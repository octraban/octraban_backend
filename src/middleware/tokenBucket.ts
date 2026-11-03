/**
 * Token Bucket Rate Limiter
 *
 * Implements a distributed token bucket algorithm using a Redis Lua script
 * (similar to CL.THROTTLE from redis-cell). Falls back to an in-memory map
 * when Redis is unavailable.
 *
 * Default tiers (configurable via RATE_LIMIT_TIER_<TIER>_LIMIT and
 * RATE_LIMIT_TIER_<TIER>_WINDOW_MS environment variables):
 *   unauthenticated    60 req / 60s   burst 10
 *   free             1000 req / 60s   burst 50
 *   developer        1000 req / 60s   burst 50
 *   pro             10000 req / 60s   burst 200
 *   enterprise      60000 req / 60s   burst 500
 *
 * Per-endpoint groups add an additional multiplier on top of the tier limit.
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';

// ─── Tier definitions ─────────────────────────────────────────────────────────

export type RateLimitTier = 'unauthenticated' | 'free' | 'developer' | 'pro' | 'enterprise';

export const RATE_LIMIT_TIERS: readonly RateLimitTier[] = [
  'unauthenticated',
  'free',
  'developer',
  'pro',
  'enterprise',
] as const;

export interface TierLimits {
  /** Requests allowed per window (alias retained for backward compatibility). */
  perMinute: number;
  /** Requests allowed per window. */
  limit: number;
  /** Window duration in milliseconds. */
  windowMs: number;
  /** Burst allowance tokens. */
  burst: number;
  /** Redis key TTL in seconds. */
  ttlSeconds: number;
}

export const DEFAULT_TIER_LIMITS: Readonly<Record<RateLimitTier, Readonly<TierLimits>>> = {
  unauthenticated: {
    perMinute: 60,
    limit: 60,
    windowMs: 60_000,
    burst: 10,
    ttlSeconds: 3600,
  },
  free: {
    perMinute: 1000,
    limit: 1000,
    windowMs: 60_000,
    burst: 50,
    ttlSeconds: 86400,
  },
  developer: {
    perMinute: 1000,
    limit: 1000,
    windowMs: 60_000,
    burst: 50,
    ttlSeconds: 86400,
  },
  pro: {
    perMinute: 10000,
    limit: 10000,
    windowMs: 60_000,
    burst: 200,
    ttlSeconds: 2592000,
  },
  enterprise: {
    perMinute: 60000,
    limit: 60000,
    windowMs: 60_000,
    burst: 500,
    ttlSeconds: 2592000,
  },
};

function parsePositiveIntEnv(raw: string | undefined, fallback: number): number {
  if (!raw || raw.trim() === '') return fallback;
  const parsed = Number(raw.trim());
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function getTierLimits(
  tier: RateLimitTier,
  env: NodeJS.ProcessEnv = process.env,
): TierLimits {
  const safeTier: RateLimitTier = tier in DEFAULT_TIER_LIMITS ? tier : 'unauthenticated';
  const defaults = DEFAULT_TIER_LIMITS[safeTier];
  const prefix = `RATE_LIMIT_TIER_${safeTier.toUpperCase()}`;

  const limit = parsePositiveIntEnv(env[`${prefix}_LIMIT`], defaults.limit);
  const windowMs = parsePositiveIntEnv(env[`${prefix}_WINDOW_MS`], defaults.windowMs);
  const burst = parsePositiveIntEnv(env[`${prefix}_BURST`], defaults.burst);
  const ttlSeconds = Math.max(defaults.ttlSeconds, Math.ceil(windowMs / 1000));

  return {
    perMinute: limit,
    limit,
    windowMs,
    burst,
    ttlSeconds,
  };
}

export function resolveTierLimits(
  env: NodeJS.ProcessEnv = process.env,
): Record<RateLimitTier, TierLimits> {
  return {
    unauthenticated: getTierLimits('unauthenticated', env),
    free: getTierLimits('free', env),
    developer: getTierLimits('developer', env),
    pro: getTierLimits('pro', env),
    enterprise: getTierLimits('enterprise', env),
  };
}

export const TIER_LIMITS: Record<RateLimitTier, TierLimits> = resolveTierLimits();

// ─── Endpoint group multipliers (fraction of tier limit) ─────────────────────

interface EndpointGroup {
  pattern: RegExp;
  name: string;
  multiplier: number; // 1.0 = full tier limit
}

const ENDPOINT_GROUPS: EndpointGroup[] = [
  { pattern: /^\/api\/v1\/events/, name: 'events', multiplier: 1.0 },
  { pattern: /^\/api\/v1\/(search|nft\/search)/, name: 'search', multiplier: 0.5 },
  { pattern: /^\/api\/v1\/contracts.*POST/, name: 'contracts', multiplier: 0.17 },
  { pattern: /^\/api\/v1\/simulate/, name: 'simulate', multiplier: 0.08 },
  { pattern: /^\/ws/, name: 'websocket', multiplier: 0.05 },
];

function getEndpointMultiplier(method: string, path: string): number {
  const key = `${path}${method}`;
  for (const group of ENDPOINT_GROUPS) {
    if (group.pattern.test(key) || group.pattern.test(path)) return group.multiplier;
  }
  return 1.0;
}

// ─── Lua script for atomic token bucket ──────────────────────────────────────
// Returns: [allowed (0|1), remaining, resetAt (unix seconds)]

const TOKEN_BUCKET_LUA = `
local key        = KEYS[1]
local capacity   = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])  -- tokens per second
local now        = tonumber(ARGV[3])  -- current unix timestamp (ms)
local ttl        = tonumber(ARGV[4])

local data = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens     = tonumber(data[1])
local lastRefill = tonumber(data[2])

if tokens == nil then
  tokens     = capacity
  lastRefill = now
end

-- Refill tokens based on elapsed time
local elapsed      = math.max(0, now - lastRefill)
local newTokens    = elapsed / 1000 * refillRate
tokens = math.min(capacity, tokens + newTokens)
lastRefill = now

local allowed = 0
if tokens >= 1 then
  tokens    = tokens - 1
  allowed   = 1
end

redis.call('HMSET', key, 'tokens', tokens, 'last_refill', lastRefill)
redis.call('EXPIRE', key, ttl)

local resetAt = math.ceil(now/1000 + (capacity - tokens) / refillRate)
return {allowed, math.floor(tokens), resetAt}
`;

// ─── In-memory fallback ───────────────────────────────────────────────────────

interface MemBucket {
  tokens: number;
  lastRefill: number;
}

const memBuckets = new Map<string, MemBucket>();

function checkMemoryBucket(
  key: string,
  capacity: number,
  refillRate: number,
  now: number,
): [allowed: boolean, remaining: number, resetAt: number] {
  let bucket = memBuckets.get(key);
  if (!bucket) {
    bucket = { tokens: capacity, lastRefill: now };
  }

  const elapsed = Math.max(0, now - bucket.lastRefill);
  bucket.tokens = Math.min(capacity, bucket.tokens + (elapsed / 1000) * refillRate);
  bucket.lastRefill = now;

  const allowed = bucket.tokens >= 1;
  if (allowed) bucket.tokens -= 1;
  memBuckets.set(key, bucket);

  const resetAt = Math.ceil(now / 1000 + (capacity - bucket.tokens) / refillRate);
  return [allowed, Math.floor(bucket.tokens), resetAt];
}

/** Exposed for testing only — clears in-process token buckets. */
export function _resetMemoryBuckets(): void {
  memBuckets.clear();
}

// ─── Public interface ─────────────────────────────────────────────────────────

interface TokenBucketRedisClient {
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
}

let redisClient: TokenBucketRedisClient | null = null;

export function setRateLimitRedisClient(client: TokenBucketRedisClient | null): void {
  redisClient = client;
}

export interface TokenBucketResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number; // unix seconds
  tier: RateLimitTier;
}

export async function checkTokenBucket(
  clientKey: string,
  tier: RateLimitTier,
  method: string,
  path: string,
  overridePerMinute?: number,
): Promise<TokenBucketResult> {
  const resolvedTier: RateLimitTier = tier in DEFAULT_TIER_LIMITS ? tier : 'unauthenticated';
  const baseLimits = getTierLimits(resolvedTier);
  const multiplier = getEndpointMultiplier(method, path);

  const hasValidOverride =
    typeof overridePerMinute === 'number' &&
    Number.isFinite(overridePerMinute) &&
    overridePerMinute > 0;

  const baseQuota = hasValidOverride ? overridePerMinute : baseLimits.limit;
  const capacity = Math.max(1, Math.ceil(baseQuota * multiplier));
  const windowSeconds = Math.max(0.001, baseLimits.windowMs / 1000);
  const refillRate = capacity / windowSeconds; // tokens per second
  const burst = Math.min(capacity, hasValidOverride ? capacity : baseLimits.burst);
  const effectiveCapacity = Math.max(capacity, burst);
  const now = Date.now();

  const redisKey = `tb:${resolvedTier}:${clientKey}:${path.replace(/\//g, '_')}`;

  if (redisClient) {
    try {
      const result = (await redisClient.eval(TOKEN_BUCKET_LUA, {
        keys: [redisKey],
        arguments: [
          String(effectiveCapacity),
          String(refillRate),
          String(now),
          String(baseLimits.ttlSeconds),
        ],
      })) as [number, number, number];

      return {
        allowed: result[0] === 1,
        remaining: result[1],
        limit: capacity,
        resetAt: result[2],
        tier: resolvedTier,
      };
    } catch (err) {
      logger.warn('[token-bucket] Redis eval failed, using memory fallback', { err });
    }
  }

  const [allowed, remaining, resetAt] = checkMemoryBucket(
    redisKey,
    effectiveCapacity,
    refillRate,
    now,
  );
  return { allowed, remaining, limit: capacity, resetAt, tier: resolvedTier };
}

export function applyRateLimitHeaders(res: Response, result: TokenBucketResult): number {
  const nowSec = Math.floor(Date.now() / 1000);
  const remaining = Math.max(0, result.remaining);
  const resetSeconds = Math.max(0, result.resetAt - nowSec);

  res.setHeader('RateLimit-Limit', String(result.limit));
  res.setHeader('RateLimit-Remaining', String(remaining));
  res.setHeader('RateLimit-Reset', String(resetSeconds));

  res.setHeader('X-RateLimit-Limit', String(result.limit));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(result.resetAt));
  res.setHeader('X-RateLimit-Tier', result.tier);

  return resetSeconds;
}

function defaultTierResolver(req: Request): {
  tier: RateLimitTier;
  key: string;
  override?: number;
} {
  if (req.apiKey) {
    return {
      tier: req.apiKey.tier,
      key: req.apiKey.id,
      override: req.apiKey.rateLimitOverride,
    };
  }
  return {
    tier: 'unauthenticated',
    key: req.ip || 'anonymous',
  };
}

// ─── Express middleware ───────────────────────────────────────────────────────

export function tokenBucketMiddleware(
  getTier: (req: Request) => {
    tier: RateLimitTier;
    key: string;
    override?: number;
  } = defaultTierResolver,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { tier, key, override } = getTier(req);
    const result = await checkTokenBucket(key, tier, req.method, req.path, override);

    const resetSeconds = applyRateLimitHeaders(res, result);
    (req as Request & { rateLimitResult?: TokenBucketResult }).rateLimitResult = result;

    if (!result.allowed) {
      const retryAfter = Math.max(1, resetSeconds);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        error: 'Rate limit exceeded',
        tier: result.tier,
        retryAfter,
        resetAt: new Date(result.resetAt * 1000).toISOString(),
      });
      return;
    }

    next();
  };
}
