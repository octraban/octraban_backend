import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import { db } from "./db.js";
import { analyzeSourceDependencies } from "./dependencyScanner.js";
import { fetchTokenMetadata } from "./sep41Metadata.js";
import { attachWebSocketServer } from "./wsEvents.js";
import { bootstrapVault, refreshVaultRatio } from "./vaultIndexer.js";
import { verifyAbi } from "./verify_abi.js";
import { getMetrics } from "./rpcMetrics.js";
import { getRpcNodeStatus } from "./rpcMultiNode.js";
import { cacheAside, cacheDel } from "./metadataCache.js";
import { attachGraphQL } from "./graphql.js";
import { parseExecutionTrace } from "./executionTraceParser.js";
import { detectReentrancyFromParsed } from "./reentrancyTrapDetector.js";
import { parseDiagnosticEvents } from "./diagnosticParser.js";
import { annotateEvictionStates, summariseEvictionStats } from "./storageEvictionTracker.js";
import { runAllChecks } from "./doctor-lib.js";
import pg from "pg";
import { getBurnAlerts } from "./burnDetector.js";
import { formatAmount } from "./formatAmount.js";

const PORT = process.env.PORT || 3001;
const VERIFY_ON_UPLOAD = process.env.VERIFY_ABI !== "false";
const RPC_URL = process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
const API_KEY = process.env.API_KEY;

function requireApiKey(req, res, next) {
  if (!API_KEY) return next();
  const key = req.headers["x-api-key"];
  if (!key || key !== API_KEY) return res.status(401).json({ error: "Unauthorized" });
  next();
}

const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});

const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});

export function startApi() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
  app.use(express.json());
  app.use(generalLimiter);

  // ── API Documentation ────────────────────────────────────────────────────────
  const openApiPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../openapi.yaml");
  if (fs.existsSync(openApiPath)) {
    const yaml = fs.readFileSync(openApiPath, "utf8");
    import("yaml").then(({ parse }) => {
      const spec = parse(yaml);
      app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(spec, { customCss: ".swagger-ui .topbar { display: none }" }));
    }).catch(() => {});
  }

  app.get("/api/openapi.yaml", (_req, res) => {
    if (fs.existsSync(openApiPath)) res.type("yaml").sendFile(openApiPath);
    else res.status(404).json({ error: "Not found" });
  });

  // ── Health check (used by Docker Compose) ──────────────────────────────
  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  // ── Existing endpoints ──────────────────────────────────────────────────────

  // GET /api/events?contract=&fn=&page=
  app.get("/api/events", async (req, res) => {
    try {
      const events = await db.getEvents({
        contract: req.query.contract,
        fn:       req.query.fn,
        page:     Number(req.query.page) || 1,
        type:     req.query.type,
      });
      res.json(events);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/events/:seq
  app.get("/api/events/:seq", async (req, res) => {
    try {
      const ev = await db.getEvent(Number(req.params.seq));
      if (!ev) return res.status(404).json({ error: "Not found" });
      res.json(ev);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Issue #164 — GET /api/events/:seq/zk-costs
  // Returns the ZK host function call list and cost delta for a single event.
  app.get("/api/events/:seq/zk-costs", async (req, res) => {
    try {
      const ev = await db.getEvent(Number(req.params.seq));
      if (!ev) return res.status(404).json({ error: "Not found" });
      if (!ev.zk_host_calls) return res.json({ calls: [], delta: null });
      const zk = typeof ev.zk_host_calls === "string"
        ? JSON.parse(ev.zk_host_calls)
        : ev.zk_host_calls;
      res.json(zk);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/contracts/:id
  app.get("/api/contracts/:id", async (req, res) => {
    try {
      // Issue #137: cache contract metadata (Cache-Aside, TTL 60 s)
      const cacheKey = `contract:meta:${req.params.id}`;
      const meta = await cacheAside(cacheKey, () => db.getContractMeta(req.params.id));
      if (!meta) return res.status(404).json({ error: "Not found" });

      const sourceFiles = Array.isArray(meta.source_files)
        ? meta.source_files
        : meta.source_files ? JSON.parse(meta.source_files) : [];

      const advisory = await analyzeSourceDependencies(sourceFiles);
      res.json({ ...meta, dependency_advisory: advisory });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/contracts/:id/build-metadata — WASM build metadata (compiler, SDK, repo link)
  app.get("/api/contracts/:id/build-metadata", async (req, res) => {
    try {
      const meta = await db.getWasmBuildMetadata(req.params.id);
      if (!meta) return res.status(404).json({ error: "No build metadata found for this contract" });
      res.json(meta);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/contracts/:id/abi — download standardized ABI JSON
  app.get("/api/contracts/:id/abi", async (req, res) => {
    try {
      const { fetchContractSpec } = await import("./verify_abi.js");
      const meta = await db.getContractMeta(req.params.id);
      const spec = await fetchContractSpec(req.params.id);
      const abi = {
        contractId: req.params.id,
        name: meta?.name || "",
        description: meta?.description || "",
        functions: (spec || []).map(fn => {
          const registered = meta?.functions?.find(f => f.name === fn.name);
          return {
            name: fn.name,
            description: registered?.description || "",
            args: fn.args.map(a => ({ name: a.name, type: a.type })),
          };
        }),
      };
      res.setHeader("Content-Disposition", `attachment; filename="${req.params.id}.abi.json"`);
      res.json(abi);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/contracts  — register ABI metadata
  app.post("/api/contracts", writeLimiter, requireApiKey, async (req, res) => {
    try {
      const { id, functions } = req.body;

      if (!id || !functions) {
        return res.status(400).json({ error: "Missing id or functions" });
      }

      // Verify ABI against on-chain spec if enabled
      if (VERIFY_ON_UPLOAD) {
        const verification = await verifyAbi(id, functions);

        if (!verification.valid) {
          return res.status(400).json({
            error: "ABI verification failed",
            details: verification,
          });
        }

        console.log(`ABI verified for contract ${id}:`, {
          functionsVerified: functions.length,
          missing: verification.missingFunctions.length,
          mismatches: verification.argMismatch.length,
        });
      }

      await db.upsertContractMeta(req.body);
      await cacheDel(`contract:meta:${id}`); // Issue #137: bust cache on update
      res.status(201).json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/verify — verify ABI without registering
  app.post("/api/verify", writeLimiter, requireApiKey, async (req, res) => {
    try {
      const { contractId, functions } = req.body;

      if (!contractId || !functions) {
        return res.status(400).json({ error: "Missing contractId or functions" });
      }

      const verification = await verifyAbi(contractId, functions);
      res.json(verification);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/spec/:id — fetch on-chain spec for a contract (functions only, legacy)
  app.get("/api/spec/:id", async (req, res) => {
    try {
      const { fetchContractSpec } = await import("./verify_abi.js");
      const spec = await fetchContractSpec(req.params.id);
      if (spec === null) {
        return res.status(404).json({ error: "Contract not found or has no spec" });
      }
      res.json(spec);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/spec/:id/full — fetch full on-chain spec including custom types
  // Returns { functions: [...], types: [...] } where types includes structs,
  // enums, unions, and error_enums parsed from the contract WASM binary.
  app.get("/api/spec/:id/full", async (req, res) => {
    try {
      const { fetchContractSpecFull } = await import("./verify_abi.js");
      const spec = await fetchContractSpecFull(req.params.id);
      if (spec === null) {
        return res.status(404).json({ error: "Contract not found or has no WASM spec" });
      }
      res.json(spec);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/simulate — issue #46: simulate a contract call via RPC
  app.post("/api/simulate", writeLimiter, requireApiKey, async (req, res) => {
    try {
      const { contractId, fn, args = [] } = req.body;
      if (!contractId || !fn) return res.status(400).json({ error: "Missing contractId or fn" });

      const { SorobanRpc, Contract, nativeToScVal, xdr } = await import("@stellar/stellar-sdk");
      const rpcUrl = process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
      const server = new SorobanRpc.Server(rpcUrl);

      const contract = new Contract(contractId);
      const scArgs = args.map(a => nativeToScVal(a));
      const op = contract.call(fn, ...scArgs);

      const account = await server.getAccount(process.env.SIMULATE_SOURCE || "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN");
      const { TransactionBuilder, Networks, BASE_FEE } = await import("@stellar/stellar-sdk");
      const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
        .addOperation(op)
        .setTimeout(30)
        .build();

      const sim = await server.simulateTransaction(tx);

      if (SorobanRpc.Api.isSimulationError(sim)) {
        return res.json({ success: false, error: sim.error });
      }

      const cost = sim.cost ?? {};
      const retVal = sim.result?.retval;
      res.json({
        success: true,
        returnValue: retVal ? retVal.toXDR("base64") : undefined,
        cost: { cpuInsns: String(cost.cpuInsns ?? 0), memBytes: String(cost.memBytes ?? 0) },
      });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // POST /api/sandbox/simulate — accepts a raw XDR TransactionEnvelope, simulates it directly
  app.post("/api/sandbox/simulate", writeLimiter, requireApiKey, async (req, res) => {
    try {
      const { xdrEnvelope } = req.body;
      if (!xdrEnvelope) return res.status(400).json({ error: "Missing xdrEnvelope" });

      const { SorobanRpc, xdr } = await import("@stellar/stellar-sdk");
      const server = new SorobanRpc.Server(RPC_URL);

      const envelope = xdr.TransactionEnvelope.fromXDR(xdrEnvelope, "base64");
      const sim = await server.simulateTransaction({ toEnvelope: () => envelope });

      if (SorobanRpc.Api.isSimulationError(sim)) {
        return res.json({ success: false, error: sim.error });
      }

      const cost = sim.cost ?? {};
      const retVal = sim.result?.retval;
      res.json({
        success: true,
        returnValue: retVal ? retVal.toXDR("base64") : undefined,
        cost: { cpuInsns: String(cost.cpuInsns ?? 0), memBytes: String(cost.memBytes ?? 0) },
        minResourceFee: sim.minResourceFee ?? null,
        latestLedger: sim.latestLedger ?? null,
      });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // GET /api/wallet/:address
  app.get("/api/wallet/:address", async (req, res) => {
    try {
      const events = await db.getWalletEvents(req.params.address);
      res.json(events);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/tokens/:id/holders — sorted list of addresses and their token balances
  app.get("/api/tokens/:id/holders", async (req, res) => {
    try {
      const contractId = req.params.id;
      let decimals = 7;
      try {
        const meta = await fetchTokenMetadata(contractId);
        decimals = meta.decimals;
      } catch { /* use default */ }

      const rows = await db.getTokenHolders(contractId);
      const holders = rows.map(r => ({
        address:     r.address,
        balance_raw: r.balance_raw,
        balance:     formatAmount(r.balance_raw, decimals),
      }));

      res.json({
        contract_id:   contractId,
        decimals,
        total_holders: holders.length,
        holders,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/tokens/:id/volume  — 24-hour rolling transfer volume
  app.get("/api/tokens/:id/volume", async (req, res) => {
    try {
      const contractId = req.params.id;
      // Fetch decimals from on-chain metadata (cached via contract registry or live sim)
      let decimals = 7;
      try {
        const meta = await fetchTokenMetadata(contractId);
        decimals = meta.decimals;
      } catch { /* use default */ }

      const volume = await db.get24hVolume(contractId, decimals);
      res.json({ contract_id: contractId, window: "24h", ...volume });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Issue #34: cursor-based pagination endpoint ────────────────────────────
  // GET /api/v1/events?contract=&fn=&type=&after=&limit=
  // `after` is the opaque seq cursor returned as `next_cursor` in the previous page.
  app.get("/api/v1/events", async (req, res) => {
    try {
      const result = await db.getEventsCursor({
        contract:  req.query.contract  || undefined,
        fn:        req.query.fn        || undefined,
        type:      req.query.type      || undefined,
        after_seq: req.query.after     ? Number(req.query.after) : 0,
        limit:     req.query.limit     ? Math.min(Number(req.query.limit), 200) : 25,
      });
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Issue #38: Contract transaction history ─────────────────────────────────
  // GET /api/v1/contracts/:id/transactions?function_name=&start_ledger=&end_ledger=&page=&limit=
  app.get("/api/v1/contracts/:id/transactions", async (req, res) => {
    try {
      const { function_name, start_ledger, end_ledger, page, limit } = req.query;
      const result = await db.getContractTransactions(req.params.id, {
        function_name: function_name || undefined,
        start_ledger:  start_ledger  ? Number(start_ledger)  : undefined,
        end_ledger:    end_ledger    ? Number(end_ledger)    : undefined,
        page:          page          ? Number(page)          : 1,
        limit:         limit         ? Math.min(Number(limit), 100) : 25,
      });
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/contracts/:id/upgrades — contract WASM upgrade lineage ────────
  app.get("/api/contracts/:id/upgrades", async (req, res) => {
    try {
      const rows = await db.getUpgradeHistory(req.params.id);
      res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/contracts/:id/migration-status — Issue #84: SEP-49 migration tracker
  app.get("/api/contracts/:id/migration-status", async (req, res) => {
    try {
      const status = await db.getMigrationStatus(req.params.id);
      res.json(status);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Issue #86: Circuit breaker status endpoint ──────────────────────────────
  // GET /api/contracts/:id/circuit-breaker — detect and return pause status
  app.get("/api/contracts/:id/circuit-breaker", async (req, res) => {
    try {
      const status = await db.getCircuitBreakerStatus(req.params.id);
      res.json(status);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Issue #81: RWA token activity endpoint ──────────────────────────────────
  // GET /api/contracts/:id/rwa-metadata — get RWA-specific metadata
  app.get("/api/contracts/:id/rwa-metadata", async (req, res) => {
    try {
      const meta = await db.getContractMeta(req.params.id);
      if (!meta) return res.status(404).json({ error: "Not found" });
      
      const rwaInfo = {
        is_rwa: meta.is_rwa ?? false,
        rwa_type: meta.rwa_type ?? null,
      };
      res.json(rwaInfo);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── POST /api/auth-tree — parse multi-sig ContractAuth trees ───────────────
  // Body: { auth: string[] }  — array of base64 SorobanAuthorizationEntry XDRs
  // Returns: ordered array of { signer, invocations: [{ depth, scope }] }
  app.post("/api/auth-tree", writeLimiter, requireApiKey, async (req, res) => {
    try {
      const { auth } = req.body;
      if (!Array.isArray(auth)) return res.status(400).json({ error: "auth must be an array" });
      const { parseAuthTree } = await import("./authTreeParser.js");
      res.json(parseAuthTree(auth));
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  // ── GET /api/burn-alerts?contract= — suspicious burn sequence alerts ────────
  // Returns alerts flagged by burnDetector for rapid supply contraction.
  app.get("/api/burn-alerts", (req, res) => {
    try {
      const alerts = getBurnAlerts(req.query.contract || undefined);
      res.json(alerts);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Issue #115: RPC node performance metrics ────────────────────────────────
  // GET /api/rpc-metrics — latency history, uptime, error rate per node
  app.get("/api/rpc-metrics", (_req, res) => {
    try {
      res.json(getMetrics());
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/rpc-nodes — live health status from multi-node client (#113)
  app.get("/api/rpc-nodes", (_req, res) => {
    try {
      res.json(getRpcNodeStatus());
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Issue #135: Multi-Signature Source Code Verification ───────────────────

  // POST /api/contracts/:id/source-verifications
  // Body: { wasm_hash, signer, signature, compiler_hash }
  app.post("/api/contracts/:id/source-verifications", writeLimiter, requireApiKey, async (req, res) => {
    try {
      const { wasm_hash, signer, signature, compiler_hash } = req.body;
      if (!wasm_hash || !signer || !signature || !compiler_hash) {
        return res.status(400).json({ error: "Missing wasm_hash, signer, signature, or compiler_hash" });
      }
      await db.addSourceVerification({
        contract_id: req.params.id,
        wasm_hash,
        signer,
        signature,
        compiler_hash,
      });
      res.status(201).json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/contracts/:id/source-verifications?wasm_hash=
  app.get("/api/contracts/:id/source-verifications", async (req, res) => {
    try {
      const rows = await db.getSourceVerifications(
        req.params.id,
        req.query.wasm_hash || undefined
      );
      res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Issue #140: Storage State-Diff Timeline ────────────────────────────────

  // GET /api/contracts/:id/state-diffs?key=&limit=
  app.get("/api/contracts/:id/state-diffs", async (req, res) => {
    try {
      const rows = await db.getStateDiffs(req.params.id, {
        key:   req.query.key   || undefined,
        limit: req.query.limit ? Math.min(Number(req.query.limit), 500) : 200,
      });
      res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Issue #165: Live TTL status for contract instance, code, and persistent storage ──
  // GET /api/contracts/:id/ttl
  // Queries the Soroban RPC getLedgerEntries for the contract's instance and code
  // ledger keys, then returns expiration ledgers alongside the current ledger height.
  app.get("/api/contracts/:id/ttl", async (req, res) => {
    try {
      const contractId = req.params.id;
      const { SorobanRpc, xdr, Address } = await import("@stellar/stellar-sdk");
      const server = new SorobanRpc.Server(RPC_URL);

      // Build ledger keys for instance and code entries
      const contractAddress = Address.fromString(contractId);
      const instanceKey = xdr.LedgerKey.contractData(
        new xdr.LedgerKeyContractData({
          contract: contractAddress.toScAddress(),
          key: xdr.ScVal.scvLedgerKeyContractInstance(),
          durability: xdr.ContractDataDurability.persistent(),
        })
      );
      const codeKey = xdr.LedgerKey.contractCode(
        new xdr.LedgerKeyContractCode({
          hash: Buffer.alloc(32), // placeholder; resolved below from instance
        })
      );

      // Fetch instance entry first to get the WASM hash for the code key
      const instanceResult = await server.getLedgerEntries(instanceKey);
      const instanceEntry = instanceResult.entries?.[0] ?? null;

      let instanceTTL = null;
      let codeTTL = null;
      let currentLedger = instanceResult.latestLedger ?? 0;

      if (instanceEntry) {
        instanceTTL = instanceEntry.liveUntilLedgerSeq ?? null;

        // Extract WASM hash from the instance entry to build the code key
        try {
          const contractInstance = instanceEntry.val.contractData().val().instance();
          const wasmHash = contractInstance.executable().wasmHash();
          const resolvedCodeKey = xdr.LedgerKey.contractCode(
            new xdr.LedgerKeyContractCode({ hash: wasmHash })
          );
          const codeResult = await server.getLedgerEntries(resolvedCodeKey);
          const codeEntry = codeResult.entries?.[0] ?? null;
          if (codeEntry) codeTTL = codeEntry.liveUntilLedgerSeq ?? null;
        } catch {
          // WASM hash extraction failed — code TTL unavailable
        }
      }

      res.json({
        contract_id: contractId,
        current_ledger: currentLedger,
        instance: { live_until_ledger: instanceTTL },
        code:     { live_until_ledger: codeTTL },
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Setup Wizard & Diagnostics Endpoints ────────────────────────────────────
  app.get("/api/setup/doctor", async (req, res) => {
    try {
      const report = await runAllChecks();
      res.json(report);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/setup/test-db", async (req, res) => {
    try {
      const { databaseUrl } = req.body;
      if (!databaseUrl) return res.status(400).json({ error: "Missing databaseUrl" });
      const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 3000 });
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      res.json({ success: true });
    } catch (e) {
      res.json({ success: false, error: e.message });
    }
  });

  app.post("/api/setup/save-config", async (req, res) => {
    try {
      const { sorobanRpcUrl, databaseUrl, pollMs } = req.body;
      const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env");
      let envContent = "";
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, "utf8");
      }
      const updateEnvVar = (key, val) => {
        if (!val) return;
        const regex = new RegExp(`^#?\\s*${key}=.*$`, "m");
        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, `${key}=${val}`);
        } else {
          envContent += `\n${key}=${val}`;
        }
      };
      updateEnvVar("SOROBAN_RPC_URL", sorobanRpcUrl);
      updateEnvVar("DATABASE_URL", databaseUrl);
      updateEnvVar("POLL_MS", pollMs);
      fs.writeFileSync(envPath, envContent, "utf8");

      // Update current process environment
      if (sorobanRpcUrl) process.env.SOROBAN_RPC_URL = sorobanRpcUrl;
      if (databaseUrl) process.env.DATABASE_URL = databaseUrl;
      if (pollMs) process.env.POLL_MS = pollMs;

      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/setup/db-init", async (req, res) => {
    try {
      // 1. Run migrations
      await db.init();

      // 2. Load seed data using seed-lib
      const { seed } = await import("./seed-lib.js");
      await seed(process.env.DATABASE_URL);

      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Issue #215: CSV/JSON export endpoints ─────────────────────────────────

  function rowsToCsv(rows, columns) {
    if (!rows.length) return columns.join(",") + "\n";
    const escape = (v) => {
      if (v == null) return "";
      const s = String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = columns.join(",");
    const body = rows.map(r => columns.map(c => escape(r[c])).join(",")).join("\n");
    return header + "\n" + body + "\n";
  }

  const EVENT_COLUMNS = [
    "seq", "contract_id", "function", "ledger", "tx_hash", "description",
    "cpu_instructions", "mem_bytes", "fee_charged", "is_clawback", "is_high_bloat_risk",
  ];

  const CONTRACT_COLUMNS = [
    "id", "name", "description", "registered_by",
    "has_circuit_breaker", "is_paused", "is_rwa", "rwa_type", "created_at",
  ];

  // GET /api/export/events?format=csv|json&contract=&fn=&type=&limit=
  app.get("/api/export/events", async (req, res) => {
    try {
      const format = req.query.format === "json" ? "json" : "csv";
      const limit  = Math.min(Number(req.query.limit) || 10000, 10000);
      const rows   = await db.getEventsForExport({
        contract: req.query.contract,
        fn:       req.query.fn,
        type:     req.query.type,
        limit,
      });
      if (format === "json") {
        res.setHeader("Content-Disposition", 'attachment; filename="events.json"');
        res.setHeader("Content-Type", "application/json");
        return res.json(rows);
      }
      res.setHeader("Content-Disposition", 'attachment; filename="events.csv"');
      res.setHeader("Content-Type", "text/csv");
      return res.send(rowsToCsv(rows, EVENT_COLUMNS));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/export/contracts?format=csv|json
  app.get("/api/export/contracts", async (req, res) => {
    try {
      const format = req.query.format === "json" ? "json" : "csv";
      const rows   = await db.getContractsForExport();
      if (format === "json") {
        res.setHeader("Content-Disposition", 'attachment; filename="contracts.json"');
        res.setHeader("Content-Type", "application/json");
        return res.json(rows);
      }
      res.setHeader("Content-Disposition", 'attachment; filename="contracts.csv"');
      res.setHeader("Content-Type", "text/csv");
      return res.send(rowsToCsv(rows, CONTRACT_COLUMNS));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Issue #139: GraphQL endpoint ───────────────────────────────────────────
  attachGraphQL(app);

  // ── Start HTTP + WebSocket server ───────────────────────────────────────────
  const server = http.createServer(app);
  attachWebSocketServer(server);

  server.on("close", () => console.log("[api] server closed"));
  server.listen(PORT, () => console.log(`API listening on :${PORT}`));
  return server;
}
