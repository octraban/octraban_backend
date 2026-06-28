import { xdr, StrKey } from "@stellar/stellar-sdk";

/**
 * Recursively collect all CreateContract host functions from an
 * InvokeHostFunction operation's auth entries and sub-invocations.
 *
 * @param {xdr.SorobanAuthorizedInvocation} invocation
 * @param {string|null} parentContractId
 * @param {object[]} acc  accumulator
 */
function collectCreates(invocation, parentContractId, acc) {
  try {
    const fn = invocation.function();
    if (
      fn.switch().name === "sorobanAuthorizedFunctionTypeCreateContractV2HostFn" ||
      fn.switch().name === "sorobanAuthorizedFunctionTypeCreateContractHostFn"
    ) {
      const args = fn.createContractV2HostFn?.() ?? fn.createContractHostFn?.();
      let newContractId = null;
      try {
        const preimage = args.contractIdPreimage?.();
        if (preimage?.switch().name === "contractIdPreimageFromAddress") {
          // address-based preimage — contract ID resolved post-execution
          newContractId = null;
        }
      } catch {
        /* ignore */
      }
      acc.push({ parentContractId, newContractId, raw: fn });
    }
  } catch {
    /* not a create */
  }

  // Recurse into sub-invocations
  try {
    for (const sub of invocation.subInvocations()) {
      collectCreates(sub, parentContractId, acc);
    }
  } catch {
    /* no sub-invocations */
  }
}

/**
 * Extract newly created contract IDs from sorobanMeta.changedEntries.
 * A "created" contractInstance entry means a new contract was deployed.
 *
 * @param {object} sorobanMeta
 * @returns {string[]}  strkey-encoded contract IDs
 */
function extractCreatedContracts(sorobanMeta) {
  const created = [];
  try {
    const changes = sorobanMeta.changedEntries?.() ?? [];
    for (const change of changes) {
      try {
        if (change.switch().name !== "ledgerEntryCreated") continue;
        const entry = change.created();
        const contractData = entry.data?.().contractData?.();
        if (!contractData) continue;
        if (contractData.key?.().switch().name !== "scvLedgerKeyContractInstance") continue;
        const contractId = StrKey.encodeContract(contractData.contract().contractId());
        created.push(contractId);
      } catch {
        /* skip */
      }
    }
  } catch {
    /* ignore */
  }
  return created;
}

/**
 * Extract WASM hash or deployment method from CreateContract args.
 *
 * @param {object} createArgs  CreateContractArgs from XDR
 * @returns {{ wasmHash: string|null, deploymentMethod: string }}
 */
function extractDeploymentInfo(createArgs) {
  try {
    const executable = createArgs.executable?.();
    if (!executable) return { wasmHash: null, deploymentMethod: "unknown" };

    const execType = executable.switch().name;

    if (execType === "contractExecutableWasm") {
      const hash = executable.wasmHash();
      return {
        wasmHash: Buffer.from(hash).toString("hex"),
        deploymentMethod: "wasm_hash",
      };
    }

    if (execType === "contractExecutableStellarAsset") {
      return { wasmHash: null, deploymentMethod: "stellar_asset" };
    }

    return { wasmHash: null, deploymentMethod: execType };
  } catch {
    return { wasmHash: null, deploymentMethod: "unknown" };
  }
}

/**
 * Detect a factory deployment pattern in a transaction's metadata.
 *
 * A factory deployment is when a single transaction deploys 2+ contracts,
 * typically via a factory contract that calls CreateContract multiple times.
 *
 * @param {object} ev  Raw Soroban RPC event (must have ev.txMeta)
 * @returns {{
 *   isFactoryDeployment: boolean,
 *   factoryContractId: string|null,
 *   deployedContracts: Array<{
 *     contractId: string,
 *     wasmHash: string|null,
 *     deploymentMethod: string,
 *     index: number
 *   }>,
 *   deploymentTree: {
 *     factoryContractId: string|null,
 *     contracts: Array<{
 *       contractId: string,
 *       wasmHash: string|null,
 *       deploymentMethod: string,
 *       index: number
 *     }>
 *   }
 * } | null}
 */
export function detectFactoryDeployment(ev) {
  try {
    const sorobanMeta = ev.txMeta?.v3?.().sorobanMeta?.();
    if (!sorobanMeta) return null;

    const deployedContractIds = extractCreatedContracts(sorobanMeta);
    if (deployedContractIds.length < 2) return null;

    // Try to identify the factory contract from the invoking contract
    let factoryContractId = null;
    try {
      // Best-effort: the factory is the contract that initiated the tx
      factoryContractId = ev.contractId ?? null;
    } catch {
      /* ignore */
    }

    // Extract deployment details from auth entries
    const deploymentDetails = [];
    try {
      const env = xdr.TransactionEnvelope.fromXDR(ev.envelopeXdr || ev.envelope_xdr, "base64");
      let ops = [];
      try {
        ops = env.v1?.().tx().operations() ?? env.tx?.().operations() ?? [];
      } catch {
        /* ignore */
      }

      for (const op of ops) {
        try {
          const body = op.body();
          if (body.switch().name !== "invokeHostFunction") continue;
          const ihf = body.invokeHostFunction();

          // Scan auth entries for CreateContract operations
          for (const authEntry of ihf.auth()) {
            try {
              const rootInv = authEntry.rootInvocation();
              const fn = rootInv.function();
              const fnType = fn.switch().name;

              if (
                fnType === "sorobanAuthorizedFunctionTypeCreateContractV2HostFn" ||
                fnType === "sorobanAuthorizedFunctionTypeCreateContractHostFn"
              ) {
                const args = fn.createContractV2HostFn?.() ?? fn.createContractHostFn?.();
                const deployInfo = extractDeploymentInfo(args);
                deploymentDetails.push(deployInfo);
              }
            } catch {
              /* skip */
            }
          }
        } catch {
          /* skip */
        }
      }
    } catch {
      /* ignore envelope parsing errors */
    }

    // Merge contract IDs with deployment details
    const contracts = deployedContractIds.map((contractId, index) => ({
      contractId,
      wasmHash: deploymentDetails[index]?.wasmHash ?? null,
      deploymentMethod: deploymentDetails[index]?.deploymentMethod ?? "unknown",
      index,
    }));

    return {
      isFactoryDeployment: true,
      factoryContractId,
      deployedContracts: contracts,
      deploymentTree: {
        factoryContractId,
        contracts,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Parse a TransactionEnvelope XDR for factory deployment patterns by
 * recursively scanning CreateContract operations within the envelope.
 *
 * @param {string} txEnvelopeXdr  base64-encoded TransactionEnvelope XDR
 * @param {string} [factoryContractId]  known factory contract ID (optional)
 * @returns {{
 *   isFactoryDeployment: boolean,
 *   factoryContractId: string|null,
 *   deployedContracts: { index: number, parentContractId: string|null }[],
 *   deploymentTree: { factoryContractId: string|null, contracts: object[] }
 * }}
 */
export function parseFactoryDeployment(txEnvelopeXdr, factoryContractId = null) {
  const env = xdr.TransactionEnvelope.fromXDR(txEnvelopeXdr, "base64");

  let ops;
  try {
    ops = env.v1?.().tx().operations() ?? env.tx?.().operations() ?? [];
  } catch {
    ops = [];
  }

  const creates = [];

  for (const op of ops) {
    try {
      const body = op.body();
      if (body.switch().name !== "invokeHostFunction") continue;
      const ihf = body.invokeHostFunction();

      // Scan auth entries for CreateContract sub-invocations
      for (const authEntry of ihf.auth()) {
        try {
          collectCreates(authEntry.rootInvocation(), factoryContractId, creates);
        } catch {
          /* skip */
        }
      }
    } catch {
      /* skip non-invoke ops */
    }
  }

  const isFactoryDeployment = creates.length >= 2;

  return {
    isFactoryDeployment,
    factoryContractId,
    deployedContracts: creates.map((c, i) => ({
      index: i,
      parentContractId: c.parentContractId,
    })),
    deploymentTree: {
      factoryContractId,
      contracts: creates.map((c, i) => ({
        index: i,
        parentContractId: c.parentContractId,
      })),
    },
  };
}
