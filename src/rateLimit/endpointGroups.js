/**
 * Endpoint Groups and Per-Tier Rate Limits
 *
 * Defines URL path patterns for each endpoint group and the sustained rpm
 * and burst limits per tier. Used by the token bucket middleware to select
 * the appropriate rate limit for each request.
 *
 * Groups (in match priority order):
 *   websocket  – WebSocket upgrade paths
 *   simulate   – simulation / sandbox execution paths
 *   contracts  – contract metadata, ABI, spec, upgrades, etc.
 *   search     – search and wallet lookup
 *   events     – event listing and single-event reads
 *   default    – everything else
 *
 * Per-tier rpm values (sustained requests per minute):
 *
 *   Group      | unauth |  free  |  pro   | enterprise
 *   -----------|--------|--------|--------|------------
 *   events     |   60   |  1000  | 10000  | Infinity*
 *   search     |   30   |   500  |  5000  | Infinity*
 *   contracts  |   10   |   100  |  1000  | Infinity*
 *   simulate   |    5   |    50  |   500  | Infinity*
 *   websocket  |    3   |    30  |   300  | Infinity*
 *   default    |   60   |  1000  | 10000  | Infinity*
 *
 * * Enterprise rpm is configurable; Infinity is used as a sentinel value
 *   that callers should replace with the key-specific override.
 *
 * Default burst limits per tier:
 *   unauthenticated: 10
 *   free:            50
 *   pro:             200
 *   enterprise:      500
 */

// ── Endpoint group definitions ────────────────────────────────────────────────

/**
 * Each entry has:
 *   name     {string}   – canonical group identifier
 *   patterns {string[]} – path prefix strings to match (longest prefix wins
 *                         implicitly through ordering)
 */
const ENDPOINT_GROUP_DEFINITIONS = [
  {
    name: 'websocket',
    patterns: ['/ws', '/socket', '/api/ws', '/api/socket'],
  },
  {
    name: 'simulate',
    patterns: ['/api/simulate', '/api/sandbox/simulate'],
  },
  {
    name: 'contracts',
    patterns: [
      '/api/contracts',
      '/api/v1/contracts',
      '/api/spec',
      '/api/verify',
    ],
  },
  {
    name: 'search',
    patterns: ['/api/search', '/api/wallet'],
  },
  {
    name: 'events',
    patterns: ['/api/events', '/api/v1/events'],
  },
];

// ── Per-tier burst defaults ───────────────────────────────────────────────────

/** Default burst token allocation per tier (tokens above the sustained rate). */
export const TIER_BURST_DEFAULTS = {
  unauthenticated: 10,
  free: 50,
  pro: 200,
  enterprise: 500,
};

// ── Per-group, per-tier sustained rpm limits ──────────────────────────────────

/**
 * Sustained requests-per-minute for each (group, tier) combination.
 * Enterprise is set to Infinity as a placeholder; callers should substitute
 * the key-specific override when one is available.
 *
 * @type {Record<string, Record<string, number>>}
 */
export const GROUP_TIER_LIMITS = {
  events: {
    unauthenticated: 60,
    free: 1000,
    pro: 10000,
    enterprise: Infinity,
  },
  search: {
    unauthenticated: 30,
    free: 500,
    pro: 5000,
    enterprise: Infinity,
  },
  contracts: {
    unauthenticated: 10,
    free: 100,
    pro: 1000,
    enterprise: Infinity,
  },
  simulate: {
    unauthenticated: 5,
    free: 50,
    pro: 500,
    enterprise: Infinity,
  },
  websocket: {
    unauthenticated: 3,
    free: 30,
    pro: 300,
    enterprise: Infinity,
  },
  default: {
    unauthenticated: 60,
    free: 1000,
    pro: 10000,
    enterprise: Infinity,
  },
};

// ── resolveEndpointGroup ──────────────────────────────────────────────────────

/**
 * Resolve the endpoint group name for a given URL path.
 *
 * Iterates over ENDPOINT_GROUP_DEFINITIONS in order. The first group whose
 * any pattern is a prefix of `path` (case-insensitive) is returned. Falls
 * back to `"default"` if no pattern matches.
 *
 * @param {string} path  e.g. "/api/events/123"
 * @returns {string}     group name, e.g. "events"
 */
export function resolveEndpointGroup(path) {
  if (typeof path !== 'string') return 'default';

  const normalised = path.toLowerCase();

  for (const group of ENDPOINT_GROUP_DEFINITIONS) {
    for (const pattern of group.patterns) {
      if (normalised === pattern || normalised.startsWith(pattern + '/') || normalised.startsWith(pattern + '?')) {
        return group.name;
      }
    }
  }

  return 'default';
}

// ── getTierLimits ─────────────────────────────────────────────────────────────

/**
 * Return the effective `{ rpm, burst }` for a given group + tier combination.
 *
 * If `overrideRpm` is a finite positive number it replaces the table value.
 * For the enterprise tier the table value is Infinity; callers should always
 * provide a meaningful `overrideRpm` for enterprise keys.
 *
 * @param {string}      group        – endpoint group name (e.g. "events")
 * @param {string}      tier         – tier name (e.g. "pro")
 * @param {number|null} [overrideRpm] – per-key override from api_keys.rate_limit
 * @returns {{ rpm: number, burst: number }}
 */
export function getTierLimits(group, tier, overrideRpm = null) {
  const baseLimits = GROUP_TIER_LIMITS[group] ?? GROUP_TIER_LIMITS.default;
  const baseRpm = baseLimits[tier] ?? baseLimits.unauthenticated ?? 60;

  const rpm =
    typeof overrideRpm === 'number' && Number.isFinite(overrideRpm) && overrideRpm > 0
      ? overrideRpm
      : baseRpm;

  const burst = TIER_BURST_DEFAULTS[tier] ?? TIER_BURST_DEFAULTS.unauthenticated;

  return { rpm, burst };
}
