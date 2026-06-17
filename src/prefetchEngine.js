/**
 * Predictive Pre-Fetching Engine
 *
 * Tracks access patterns and pre-fetches likely next cache keys before
 * users request them.  Uses a frequency-weighted model seeded by:
 *   - Sequential page access (page N → pre-fetch page N+1)
 *   - Contract co-access (event list for contract X → pre-fetch contract X detail)
 *
 * Pre-fetches are fire-and-forget; they never block the request path.
 */

import { cacheGet, cacheSet } from "./cacheLayer.js";

const _freq = new Map();    // key → access count
const _inFlight = new Set(); // keys currently being pre-fetched

/**
 * Record a cache key access for pattern analysis.
 */
export function recordAccess(key) {
  _freq.set(key, (_freq.get(key) || 0) + 1);
}

/**
 * Get the most frequently accessed cache keys.
 */
export function getTopKeys(n = 20) {
  return [..._freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ key, count }));
}

/**
 * Predict and pre-fetch likely next keys given the current access key.
 * @param {string}   key        recently accessed cache key
 * @param {object}   loaderMap  { [predictedKey]: async () => value }
 */
export function schedulePrefetch(key, loaderMap) {
  const predictions = _predict(key);
  for (const nextKey of predictions) {
    if (_inFlight.has(nextKey) || !loaderMap[nextKey]) continue;
    _inFlight.add(nextKey);
    setImmediate(async () => {
      try {
        const hit = await cacheGet(nextKey);
        if (!hit) {
          const value = await loaderMap[nextKey]();
          if (value != null) {
            const type = _inferType(nextKey);
            await cacheSet(nextKey, value, type, 0);
          }
        }
      } catch {}
      _inFlight.delete(nextKey);
    });
  }
}

// Predict likely next keys from an access pattern.
function _predict(key) {
  const results = [];

  // events:list:{contract}:{fn}:{page}:{type} → pre-fetch page + 1
  const listMatch = key.match(
    /^events:list:([^:]*):([^:]*):(\d+):([^:]*)$/,
  );
  if (listMatch) {
    const [, contract, fn, page, type] = listMatch;
    const nextPage = Number(page) + 1;
    if (nextPage <= 5) { // only pre-fetch up to page 5
      results.push(`events:list:${contract}:${fn}:${nextPage}:${type}`);
    }
    // If filtering on a contract, also pre-fetch the contract detail
    if (contract) {
      results.push(`contracts:single:${contract}`);
    }
  }

  return results;
}

function _inferType(key) {
  if (key.startsWith("events:list:")) return "events_list";
  if (key.startsWith("events:single:")) return "events_single";
  if (key.startsWith("contracts:single:")) return "contracts_single";
  if (key.startsWith("stats:")) return "stats";
  return "default";
}
