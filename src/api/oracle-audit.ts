import { Router, Request, Response } from 'express';
import { prismaRead } from '../db';

export const oracleAuditRouter = Router();

// GET /audits/oracle/:requestTxHash
oracleAuditRouter.get('/:requestTxHash', async (req: Request, res: Response) => {
  try {
    const audit = await prismaRead.oracleCallback.findUnique({
      where: { requestTransactionHash: req.params.requestTxHash },
    });

    if (!audit) {
      return res.status(404).json({ error: 'Oracle callback not found' });
    }

    res.json({
      ...audit,
      operationalCard: {
        requestTxHash: audit.requestTransactionHash,
        fulfillmentTxHash: audit.fulfillmentTransactionHash,
        roundTripLatencyBlocks: audit.roundTripLatencyBlocks,
        roundTripLatencyMs: audit.roundTripLatencyMs,
        status: audit.status,
      },
    });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /audits/oracle/contract/:oracleAddress
oracleAuditRouter.get('/contract/:oracleAddress', async (req: Request, res: Response) => {
  try {
    const callbacks = await prismaRead.oracleCallback.findMany({
      where: { oracleContractAddress: req.params.oracleAddress },
      orderBy: { requestLedgerSequence: 'desc' },
      take: 100,
    });

    const stats = {
      totalCallbacks: callbacks.length,
      fulfilled: callbacks.filter((c) => c.status === 'fulfilled').length,
      pending: callbacks.filter((c) => c.status === 'pending').length,
      avgLatencyBlocks:
        callbacks
          .filter((c) => c.roundTripLatencyBlocks)
          .reduce((sum, c) => sum + (c.roundTripLatencyBlocks || 0), 0) /
          callbacks.filter((c) => c.roundTripLatencyBlocks).length || 0,
      callbacks,
    };

    res.json(stats);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});
