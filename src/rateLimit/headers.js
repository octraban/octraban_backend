/**
 * Rate Limit Header Writer Middleware
 *
 * Attaches X-RateLimit-* headers to every response and Retry-After only when
 * the response status is 429.
 *
 * Reads from req.rateLimitState populated by tokenBucketMiddleware:
 *   { limit, remaining, reset, tier }
 *
 * Headers set on every response:
 *   X-RateLimit-Limit     – max rpm for active tier + endpoint group
 *   X-RateLimit-Remaining – remaining tokens in current window
 *   X-RateLimit-Reset     – Unix timestamp of next window reset
 *   X-RateLimit-Tier      – tier name string
 *
 * Additional header on 429 responses:
 *   Retry-After           – seconds until next token is available
 */

/**
 * Express middleware that writes X-RateLimit-* headers on every response.
 * Should be placed after tokenBucketMiddleware in the chain.
 *
 * @type {import('express').RequestHandler}
 */
function rateLimitHeaderWriter(req, res, next) {
  // Intercept the response by wrapping the write/end cycle.
  // We override res.writeHead so the headers are always set before the
  // response is flushed, regardless of how the response is sent.
  const originalWriteHead = res.writeHead.bind(res);

  res.writeHead = function patchedWriteHead(statusCode, statusMessage, headers) {
    _applyRateLimitHeaders(req, res, statusCode);

    // Restore and delegate to the original.
    res.writeHead = originalWriteHead;
    if (typeof statusMessage === 'string') {
      return originalWriteHead(statusCode, statusMessage, headers);
    }
    // statusMessage may be omitted; the second arg might be headers.
    return originalWriteHead(statusCode, statusMessage);
  };

  // Also set them immediately so they are available to downstream middleware
  // that reads res headers (e.g. tests that call res.get(...) before flush).
  // This is a best-effort pre-population; writeHead override handles the
  // actual flush-time guarantee.
  const state = req.rateLimitState;
  if (state) {
    res.set('X-RateLimit-Limit', String(state.limit));
    res.set('X-RateLimit-Remaining', String(Math.max(0, state.remaining)));
    res.set('X-RateLimit-Reset', String(state.reset));
    res.set('X-RateLimit-Tier', String(state.tier));
  }

  return next();
}

/**
 * Apply X-RateLimit-* headers to the response object.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {number} statusCode
 */
function _applyRateLimitHeaders(req, res, statusCode) {
  const state = req.rateLimitState;
  if (!state) return;

  try {
    res.setHeader('X-RateLimit-Limit', String(state.limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, state.remaining)));
    res.setHeader('X-RateLimit-Reset', String(state.reset));
    res.setHeader('X-RateLimit-Tier', String(state.tier));

    // Retry-After is only meaningful on 429 responses.
    if (statusCode === 429) {
      // retryAfter may be on the state if the token bucket populated it,
      // or on the existing Retry-After header already set by tokenBucketMiddleware.
      const existing = res.getHeader('Retry-After');
      if (!existing && state.retryAfter !== undefined) {
        res.setHeader('Retry-After', String(state.retryAfter));
      }
    }
  } catch {
    // Headers may already be sent in edge cases — ignore silently.
  }
}

export { rateLimitHeaderWriter };
