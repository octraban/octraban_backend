/**
 * Reputation leaderboard: real-source data only (Issue #47)
 *
 * The leaderboard endpoint previously had a code path that synthesized a
 * constant chain-data stand-in (uniform transactionCount / derived sybilRisk)
 * and passed it to createLeaderboard, which could silently return fabricated
 * rankings. That path is gone: the endpoint now derives every entry from the
 * real per-address signals returned by fetchProfileData, and returns an
 * explicit "insufficient data" response when none are available.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../src/db', () => ({
  prismaRead: {
    reputationProfile: { findMany: vi.fn() },
  },
  prismaWrite: {},
}));

vi.mock('../../src/cache', () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
}));

vi.mock('../../src/reputation/score', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/reputation/score')>();
  return { ...actual, fetchProfileData: vi.fn() };
});

import { reputationRouter } from '../../src/api/reputation';
import { prismaRead } from '../../src/db';
import { fetchProfileData } from '../../src/reputation/score';

function mount() {
  const app = express();
  app.use(express.json());
  app.use('/reputation', reputationRouter);
  return app;
}

const findMany = prismaRead.reputationProfile.findMany as ReturnType<typeof vi.fn>;
const fetchProfile = fetchProfileData as ReturnType<typeof vi.fn>;

afterEach(() => {
  vi.clearAllMocks();
});

describe('GET /reputation/leaderboard (Issue #47)', () => {
  it('ranks entries from the real fetchProfileData source, not a synthetic array', async () => {
    findMany.mockResolvedValue([
      { address: 'GADDRHIGH', chain: 'stellar', combinedScore: 500 },
      { address: 'GADDRLOW', chain: 'stellar', combinedScore: 100 },
    ]);

    fetchProfile.mockImplementation(async (address: string) => {
      if (address === 'GADDRHIGH') {
        return [
          {
            chainId: 'stellar',
            address,
            transactionCount: 900,
            successfulTransactionCount: 890,
            sybilRisk: 0.05,
          },
        ];
      }
      return [
        {
          chainId: 'stellar',
          address,
          transactionCount: 3,
          successfulTransactionCount: 1,
          sybilRisk: 0.9,
        },
      ];
    });

    const res = await request(mount()).get('/reputation/leaderboard');

    expect(res.status).toBe(200);
    expect(res.body.insufficientData).toBeUndefined();

    // Every profile was scored from its real per-address activity.
    expect(fetchProfile).toHaveBeenCalledWith('GADDRHIGH');
    expect(fetchProfile).toHaveBeenCalledWith('GADDRLOW');

    // Ranking reflects the divergent real signals — a synthetic constant
    // stand-in would have produced identical scores / ordering by address.
    expect(res.body.leaderboard.map((e: { address: string }) => e.address)).toEqual([
      'GADDRHIGH',
      'GADDRLOW',
    ]);
    expect(res.body.leaderboard[0].score).toBeGreaterThan(res.body.leaderboard[1].score);
  });

  it('returns a defined "insufficient data" response when no data is available', async () => {
    findMany.mockResolvedValue([]);

    const res = await request(mount()).get('/reputation/leaderboard');

    expect(res.status).toBe(200);
    expect(res.body.category).toBe('overall');
    expect(res.body.leaderboard).toEqual([]);
    expect(res.body.insufficientData).toBe(true);
    expect(typeof res.body.message).toBe('string');
    expect(fetchProfile).not.toHaveBeenCalled();
  });

  it('returns "insufficient data" when profiles exist but yield no chain activity', async () => {
    findMany.mockResolvedValue([{ address: 'GNOACTIVITY', chain: 'stellar', combinedScore: 0 }]);
    fetchProfile.mockResolvedValue([]);

    const res = await request(mount()).get('/reputation/leaderboard');

    expect(res.status).toBe(200);
    expect(res.body.leaderboard).toEqual([]);
    expect(res.body.insufficientData).toBe(true);
  });
});
