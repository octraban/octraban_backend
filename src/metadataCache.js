/**
 * Thin compatibility shim over cacheLayer.js.
 *
 * Existing callers import { cacheGet, cacheSet, cacheDel, cacheAside }
 * from this module.  All logic now lives in cacheLayer.js which provides
 * the full multi-tier L1/L2 implementation with XFetch, analytics, and
 * Redis Pub/Sub invalidation.
 */

export {
  cacheGet,
  cacheSet,
  cacheDel,
  cacheAside,
} from "./cacheLayer.js";
