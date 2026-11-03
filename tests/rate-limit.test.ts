import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import {
  getRateLimitTier,
  normalizeTierConfig,
  tieredRateLimit,
} from '../src/middleware/rateLimit';
import { checkTokenBucket } from '../src/middleware/tokenBucket';

vi.mock('../src/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
vi.mock('../src/middleware/tokenBucket', () => ({
  checkTokenBucket: vi.fn(),
  setRateLimitRedisClient: vi.fn(),
}));

const mockCheck = vi.mocked(checkTokenBucket);

function makeReq(overrides: Partial<Request> = {}): Request {
  return { headers: {}, ip: '127.0.0.1', method: 'GET', path: '/test', ...overrides } as Request;
}

function makeRes(): {
  res: Response;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
  headers: Record<string, string>;
} {
  const headers: Record<string, string> = {};
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const setHeader = vi.fn((name: string, value: unknown) => {
    headers[name.toLowerCase()] = String(value);
  });
  return {
    res: { status, json, setHeader } as unknown as Response,
    status,
    json,
    setHeader,
    headers,
  };
}

describe('rate limit configuration', () => {
  it('falls back to defaults for invalid tier values', () => {
    const tierConfig = normalizeTierConfig({
      public: { windowMs: 0, max: -5 },
      developer: { windowMs: 30_000, max: 250 },
      premium: { windowMs: 90_000, max: 5000 },
    } as any);

    expect(tierConfig.public.windowMs).toBe(60_000);
    expect(tierConfig.public.max).toBe(100);
    expect(tierConfig.developer.windowMs).toBe(30_000);
    expect(tierConfig.developer.max).toBe(250);
  });

  it('selects the highest matching tier for known API keys', () => {
    const tier = getRateLimitTier(
      'premium-api',
      new Set(['developer-api']),
      new Set(['premium-api']),
    );
    expect(tier).toBe('premium');
  });
});

describe('tieredRateLimit', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
    vi.clearAllMocks();
    const nowSec = Math.floor(Date.now() / 1000);
    mockCheck.mockResolvedValue({
      allowed: true,
      limit: 100,
      remaining: 99,
      resetAt: nowSec + 45,
      tier: 'free',
    });
  });

  it('calls next() and emits standard RateLimit-* headers when allowed', async () => {
    const { res, headers } = makeRes();
    await tieredRateLimit(makeReq(), res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(headers['ratelimit-limit']).toBe('100');
    expect(headers['ratelimit-remaining']).toBe('99');
    expect(Number(headers['ratelimit-reset'])).toBeGreaterThanOrEqual(0);
    expect(headers['retry-after']).toBeUndefined();
  });

  it('uses apiKey tier and forwards rateLimitOverride when present', async () => {
    const req = makeReq({
      apiKey: {
        id: 'key-pro-1',
        keyName: 'prod-key',
        developerId: 'dev-1',
        tier: 'pro',
        rateLimitOverride: 2500,
      },
    } as any);
    const { res } = makeRes();
    await tieredRateLimit(req, res, next);

    expect(mockCheck).toHaveBeenCalledWith('key-pro-1', 'pro', 'GET', '/test', 2500);
    expect(next).toHaveBeenCalledOnce();
  });

  it('falls back to unauthenticated tier when no apiKey header is present', async () => {
    const req = makeReq({ headers: {} });
    const { res } = makeRes();
    await tieredRateLimit(req, res, next);

    expect(mockCheck).toHaveBeenCalledWith(
      '127.0.0.1',
      'unauthenticated',
      'GET',
      '/test',
      undefined,
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 429 with Retry-After and standard RateLimit-* headers when limit is exceeded', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    mockCheck.mockResolvedValueOnce({
      allowed: false,
      limit: 60,
      remaining: 0,
      resetAt: nowSec + 20,
      tier: 'unauthenticated',
    });

    const { res, status, json, headers } = makeRes();
    await tieredRateLimit(makeReq(), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(429);
    expect(headers['ratelimit-limit']).toBe('60');
    expect(headers['ratelimit-remaining']).toBe('0');
    expect(Number(headers['ratelimit-reset'])).toBeGreaterThanOrEqual(1);
    expect(Number(headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Rate limit exceeded',
        tier: 'unauthenticated',
      }),
    );
  });

  it('falls back gracefully to local rate limiter if checkTokenBucket throws', async () => {
    mockCheck.mockRejectedValueOnce(new Error('unexpected failure'));
    const { res, headers } = makeRes();
    await tieredRateLimit(makeReq(), res, next);

    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledOnce();
    });
    expect(headers['ratelimit-limit']).toBeDefined();
    expect(headers['ratelimit-remaining']).toBeDefined();
  });
});

describe('rate-limit security', () => {
  it('does not crash on spoofed X-Forwarded-For header', async () => {
    const next = vi.fn();
    const req = makeReq({ headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } });
    const { res } = makeRes();
    await expect(tieredRateLimit(req, res, next)).resolves.not.toThrow();
  });

  it('handles missing ip gracefully', async () => {
    const next = vi.fn();
    const req = makeReq({ ip: undefined });
    const { res } = makeRes();
    await expect(tieredRateLimit(req, res, next)).resolves.not.toThrow();
  });
});
