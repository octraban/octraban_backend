import express from "express";
import { db } from "./db.js";
import { fetchTokenMetadata } from "./sep41Metadata.js";
import { SorobanRpc, TransactionBuilder } from "@stellar/stellar-sdk";

const RPC_URL = process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
const _rpc = new SorobanRpc.Server(RPC_URL, { allowHttp: true });

const PORT = process.env.PORT || 3001;
const VERIFY_ON_UPLOAD = process.env.VERIFY_ABI !== "false";

export function startApi() {
  const app = express();
  app.use(express.json());

  // GET /api/account/:address — fetch account for transaction building
  app.get("/api/account/:address", async (req, res) => {
    try {
      const account = await _rpc.getAccount(req.params.address);
      res.json({ id: account.accountId(), sequence: account.sequenceNumber() });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/submit — broadcast a signed transaction XDR
  app.post("/api/submit", async (req, res) => {
    try {
      const { xdr: txXdr } = req.body;
      if (!txXdr) return res.status(400).json({ error: "Missing xdr" });
      const network = await _rpc.getNetwork();
      const tx = TransactionBuilder.fromXDR(txXdr, network.passphrase);
      const result = await _rpc.sendTransaction(tx);
      res.json({ hash: result.hash, status: result.status });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/health
  app.get("/api/health", async (_req, res) => {
    try {
      const [latestLedger, dbMaxLedger] = await Promise.all([
        _rpc.getLatestLedger().then(r => r.sequence),
        db.getMaxLedger(),
      ]);
      const lag = latestLedger - dbMaxLedger;
      const syncPct = latestLedger > 0
        ? Math.min(100, Math.round((dbMaxLedger / latestLedger) * 10000) / 100)
        : 0;
      const mem = process.memoryUsage();
      res.json({
        status: lag < 100 ? "ok" : "lagging",
        sync_pct: syncPct,
        lag_ledgers: lag,
        network_ledger: latestLedger,
        indexed_ledger: dbMaxLedger,
        memory: {
          rss_mb:       Math.round(mem.rss / 1024 / 1024 * 100) / 100,
          heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024 * 100) / 100,
          heap_total_mb:Math.round(mem.heapTotal / 1024 / 1024 * 100) / 100,
        },
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/events?contract=&fn=&page=
  app.get("/api/events", async (req, res) => {
    try {
      const events = await db.getEvents({
        contract: req.query.contract,
        fn:       req.query.fn,
        page:     Number(req.query.page) || 1,
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

  // GET /api/contracts/:id
  app.get("/api/contracts/:id", async (req, res) => {
    try {
      const meta = await db.getContractMeta(req.params.id);
      if (!meta) return res.status(404).json({ error: "Not found" });
      res.json(meta);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/contracts  — register ABI metadata
  app.post("/api/contracts", async (req, res) => {
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
      res.status(201).json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/verify — verify ABI without registering
  app.post("/api/verify", async (req, res) => {
    try {
      const { contractId, functions } = req.body;

      if (!contractId || !functions) {
        return res.status(400).json({ error: "Missing contractId or functions" });
      }

      const verification = await verifyAbi(contractId, functions);
      res.json(verification);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/spec/:id — fetch on-chain spec for a contract
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

  // GET /api/wallet/:address
  app.get("/api/wallet/:address", async (req, res) => {
    try {
      const events = await db.getWalletEvents(req.params.address);
      res.json(events);
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

  app.listen(PORT, () => console.log(`API listening on :${PORT}`));
}
