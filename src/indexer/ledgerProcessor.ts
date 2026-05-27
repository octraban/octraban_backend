import { prismaWrite as prisma } from '../db';
import { fetchEvents, getTransaction } from './rpc';
import { decodeTransaction } from './decoder';
import { ingestEvents } from './eventIngestor';
import { enqueueFailure } from './errorQueue';
import { detectContention } from './contention';
import { inspectSignature } from './signatureInspector';

/**
 * Fetch, decode, and persist all transactions and events for [start, end].
 * Safe to call concurrently for non-overlapping ranges — all DB writes use
 * upsert so duplicate execution is idempotent.
 */
export async function processLedgerRange(start: number, end: number): Promise<void> {
  console.log(`[worker] Indexing ledgers ${start} → ${end}`);
  const events = await fetchEvents(start, end);

  for (const event of events) {
    // Upsert the Ledger row before writing transactions/events (FK constraint)
    await prisma.ledger.upsert({
      where: { sequence: event.ledgerSequence },
      update: {},
      create: {
        sequence: event.ledgerSequence,
        hash: '',               // hash not available from event stream; filled in if known
        closeTime: event.ledgerCloseTime,
      },
    });

    await prisma.contract.upsert({
      where: { address: event.contractId },
      update: {},
      create: { address: event.contractId },
    });

    const existingTx = await prisma.transaction.findUnique({ where: { hash: event.transactionHash } });
    if (!existingTx) {
      const txResult = await getTransaction(event.transactionHash).catch(() => null);
      const rawXdr = (txResult as any)?.envelopeXdr?.toXDR('base64') ?? '';
      const decoded = rawXdr
        ? await decodeTransaction(rawXdr).catch(async (err) => {
            await enqueueFailure({
              itemType: 'transaction',
              itemId: event.transactionHash,
              ledger: event.ledgerSequence,
              rawXdr,
              error: err,
            });
            return { contractAddress: event.contractId, functionName: null, functionArgs: null, humanReadable: null };
          })
        : { contractAddress: event.contractId, functionName: null, functionArgs: null, humanReadable: null };

      await prisma.transaction.upsert({
        where: { hash: event.transactionHash },
        update: {},
        create: {
          hash: event.transactionHash,
          ledgerSequence: event.ledgerSequence,
          ledgerCloseTime: event.ledgerCloseTime,
          sourceAccount: (txResult as any)?.sourceAccount ?? 'unknown',
          contractAddress: decoded.contractAddress,
          functionName: decoded.functionName,
          functionArgs: decoded.functionArgs as object ?? undefined,
          rawXdr,
          status: (txResult as any)?.status === 'SUCCESS' ? 'success' : 'failed',
          humanReadable: decoded.humanReadable,
          feeCharged: String((txResult as any)?.feeCharged ?? ''),
        },
      });

      // Inspect for secp256r1 / passkey signatures (non-blocking)
      if (rawXdr) {
        inspectSignature(event.transactionHash, event.ledgerSequence, rawXdr).catch(() => {});
      }
    }
  }

  const stored = await ingestEvents(start, end);
  console.log(`[worker] ledgers ${start}–${end}: ${events.length} txs, ${stored} events`);

  // Group transactions by ledger and run contention detection
  const byLedger = new Map<number, Array<{ hash: string; contractAddress: string | null; rawXdr: string }>>();
  for (const event of events) {
    if (!byLedger.has(event.ledgerSequence)) byLedger.set(event.ledgerSequence, []);
    const tx = await prisma.transaction.findUnique({
      where: { hash: event.transactionHash },
      select: { hash: true, contractAddress: true, rawXdr: true },
    });
    if (tx) byLedger.get(event.ledgerSequence)!.push(tx);
  }
  for (const [ledger, txs] of byLedger) {
    await detectContention(ledger, txs).catch((err) =>
      console.warn(`[contention] ledger ${ledger} detection failed:`, err)
    );
  }
}
