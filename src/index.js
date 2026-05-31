import "dotenv/config";
import { SorobanRpc } from "@stellar/stellar-sdk";
import { startApi } from "./api.js";
import { db } from "./db.js";
import { decode } from "./decoder.js";
import { startAbiSync } from "./githubAbiSync.js";
import { withRetry } from "./rpcRetry.js";
import { isHighBloatRisk } from "./bloatDetector.js";
import { detectUpgrade } from "./upgradeDetector.js";
import { classifyStorageWrites } from "./storageTierClassifier.js";
import { startBurnDetector } from "./burnDetector.js";
import { multiNodeRpc } from "./rpcMultiNode.js";
import { startMetricsCollector } from "./rpcMetrics.js";
import { startPruner } from "./pruner.js";

const RPC_URL      = process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
const START_LEDGER = Number(process.env.START_LEDGER || 0);
const POLL_MS      = Number(process.env.POLL_MS || 5000);
// Max events per RPC page — Soroban caps at 200
const PAGE_LIMIT   = 200;

const rpc = new SorobanRpc.Server(RPC_URL, { allowHttp: true });

// ── Issue #33: persisted ledger cursor ────────────────────────────────────────
// The cursor is stored in the DB so the daemon resumes correctly after restart.
// cursorRef is shared with the reorg worker so it can rewind on fork.
const cursorRef = {
  getCursor: () => _cursor,
  setCursor: (n) => { _cursor = n; },
};
let _cursor = 0;

/**
 * Fetch and process ALL events for a given startLedger, handling pagination
 * boundaries when a ledger contains more than PAGE_LIMIT events (Issue #33).
 *
 * Returns the latestLedger reported by the RPC node.
 */
async function indexLedger(ledger) {
  let pageCursor = undefined; // RPC pagination cursor (opaque string)
  let latestLedger = ledger;

  do {
    const req = {
      startLedger: pageCursor ? undefined : ledger, // only on first page
      filters: [{ type: "contract" }],
      limit: PAGE_LIMIT,
      ...(pageCursor ? { cursor: pageCursor } : {}),
    };

    const res = await withRetry(() => rpc.getEvents(req));
    latestLedger = res.latestLedger ?? latestLedger;

    for (const ev of res.events) {
      const decoded = await decode(ev);
      decoded.is_high_bloat_risk = isHighBloatRisk(ev, ev.contractId);

      const upgrade = detectUpgrade(ev);
      if (upgrade) {
        console.log(`[${ev.ledger}] CONTRACT UPGRADE ${ev.contractId}: ${upgrade.oldHash} → ${upgrade.newHash}`);
        decoded.upgrade = upgrade;
      }

      decoded.storage_tiers = classifyStorageWrites(ev);
      await db.upsertEvent(decoded);
      publish(decoded);           // Issue #39 — push to WS clients
      handleVaultEvent(decoded);  // vault ratio update (async, non-blocking)
      console.log(`[${ev.ledger}] ${decoded.function}: ${decoded.description}`);
    }

    // Issue #37 — record the latest ledger hash for re-org detection
    if (res.latestLedger && res.latestLedgerHash) {
      await recordLedgerHash(res.latestLedger, res.latestLedgerHash).catch(() => {});
    }

    // If the RPC returned a full page there may be more events; follow the cursor.
    pageCursor = res.events.length === PAGE_LIMIT ? res.cursor : undefined;
  } while (pageCursor);

  return latestLedger;
}

async function run() {
  await db.init();
  startApi();
  startAbiSync();
  startBurnDetector();
  startMetricsCollector();  // Issue #115 — RPC latency probes
  startPruner();            // Issue #116 — daily temporary-storage cleanup

  // Bootstrap vault indexer: initial ratio snapshot for all registered vaults
  refreshAllVaults().catch(() => {});
  // Periodic ratio refresh every 60s for vaults that accrue without emitting events
  setInterval(() => refreshAllVaults().catch(() => {}), 60_000);

  // Issue #33: resume from the highest indexed ledger so no events are missed
  // after a restart. Fall back to START_LEDGER or (latest - 100) for first run.
  const dbMax = await db.getMaxLedger();
  _cursor = dbMax > 0
    ? dbMax + 1
    : START_LEDGER || (await withRetry(() => multiNodeRpc.getLatestLedger())).sequence - 100;

  console.log(`[daemon] starting from ledger ${_cursor}`);

  while (true) {
    try {
      const latest = await indexLedger(_cursor);
      // Advance cursor to the ledger after the last one the RPC reported
      _cursor = latest + 1;
      await db.saveCursor(_cursor);
    } catch (err) {
      console.error("[daemon] indexer error:", err.message);
    }
    await new Promise(r => setTimeout(r, POLL_MS));
  }
}

run();
