/**
 * Concurrent Request Limiter Middleware
 *
 * Enforces a per-client cap on the number of in-flight HTTP requests (and
 * WebSocket connections handled separately) using Redis INCR / DECR counters.
 *
 * Key formats:
 *   conc:{clientId}       – concurrent HTTP request counter
 *   conc:ws:{clientId}    – concurrent WebSocket connection counter
 *
 * Tier limits (HTTP):
 *   unauthenticated: 5
 *   free:            20
 *   pro:             100
 *   enterprise:      200
 *
 * Tier limits (WebSocket):
 *   unauthenticated: 1
 *   free:            5
 *   pro:             25
 *   enterprise:      50
 *
 * Behaviour:
 *   - On request start: INCR the counter; if counter > limit → 503 + Retry-After: 1
 *   - On response finish: DECR the counter (even on errors)
 *   - A TTL_CONC_SAFETY (300 s) safety net is re-applied after each INCR to
 *     prevent permanent counter leaks if a connection dies without decrementing.
 *   - If Redis is unavailable, the middleware passes through (graceful degradation).
 */

import { getRedisClient } from './tokenBucket.js';
import { CONC_PREFIX, CONC_WS_PREFIX, TTL_CONC_SAFETY } from './constants.js';

// ── Tier limit tables ─────────────────────────────────────────────────────────

/** Maximum concurrent HTTP requests per tier. */
const HTTP_TIER_LIMITS = {
  unauthenticated: 5,
  free: 20,
  pro: 100,
  enterprise: 200,
};

/** Maximum concurrent WebSocket connections per tier. */
const WS_TIER_LIMITS = {
  unauthenticated: 1,
  free: 5,
  pro: 25,
  enterprise: 50,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Determine whether the request is a WebSocket upgrade.
 *
 * @param {import('express').Request} req
 * @returns {boolean}
 */
function isWebSocket(req) {
  return (
    typeof req.headers?.upgrade === 'string' &&
    req.headers.upgrade.toLowerCase() === 'websocket'
  );
}

/**
 * Return the concurrent limit for the client given its tier and connection type.
 *
 * @param {string}  tier
 * @param {boolean} ws
 * @returns {number}
 */
function getConcLimit(tier, ws) {
  const table = ws ? WS_TIER_LIMITS : HTTP_TIER_LIMITS;
  return table[tier] ?? table.unauthenticated;
}

// ── Middleware ─────────────────────────────────────────────────────────────────

/**
 * Express middleware that limits concurrent in-flight requests per client.
 *
 * Reads req.rateContext (populated by apiKeyAuthenticator) for clientId and tier.
 * Returns 503 with Retry-After: 1 when the concurrent limit is exceeded.
 * Gracefully passes through if Redis is unavailable.
 *
 * @type {import('express').RequestHandler}
 */
async function concurrentRequestLimiter(req, res, next) {
  const rateContext = req.rateContext ?? {
    clientId: 'unknown',
    tier: 'unauthenticated',
  };

  const { clientId, tier } = rateContext;
  const ws = isWebSocket(req);
  const prefix = ws ? CONC_WS_PREFIX : CONC_PREFIX;
  const redisKey = `${prefix}:${clientId}`;
  const limit = getConcLimit(tier, ws);

  let redis = null;
  try {
    redis = await getRedisClient();
  } catch {
    // Redis unavailable — pass through.
    return next();
  }

  if (!redis?.isReady) {
    // Graceful degradation: allow the request through.
    return next();
  }

  let count;
  try {
    // Atomically increment and read.
    count = await redis.incr(redisKey);

    // Refresh safety-net TTL on every increment to prevent key leaks.
    await redis.expire(redisKey, TTL_CONC_SAFETY);
  } catch {
    // Redis error mid-operation — fail open.
    return next();
  }

  if (count > limit) {
    // Exceeded the concurrent cap. Decrement immediately since we are not
    // going to process this request.
    try {
      await redis.decr(redisKey);
    } catch {
      // Ignore decr failure — TTL safety net will clean up eventually.
    }

    res.set('Retry-After', '1');
    return res.status(503).json({ error: 'Too many concurrent requests' });
  }

  // Decrement when the response finishes (success or error).
  res.on('finish', () => {
    getRedisClient()
      .then((r) => {
        if (r?.isReady) return r.decr(redisKey);
      })
      .catch(() => {
        // Ignore — safety TTL handles eventual cleanup.
      });
  });

  return next();
}

export { concurrentRequestLimiter, HTTP_TIER_LIMITS, WS_TIER_LIMITS };
