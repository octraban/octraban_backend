/**
 * Ledger Ingestion Gap Detection Script
 *
 * Scans the indexed ledger range for any missing ledger_sequence values
 * and triggers a targeted catchup resync for each gap found.
 *
 * Usage:
 *   node src/gapDetector.js [--dry-run]
 *
 * Options:
 *   --dry-run   Report gaps without triggering resync
 *
 * Environment variables (same as main indexer):
 *   SOROBAN_RPC_URL, DATABASE_URL
 */

import "dotenv/config";
import { db } from "./db.js";
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DRY_RUN = process.argv.includes("--dry-run");

/**
 * Find all missing ledger sequences in the indexed range [min, max].
 * Uses a generate_series approach for a fast single-query gap scan.
 *
 * @returns {Promise<number[]>} sorted array of missing ledger sequences
 */
export async function findLedgerGaps() {
  // Get the full indexed range
  const { rows: rangeRows } = await db.query(
    `SELECT MIN(ledger)::BIGINT AS min_ledger,
            MAX(ledger)::BIGINT AS max_ledger
     FROM events`,
  );

  const { min_ledger, max_ledger } = rangeRows[0];

  if (min_ledger == null || max_ledger == null) {
    console.log("[gapDetector] No ledgers indexed yet.");
    return [];
  }

  console.log(`[gapDetector] Scanning ledger range ${min_ledger} → ${max_ledger}`);

  // generate_series produces every integer in [min, max]; LEFT JOIN finds the holes
  const { rows } = await db.query(
    `SELECT s.ledger::BIGINT AS missing_ledger
     FROM generate_series($1::BIGINT, $2::BIGINT) AS s(ledger)
     LEFT JOIN (
       SELECT DISTINCT ledger FROM events
     ) e ON e.ledger = s.ledger
     WHERE e.ledger IS NULL
     ORDER BY s.ledger`,
    [min_ledger, max_ledger],
  );

  return rows.map((r) => Number(r.missing_ledger));
}

/**
 * Trigger catchup.js for a contiguous range of missing ledgers.
 * Groups consecutive gaps into ranges to minimise subprocess spawns.
 *
 * @param {number[]} gaps  sorted array of missing ledger sequences
 */
function resyncGaps(gaps) {
  if (gaps.length === 0) return;

  // Collapse consecutive sequences into [from, to] ranges
  const ranges = [];
  let rangeStart = gaps[0];
  let prev = gaps[0];

  for (let i = 1; i < gaps.length; i++) {
    if (gaps[i] === prev + 1) {
      prev = gaps[i];
    } else {
      ranges.push([rangeStart, prev]);
      rangeStart = gaps[i];
      prev = gaps[i];
    }
  }
  ranges.push([rangeStart, prev]);

  const catchupScript = path.join(__dirname, "catchup.js");

  for (const [from, to] of ranges) {
    console.log(`[gapDetector] Resyncing ledgers ${from} → ${to}`);
    const result = spawnSync(process.execPath, [catchupScript, `--from=${from}`, `--to=${to}`], {
      stdio: "inherit",
      env: process.env,
    });
    if (result.status !== 0) {
      console.error(`[gapDetector] catchup failed for range ${from}-${to} (exit ${result.status})`);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  await db.init();

  const gaps = await findLedgerGaps();

  if (gaps.length === 0) {
    console.log("[gapDetector] No gaps found. Ledger history is complete.");
    process.exit(0);
  }

  console.log(`[gapDetector] Found ${gaps.length} missing ledger(s):`, gaps);

  if (DRY_RUN) {
    console.log("[gapDetector] --dry-run mode: skipping resync.");
    process.exit(0);
  }

  resyncGaps(gaps);
  console.log("[gapDetector] Resync complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[gapDetector] Fatal:", err);
  process.exit(1);
});
