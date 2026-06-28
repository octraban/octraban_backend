import pg from "pg";

function randomAddress(prefix = "G") {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let result = prefix;
  for (let i = 0; i < 55; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function randomHex(length = 64) {
  const chars = "0123456789abcdef";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const contractConfigs = [
  {
    name: "USDC Token",
    description: "Fiat-backed stablecoin issued by Circle",
    is_rwa: false,
    functions: [
      { name: "transfer", description: "Transfer tokens" },
      { name: "mint", description: "Mint tokens" },
      { name: "burn", description: "Burn tokens" },
    ],
  },
  {
    name: "StellarSwap DEX",
    description: "Automated market maker pool for XLM/USDC",
    is_rwa: false,
    functions: [
      { name: "swap", description: "Swap assets" },
      { name: "add_liquidity", description: "Add liquidity" },
      { name: "remove_liquidity", description: "Remove liquidity" },
    ],
  },
  {
    name: "Aave Lending Pool",
    description: "Decentralized money market contract",
    is_rwa: false,
    functions: [
      { name: "deposit", description: "Deposit collateral" },
      { name: "borrow", description: "Borrow assets" },
      { name: "repay", description: "Repay loan" },
      { name: "liquidate", description: "Liquidate position" },
    ],
  },
  {
    name: "Soroban NFT Marketplace",
    description: "Decentralized NFT trading contract",
    is_rwa: false,
    functions: [
      { name: "list_nft", description: "List NFT for sale" },
      { name: "buy_nft", description: "Purchase NFT" },
      { name: "cancel_list", description: "Remove listing" },
    ],
  },
  {
    name: "DAO Treasury",
    description: "Decentralized autonomous governance treasury",
    is_rwa: false,
    functions: [
      { name: "propose", description: "Submit proposal" },
      { name: "vote", description: "Cast vote" },
      { name: "execute", description: "Execute approved proposal" },
    ],
  },
  {
    name: "Tokenized Gold (GLD)",
    description: "Real-world asset representing physical gold bullion",
    is_rwa: true,
    rwa_type: "precious_metal",
    functions: [
      { name: "transfer", description: "Transfer gold weight" },
      { name: "mint", description: "Mint physical backed tokens" },
    ],
  },
  {
    name: "Manhattan Real Estate (MRE)",
    description: "Tokenized fraction of commercial property in NYC",
    is_rwa: true,
    rwa_type: "property",
    functions: [
      { name: "transfer", description: "Transfer property share" },
      { name: "distribute_yield", description: "Disburse rental yields" },
    ],
  },
  {
    name: "Stellar-Ethereum Bridge",
    description: "Cross-chain asset locked bridge contract",
    is_rwa: false,
    functions: [
      { name: "lock", description: "Lock tokens" },
      { name: "unlock", description: "Release tokens" },
    ],
  },
  {
    name: "Pyth Oracle Feed",
    description: "Real-time asset price reference feed",
    is_rwa: false,
    functions: [
      { name: "update_price", description: "Refresh feed price" },
      { name: "get_price", description: "Get asset price" },
    ],
  },
  {
    name: "Governance Token (GOV)",
    description: "Protocol governance and voting token",
    is_rwa: false,
    functions: [
      { name: "vote_power", description: "Check voting weight" },
      { name: "delegate", description: "Delegate vote" },
    ],
  },
  {
    name: "EURC Stablecoin",
    description: "Euro-backed stablecoin issued by Circle",
    is_rwa: false,
    functions: [
      { name: "transfer", description: "Transfer EURC" },
      { name: "approve", description: "Allow allowance" },
    ],
  },
  {
    name: "Y-Vault Optimizer",
    description: "Automated yield farming vaults",
    is_rwa: false,
    functions: [
      { name: "deposit", description: "Deposit assets" },
      { name: "harvest", description: "Compound returns" },
    ],
  },
  {
    name: "Bridge Escrow",
    description: "Escrow holding contract for bridge settlements",
    is_rwa: false,
    functions: [{ name: "settle", description: "Settle transfer" }],
  },
  {
    name: "Streaming Payments",
    description: "Real-time continuous salary streaming contract",
    is_rwa: false,
    functions: [
      { name: "create_stream", description: "Initiate pay stream" },
      { name: "withdraw_stream", description: "Claim accrued funds" },
    ],
  },
  {
    name: "Stellar Identity ID",
    description: "Decentralized identity claims contract",
    is_rwa: false,
    functions: [
      { name: "register_id", description: "Bind ID schema" },
      { name: "verify_claim", description: "Validate credential claim" },
    ],
  },
  {
    name: "MultiSig Wallet",
    description: "Shared multi-signature wallet",
    is_rwa: false,
    functions: [
      { name: "submit_tx", description: "Submit transaction request" },
      { name: "confirm_tx", description: "Approve transaction request" },
    ],
  },
  {
    name: "Limit Order Book",
    description: "Orderbook DEX matching engine",
    is_rwa: false,
    functions: [
      { name: "place_order", description: "Submit limit order" },
      { name: "cancel_order", description: "Cancel active order" },
    ],
  },
  {
    name: "Yield Farm Manager",
    description: "Staking farm rewards contract",
    is_rwa: false,
    functions: [
      { name: "stake", description: "Stake LP tokens" },
      { name: "claim_rewards", description: "Claim reward balance" },
    ],
  },
  {
    name: "Options Clearing",
    description: "European options trading contract",
    is_rwa: false,
    functions: [
      { name: "purchase_option", description: "Buy call/put option" },
      { name: "exercise_option", description: "Exercise active option" },
    ],
  },
  {
    name: "Insurance Mutual Pool",
    description: "DeFi smart contract cover insurance mutual pool",
    is_rwa: false,
    functions: [
      { name: "buy_cover", description: "Purchase cover" },
      { name: "file_claim", description: "File claim request" },
    ],
  },
];

export async function seed(dbUrl) {
  const pool = new pg.Pool({ connectionString: dbUrl });
  const client = await pool.connect();
  console.log("Seeding database with rich test data...");

  try {
    await client.query("BEGIN");

    // Clean existing data
    console.log("Truncating existing tables...");
    await client.query(`
      TRUNCATE TABLE events, contracts, sub_invocations, storage_state_diffs, quorum_freezes, privileged_roles, wasm_build_metadata CASCADE
    `);

    // Generate Wallets
    const wallets = Array.from({ length: 50 }, () => randomAddress("G"));

    // Insert Contracts
    console.log("Inserting 20 mock contracts...");
    const contracts = [];
    for (const conf of contractConfigs) {
      const contractId = randomAddress("C");
      await client.query(
        `INSERT INTO contracts (id, name, description, functions, registered_by, is_rwa, rwa_type, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          contractId,
          conf.name,
          conf.description,
          JSON.stringify(conf.functions),
          wallets[Math.floor(Math.random() * wallets.length)],
          conf.is_rwa,
          conf.rwa_type || null,
        ],
      );
      contracts.push({
        id: contractId,
        name: conf.name,
        functions: conf.functions,
      });
    }

    // Insert 500+ Events
    console.log("Inserting 520 mock events spanning 30 days...");
    const totalEvents = 520;
    const now = Date.now();
    const msIn30Days = 30 * 24 * 60 * 60 * 1000;

    for (let i = 0; i < totalEvents; i++) {
      const dateOffset = (i / totalEvents) * msIn30Days;
      const timestamp = new Date(now - msIn30Days + dateOffset);
      const ledger = 1200000 + Math.floor((i / totalEvents) * 150000);
      const txHash = randomHex(64);

      const contract = contracts[i % contracts.length];
      const fnMeta = contract.functions[Math.floor(Math.random() * contract.functions.length)];
      const fn = fnMeta.name;

      // Random details based on function type
      let description = "";
      let raw_topics = [];
      let raw_data = {};

      const alice = wallets[Math.floor(Math.random() * wallets.length)];
      const bob = wallets[Math.floor(Math.random() * wallets.length)];

      if (fn === "transfer") {
        const amount = Math.floor(Math.random() * 500) + 1;
        description = `Address ${alice.slice(0, 8)}… transferred ${amount} ${contract.name.split(" ")[0]} to ${bob.slice(0, 8)}…`;
        raw_topics = ["transfer", alice, bob];
        raw_data = { amount: (amount * 10000000).toString() };
      } else if (fn === "swap") {
        const amountIn = Math.floor(Math.random() * 100) + 10;
        const amountOut = Math.floor(amountIn * 0.98);
        description = `Address ${alice.slice(0, 8)}… swapped ${amountIn} USDC for ${amountOut} XLM on ${contract.name}`;
        raw_topics = ["swap", alice];
        raw_data = {
          amount_in: (amountIn * 10000000).toString(),
          amount_out: (amountOut * 10000000).toString(),
        };
      } else if (fn === "mint") {
        const amount = Math.floor(Math.random() * 1000) + 500;
        description = `Address ${alice.slice(0, 8)}… minted ${amount} ${contract.name.split(" ")[0]}`;
        raw_topics = ["mint", alice, bob];
        raw_data = { amount: (amount * 10000000).toString() };
      } else if (fn === "burn") {
        const amount = Math.floor(Math.random() * 200) + 10;
        description = `Address ${alice.slice(0, 8)}… burned ${amount} ${contract.name.split(" ")[0]}`;
        raw_topics = ["burn", alice];
        raw_data = { amount: (amount * 10000000).toString() };
      } else {
        description = `Address ${alice.slice(0, 8)}… executed ${fn} on ${contract.name}`;
        raw_topics = [fn, alice];
        raw_data = { caller: alice, status: "success" };
      }

      const cpu = Math.floor(Math.random() * 150000) + 10000;
      const mem = Math.floor(Math.random() * 80000) + 5000;
      const fee = Math.floor(Math.random() * 10000) + 100;

      await client.query(
        `INSERT INTO events (
           contract_id, function, ledger, tx_hash, description, raw_topics, raw_data,
           cpu_instructions, mem_bytes, fee_charged, is_high_bloat_risk, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          contract.id,
          fn,
          ledger,
          txHash,
          description,
          JSON.stringify(raw_topics),
          JSON.stringify(raw_data),
          cpu,
          mem,
          fee,
          cpu > 120000,
          timestamp,
        ],
      );

      // Insert Sub-invocations for ~30% of the events
      if (i % 3 === 0) {
        const subContract = contracts[(i + 1) % contracts.length];
        const subFn = subContract.functions[0].name;
        // Level 1 sub invocation
        await client.query(
          `INSERT INTO sub_invocations (parent_tx_hash, depth, contract_id, function, args, ledger, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [txHash, 1, subContract.id, subFn, JSON.stringify([alice, bob, "50000000"]), ledger, timestamp],
        );

        if (i % 6 === 0) {
          // Level 2 sub invocation
          const subContract2 = contracts[(i + 2) % contracts.length];
          const subFn2 = subContract2.functions[0].name;
          await client.query(
            `INSERT INTO sub_invocations (parent_tx_hash, depth, contract_id, function, args, ledger, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [txHash, 2, subContract2.id, subFn2, JSON.stringify([alice]), ledger, timestamp],
          );

          if (i % 12 === 0) {
            // Level 3 sub invocation
            const subContract3 = contracts[(i + 3) % contracts.length];
            const subFn3 = subContract3.functions[0].name;
            await client.query(
              `INSERT INTO sub_invocations (parent_tx_hash, depth, contract_id, function, args, ledger, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [txHash, 3, subContract3.id, subFn3, JSON.stringify(["validate"]), ledger, timestamp],
            );
          }
        }
      }
    }

    await client.query("COMMIT");
    console.log("✓ Seeding completed successfully!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Seeding failed:", err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}
