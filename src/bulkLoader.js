/**
 * Bulk Block Processing Loader for Fast Ecosystem Resyncing
 *
 * High-speed historical ledger importer. Uses concurrent workers and batch
 * DB inserts to achieve ≥500 blocks/second throughput.
 *
 * Usage:
 *   node src/bulkLoader.js --from=<ledger> --to=<ledger> [--workers=10] [--batch=100]
 */

import "dotenv/config";
import { SorobanRpc } from "@stellar/stellar-sdk";
import { db } from "./db.js";
import { decode } from "./decoder.js";
import { withRetry } from "./rpcRetry.js";

const RPC_URL = process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
const PAGE_LIMIT = 200;

const rpc = new SorobanRpc.Server(RPC_URL, { allowHttp: true });

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
  const workers = Number(args.workers || 10);
  const batch = Number(args.batch || 100);

  if (!from || !to || from > to) {
    console.error("Usage: node src/bulkLoader.js --from=<ledger> --to=<ledger> [--workers=10] [--batch=100]");
    process.exit(1);
  }
  return { from, to, workers, batch };
}

/** Fetch all events for a ledger, return decoded array (no DB write yet). */
async function fetchLedgerEvents(ledger) {
  const events = [];
  let pageCursor;

  do {
    const req = {
      ...(pageCursor ? { cursor: pageCursor } : { startLedger: ledger }),
      filters: [{ type: "contract" }],
      limit: PAGE_LIMIT,
    };
    const res = await withRetry(() => rpc.getEvents(req));

    for (const ev of res.events) {
      if (ev.ledger !== ledger) continue;
      events.push(await decode(ev));
    }

    pageCursor = res.events.length === PAGE_LIMIT ? res.cursor : undefined;
  } while (pageCursor);

  return events;
}

/** Batch-insert an array of decoded events in a single transaction. */
async function batchInsert(events) {
  if (!events.length) return;

  // Build a multi-row INSERT … ON CONFLICT DO NOTHING
  const cols = ["contract_id", "function", "ledger", "tx_hash", "description", "raw_topics", "raw_data"];
  const placeholders = events
    .map((_, i) => {
      const base = i * cols.length;
      return `(${cols.map((_, j) => `$${base + j + 1}`).join(", ")})`;
    })
    .join(", ");

  const values = events.flatMap((e) => [
    e.contract_id,
    e.function,
    e.ledger,
    e.tx_hash ?? null,
    e.description,
    JSON.stringify(e.raw_topics ?? null),
    e.raw_data ?? null,
  ]);

  await db.query(`INSERT INTO events (${cols.join(", ")}) VALUES ${placeholders} ON CONFLICT DO NOTHING`, values);
}

/** Worker: processes a list of ledgers, collecting events then batch-inserting. */
async function worker(id, ledgers, batchSize) {
  let done = 0;
  let buffer = [];

  const flush = async () => {
    if (buffer.length) {
      await batchInsert(buffer);
      buffer = [];
    }
  };

  for (const ledger of ledgers) {
    try {
      const events = await fetchLedgerEvents(ledger);
      buffer.push(...events);
      done++;

      if (buffer.length >= batchSize * 10) await flush();

      if (done % 500 === 0) {
        console.log(`[bulk-worker-${id}] ${done}/${ledgers.length} ledgers (last: ${ledger})`);
      }
    } catch (err) {
      console.error(`[bulk-worker-${id}] ledger ${ledger} failed: ${err.message}`);
    }
  }

  await flush();
  console.log(`[bulk-worker-${id}] done — ${done}/${ledgers.length} ledgers`);
  return done;
}

async function main() {
  const { from, to, workers, batch } = parseArgs();
  await db.init();

  const total = to - from + 1;
  console.log(`[bulk-loader] ledgers ${from}–${to} (${total} total), workers=${workers}, batch=${batch}`);

  const allLedgers = Array.from({ length: total }, (_, i) => from + i);

  // Distribute ledgers evenly across workers
  const queues = Array.from({ length: workers }, () => []);
  allLedgers.forEach((l, i) => queues[i % workers].push(l));

  const start = Date.now();
  const results = await Promise.all(queues.map((ledgers, id) => worker(id, ledgers, batch)));

  const elapsed = (Date.now() - start) / 1000;
  const processed = results.reduce((a, b) => a + b, 0);
  const rate = (processed / elapsed).toFixed(0);

  console.log(`[bulk-loader] complete — ${processed} ledgers in ${elapsed.toFixed(1)}s (${rate} ledgers/s)`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[bulk-loader] fatal:", err);
  process.exit(1);
});
