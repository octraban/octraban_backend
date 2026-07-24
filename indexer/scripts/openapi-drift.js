#!/usr/bin/env node
/**
 * Keeps docs/api/openapi.yaml's route inventory in sync with the Express
 * routes actually registered by the indexer service.
 *
 * The spec's `paths:` section is machine-generated (not hand-annotated via
 * swagger-jsdoc, and not authored free-form) precisely so this check can be
 * exact: every implemented route must have a matching `paths` entry, and
 * every documented entry must correspond to a real route.
 *
 * Usage:
 *   node scripts/openapi-drift.js           Add stub entries for any
 *                                            implemented route missing from
 *                                            the spec. Never removes or
 *                                            rewrites existing entries, so
 *                                            hand-added detail (schemas,
 *                                            x-status: experimental/mock,
 *                                            etc.) on a route already in the
 *                                            file is preserved.
 *   node scripts/openapi-drift.js --check    Exit 1 if the spec and the
 *                                            implemented routes disagree.
 *                                            Used by CI; makes no changes.
 *
 * See docs/OPENAPI.md.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SPEC_PATH = path.join(REPO_ROOT, "docs", "api", "openapi.yaml");

// ── Where routes are registered, and the path prefix each receiver implies ──
// `routes/admin.js` mounts its own router at `/api/admin` internally;
// `billing/stripeWebhook.js`'s router is mounted at `/api/billing` by
// api.js. Add new route files here as they're introduced.
const ROUTE_SOURCES = [
  { file: "src/api.js", prefixes: { app: "" } },
  { file: "src/routes/admin.js", prefixes: { app: "", router: "/api/admin" } },
  { file: "src/billing/stripeWebhook.js", prefixes: { stripeWebhookRouter: "/api/billing" } },
];

const ROUTE_CALL_RE = /\b(app|router|stripeWebhookRouter)\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g;

function toOpenApiPath(expressPath) {
  return expressPath.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, "{$1}");
}

/** @returns {Map<string, {method: string, path: string}>} keyed by "METHOD /path" */
function extractImplementedRoutes() {
  const routes = new Map();
  for (const { file, prefixes } of ROUTE_SOURCES) {
    const source = readFileSync(path.join(__dirname, "..", file), "utf8");
    for (const match of source.matchAll(ROUTE_CALL_RE)) {
      const [, receiver, method, rawPath] = match;
      const prefix = prefixes[receiver];
      if (prefix === undefined) continue; // this receiver isn't a router mounted from this file
      const opPath = toOpenApiPath(prefix + rawPath);
      const opMethod = method.toUpperCase();
      routes.set(`${opMethod} ${opPath}`, { method: opMethod, path: opPath });
    }
  }
  return routes;
}

// ── Minimal reader for this file's flat `paths:` section ───────────────────
// docs/api/openapi.yaml always keeps `paths:` as its last top-level section,
// with each path a 2-space-indented key and each method a 4-space-indented
// key beneath it — see docs/OPENAPI.md. This avoids a YAML-parsing
// dependency for what is otherwise a dependency-free check.
function extractSpecRoutes(yamlText) {
  const routes = new Set();
  let inPaths = false;
  let currentPath = null;
  for (const line of yamlText.split("\n")) {
    if (/^paths:\s*$/.test(line)) {
      inPaths = true;
      continue;
    }
    if (!inPaths) continue;
    if (/^\S/.test(line)) break; // dedented out of `paths:` (spec has nothing after it)
    const pathMatch = line.match(/^ {2}(\/\S*):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }
    const methodMatch = line.match(/^ {4}(get|post|put|patch|delete):\s*$/);
    if (methodMatch && currentPath) {
      routes.add(`${methodMatch[1].toUpperCase()} ${currentPath}`);
    }
  }
  return routes;
}

function loadSpecRoutes() {
  if (!existsSync(SPEC_PATH)) return new Set();
  return extractSpecRoutes(readFileSync(SPEC_PATH, "utf8"));
}

function methodBlock(method, opPath) {
  const responses =
    method === "DELETE"
      ? `        '204':\n          description: No content.\n`
      : `        '200':\n          description: Successful response.\n`;
  return `    ${method.toLowerCase()}:\n      summary: "${method} ${opPath}"\n      responses:\n${responses}`;
}

/** Groups missing "METHOD /path" keys by path so a path with several new
 * methods at once gets a single `paths` entry instead of duplicate keys. */
function groupByPath(keys) {
  const byPath = new Map();
  for (const key of keys) {
    const [method, opPath] = key.split(" ");
    if (!byPath.has(opPath)) byPath.set(opPath, []);
    byPath.get(opPath).push(method);
  }
  return byPath;
}

function stubFor(opPath, methods) {
  return `  ${opPath}:\n` + methods.map((m) => methodBlock(m, opPath)).join("");
}

function main() {
  const check = process.argv.includes("--check");
  const implemented = extractImplementedRoutes();
  const documented = loadSpecRoutes();

  const missing = [...implemented.keys()].filter((k) => !documented.has(k)).sort();
  const stale = [...documented].filter((k) => !implemented.has(k)).sort();

  if (check) {
    if (missing.length === 0 && stale.length === 0) {
      console.log("[openapi-drift] docs/api/openapi.yaml matches the implemented routes.");
      return;
    }
    if (missing.length) {
      console.error("[openapi-drift] Implemented but not documented in docs/api/openapi.yaml:");
      missing.forEach((m) => console.error(`  + ${m}`));
    }
    if (stale.length) {
      console.error("[openapi-drift] Documented in docs/api/openapi.yaml but not implemented:");
      stale.forEach((s) => console.error(`  - ${s}`));
    }
    console.error(
      "\nRun `node indexer/scripts/openapi-drift.js` to add stub entries for missing routes, " +
        "remove any stale entries by hand, and commit docs/api/openapi.yaml. See docs/OPENAPI.md.",
    );
    process.exitCode = 1;
    return;
  }

  // Generation mode: additive only.
  if (missing.length === 0) {
    console.log("[openapi-drift] No missing routes — docs/api/openapi.yaml is already up to date.");
  } else {
    if (!existsSync(SPEC_PATH)) {
      throw new Error(`${SPEC_PATH} does not exist. Create it with a paths: section first.`);
    }
    let spec = readFileSync(SPEC_PATH, "utf8");
    if (!spec.endsWith("\n")) spec += "\n";
    for (const [opPath, methods] of groupByPath(missing)) {
      spec += stubFor(opPath, methods);
    }
    writeFileSync(SPEC_PATH, spec);
    console.log(`[openapi-drift] Added ${missing.length} stub route(s) to docs/api/openapi.yaml:`);
    missing.forEach((m) => console.log(`  + ${m}`));
  }

  if (stale.length) {
    console.warn(
      "[openapi-drift] These documented routes no longer exist in the implementation — remove them by hand:",
    );
    stale.forEach((s) => console.warn(`  - ${s}`));
  }
}

main();
