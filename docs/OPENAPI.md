# Indexer OpenAPI Spec — Generation & Drift Check

`docs/api/openapi.yaml` documents every route the indexer service
(`indexer/src/api.js`, mounted on `PORT` 3001) exposes. It's served at
runtime from `GET /api/openapi.yaml` and rendered at `/api/docs` (see
`indexer/src/api.js`).

## Is it hand-maintained or generated?

**Generated.** The indexer does not use `swagger-jsdoc` annotations (that
package is only used by the separate top-level API service's
`src/indexer/swaggerSpec.ts`, a different service on `PORT` 3000). Until this
change, `docs/api/openapi.yaml` didn't exist at all — `GET /api/openapi.yaml`
always 404'd, and `indexer/test/api/contract.test.js`, which loads this file
at import time, was crashing.

The `paths:` section is produced by
[`indexer/scripts/openapi-drift.js`](../indexer/scripts/openapi-drift.js),
which statically scans the Express route registrations in:

- `indexer/src/api.js`
- `indexer/src/routes/admin.js` (routes on its internal `router` are
  prefixed with `/api/admin`)
- `indexer/src/billing/stripeWebhook.js` (prefixed with `/api/billing`)

and reconciles that list against the paths documented in this file.

## Regenerating

```bash
cd octraban_backend
node indexer/scripts/openapi-drift.js
```

This **only adds** stub entries (`summary` + a generic response) for routes
that exist in the code but aren't documented yet — it never rewrites or
deletes an existing entry, so hand-added detail (real request/response
schemas, `x-status: experimental` / `x-status: mock` annotations) on a route
already in the file is preserved. If a route was removed from the code, the
script prints it as stale on stdout/stderr but leaves removing that entry to
a human, since deleting documentation is a decision, not a mechanical one.

## CI enforcement

```bash
node indexer/scripts/openapi-drift.js --check
```

Wired up as the `openapi-drift` job in
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml). It exits non-zero
if any implemented route is undocumented, or any documented route no longer
exists in the code — i.e. it checks route *existence* (path + HTTP method),
not full schema correctness. This is intentionally lightweight: no
dependencies are installed for this job (the check only uses Node's `fs`, no
YAML-parsing library), so it runs in seconds.

## Scope: inventory, not a full contract

Generated entries only assert that a path + method exists; they don't
declare path parameters or real response schemas. This is deliberate —
authoring accurate request/response schemas for ~70 routes by hand is a
separate, much larger effort than keeping the *route inventory* in sync, and
guessing at them risks documenting something incorrect. Maintainers are
encouraged to enrich individual entries over time (see `indexer/test/api/contract.test.js`
for an example of validating a response body against a fuller schema for a
handful of routes); doing so never conflicts with the drift check as long as
the path and method keys are left in place.

## Marking experimental / mock-data endpoints

None of the routes scanned by `openapi-drift.js` are currently known to be
experimental or backed by mock data (that tracking — see
[`docs/STATUS.md`](./STATUS.md) and
[issue #7](https://github.com/octraban/octraban_backend/issues/7) — covers
the separate top-level `src/api/` service, not `indexer/`). If a future
indexer route needs this, add `x-status: experimental` or `x-status: mock`
to its entry in `docs/api/openapi.yaml` by hand; the generator will leave it
untouched on subsequent runs.
