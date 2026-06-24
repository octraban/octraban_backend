/**
 * Redis key namespace constants for the rate limiting and abuse detection system.
 *
 * Key formats:
 *   rl:{clientId}:{endpointGroup}           – token bucket (CL.THROTTLE)
 *   conc:{clientId}                         – concurrent HTTP request counter
 *   conc:ws:{clientId}                      – concurrent WebSocket counter
 *   abuse:authfail:{ip}                     – auth failure count (TTL 60 s)
 *   abuse:block:{ip}                        – temporary IP block flag (TTL 15 min)
 *   abuse:scrape:{clientId}                 – scraping URL sliding window (sorted set)
 *   abuse:ddos:{endpoint}:{window}          – distinct IP HyperLogLog per endpoint
 *   abuse:paginate:{clientId}:{endpoint}    – consecutive page count (TTL 60 s)
 *   abuse:ratelimitcount:{clientId}         – repeat breach count (TTL 10 min)
 *   abuse:penalty:{clientId}:{endpoint}     – active penalty flag (TTL variable)
 *   usage:{keyId}:{date}:{metric}           – intra-day usage buffer counter
 */

// ── Rate limit token bucket prefix ────────────────────────────────────────────
/** Prefix for per-client, per-endpoint-group token bucket keys. */
export const RL_PREFIX = 'rl';

// ── Concurrent request counter prefixes ───────────────────────────────────────
/** Prefix for per-client concurrent HTTP request counters. */
export const CONC_PREFIX = 'conc';

/** Prefix for per-client concurrent WebSocket connection counters. */
export const CONC_WS_PREFIX = 'conc:ws';

// ── Abuse detection prefixes ───────────────────────────────────────────────────
/** Prefix for per-IP authentication failure counters (TTL: 60 s). */
export const ABUSE_AUTHFAIL_PREFIX = 'abuse:authfail';

/** Prefix for temporary IP block flags (TTL: 15 min). */
export const ABUSE_BLOCK_PREFIX = 'abuse:block';

/** Prefix for scraping URL-path sliding windows (sorted set). */
export const ABUSE_SCRAPE_PREFIX = 'abuse:scrape';

/** Prefix for per-endpoint DDoS detection HyperLogLog keys. */
export const ABUSE_DDOS_PREFIX = 'abuse:ddos';

/** Prefix for aggressive pagination counters per client per endpoint (TTL: 60 s). */
export const ABUSE_PAGINATE_PREFIX = 'abuse:paginate';

/** Prefix for repeat rate-limit breach counters (TTL: 10 min). */
export const ABUSE_RATELIMITCOUNT_PREFIX = 'abuse:ratelimitcount';

/** Prefix for active penalty flags per client per endpoint (TTL: variable). */
export const ABUSE_PENALTY_PREFIX = 'abuse:penalty';

// ── Usage tracking prefix ──────────────────────────────────────────────────────
/** Prefix for intra-day per-key usage buffer counters. */
export const USAGE_PREFIX = 'usage';

// ── TTL constants (seconds) ────────────────────────────────────────────────────
/** Token bucket TTL for Unauthenticated tier (1 hour). */
export const TTL_UNAUTH = 3600;

/** Token bucket TTL for Free tier (24 hours). */
export const TTL_FREE = 86400;

/** Token bucket TTL for Pro tier (1 month ≈ 30 days). */
export const TTL_PRO = 2592000;

/**
 * Safety-net TTL applied to concurrent request counter keys to prevent
 * permanent counter leaks if a connection drops without decrementing (5 min).
 */
export const TTL_CONC_SAFETY = 300;
