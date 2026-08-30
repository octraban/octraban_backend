import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// ── Mocks ─────────────────────────────────────────────────────────────────────
//
// The dispatcher talks to Prisma and the SSRF-guarded HTTP transport. Both are
// replaced with in-memory fakes so the retry/backoff/signing logic can be
// exercised deterministically without a database or network.

const h = vi.hoisted(() => {
  const rows = new Map<string, Record<string, unknown>>();
  const state = { seq: 0 };

  const prisma = {
    webhookSubscription: { findMany: vi.fn(async () => [] as unknown[]) },
    webhookDelivery: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = `d${++state.seq}`;
        const row = { id, ...data };
        rows.set(id, row);
        return row;
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = { ...(rows.get(where.id) ?? { id: where.id }), ...data };
          rows.set(where.id, row);
          return row;
        },
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null),
      findMany: vi.fn(async () => [...rows.values()]),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    event: { findUnique: vi.fn(async () => null) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };

  const safePost = vi.fn();

  class SsrfBlockedError extends Error {
    constructor(reason: string) {
      super(reason);
      this.name = 'SsrfBlockedError';
    }
  }

  return { rows, prisma, safePost, SsrfBlockedError };
});

vi.mock('../../src/db', () => ({ prismaWrite: h.prisma, prismaRead: h.prisma }));

vi.mock('../../src/webhooks/ssrf-guard', () => ({
  assertSafeUrl: vi.fn().mockResolvedValue(undefined),
  safePost: h.safePost,
  SsrfBlockedError: h.SsrfBlockedError,
}));

import {
  backoffMs,
  deliverOnce,
  listDeadLetterDeliveries,
  getDispatchMetrics,
  MAX_ATTEMPTS,
  BACKOFF_BASE_MS,
  BACKOFF_CAP_MS,
  DEAD_LETTER_STATUS,
  type WebhookPayload,
} from '../../src/webhooks/dispatcher';

const EVENT: WebhookPayload = {
  id: 'evt-1',
  contractAddress: 'CABC',
  eventType: 'transfer',
  topicSymbol: null,
  decoded: { from: 'A', to: 'B', amount: '10' },
  ledger: 42,
  ledgerCloseTime: new Date('2026-01-01T00:00:00Z'),
  transactionHash: 'hash-1',
};

const URL = 'https://hooks.example.com/receiver';

beforeEach(() => {
  h.rows.clear();
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('backoffMs', () => {
  it('returns an increasing exponential schedule', () => {
    const schedule = [1, 2, 3, 4, 5].map((attempt) => backoffMs(attempt));

    expect(schedule).toEqual([
      BACKOFF_BASE_MS,
      BACKOFF_BASE_MS * 3,
      BACKOFF_BASE_MS * 9,
      BACKOFF_BASE_MS * 27,
      BACKOFF_BASE_MS * 81,
    ]);
    expect(schedule).toEqual([10_000, 30_000, 90_000, 270_000, 810_000]);

    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i]).toBeGreaterThan(schedule[i - 1]);
    }
  });

  it('caps the delay at 15 minutes', () => {
    expect(backoffMs(6)).toBe(BACKOFF_CAP_MS);
    expect(backoffMs(20)).toBe(BACKOFF_CAP_MS);
    expect(BACKOFF_CAP_MS).toBe(900_000);
  });
});

describe('delivery HMAC signature', () => {
  it('signs the request body with the subscription secret', async () => {
    h.safePost.mockResolvedValue({ status: 200, data: 'ok' });
    const secret = 'x'.repeat(48);

    await deliverOnce('sub-1', URL, secret, EVENT, 1);

    expect(h.safePost).toHaveBeenCalledOnce();
    const [calledUrl, body, headers] = h.safePost.mock.calls[0] as [
      string,
      string,
      Record<string, string>,
    ];

    expect(calledUrl).toBe(URL);

    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(headers['X-Webhook-Signature']).toBe(expected);

    // The signed body is the {event, attempt} envelope.
    expect(JSON.parse(body)).toMatchObject({ attempt: 1, event: { id: EVENT.id } });
  });

  it('produces a different signature for a different secret', async () => {
    h.safePost.mockResolvedValue({ status: 200, data: 'ok' });

    await deliverOnce('sub-1', URL, 'a'.repeat(48), EVENT, 1);
    await deliverOnce('sub-2', URL, 'b'.repeat(48), EVENT, 1);

    const sigA = (h.safePost.mock.calls[0][2] as Record<string, string>)['X-Webhook-Signature'];
    const sigB = (h.safePost.mock.calls[1][2] as Record<string, string>)['X-Webhook-Signature'];
    expect(sigA).not.toBe(sigB);
  });
});

describe('dead-letter handling', () => {
  it('schedules another retry while attempts remain below the cap', async () => {
    h.safePost.mockResolvedValue({ status: 503, data: 'unavailable' });
    h.rows.set('d-mid', {
      id: 'd-mid',
      subscriptionId: 'sub-1',
      eventId: EVENT.id,
      attempt: 1,
      status: 'pending',
    });

    await deliverOnce('sub-1', URL, 'k'.repeat(48), EVENT, 1, 'd-mid');

    const row = h.rows.get('d-mid')!;
    expect(row.status).toBe('pending');
    expect(row.attempt).toBe(2);
    expect(row.nextRetryAt).toBeInstanceOf(Date);
  });

  it('moves a delivery to the terminal dead-letter state after the max attempts', async () => {
    h.safePost.mockResolvedValue({ status: 500, data: 'permanent failure' });
    const before = getDispatchMetrics().deadLetterCount;

    h.rows.set('d-final', {
      id: 'd-final',
      subscriptionId: 'sub-1',
      eventId: EVENT.id,
      attempt: MAX_ATTEMPTS,
      status: 'pending',
    });

    await deliverOnce('sub-1', URL, 'k'.repeat(48), EVENT, MAX_ATTEMPTS, 'd-final');

    const row = h.rows.get('d-final')!;
    expect(row.status).toBe(DEAD_LETTER_STATUS);
    expect(row.processingStatus).toBe('done');
    expect(row.nextRetryAt).toBeNull();
    expect(row.leaseExpiresAt).toBeNull();

    // The dead-letter metric advanced …
    expect(getDispatchMetrics().deadLetterCount).toBe(before + 1);

    // … and the delivery is visible through the operator query.
    const deadLettered = await listDeadLetterDeliveries();
    expect(deadLettered).toHaveLength(1);
    expect((deadLettered[0] as { id: string }).id).toBe('d-final');
  });

  it('never retries once dead-lettered', async () => {
    h.safePost.mockResolvedValue({ status: 500, data: 'nope' });
    h.rows.set('d-x', {
      id: 'd-x',
      subscriptionId: 'sub-1',
      eventId: EVENT.id,
      attempt: MAX_ATTEMPTS,
      status: 'pending',
    });

    await deliverOnce('sub-1', URL, 'k'.repeat(48), EVENT, MAX_ATTEMPTS, 'd-x');

    const row = h.rows.get('d-x')!;
    expect(row.status).toBe(DEAD_LETTER_STATUS);
    expect(row.attempt).toBe(MAX_ATTEMPTS); // not incremented past the cap
  });
});
