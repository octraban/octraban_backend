/**
 * GraphQL Complexity Limiter Middleware
 *
 * Applied only to requests whose path includes '/graphql'.
 * Parses req.body.query using the `graphql` package's parse() function,
 * walks the DocumentNode AST to calculate total cost, and rejects queries
 * that exceed the tier budget.
 *
 * Cost model:
 *   - Default field cost: 1
 *   - List fields (field name ends with 's' OR appears in LIST_FIELD_NAMES):
 *     base cost × 10
 *
 * Cost budgets by tier:
 *   unauthenticated:  100
 *   free:             500
 *   pro:            2 000
 *   enterprise:    10 000
 *
 * On rejection: 400 { "error": "Query complexity exceeded", "cost": N, "limit": M }
 *
 * On success: sets X-GraphQL-Cost and X-GraphQL-Cost-Remaining headers and
 * calls next().
 *
 * Parse errors are handled gracefully — the request is allowed through.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/** Cost budget per tier. */
const TIER_COMPLEXITY_BUDGETS = {
  unauthenticated: 100,
  free: 500,
  pro: 2000,
  enterprise: 10000,
};

/** Default cost for a single field selection. */
const DEFAULT_FIELD_COST = 1;

/** Multiplier applied to fields identified as list-returning. */
const LIST_FIELD_MULTIPLIER = 10;

/**
 * Explicit set of field names that are known to return lists (in addition to
 * the heuristic of names ending with 's').
 */
const LIST_FIELD_NAMES = new Set([
  'edges',
  'nodes',
  'items',
  'results',
  'data',
  'records',
  'entries',
  'list',
  'feed',
  'page',
  'collection',
]);

// ── Cost calculation ──────────────────────────────────────────────────────────

/**
 * Determine whether a field selection is heuristically a list field.
 *
 * @param {string} fieldName
 * @returns {boolean}
 */
function isListField(fieldName) {
  if (LIST_FIELD_NAMES.has(fieldName.toLowerCase())) return true;
  // Heuristic: plural names (ending in 's') are usually list-returning.
  return fieldName.length > 1 && fieldName.endsWith('s');
}

/**
 * Recursively walk a GraphQL SelectionSet and accumulate complexity cost.
 *
 * @param {object} selectionSet  – A GraphQL SelectionSetNode or undefined
 * @returns {number}
 */
function calculateSelectionSetCost(selectionSet) {
  if (!selectionSet || !Array.isArray(selectionSet.selections)) return 0;

  let total = 0;

  for (const selection of selectionSet.selections) {
    if (selection.kind === 'Field') {
      const fieldName = selection.name?.value ?? '';
      const fieldCost = isListField(fieldName)
        ? DEFAULT_FIELD_COST * LIST_FIELD_MULTIPLIER
        : DEFAULT_FIELD_COST;

      total += fieldCost;

      // Recurse into nested selection sets.
      if (selection.selectionSet) {
        total += calculateSelectionSetCost(selection.selectionSet);
      }
    } else if (selection.kind === 'InlineFragment') {
      total += calculateSelectionSetCost(selection.selectionSet);
    } else if (selection.kind === 'FragmentSpread') {
      // Fragment spreads cost 1 by default; the actual fragment body is not
      // available without the full document context, so we apply a minimal cost.
      total += DEFAULT_FIELD_COST;
    }
  }

  return total;
}

/**
 * Calculate the total complexity cost for a parsed GraphQL DocumentNode.
 *
 * @param {object} document – A GraphQL DocumentNode (result of parse())
 * @returns {number}
 */
function calculateDocumentCost(document) {
  if (!document || !Array.isArray(document.definitions)) return 0;

  let total = 0;

  for (const definition of document.definitions) {
    if (
      definition.kind === 'OperationDefinition' ||
      definition.kind === 'FragmentDefinition'
    ) {
      total += calculateSelectionSetCost(definition.selectionSet);
    }
  }

  return total;
}

// ── Middleware ─────────────────────────────────────────────────────────────────

/**
 * Express middleware that enforces GraphQL query complexity limits.
 *
 * Only runs on paths that include '/graphql'.
 * Reads req.rateContext.tier for the budget; falls back to 'unauthenticated'.
 * Sets X-GraphQL-Cost and X-GraphQL-Cost-Remaining on allowed requests.
 *
 * @type {import('express').RequestHandler}
 */
async function graphqlComplexityLimiter(req, res, next) {
  // Only apply to GraphQL routes.
  if (!req.path.includes('/graphql')) {
    return next();
  }

  const query = req.body?.query;

  // If there is no query, pass through (e.g. introspection over GET, health checks).
  if (!query || typeof query !== 'string') {
    return next();
  }

  let document;
  try {
    // Dynamically import graphql to keep startup fast and avoid hard dependency
    // errors if the package is missing.
    const { parse } = await import('graphql');
    document = parse(query);
  } catch {
    // Parse failure — pass through gracefully.
    return next();
  }

  const cost = calculateDocumentCost(document);
  const tier = req.rateContext?.tier ?? 'unauthenticated';
  const budget =
    TIER_COMPLEXITY_BUDGETS[tier] ?? TIER_COMPLEXITY_BUDGETS.unauthenticated;

  if (cost > budget) {
    return res.status(400).json({
      error: 'Query complexity exceeded',
      cost,
      limit: budget,
    });
  }

  // Attach cost headers.
  res.set('X-GraphQL-Cost', String(cost));
  res.set('X-GraphQL-Cost-Remaining', String(Math.max(0, budget - cost)));

  return next();
}

export {
  graphqlComplexityLimiter,
  calculateDocumentCost,
  calculateSelectionSetCost,
  isListField,
  TIER_COMPLEXITY_BUDGETS,
};
