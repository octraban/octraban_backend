# Admin API Authentication

Every route under `/api/admin/*` on the indexer (`indexer/src/routes/admin.js`,
mounted from `indexer/src/api.js`) — including the four analytics endpoints
the frontend rate-limit dashboard calls (`/api/admin/analytics/rate-limit-hits`,
`/api/admin/analytics/top-users`, `/api/admin/analytics/violation-heatmap`,
`/api/admin/analytics/upgrade-recommendations`) — requires a valid admin
bearer token. This document covers how that token is configured, its scope,
expiry, and rotation.

## Scheme

`Authorization: Bearer <token>`, checked in
[`indexer/src/admin/adminAuth.js`](../indexer/src/admin/adminAuth.js) against
the `ADMIN_SECRET` environment variable using `crypto.timingSafeEqual` (constant-time
comparison, to avoid leaking the secret via timing).

The check is applied once, to the whole admin router
(`router.use(adminAuthMiddleware)` in `indexer/src/routes/admin.js`), so every
route registered on that router — present and future — is covered without
needing to remember to add the middleware per-route.

## Issuance / configuration

`ADMIN_SECRET` is a single shared secret set as an environment variable at
deploy time (see `indexer/src/config.js`). There is no per-admin token
issuance flow — anyone holding the value of `ADMIN_SECRET` has full admin
access to every route on the router.

## Scope

All-or-nothing: a valid token authorizes every `/api/admin/*` route. There is
no tiering or per-route scoping, so there is no case where a *valid* token is
rejected for insufficient permission — the middleware therefore only ever
returns `401`, never `403`. If per-route scoping is introduced later, add the
`403` case here and in the corresponding tests.

## Expiry

None. The token is a static secret; it is valid until it is rotated (i.e.
until the `ADMIN_SECRET` env var is changed and the service is redeployed).

## Rotation

1. Generate a new high-entropy secret.
2. Update `ADMIN_SECRET` in the deployment environment.
3. Redeploy/restart the indexer so it picks up the new value (the middleware
   reads `process.env.ADMIN_SECRET` per-request, so no code change is
   needed — only the env var and a process restart to load it).
4. Revoke the old value by ensuring it is no longer set anywhere (old
   requests using it now fail with `401`).

## Logging

The `Authorization` header and raw token are never logged: request logging
(`indexer/src/api.js`) does not log headers, and the audit logger
(`indexer/src/audit/auditLogger.js`) records only `method`, `endpoint`,
`status_code`, `ip`, and `user-agent` — never `authorization`.

## Status codes

| Condition | Status | Body |
|---|---|---|
| No `Authorization` header, or not `Bearer <token>` | `401` | `{ "error": "Unauthorized" }` |
| Token present but does not match `ADMIN_SECRET` | `401` | `{ "error": "Unauthorized" }` |
| `ADMIN_SECRET` not configured on the server | `401` | `{ "error": "Unauthorized" }` (fails closed) |
| Valid token | — | request proceeds |

See `tests/admin-auth.test.ts` for coverage of unauthenticated, invalid-token,
and valid-token access on each `/api/admin/*` route.
