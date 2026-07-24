# Admin Endpoint Authentication

This document describes the authentication scheme protecting all `/api/admin/*`
routes, including the admin analytics endpoints consumed by the frontend
dashboard (`/api/admin/analytics/rate-limit-hits`, `/top-users`,
`/violation-heatmap`, `/upgrade-recommendations`), the API key management
routes, and the audit log routes.

## Scheme

Admin routes use a single static bearer token, not per-user tokens or JWTs.

- **Configuration**: set the `ADMIN_SECRET` environment variable (see
  `indexer/.env.example`). It is optional at the schema level
  (`indexer/src/config.js`), but if it is unset, `adminAuthMiddleware`
  rejects **every** request to `/api/admin/*` with `401`.
- **Request format**: clients send `Authorization: Bearer <ADMIN_SECRET>`.
- **Scope**: the token is all-or-nothing — it grants access to every route
  under `/api/admin/*`. There are no per-route or per-action scopes.
- **Comparison**: the middleware (`indexer/src/admin/adminAuth.js`) compares
  the supplied token to `ADMIN_SECRET` with `crypto.timingSafeEqual` to avoid
  timing side-channels, after normalizing buffer length.

## Expiration and rotation

`ADMIN_SECRET` is a long-lived static secret — it does not expire on its own.

To rotate it:

1. Generate a new secret value.
2. Update `ADMIN_SECRET` in the deployment environment.
3. Restart the indexer process (the middleware reads `process.env.ADMIN_SECRET`
   per request, so no code change is needed, but the running process must pick
   up the new environment variable).
4. Update any clients (e.g. the admin dashboard) with the new value.

There is no dual-secret grace period today — rotation is a hard cutover.
Treat `ADMIN_SECRET` the same as any other production credential: store it in
your secrets manager, not in source control or `.env` files committed to git.

## Enforcement

Every route under `/api/admin/*` is mounted on an Express `Router` that
applies `adminAuthMiddleware` via `router.use(adminAuthMiddleware)`
(`indexer/src/routes/admin.js`), so new routes added to that router are
protected automatically — there is no per-route opt-in.

- Missing or malformed `Authorization` header → `401 { "error": "Unauthorized" }`
- Present but incorrect token → `401 { "error": "Unauthorized" }`
- `ADMIN_SECRET` not configured on the server → `401` for all requests
- Valid token → request proceeds

The middleware does not return `403` today: there is no notion of an
authenticated-but-insufficiently-privileged admin caller, since the token is
all-or-nothing.

## Logging

The admin token is never logged: there is no request logger in
`indexer/src/api.js` that dumps request headers, and `adminAuth.js` does not
log the `Authorization` header or the configured secret. Keep it that way —
avoid adding wholesale header/body logging (e.g. `morgan('combined')`) to
routes under `/api/admin/*` without redacting `Authorization`.

## Test coverage

`indexer/test/api/admin-auth.test.js` asserts:

- `401` for every `/api/admin/*` route (including all four analytics routes)
  when the `Authorization` header is missing
- `401` when the header carries a well-formed but incorrect bearer token
- `200` for a representative admin analytics route when the token is valid
