/**
 * Persistent Storage Eviction & Off-Chain Archival State Tracker
 *
 * Monitors ContractDataEntry TTL expiry by comparing each entry's
 * liveUntilLedger against the current ledger height.  When the threshold
 * is crossed without a TTL extension, the entry is flagged as "Evicted".
 *
 * The module also estimates the RestoreFootprintOp fee needed to revive
 * each evicted entry based on its approximate byte size.
 */

// Soroban network constants (Testnet / Mainnet defaults)
const LEDGER_CLOSE_SECONDS = 5; // ~5 s per ledger
const BYTES_PER_LEDGER_STROOP = 0.0001; // rough rent per byte per ledger (in XLM)
const STROOPS_PER_XLM = 10_000_000;

/**
 * Estimate the RestoreFootprintOp fee (in stroops) to revive an evicted entry.
 *
 * @param {number} entryBytes   approximate byte size of the contract data entry
 * @param {number} restoreLedgers  number of ledgers to restore for (default: 120,960 ≈ 1 week)
 * @returns {number}  estimated fee in stroops
 */
export function estimateRestoreFee(entryBytes = 256, restoreLedgers = 120_960) {
  const xlm = entryBytes * BYTES_PER_LEDGER_STROOP * restoreLedgers;
  return Math.ceil(xlm * STROOPS_PER_XLM);
}

/**
 * Determine the lifecycle state of a contract data entry.
 *
 * @param {number} liveUntilLedger  liveUntilLedger sequence from ContractDataEntry
 * @param {number} currentLedger    current network ledger sequence
 * @returns {"live"|"expiring_soon"|"evicted"}
 */
export function classifyEntryState(liveUntilLedger, currentLedger) {
  if (currentLedger > liveUntilLedger) return "evicted";
  const remaining = liveUntilLedger - currentLedger;
  // Warn when < 1 day remaining (~17,280 ledgers at 5 s/ledger)
  if (remaining < 17_280) return "expiring_soon";
  return "live";
}

/**
 * Process a batch of ContractDataEntry-like objects and annotate each
 * with its current lifecycle state.
 *
 * Input shape (each entry):
 * {
 *   contractId: string,
 *   key: string,
 *   durability: "persistent" | "temporary",
 *   liveUntilLedger: number,
 *   valueSizeBytes?: number,
 *   lastModifiedLedger?: number,
 *   lastModifiedTime?: string,
 * }
 *
 * @param {object[]} entries       array of ContractDataEntry-like objects
 * @param {number}   currentLedger current network ledger sequence
 * @returns {object[]}  same entries with `state`, `ledgersUntilEviction`, `estimatedRestoreFeeStroops` added
 */
export function annotateEvictionStates(entries, currentLedger) {
  return entries.map((entry) => {
    const state = classifyEntryState(entry.liveUntilLedger, currentLedger);
    const ledgersUntilEviction = state === "evicted" ? 0 : entry.liveUntilLedger - currentLedger;

    const estimatedRestoreFeeStroops = state === "evicted" ? estimateRestoreFee(entry.valueSizeBytes ?? 256) : null;

    const secondsUntilEviction = ledgersUntilEviction * LEDGER_CLOSE_SECONDS;

    return {
      ...entry,
      state,
      ledgersUntilEviction,
      secondsUntilEviction,
      estimatedRestoreFeeStroops,
    };
  });
}

/**
 * Filter to only evicted entries from an annotated array.
 *
 * @param {object[]} annotatedEntries  output of annotateEvictionStates
 * @returns {object[]}
 */
export function getEvictedEntries(annotatedEntries) {
  return annotatedEntries.filter((e) => e.state === "evicted");
}

/**
 * Summarise eviction statistics for a contract's storage entries.
 *
 * @param {object[]} annotatedEntries  output of annotateEvictionStates
 * @returns {{
 *   total: number,
 *   live: number,
 *   expiringSoon: number,
 *   evicted: number,
 *   totalEstimatedRestoreFeeStroops: number,
 * }}
 */
export function summariseEvictionStats(annotatedEntries) {
  let live = 0,
    expiringSoon = 0,
    evicted = 0,
    totalFee = 0;

  for (const e of annotatedEntries) {
    if (e.state === "live") live++;
    else if (e.state === "expiring_soon") expiringSoon++;
    else if (e.state === "evicted") {
      evicted++;
      totalFee += e.estimatedRestoreFeeStroops ?? 0;
    }
  }

  return {
    total: annotatedEntries.length,
    live,
    expiringSoon,
    evicted,
    totalEstimatedRestoreFeeStroops: totalFee,
  };
}

/**
 * Parse raw SorobanRpc `getLedgerEntries` response items into the
 * ContractDataEntry shape expected by annotateEvictionStates.
 *
 * @param {object[]} rpcEntries  raw entries from SorobanRpc.getLedgerEntries()
 * @param {Function} [keySerializer]  optional custom key→string serializer
 * @returns {object[]}
 */
export async function parseRpcLedgerEntries(rpcEntries, keySerializer = null) {
  const results = [];

  for (const entry of rpcEntries ?? []) {
    try {
      const xdrEntry = entry.xdr ?? entry.entry ?? entry;
      const liveUntilLedger = entry.liveUntilLedgerSeq ?? entry.live_until_ledger_seq ?? null;
      if (liveUntilLedger == null) continue;

      let contractId = null;
      let key = null;
      let durability = "persistent";

      // Try to extract contractId and key from the XDR string
      if (typeof xdrEntry === "string") {
        try {
          const { xdr: xdrSdk, StrKey, scValToNative } = await import("@stellar/stellar-sdk").catch(() => ({}));
          if (xdrSdk) {
            const le = xdrSdk.LedgerEntry.fromXDR(xdrEntry, "base64");
            const data = le.data();
            if (data.switch().name === "contractData") {
              const cd = data.contractData();
              contractId = StrKey.encodeContract(cd.contract().contractId());
              try {
                key = String(scValToNative(cd.key()));
              } catch {
                key = cd.key().switch().name;
              }
              durability = cd.durability().name ?? "persistent";
            }
          }
        } catch {
          /* fallback below */
        }
      }

      // Fallback shapes from simplified/mock data
      contractId = contractId ?? entry.contractId ?? entry.contract_id ?? null;
      key = key ?? (keySerializer ? keySerializer(entry) : (entry.key ?? entry.keyXdr ?? null));

      if (!contractId || !key) continue;

      results.push({
        contractId,
        key: String(key),
        durability,
        liveUntilLedger: Number(liveUntilLedger),
        valueSizeBytes: entry.valueSizeBytes ?? entry.value_size_bytes ?? 256,
        lastModifiedLedger: entry.lastModifiedLedgerSeq ?? entry.last_modified_ledger_seq ?? null,
      });
    } catch {
      /* skip malformed entries */
    }
  }

  return results;
}
