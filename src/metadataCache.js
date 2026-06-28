/**
 * In-Memory Redis Cache for Contract Metadata
 *
 * Cache-Aside strategy: callers check the cache first; on miss they fetch
 * from the DB/RPC and populate the cache.  A TTL of 60 s ensures stale
 * metadata (name, symbol, decimals) is refreshed automatically.
 *
 * Redis is optional: if REDIS_URL is not set the module falls back to a
 * plain in-process Map so the rest of the codebase works without Redis.
 */

import config from "./config.js";

const TTL_SECONDS = config.METADATA_CACHE_TTL;

// ── Redis client (lazy-initialised) ──────────────────────────────────────────

let _redis = null;

async function getRedis() {
  if (_redis) return _redis;
  const url = process.env.REDIS_URL;
  if (!url) return null; // fallback to in-process map

  try {
    // Dynamic import so the indexer starts even when the `redis` package is
    // absent (it is an optional peer dependency).
    const { createClient } = await import("redis");
    _redis = createClient({ url });
    _redis.on("error", (err) => console.warn("[cache] Redis error:", err.message));
    await _redis.connect();
    console.log("[cache] Connected to Redis at", url);
  } catch (err) {
    console.warn("[cache] Redis unavailable, using in-process fallback:", err.message);
    _redis = null;
  }
  return _redis;
}

// ── In-process fallback ───────────────────────────────────────────────────────

const _map = new Map(); // key → { value, expiresAt }

function mapGet(key) {
  const entry = _map.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _map.delete(key);
    return null;
  }
  return entry.value;
}

function mapSet(key, value, ttlSeconds) {
  _map.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

function mapDel(key) {
  _map.delete(key);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Retrieve a cached value.
 * @param {string} key
 * @returns {Promise<object|null>}
 */
export async function cacheGet(key) {
  const redis = await getRedis();
  if (redis) {
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  }
  return mapGet(key);
}

/**
 * Store a value in the cache.
 * @param {string} key
 * @param {object} value
 * @param {number} [ttl]  TTL in seconds (defaults to METADATA_CACHE_TTL env var or 60)
 */
export async function cacheSet(key, value, ttl = TTL_SECONDS) {
  const redis = await getRedis();
  if (redis) {
    await redis.set(key, JSON.stringify(value), { EX: ttl });
  } else {
    mapSet(key, value, ttl);
  }
}

/**
 * Invalidate a cached entry.
 * @param {string} key
 */
export async function cacheDel(key) {
  const redis = await getRedis();
  if (redis) {
    await redis.del(key);
  } else {
    mapDel(key);
  }
}

/**
 * Cache-Aside helper: return cached value or call `loader()`, cache the
 * result, and return it.
 *
 * @template T
 * @param {string}          key
 * @param {() => Promise<T>} loader
 * @param {number}          [ttl]
 * @returns {Promise<T>}
 */
export async function cacheAside(key, loader, ttl = TTL_SECONDS) {
  const cached = await cacheGet(key);
  if (cached !== null) return cached;
  const value = await loader();
  if (value !== null && value !== undefined) {
    await cacheSet(key, value, ttl);
  }
  return value;
}
