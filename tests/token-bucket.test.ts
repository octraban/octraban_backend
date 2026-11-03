import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/db', () => ({
  prismaRead: {
    devApiKey: { findFirst: vi.fn() },
    rateLimitOverride: { findUnique: vi.fn().mockResolvedValue(null) },
  },
  prismaWrite: {
    devApiKey: { update: vi.fn().mockResolvedValue(null) },
  },
}));
vi.mock('../src/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { prismaRead } from '../src/db';
import { _clearKeyCache, apiKeyAuth, normalizeRateLimitTier } from '../src/middleware/apiKeyAuth';
import { tieredRateLimit } from '../src/middleware/rateLimit';
import {
  _resetMemoryBuckets,
  checkTokenBucket,
  DEFAULT_TIER_LIMITS,
  getTierLimits,
  resolveTierLimits,
  setRateLimitRedisClient,
  tokenBucketMiddleware,
} from '../src/middleware/tokenBucket';

const mockFindKey = (prismaRead as any).devApiKey.findFirst as ReturnType<typeof vi.fn>;

function buildTestApp(useDirectTokenBucket = false) {
  const app = express();
  app.use(express.json());
  app.use(apiKeyAuth);
  app.use(useDirectTokenBucket ? tokenBucketMiddleware() : tieredRateLimit);
  app.get('/api/v1/events', (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.get('/api/v1/search', (_req, res) => {
    res.status(200).json({ results: [] });
  });
  return app;
}

describe('tokenBucket tier configuration via environment variables', () => {
  beforeEach(() => {
    _resetMemoryBuckets();
    _clearKeyCache();
    setRateLimitRedisClient(null);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    setRateLimitRedisClient(null);
  });

  it('uses current hardcoded values as defaults when env vars are unset', () => {
    const resolved = resolveTierLimits({});

    expect(resolved.unauthenticated).toMatchObject({
      limit: 60,
      perMinute: 60,
      windowMs: 60_000,
      burst: 10,
    });
    expect(resolved.free).toMatchObject({
      limit: 1000,
      perMinute: 1000,
      windowMs: 60_000,
      burst: 50,
    });
    expect(resolved.developer).toMatchObject({
      limit: 1000,
      perMinute: 1000,
      windowMs: 60_000,
      burst: 50,
    });
    expect(resolved.pro).toMatchObject({
      limit: 10000,
      perMinute: 10000,
      windowMs: 60_000,
      burst: 200,
    });
    expect(resolved.enterprise).toMatchObject({
      limit: 60000,
      perMinute: 60000,
      windowMs: 60_000,
      burst: 500,
    });
  });

  it('configures each tier limit and window from environment variables', () => {
    const customEnv: NodeJS.ProcessEnv = {
      RATE_LIMIT_TIER_UNAUTHENTICATED_LIMIT: '25',
      RATE_LIMIT_TIER_UNAUTHENTICATED_WINDOW_MS: '30000',
      RATE_LIMIT_TIER_FREE_LIMIT: '500',
      RATE_LIMIT_TIER_FREE_WINDOW_MS: '120000',
      RATE_LIMIT_TIER_DEVELOPER_LIMIT: '2000',
      RATE_LIMIT_TIER_DEVELOPER_WINDOW_MS: '45000',
      RATE_LIMIT_TIER_PRO_LIMIT: '15000',
      RATE_LIMIT_TIER_PRO_WINDOW_MS: '90000',
      RATE_LIMIT_TIER_ENTERPRISE_LIMIT: '120000',
      RATE_LIMIT_TIER_ENTERPRISE_WINDOW_MS: '180000',
    };

    const resolved = resolveTierLimits(customEnv);

    expect(resolved.unauthenticated).toMatchObject({ limit: 25, windowMs: 30_000 });
    expect(resolved.free).toMatchObject({ limit: 500, windowMs: 120_000 });
    expect(resolved.developer).toMatchObject({ limit: 2000, windowMs: 45_000 });
    expect(resolved.pro).toMatchObject({ limit: 15000, windowMs: 90_000 });
    expect(resolved.enterprise).toMatchObject({ limit: 120000, windowMs: 180_000 });
  });

  it('falls back to defaults when env vars are invalid, zero, negative, or non-integer', () => {
    const noisyEnv: NodeJS.ProcessEnv = {
      RATE_LIMIT_TIER_UNAUTHENTICATED_LIMIT: '0',
      RATE_LIMIT_TIER_UNAUTHENTICATED_WINDOW_MS: '-5000',
      RATE_LIMIT_TIER_FREE_LIMIT: 'not-a-number',
      RATE_LIMIT_TIER_FREE_WINDOW_MS: '12.5',
      RATE_LIMIT_TIER_PRO_LIMIT: '   ',
    };

    expect(getTierLimits('unauthenticated', noisyEnv)).toMatchObject({
      limit: DEFAULT_TIER_LIMITS.unauthenticated.limit,
      windowMs: DEFAULT_TIER_LIMITS.unauthenticated.windowMs,
    });
    expect(getTierLimits('free', noisyEnv)).toMatchObject({
      limit: DEFAULT_TIER_LIMITS.free.limit,
      windowMs: DEFAULT_TIER_LIMITS.free.windowMs,
    });
    expect(getTierLimits('pro', noisyEnv)).toMatchObject({
      limit: DEFAULT_TIER_LIMITS.pro.limit,
      windowMs: DEFAULT_TIER_LIMITS.pro.windowMs,
    });
  });
});

describe('standard rate-limit headers and 429 Retry-After integration', () => {
  beforeEach(() => {
    _resetMemoryBuckets();
    _clearKeyCache();
    setRateLimitRedisClient(null);
    vi.clearAllMocks();
    mockFindKey.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    setRateLimitRedisClient(null);
  });

  it('includes RateLimit-Limit, RateLimit-Remaining, and RateLimit-Reset on within-limit requests and 429 with Retry-After when exceeded', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
    vi.stubEnv('RATE_LIMIT_TIER_UNAUTHENTICATED_LIMIT', '3');
    vi.stubEnv('RATE_LIMIT_TIER_UNAUTHENTICATED_WINDOW_MS', '30000');

    const app = buildTestApp();

    const r1 = await request(app).get('/api/v1/events');
    expect(r1.status).toBe(200);
    expect(r1.headers['ratelimit-limit']).toBe('3');
    expect(r1.headers['ratelimit-remaining']).toBe('2');
    expect(Number(r1.headers['ratelimit-reset'])).toBeGreaterThan(0);
    expect(r1.headers['retry-after']).toBeUndefined();

    const r2 = await request(app).get('/api/v1/events');
    expect(r2.status).toBe(200);
    expect(r2.headers['ratelimit-limit']).toBe('3');
    expect(r2.headers['ratelimit-remaining']).toBe('1');
    expect(r2.headers['retry-after']).toBeUndefined();

    const r3 = await request(app).get('/api/v1/events');
    expect(r3.status).toBe(200);
    expect(r3.headers['ratelimit-limit']).toBe('3');
    expect(r3.headers['ratelimit-remaining']).toBe('0');
    expect(r3.headers['retry-after']).toBeUndefined();

    const r4 = await request(app).get('/api/v1/events');
    expect(r4.status).toBe(429);
    expect(r4.headers['ratelimit-limit']).toBe('3');
    expect(r4.headers['ratelimit-remaining']).toBe('0');
    expect(Number(r4.headers['ratelimit-reset'])).toBe(30);
    expect(r4.headers['retry-after']).toBe('30');
    expect(r4.body).toMatchObject({
      error: 'Rate limit exceeded',
      tier: 'unauthenticated',
      retryAfter: 30,
    });

    // Advance past the 30s configured window and verify quota refills
    vi.advanceTimersByTime(30_000);

    const r5 = await request(app).get('/api/v1/events');
    expect(r5.status).toBe(200);
    expect(r5.headers['ratelimit-limit']).toBe('3');
    expect(r5.headers['ratelimit-remaining']).toBe('2');
    expect(r5.headers['retry-after']).toBeUndefined();
  });

  it('applies authenticated API key tier limits configured via env vars', async () => {
    vi.stubEnv('RATE_LIMIT_TIER_DEVELOPER_LIMIT', '4');
    vi.stubEnv('RATE_LIMIT_TIER_DEVELOPER_WINDOW_MS', '60000');

    mockFindKey.mockResolvedValue({
      id: 'dev-key-1',
      name: 'ci-key',
      developerId: 'dev-42',
      tier: 'developer',
      rateLimitOverride: null,
      allowedIps: null,
      allowedEndpoints: null,
      allowedDomains: null,
      expiresAt: null,
      revokedAt: null,
    });

    const app = buildTestApp();

    const res = await request(app).get('/api/v1/events').set('X-Api-Key', 'secret-dev-key');
    expect(res.status).toBe(200);
    expect(res.headers['ratelimit-limit']).toBe('4');
    expect(res.headers['ratelimit-remaining']).toBe('3');
    expect(res.headers['x-ratelimit-tier']).toBe('developer');
  });

  it('enforces per-key rateLimitOverride from apiKeyAuth over the tier default', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00.000Z'));

    mockFindKey.mockResolvedValue({
      id: 'custom-override-key',
      name: 'custom-quota',
      developerId: 'dev-99',
      tier: 'pro',
      rateLimitOverride: 2,
      allowedIps: null,
      allowedEndpoints: null,
      allowedDomains: null,
      expiresAt: null,
      revokedAt: null,
    });

    const app = buildTestApp();

    const first = await request(app).get('/api/v1/events').set('X-Api-Key', 'override-raw-key');
    expect(first.status).toBe(200);
    expect(first.headers['ratelimit-limit']).toBe('2');
    expect(first.headers['ratelimit-remaining']).toBe('1');

    const second = await request(app).get('/api/v1/events').set('X-Api-Key', 'override-raw-key');
    expect(second.status).toBe(200);
    expect(second.headers['ratelimit-limit']).toBe('2');
    expect(second.headers['ratelimit-remaining']).toBe('0');

    const third = await request(app).get('/api/v1/events').set('X-Api-Key', 'override-raw-key');
    expect(third.status).toBe(429);
    expect(third.headers['ratelimit-limit']).toBe('2');
    expect(third.headers['ratelimit-remaining']).toBe('0');
    expect(Number(third.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(third.body.tier).toBe('pro');
  });

  it('normalizes casing and unknown tier values safely in apiKeyAuth', async () => {
    expect(normalizeRateLimitTier(' PRO ')).toBe('pro');
    expect(normalizeRateLimitTier('Enterprise')).toBe('enterprise');
    expect(normalizeRateLimitTier('legacy_unknown')).toBe('free');
    expect(normalizeRateLimitTier(null)).toBe('free');

    mockFindKey.mockResolvedValue({
      id: 'unknown-tier-key',
      name: 'legacy',
      developerId: 'dev-7',
      tier: 'legacy_unknown',
      rateLimitOverride: 0,
      allowedIps: null,
      allowedEndpoints: null,
      allowedDomains: null,
      expiresAt: null,
      revokedAt: null,
    });

    const app = buildTestApp();
    const res = await request(app).get('/api/v1/events').set('X-Api-Key', 'legacy-key');

    expect(res.status).toBe(200);
    expect(res.headers['ratelimit-limit']).toBe('1000');
    expect(res.headers['ratelimit-remaining']).toBe('999');
    expect(res.headers['x-ratelimit-tier']).toBe('free');
  });

  it('emits standard headers and Retry-After via standalone tokenBucketMiddleware', async () => {
    vi.stubEnv('RATE_LIMIT_TIER_UNAUTHENTICATED_LIMIT', '1');
    vi.stubEnv('RATE_LIMIT_TIER_UNAUTHENTICATED_WINDOW_MS', '15000');

    const app = buildTestApp(true);

    const okRes = await request(app).get('/api/v1/events');
    expect(okRes.status).toBe(200);
    expect(okRes.headers['ratelimit-limit']).toBe('1');
    expect(okRes.headers['ratelimit-remaining']).toBe('0');

    const blockedRes = await request(app).get('/api/v1/events');
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.headers['ratelimit-limit']).toBe('1');
    expect(blockedRes.headers['ratelimit-remaining']).toBe('0');
    expect(Number(blockedRes.headers['retry-after'])).toBeGreaterThanOrEqual(1);
  });

  it('scales quota by endpoint multiplier and falls back cleanly if Redis eval fails', async () => {
    vi.stubEnv('RATE_LIMIT_TIER_FREE_LIMIT', '100');
    vi.stubEnv('RATE_LIMIT_TIER_FREE_WINDOW_MS', '20000');

    const redisEval = vi
      .fn()
      .mockResolvedValueOnce([1, 49, Math.floor(Date.now() / 1000) + 20])
      .mockRejectedValueOnce(new Error('READONLY Redis error'));

    setRateLimitRedisClient({ eval: redisEval });

    // /api/v1/search has a 0.5x multiplier -> effective capacity 50 over 20s (2.5 tokens/sec)
    const first = await checkTokenBucket('client-1', 'free', 'GET', '/api/v1/search');
    expect(first.allowed).toBe(true);
    expect(first.limit).toBe(50);
    expect(first.remaining).toBe(49);
    expect(redisEval).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        arguments: expect.arrayContaining(['50', '2.5']),
      }),
    );

    // Second call triggers Redis error and seamlessly falls back to in-memory bucket
    const second = await checkTokenBucket('client-1', 'free', 'GET', '/api/v1/search');
    expect(second.allowed).toBe(true);
    expect(second.limit).toBe(50);
    expect(second.remaining).toBe(49);
  });
});
