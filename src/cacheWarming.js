/**
 * Cache Warming — pre-populate Redis with hot data on deploy.
 *
 * Strategy:
 * 1. Warm events list pages 1–3 (highest traffic)
 * 2. Warm the 10 most active contracts (by event count)
 *
 * Called once from index.js after db.init().  Failures are non-fatal.
 */

import { cacheSet } from "./cacheLayer.js";
import { db } from "./db.js";

export async function warmCache() {
  console.log("[cache:warm] starting...");
  const results = { warmed: 0, failed: 0 };

  // Warm events list pages 1–3
  for (let page = 1; page <= 3; page++) {
    try {
      const events = await db.getEvents({ page });
      const key = `events:list:::${page}:`;
      await cacheSet(key, events, "events_list", 0);
      results.warmed++;
    } catch (e) {
      console.warn(`[cache:warm] events page ${page} failed:`, e.message);
      results.failed++;
    }
  }

  // Warm top 10 most active contracts
  try {
    const top = await db.getTopContracts(10);
    for (const { contract_id } of top) {
      try {
        const meta = await db.getContractMeta(contract_id);
        if (meta) {
          await cacheSet(
            `contracts:single:${contract_id}`,
            meta,
            "contracts_single",
            0,
          );
          results.warmed++;
        }
      } catch {}
    }
  } catch (e) {
    console.warn("[cache:warm] top contracts failed:", e.message);
    results.failed++;
  }

  console.log(
    `[cache:warm] complete — warmed ${results.warmed}, failed ${results.failed}`,
  );
}
