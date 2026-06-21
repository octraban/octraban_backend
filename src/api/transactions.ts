import { Router, Request, Response } from 'express';
import { prismaRead as prisma } from '../db';
import { z } from 'zod';

export const transactionRouter = Router();

const TX_SELECT = {
  hash: true,
  ledgerSequence: true,
  ledgerCloseTime: true,
  sourceAccount: true,
  contractAddress: true,
  functionName: true,
  functionArgs: true,
  status: true,
  humanReadable: true,
  feeCharged: true,
  sorobanResources: true,
  failureReason: true,
};

const listSchema = z.object({
  // cursor-based (preferred for large datasets) — cursor = ledger number
  cursor: z.coerce.number().int().min(0).optional(),
  // offset-based fallback
  page:   z.coerce.number().min(1).default(1),
  limit:  z.coerce.number().min(1).max(100).default(20),
  // filters
  contract:  z.string().optional(),
  account:   z.string().optional(),
  status:    z.string().optional(),
  ledgerMin: z.coerce.number().int().min(0).optional(),
  ledgerMax: z.coerce.number().int().min(0).optional(),
});

// GET /transactions
// Cursor mode:  ?cursor=<ledger>&limit=20&contract=...
// Offset mode:  ?page=2&limit=20&contract=...
transactionRouter.get('/', async (req: Request, res: Response) => {
  try {
    const q = listSchema.parse(req.query);

    const where: any = {
      ...(q.contract  && { contractAddress: q.contract }),
      ...(q.account   && { sourceAccount: q.account }),
      ...(q.status    && { status: q.status }),
      ...((q.ledgerMin !== undefined || q.ledgerMax !== undefined) && {
        ledgerSequence: {
          ...(q.ledgerMin !== undefined && { gte: q.ledgerMin }),
          ...(q.ledgerMax !== undefined && { lte: q.ledgerMax }),
        },
      }),
    };

    if (q.cursor !== undefined) {
      // Cursor-based: return rows with ledger < cursor (descending)
      where.ledgerSequence = { ...where.ledgerSequence, lt: q.cursor };

      const rows = await prisma.transaction.findMany({
        where,
        orderBy: [{ ledgerSequence: 'desc' }, { id: 'desc' }],
        take: q.limit + 1,
        select: TX_SELECT,
      });

      const hasNext = rows.length > q.limit;
      const data = hasNext ? rows.slice(0, q.limit) : rows;
      const nextCursor = hasNext ? (data[data.length - 1] as any).ledgerSequence : null;

      return res.json({ data, nextCursor, hasNext });
    }

    // Offset-based fallback
    const skip = (q.page - 1) * q.limit;
    const [data, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: [{ ledgerSequence: 'desc' }, { id: 'desc' }],
        skip,
        take: q.limit,
        select: TX_SELECT,
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({ data, total, page: q.page, limit: q.limit, pages: Math.ceil(total / q.limit) });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /transactions/:hash
transactionRouter.get('/:hash', async (req: Request, res: Response) => {
  const tx = await prisma.transaction.findUnique({
    where: { hash: req.params.hash },
    select: {
      ...TX_SELECT,
      events: true,
    },
  });
  if (!tx) return res.status(404).json({ error: 'Transaction not found' });

  res.json(tx);
});
