import "dotenv/config";
import { SorobanRpc, xdr, StrKey } from "@stellar/stellar-sdk";
import { startApi } from "./api.js";
import { db } from "./db.js";
import { decode } from "./decoder.js";
import { startAbiSync } from "./githubAbiSync.js";
import { withRetry } from "./rpcRetry.js";
import { isHighBloatRisk } from "./bloatDetector.js";
import { detectUpgrade } from "./upgradeDetector.js";
import { classifyStorageWrites } from "./storageTierClassifier.js";
import { parseFeeBump } from "./feeBumpParser.js";

const RPC_URL    = process.env.SOROBAN_RPC_URL    || "https://soroban-testnet.stellar.org";
const START_LEDGER = Number(process.env.START_LEDGER || 0);
const POLL_MS    = Number(process.env.POLL_MS       || 5000);

/**
 * Extract the raw token amount from a decoded event's raw_data string.
 * Handles two storage formats:
 *   - plain value:   "15000000"  (i128 serialised as number/string)
 *   - wrapped object: {"amount":"15000000"}  (used by some SEP-41 contracts)
 * Returns null when no parseable amount is found.
 */
function parseRawAmount(raw_data) {
  if (!raw_data) return null;
  try {
    const val = JSON.parse(raw_data);
    if (val !== null && typeof val === "object" && !Array.isArray(val) && "amount" in val) {
      return String(val.amount);
    }
    if (typeof val === "number" && Number.isFinite(val)) return String(Math.trunc(val));
    if (typeof val === "string" && /^-?\d+$/.test(val)) return val;
    return null;
  } catch {
    return null;
  }
}

/**
 * Update token_holders balances for SEP-41 transfer / mint / burn events.
 * Non-blocking: errors are logged but never interrupt the indexer loop.
 */
async function applyHolderBalance(decoded) {
  const { function: fn, contract_id, raw_topics, raw_data } = decoded;
  const amount = parseRawAmount(raw_data);
  if (!amount || amount === "0") return;

  if (fn === "transfer") {
    const from = raw_topics[1];
    const to   = raw_topics[2];
    if (from && to) await db.applyTransfer(contract_id, from, to, amount);
  } else if (fn === "mint") {
    // SEP-41 mint topics: [symbol, admin, to]
    const to = raw_topics[2];
    if (to) await db.applyMint(contract_id, to, amount);
  } else if (fn === "burn") {
    // SEP-41 burn topics: [symbol, from]
    const from = raw_topics[1];
    if (from) await db.applyBurn(contract_id, from, amount);
  }
}

const rpc = new SorobanRpc.Server(RPC_URL, { allowHttp: true });

// Mutable cursor shared with the reorg worker so it can rewind on fork
let cursor = 0;
const cursorRef = {
  getCursor: () => cursor,
  setCursor: (n) => { cursor = n; },
};

async function indexLedger(ledger) {
  const res = await withRetry(() => rpc.getEvents({
    startLedger: ledger,
    filters: [{ type: "contract" }],
    limit: 200,
  }));

  // Cache envelopes keyed by txHash to avoid redundant getTransaction calls
  // when multiple events share the same transaction.
  const envelopeCache = new Map();

  for (const ev of res.events) {
    const decoded = await decode(ev);
    decoded.is_high_bloat_risk = isHighBloatRisk(ev, ev.contractId);
    const upgrade = detectUpgrade(ev);
    if (upgrade) {
      console.log(`[${ev.ledger}] CONTRACT UPGRADE ${ev.contractId}: ${upgrade.oldHash} → ${upgrade.newHash}`);
      decoded.upgrade = upgrade;
    }
    decoded.storage_tiers = classifyStorageWrites(ev);

    // Detect Fee-Bump sponsorship on the outer transaction envelope.
    if (ev.txHash) {
      if (!envelopeCache.has(ev.txHash)) {
        try {
          const txInfo = await rpc.getTransaction(ev.txHash);
          envelopeCache.set(ev.txHash, txInfo.envelopeXdr ?? null);
        } catch {
          envelopeCache.set(ev.txHash, null);
        }
      }
      const envelope = envelopeCache.get(ev.txHash);
      if (envelope) decoded.fee_bump = parseFeeBump(envelope);
    }

    await db.upsertEvent(decoded);
    applyHolderBalance(decoded).catch(err => console.warn(`[holders] ${err.message}`));
    publish(decoded);                          // Issue #39 — push to WS clients
    handleVaultEvent(decoded);                 // vault ratio update (async, non-blocking)
    console.log(`[${ev.ledger}] ${decoded.function}: ${decoded.description}`);
  }

  // Issue #37 — record the latest ledger hash for re-org detection
  if (res.latestLedger && res.latestLedgerHash) {
    await recordLedgerHash(res.latestLedger, res.latestLedgerHash).catch(() => {});
  }

  return res.latestLedger;
}

async function run() {
  await db.init();
  startApi();
  startAbiSync();

  // Bootstrap vault indexer: initial ratio snapshot for all registered vaults
  refreshAllVaults().catch(() => {});
  // Periodic ratio refresh every 60s for vaults that accrue without emitting events
  setInterval(() => refreshAllVaults().catch(() => {}), 60_000);

  let cursor = START_LEDGER || (await withRetry(() => rpc.getLatestLedger())).sequence - 100;

  while (true) {
    try {
      const latest = await indexLedger(cursor);
      cursor = latest + 1;
    } catch (err) {
      console.error("Indexer error:", err.message);
    }
    await new Promise(r => setTimeout(r, POLL_MS));
  }
}

run();
