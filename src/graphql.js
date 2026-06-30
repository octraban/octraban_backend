/**
 * GraphQL Interface for Contract Events
 *
 * Mounts a /graphql endpoint on the Express app using a minimal hand-rolled
 * resolver so no heavy framework dependency is required.  The schema supports
 * flexible field selection and filtering by contractId, function name, ledger
 * range, and pagination — all backed by the existing `db.getEvents` layer.
 *
 * POST /graphql   { query: "{ events(contract: \"C…\") { seq ledger function } }" }
 */

import { db } from "./db.js";

// ── Schema definition (SDL) ───────────────────────────────────────────────────

export const typeDefs = `
  type Event {
    seq: Int
    contract_id: String
    function: String
    function_name: String
    ledger: Int
    ledger_sequence: Int
    tx_hash: String
    description: String
    cpu_instructions: Int
    mem_bytes: Int
    fee_charged: Int
    is_high_bloat_risk: Boolean
    is_clawback: Boolean
  }

  type EventPage {
    data: [Event]
    next_cursor: Int
  }

  type Query {
    events(
      contract: String
      fn: String
      type: String
      after: Int
      limit: Int
    ): EventPage

    event(seq: Int!): Event
  }
`;

// ── Resolvers ─────────────────────────────────────────────────────────────────

const resolvers = {
  Query: {
    events: async (_root, args) => {
      return db.getEventsCursor({
        contract: args.contract || undefined,
        fn: args.fn || undefined,
        type: args.type || undefined,
        after_seq: args.after || 0,
        limit: args.limit ? Math.min(args.limit, 200) : 25,
      });
    },
    event: async (_root, args) => {
      return db.getEvent(args.seq);
    },
  },
  // Field aliases so introspection and queries using the canonical names work.
  // The DB columns are `function` and `ledger`; these expose them under the
  // names required by the issue acceptance criteria.
  Event: {
    function_name: (row) => row.function ?? null,
    ledger_sequence: (row) => row.ledger ?? null,
  },
};

// ── Minimal GraphQL execution (no external runtime needed) ────────────────────

/**
 * Parse a very simple GraphQL query into { operationName, fields, args }.
 * Supports single-level queries with inline arguments and nested field sets.
 * This covers the acceptance-criteria use-case without pulling in graphql-js.
 */
function parseQuery(query) {
  // Strip comments
  const src = query.replace(/#[^\n]*/g, "").trim();

  // Match:  { operationName(args) { fields } }  or  { operationName { fields } }
  const opMatch = src.match(/\{\s*(\w+)\s*(?:\(([^)]*)\))?\s*\{([^}]*)\}/s);
  if (!opMatch) throw new Error("Cannot parse GraphQL query");

  const [, opName, rawArgs = "", rawFields] = opMatch;

  // Parse args: key: "value" or key: 123
  const args = {};
  for (const m of rawArgs.matchAll(/(\w+)\s*:\s*(?:"([^"]*)"|([\d]+))/g)) {
    args[m[1]] = m[3] !== undefined ? Number(m[3]) : m[2];
  }

  // Parse fields (simple, no nesting beyond EventPage.data)
  const topFields = rawFields.trim().split(/\s+/).filter(Boolean);

  // Detect nested: data { ... }
  const dataMatch = rawFields.match(/data\s*\{([^}]*)\}/s);
  const dataFields = dataMatch ? dataMatch[1].trim().split(/\s+/).filter(Boolean) : null;

  return { opName, args, topFields, dataFields };
}

/**
 * Apply Event-level field resolvers to a raw DB row so alias fields
 * (function_name, ledger_sequence) are present before projection.
 */
function resolveEventFields(row) {
  if (!row) return row;
  return {
    ...row,
    function_name: resolvers.Event.function_name(row),
    ledger_sequence: resolvers.Event.ledger_sequence(row),
  };
}

/**
 * Project an object to only the requested fields.
 */
function project(obj, fields) {
  if (!obj || !fields) return obj;
  const out = {};
  for (const f of fields) out[f] = obj[f] ?? null;
  return out;
}

/**
 * Execute a parsed query against the resolvers.
 */
async function execute(parsed) {
  const resolver = resolvers.Query[parsed.opName];
  if (!resolver) throw new Error(`Unknown query: ${parsed.opName}`);

  const result = await resolver(null, parsed.args);

  // Shape result to match requested fields
  if (parsed.opName === "events") {
    const page = result;
    const out = {};
    if (!parsed.topFields || parsed.topFields.includes("next_cursor")) {
      out.next_cursor = page.next_cursor;
    }
    if (!parsed.topFields || parsed.topFields.some((f) => f === "data" || parsed.dataFields)) {
      out.data = (page.data || []).map((ev) => {
        const resolved = resolveEventFields(ev);
        return parsed.dataFields ? project(resolved, parsed.dataFields) : resolved;
      });
    }
    return out;
  }

  // Single event
  const resolved = resolveEventFields(result);
  if (parsed.dataFields) return project(resolved, parsed.dataFields);
  if (parsed.topFields) return project(resolved, parsed.topFields);
  return resolved;
}

// ── Introspection ─────────────────────────────────────────────────────────────

/**
 * Build a minimal introspection response covering the Event type and Query
 * type so that clients can verify the schema without a full graphql-js runtime.
 */
function buildIntrospectionResponse() {
  const eventFields = [
    { name: "seq", type: { name: "Int", kind: "SCALAR" } },
    { name: "contract_id", type: { name: "String", kind: "SCALAR" } },
    { name: "function", type: { name: "String", kind: "SCALAR" } },
    { name: "function_name", type: { name: "String", kind: "SCALAR" } },
    { name: "ledger", type: { name: "Int", kind: "SCALAR" } },
    { name: "ledger_sequence", type: { name: "Int", kind: "SCALAR" } },
    { name: "tx_hash", type: { name: "String", kind: "SCALAR" } },
    { name: "description", type: { name: "String", kind: "SCALAR" } },
    { name: "cpu_instructions", type: { name: "Int", kind: "SCALAR" } },
    { name: "mem_bytes", type: { name: "Int", kind: "SCALAR" } },
    { name: "fee_charged", type: { name: "Int", kind: "SCALAR" } },
    { name: "is_high_bloat_risk", type: { name: "Boolean", kind: "SCALAR" } },
    { name: "is_clawback", type: { name: "Boolean", kind: "SCALAR" } },
  ];

  return {
    __schema: {
      queryType: { name: "Query" },
      types: [
        {
          kind: "OBJECT",
          name: "Event",
          fields: eventFields,
        },
        {
          kind: "OBJECT",
          name: "EventPage",
          fields: [
            { name: "data", type: { name: "Event", kind: "OBJECT" } },
            { name: "next_cursor", type: { name: "Int", kind: "SCALAR" } },
          ],
        },
        {
          kind: "OBJECT",
          name: "Query",
          fields: [
            { name: "events", type: { name: "EventPage", kind: "OBJECT" } },
            { name: "event", type: { name: "Event", kind: "OBJECT" } },
          ],
        },
      ],
    },
  };
}

/**
 * Returns true when the query body is a GraphQL introspection request.
 */
function isIntrospectionQuery(query) {
  return typeof query === "string" && query.includes("__schema");
}

// ── Express middleware ────────────────────────────────────────────────────────

/**
 * Attach the /graphql endpoint to an Express app.
 * @param {import('express').Application} app
 */
export function attachGraphQL(app) {
  // POST /graphql — standard GraphQL over HTTP
  app.post("/graphql", async (req, res) => {
    const { query, variables } = req.body;
    if (!query) return res.status(400).json({ errors: [{ message: "Missing query" }] });

    // Handle introspection queries without parsing as a data query
    if (isIntrospectionQuery(query)) {
      return res.json({ data: buildIntrospectionResponse() });
    }

    try {
      const parsed = parseQuery(query);
      // Merge inline args with variables (variables take precedence)
      if (variables) Object.assign(parsed.args, variables);
      const data = await execute(parsed);
      res.json({ data });
    } catch (err) {
      res.status(400).json({ errors: [{ message: err.message }] });
    }
  });

  // GET /graphql?query=… — convenience for browser testing
  app.get("/graphql", async (req, res) => {
    const query = req.query.query;
    if (!query) {
      return res.json({
        info: "POST a JSON body with { query } to use GraphQL",
      });
    }
    if (isIntrospectionQuery(String(query))) {
      return res.json({ data: buildIntrospectionResponse() });
    }
    try {
      const parsed = parseQuery(String(query));
      const data = await execute(parsed);
      res.json({ data });
    } catch (err) {
      res.status(400).json({ errors: [{ message: err.message }] });
    }
  });

  console.log("[graphql] Endpoint mounted at /graphql");
}
