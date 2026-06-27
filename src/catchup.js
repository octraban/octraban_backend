/**
 * Historical Block Indexing Catch-Up Script
 *
 * Syncs a range of historical ledgers in parallel workers without overloading
 * the RPC node or causing duplicate-key violations in the DB.
 *
 * Usage:
 *   node src/catchup.js --from=<ledger> --to=<ledger> [--workers=5] [--batch=50]
 *
 * Environment variables (same as main indexer):
 *   SOROBAN_RPC_URL, DATABASE_URL
 */

import "dotenv/config";
import { SorobanRpc } from "@stellar/stellar-sdk";
import { db } from "./db.js";
import { decode } from "./decoder.js";
import { withRetry } from "./rpcRetry.js";
import { isHighBloatRisk } from "./bloatDetector.js";
import { detectUpgrade } from "./upgradeDetector.js";
import { classifyStorageWrites } from "./storageTierClassifier.js";

const RPC_URL = process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
const PAGE_LIMIT = 200; // Soroban RPC hard cap

const rpc = new SorobanRpc.Server(RPC_URL, { allowHttp: true });

// ── CLI argument parsing ──────────────────────────────────────────────────────
function parseArgs() {
  const args = Object.fromEntries(
    process.argv
      .slice(2)
      .filter((a) => a.startsWith("--"))
      .map((a) => {
        const [k, v] = a.slice(2).split("=");
        return [k, v];
      }),
  );

  const from = Number(args.from);
  const to = Number(args.to);
  const workers = Number(args.workers || 5);
  const batch = Number(args.batch || 50); // ledgers per worker chunk

  if (!from || !to || from > to) {
    console.error("Usage: node src/catchup.js --from=<ledger> --to=<ledger> [--workers=5] [--batch=50]");
    process.exit(1);
  }
  return { from, to, workers, batch };
}

// ── Fetch and store all events for a single ledger (with RPC pagination) ─────
async function processLedger(ledger) {
  let pageCursor = undefined;

  do {
    const req = {
      ...(pageCursor ? { cursor: pageCursor } : { startLedger: ledger }),
      filters: [{ type: "contract" }],
      limit: PAGE_LIMIT,
    };

    const res = await withRetry(() => rpc.getEvents(req));

    for (const ev of res.events) {
      // Only process events that belong to this ledger
      if (ev.ledger !== ledger) continue;

      const decoded = await decode(ev);
      decoded.is_high_bloat_risk = isHighBloatRisk(ev, ev.contractId);

      const upgrade = detectUpgrade(ev);
      if (upgrade) decoded.upgrade = upgrade;

      decoded.storage_tiers = classifyStorageWrites(ev);

      // ON CONFLICT DO NOTHING in upsertEvent prevents duplicate-key violations
      await db.upsertEvent(decoded);
    }

    pageCursor = res.events.length === PAGE_LIMIT ? res.cursor : undefined;
  } while (pageCursor);
}

// ── Worker: processes a contiguous chunk of ledgers sequentially ──────────────
async function worker(id, ledgers) {
  let done = 0;
  for (const ledger of ledgers) {
    try {
      await processLedger(ledger);
      done++;
      if (done % 100 === 0) {
        console.log(`[worker-${id}] processed ${done}/${ledgers.length} ledgers (last: ${ledger})`);
      }
    } catch (err) {
      // Log and continue — a single failed ledger should not abort the whole run
      console.error(`[worker-${id}] ledger ${ledger} failed: ${err.message}`);
    }
  }
  console.log(`[worker-${id}] done — ${done}/${ledgers.length} ledgers processed`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const { from, to, workers, batch } = parseArgs();

  await db.init();

  const totalLedgers = to - from + 1;
  console.log(
    `[catchup] syncing ledgers ${from}–${to} (${totalLedgers} total) with ${workers} workers, batch=${batch}`,
  );

  // Build the full list of ledgers to process
  const allLedgers = Array.from({ length: totalLedgers }, (_, i) => from + i);

  // Distribute ledgers across workers in round-robin chunks of `batch` size
  // so each worker gets interleaved ranges (avoids hot-spot on a single ledger range)
  const workerQueues = Array.from({ length: workers }, () => []);
  for (let i = 0; i < allLedgers.length; i++) {
    workerQueues[Math.floor(i / batch) % workers].push(allLedgers[i]);
  }

  const start = Date.now();
  await Promise.all(workerQueues.map((ledgers, id) => worker(id, ledgers)));

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[catchup] complete — ${totalLedgers} ledgers in ${elapsed}s`);

  process.exit(0);
}

main().catch((err) => {
  console.error("[catchup] fatal:", err);
  process.exit(1);
});
