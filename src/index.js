import "dotenv/config";
import { SorobanRpc, xdr, StrKey } from "@stellar/stellar-sdk";
import { startApi } from "./api.js";
import { db } from "./db.js";
import { decode } from "./decoder.js";
import { startAbiSync } from "./githubAbiSync.js";
import { withRetry } from "./rpcRetry.js";

const RPC_URL    = process.env.SOROBAN_RPC_URL    || "https://soroban-testnet.stellar.org";
const START_LEDGER = Number(process.env.START_LEDGER || 0);
const POLL_MS    = Number(process.env.POLL_MS       || 5000);

const rpc = new SorobanRpc.Server(RPC_URL, { allowHttp: true });

async function indexLedger(ledger) {
  const res = await withRetry(() => rpc.getEvents({
    startLedger: ledger,
    filters: [{ type: "contract" }],
    limit: 200,
  }));

  for (const ev of res.events) {
    const decoded = await decode(ev);
    await db.upsertEvent(decoded);
    console.log(`[${ev.ledger}] ${decoded.function}: ${decoded.description}`);
  }

  return res.latestLedger;
}

async function run() {
  await db.init();
  startApi();
  startAbiSync();

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
