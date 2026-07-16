# API Implementation Status

## Purpose

This document inventories the TypeScript modules under src/api, separates primary API modules from support helpers, and classifies each module conservatively using repository evidence from the workspace.

## Status definitions

- Production-ready: the module is mounted in the public API surface and backed by real execution paths rather than placeholders.
- Experimental: the module has a real implementation, but it is niche, weakly validated, optional, or outside the core explorer responsibility.
- Mock/stub: the module depends on hardcoded responses, fake data, placeholder callbacks, or clearly incomplete execution paths.

## Executive summary

- Total TypeScript API files found: 126
- Primary API modules documented: 123
- Support-only helpers: 3
- Production-ready entries: 1
- Experimental entries: 113
- Mock/stub entries: 9

## Core explorer surface

These modules are the main explorer-oriented API footprint that is wired through the central router in [src/api/router.ts](../src/api/router.ts) and mounted at /api/v1 from [src/index.ts](../src/index.ts).

- [src/api/router.ts](../src/api/router.ts) — Production-ready; mounted at /api/v1 and acts as the central registry for the public backend surface; tracking issue: Not required
- [src/api/aa.ts](../src/api/aa.ts) — Experimental; mounted in the main router but still needs route-level validation and feature guards; tracking issue: Tracking issue not found
- [src/api/abi.ts](../src/api/abi.ts) — Experimental; mounted in the main router but still needs route-level validation and feature guards; tracking issue: Tracking issue not found
- [src/api/abi-extract.ts](../src/api/abi-extract.ts) — Experimental; mounted in the main router but still lacks dedicated regression coverage; tracking issue: Tracking issue not found
- [src/api/admin.ts](../src/api/admin.ts) — Experimental; mounted in the main router but still needs route-level validation and feature guards; tracking issue: Tracking issue not found
- [src/api/alerts.ts](../src/api/alerts.ts) — Experimental; mounted in the main router but still needs route-level validation and feature guards; tracking issue: Tracking issue not found
- [src/api/analytics.ts](../src/api/analytics.ts) — Experimental; mounted in the main router but still needs route-level validation and feature guards; tracking issue: Tracking issue not found
- [src/api/authorizations.ts](../src/api/authorizations.ts) — Experimental; mounted in the main router but still lacks dedicated regression coverage; tracking issue: Tracking issue not found
- [src/api/bridge-tracker.ts](../src/api/bridge-tracker.ts) — Experimental; mounted in the main router but still lacks dedicated regression coverage; tracking issue: Tracking issue not found
- [src/api/compiler-router.ts](../src/api/compiler-router.ts) — Experimental; mounted in the main router but still needs route-level validation and feature guards; tracking issue: Tracking issue not found
- [src/api/compliance.ts](../src/api/compliance.ts) — Experimental; mounted in the main router but still needs route-level validation and feature guards; tracking issue: Tracking issue not found
- [src/api/contracts.ts](../src/api/contracts.ts) — Experimental; mounted in the main router but still lacks dedicated regression coverage; tracking issue: Tracking issue not found
- [src/api/events.ts](../src/api/events.ts) — Experimental; mounted in the main router but still lacks dedicated regression coverage; tracking issue: Tracking issue not found
- [src/api/exports.ts](../src/api/exports.ts) — Experimental; mounted in the main router but still lacks dedicated regression coverage; tracking issue: Tracking issue not found
- [src/api/i18n.ts](../src/api/i18n.ts) — Experimental; mounted in the main router but still needs route-level validation and feature guards; tracking issue: Tracking issue not found
- [src/api/market.ts](../src/api/market.ts) — Experimental; mounted in the main router but still lacks dedicated regression coverage; tracking issue: Tracking issue not found
- [src/api/network.ts](../src/api/network.ts) — Experimental; mounted in the main router but still lacks dedicated regression coverage; tracking issue: Tracking issue not found
- [src/api/nft.ts](../src/api/nft.ts) — Experimental; mounted in the main router but still lacks dedicated regression coverage; tracking issue: Tracking issue not found
- [src/api/nlq.ts](../src/api/nlq.ts) — Experimental; mounted in the main router but still needs route-level validation and feature guards; tracking issue: Tracking issue not found
- [src/api/portfolio.ts](../src/api/portfolio.ts) — Experimental; mounted in the main router but still lacks dedicated regression coverage; tracking issue: Tracking issue not found
- [src/api/protocol.ts](../src/api/protocol.ts) — Experimental; mounted in the main router but still lacks dedicated regression coverage; tracking issue: Tracking issue not found
- [src/api/protocol-economics.ts](../src/api/protocol-economics.ts) — Experimental; mounted in the main router but still needs route-level validation and feature guards; tracking issue: Tracking issue not found
- [src/api/render.ts](../src/api/render.ts) — Experimental; mounted in the main router but still lacks dedicated regression coverage; tracking issue: Tracking issue not found
- [src/api/simulate.ts](../src/api/simulate.ts) — Experimental; mounted in the main router but still needs route-level validation and feature guards; tracking issue: Tracking issue not found
- [src/api/sync-state.ts](../src/api/sync-state.ts) — Experimental; mounted in the main router but still lacks dedicated regression coverage; tracking issue: Tracking issue not found
- [src/api/token-metadata.ts](../src/api/token-metadata.ts) — Experimental; mounted in the main router but still lacks dedicated regression coverage; tracking issue: Tracking issue not found
- [src/api/token-prices.ts](../src/api/token-prices.ts) — Experimental; mounted in the main router but still lacks dedicated regression coverage; tracking issue: Tracking issue not found
- [src/api/tokens.ts](../src/api/tokens.ts) — Experimental; mounted in the main router but still lacks dedicated regression coverage; tracking issue: Tracking issue not found
- [src/api/transactions.ts](../src/api/transactions.ts) — Experimental; mounted in the main router but still lacks dedicated regression coverage; tracking issue: Tracking issue not found
- [src/api/verify.ts](../src/api/verify.ts) — Experimental; mounted in the main router but still lacks dedicated regression coverage; tracking issue: Tracking issue not found
- [src/api/wallets.ts](../src/api/wallets.ts) — Experimental; mounted in the main router but still lacks dedicated regression coverage; tracking issue: Tracking issue not found
- [src/api/webhooks.ts](../src/api/webhooks.ts) — Experimental; mounted in the main router but still lacks dedicated regression coverage; tracking issue: Tracking issue not found

## Authentication, developer, and administration

- [src/api/admin/api-keys.ts](../src/api/admin/api-keys.ts) — Experimental; mounted under the admin router and uses sensitive auth checks without a dedicated validation layer; tracking issue: Tracking issue not found
- [src/api/admin/errors.ts](../src/api/admin/errors.ts) — Experimental; mounted under the admin router and has no separate error-path validation in this repo snapshot; tracking issue: Tracking issue not found
- [src/api/auth.ts](../src/api/auth.ts) — Experimental; mounted only through the auth aggregation path and has no separate validation layer in this snapshot; tracking issue: Tracking issue not found
- [src/api/authMultisig.ts](../src/api/authMultisig.ts) — Experimental; mounted only through the auth aggregation path and has no separate validation layer in this snapshot; tracking issue: Tracking issue not found
- [src/api/authOAuth2.ts](../src/api/authOAuth2.ts) — Experimental; mounted only through the auth aggregation path and has no separate validation layer in this snapshot; tracking issue: Tracking issue not found
- [src/api/authProfile.ts](../src/api/authProfile.ts) — Experimental; mounted only through the auth aggregation path and has no separate validation layer in this snapshot; tracking issue: Tracking issue not found
- [src/api/authSecurity.ts](../src/api/authSecurity.ts) — Experimental; mounted only through the auth aggregation path and has no separate validation layer in this snapshot; tracking issue: Tracking issue not found
- [src/api/authWebhooks.ts](../src/api/authWebhooks.ts) — Experimental; mounted only through the auth aggregation path and has no separate validation layer in this snapshot; tracking issue: Tracking issue not found
- [src/api/developer/auth.ts](../src/api/developer/auth.ts) — Experimental; mounted through the developer router aggregation and has no separate validation layer in this snapshot; tracking issue: Tracking issue not found
- [src/api/developer/keys.ts](../src/api/developer/keys.ts) — Experimental; mounted through the developer router aggregation and has no separate validation layer in this snapshot; tracking issue: Tracking issue not found
- [src/api/developer/portal.ts](../src/api/developer/portal.ts) — Experimental; mounted through the developer router aggregation and has no separate validation layer in this snapshot; tracking issue: Tracking issue not found
- [src/api/developer/rate-limits.ts](../src/api/developer/rate-limits.ts) — Experimental; mounted through the developer router aggregation and has no separate validation layer in this snapshot; tracking issue: Tracking issue not found
- [src/api/developer/router.ts](../src/api/developer/router.ts) — Experimental; acts as the developer aggregation entry point rather than a single feature router; tracking issue: Tracking issue not found
- [src/api/developer/usage.ts](../src/api/developer/usage.ts) — Experimental; mounted through the developer router aggregation and has no separate validation layer in this snapshot; tracking issue: Tracking issue not found
- [src/api/developer/webhooks.ts](../src/api/developer/webhooks.ts) — Experimental; mounted through the developer router aggregation and has no separate validation layer in this snapshot; tracking issue: Tracking issue not found
- [src/api/rate-limits.ts](../src/api/rate-limits.ts) — Experimental; mounted only through the auth/developer aggregation path and has no separate validation layer in this snapshot; tracking issue: Tracking issue not found

## Stellar ecosystem

- [src/api/stellar/accounts.ts](../src/api/stellar/accounts.ts) — Experimental; mounted through the Stellar router aggregator rather than directly from the top-level router; tracking issue: Tracking issue not found
- [src/api/stellar/anchors.ts](../src/api/stellar/anchors.ts) — Experimental; mounted through the Stellar router aggregator rather than directly from the top-level router; tracking issue: Tracking issue not found
- [src/api/stellar/bridge.ts](../src/api/stellar/bridge.ts) — Experimental; mounted through the Stellar router aggregator rather than directly from the top-level router; tracking issue: Tracking issue not found
- [src/api/stellar/classic-assets.ts](../src/api/stellar/classic-assets.ts) — Experimental; mounted through the Stellar router aggregator rather than directly from the top-level router; tracking issue: Tracking issue not found
- [src/api/stellar/extended.ts](../src/api/stellar/extended.ts) — Experimental; mounted through the Stellar router aggregator rather than directly from the top-level router; tracking issue: Tracking issue not found
- [src/api/stellar/index.ts](../src/api/stellar/index.ts) — Experimental; acts as the Stellar aggregation entry point rather than a standalone feature router; tracking issue: Tracking issue not found
- [src/api/stellar/network-health.ts](../src/api/stellar/network-health.ts) — Experimental; mounted through the Stellar router aggregator rather than directly from the top-level router; tracking issue: Tracking issue not found
- [src/api/stellar/overview.ts](../src/api/stellar/overview.ts) — Experimental; mounted through the Stellar router aggregator rather than directly from the top-level router; tracking issue: Tracking issue not found
- [src/api/stellar/payments.ts](../src/api/stellar/payments.ts) — Experimental; mounted through the Stellar router aggregator rather than directly from the top-level router; tracking issue: Tracking issue not found

## Specialized and experimental modules

- [src/api/advanced-events.ts](../src/api/advanced-events.ts) — Experimental; not mounted in the main router and uses generated subscription identifiers rather than a persisted subscription model; tracking issue: Tracking issue not found
- [src/api/arbitrage.ts](../src/api/arbitrage.ts) — Experimental; remains a standalone trading-intelligence surface and is not part of the core explorer router; tracking issue: Tracking issue not found
- [src/api/archive.ts](../src/api/archive.ts) — Experimental; remains a standalone router and needs a clearer contract with the core explorer before wider use; tracking issue: Tracking issue not found
- [src/api/assets.ts](../src/api/assets.ts) — Experimental; exposes an independent data-product surface and needs a curated export contract before it can be promoted; tracking issue: Tracking issue not found
- [src/api/benchmarks.ts](../src/api/benchmarks.ts) — Experimental; isolated from the main explorer router and needs a lightweight status/health contract before broader use; tracking issue: Tracking issue not found
- [src/api/bn254.ts](../src/api/bn254.ts) — Experimental; remains a standalone router and needs a clearer contract with the core explorer before wider use; tracking issue: Tracking issue not found
- [src/api/checked-arithmetic.ts](../src/api/checked-arithmetic.ts) — Experimental; remains a standalone router and needs a clearer contract with the core explorer before wider use; tracking issue: Tracking issue not found
- [src/api/commodity-compliance.ts](../src/api/commodity-compliance.ts) — Experimental; isolated from the core explorer and depends on specialized compliance workflows; tracking issue: Tracking issue not found
- [src/api/composability.ts](../src/api/composability.ts) — Experimental; remains a standalone router and needs a clearer contract with the core explorer before wider use; tracking issue: Tracking issue not found
- [src/api/dashboards.ts](../src/api/dashboards.ts) — Experimental; remains a standalone router and needs a clearer contract with the core explorer before wider use; tracking issue: Tracking issue not found
- [src/api/dex.ts](../src/api/dex.ts) — Experimental; remains a standalone router and needs a clearer contract with the core explorer before wider use; tracking issue: Tracking issue not found
- [src/api/dex-analytics.ts](../src/api/dex-analytics.ts) — Experimental; remains a standalone router and needs a clearer contract with the core explorer before wider use; tracking issue: Tracking issue not found
- [src/api/dtcc-settlement.ts](../src/api/dtcc-settlement.ts) — Experimental; isolated from the core explorer and depends on specialized compliance workflows; tracking issue: Tracking issue not found
- [src/api/emergency.ts](../src/api/emergency.ts) — Experimental; isolated from the main explorer router and needs a lightweight status/health contract before broader use; tracking issue: Tracking issue not found
- [src/api/emergency-alerts.ts](../src/api/emergency-alerts.ts) — Experimental; isolated from the main explorer router and needs a lightweight status/health contract before broader use; tracking issue: Tracking issue not found
- [src/api/emergency-analysis.ts](../src/api/emergency-analysis.ts) — Experimental; isolated from the main explorer router and needs a lightweight status/health contract before broader use; tracking issue: Tracking issue not found
- [src/api/emergency-health.ts](../src/api/emergency-health.ts) — Experimental; isolated from the main explorer router and needs a lightweight status/health contract before broader use; tracking issue: Tracking issue not found
- [src/api/emergency-incidents.ts](../src/api/emergency-incidents.ts) — Experimental; isolated from the main explorer router and needs a lightweight status/health contract before broader use; tracking issue: Tracking issue not found
- [src/api/emergency-router.ts](../src/api/emergency-router.ts) — Experimental; isolated from the main explorer router and needs a lightweight status/health contract before broader use; tracking issue: Tracking issue not found
- [src/api/emergency-viz.ts](../src/api/emergency-viz.ts) — Experimental; isolated from the main explorer router and needs a lightweight status/health contract before broader use; tracking issue: Tracking issue not found
- [src/api/factory-tracker.ts](../src/api/factory-tracker.ts) — Experimental; remains a standalone router and needs a clearer contract with the core explorer before wider use; tracking issue: Tracking issue not found
- [src/api/feed.ts](../src/api/feed.ts) — Experimental; contains a TODO for delivering a test message rather than a completed feed path; tracking issue: Tracking issue not found
- [src/api/feedSSE.ts](../src/api/feedSSE.ts) — Experimental; isolated from the main explorer router and needs a lightweight status/health contract before broader use; tracking issue: Tracking issue not found
- [src/api/forecast.ts](../src/api/forecast.ts) — Experimental; remains standalone and needs a normalized metrics contract before it can be surfaced from the core explorer; tracking issue: Tracking issue not found
- [src/api/freeze.ts](../src/api/freeze.ts) — Experimental; depends on mock admin-auth middleware rather than a provider-backed auth path; tracking issue: Tracking issue not found
- [src/api/fuzzing.ts](../src/api/fuzzing.ts) — Experimental; isolated from the main explorer router and needs a lightweight status/health contract before broader use; tracking issue: Tracking issue not found
- [src/api/gas.ts](../src/api/gas.ts) — Experimental; remains a standalone router and needs a clearer contract with the core explorer before wider use; tracking issue: Tracking issue not found
- [src/api/governance.ts](../src/api/governance.ts) — Experimental; remains a standalone router and needs a clearer contract with the core explorer before wider use; tracking issue: Tracking issue not found
- [src/api/graph.ts](../src/api/graph.ts) — Experimental; remains a standalone router and needs a clearer contract with the core explorer before wider use; tracking issue: Tracking issue not found
- [src/api/identity.ts](../src/api/identity.ts) — Experimental; remains a standalone router and needs a clearer contract with the core explorer before wider use; tracking issue: Tracking issue not found
- [src/api/intelligence.ts](../src/api/intelligence.ts) — Experimental; remains standalone and needs a normalized metrics contract before it can be surfaced from the core explorer; tracking issue: Tracking issue not found
- [src/api/mev.ts](../src/api/mev.ts) — Experimental; remains a standalone trading-intelligence surface and is not part of the core explorer router; tracking issue: Tracking issue not found
- [src/api/oracle-audit.ts](../src/api/oracle-audit.ts) — Experimental; remains standalone and needs a normalized metrics contract before it can be surfaced from the core explorer; tracking issue: Tracking issue not found
- [src/api/oracle-intelligence.ts](../src/api/oracle-intelligence.ts) — Experimental; remains standalone and needs a normalized metrics contract before it can be surfaced from the core explorer; tracking issue: Tracking issue not found
- [src/api/playground.ts](../src/api/playground.ts) — Experimental; isolated from the main explorer router and needs a lightweight status/health contract before broader use; tracking issue: Tracking issue not found
- [src/api/privacy.ts](../src/api/privacy.ts) — Experimental; remains a standalone router and needs a clearer contract with the core explorer before wider use; tracking issue: Tracking issue not found
- [src/api/protocol26-state-extension.ts](../src/api/protocol26-state-extension.ts) — Experimental; remains a standalone router and needs a clearer contract with the core explorer before wider use; tracking issue: Tracking issue not found
- [src/api/reentrancy.ts](../src/api/reentrancy.ts) — Experimental; isolated from the core explorer and depends on specialized compliance workflows; tracking issue: Tracking issue not found
- [src/api/resource-audit.ts](../src/api/resource-audit.ts) — Experimental; isolated from the core explorer and depends on specialized compliance workflows; tracking issue: Tracking issue not found
- [src/api/revenue.ts](../src/api/revenue.ts) — Experimental; exposes an independent data-product surface and needs a curated export contract before it can be promoted; tracking issue: Tracking issue not found
- [src/api/rwa-compliance.ts](../src/api/rwa-compliance.ts) — Experimental; isolated from the core explorer and depends on specialized compliance workflows; tracking issue: Tracking issue not found
- [src/api/sac-trustlines.ts](../src/api/sac-trustlines.ts) — Experimental; isolated from the core explorer and depends on specialized compliance workflows; tracking issue: Tracking issue not found
- [src/api/sandwich.ts](../src/api/sandwich.ts) — Experimental; remains a standalone trading-intelligence surface and is not part of the core explorer router; tracking issue: Tracking issue not found
- [src/api/schedule.ts](../src/api/schedule.ts) — Experimental; isolated from the main explorer router and needs a lightweight status/health contract before broader use; tracking issue: Tracking issue not found
- [src/api/sdks.ts](../src/api/sdks.ts) — Experimental; remains a standalone router and needs a clearer contract with the core explorer before wider use; tracking issue: Tracking issue not found
- [src/api/search.ts](../src/api/search.ts) — Experimental; remains a standalone router and needs a clearer contract with the core explorer before wider use; tracking issue: Tracking issue not found
- [src/api/settlement-batch.ts](../src/api/settlement-batch.ts) — Experimental; isolated from the core explorer and depends on specialized compliance workflows; tracking issue: Tracking issue not found
- [src/api/signers.ts](../src/api/signers.ts) — Experimental; remains a standalone router and needs a clearer contract with the core explorer before wider use; tracking issue: Tracking issue not found
- [src/api/storage.ts](../src/api/storage.ts) — Experimental; remains a standalone router and needs a clearer contract with the core explorer before wider use; tracking issue: Tracking issue not found
- [src/api/storage-trap.ts](../src/api/storage-trap.ts) — Experimental; remains a standalone router and needs a clearer contract with the core explorer before wider use; tracking issue: Tracking issue not found
- [src/api/systemic.ts](../src/api/systemic.ts) — Experimental; isolated from the core explorer and depends on specialized compliance workflows; tracking issue: Tracking issue not found
- [src/api/tax.ts](../src/api/tax.ts) — Experimental; exposes an independent data-product surface and needs a curated export contract before it can be promoted; tracking issue: Tracking issue not found
- [src/api/tip.ts](../src/api/tip.ts) — Experimental; remains a standalone router and needs a clearer contract with the core explorer before wider use; tracking issue: Tracking issue not found
- [src/api/token-holders.ts](../src/api/token-holders.ts) — Experimental; exposes an independent data-product surface and needs a curated export contract before it can be promoted; tracking issue: Tracking issue not found
- [src/api/upgrade-trace.ts](../src/api/upgrade-trace.ts) — Experimental; remains a standalone router and needs a clearer contract with the core explorer before wider use; tracking issue: Tracking issue not found
- [src/api/virtualList.ts](../src/api/virtualList.ts) — Experimental; isolated from the main explorer router and needs a lightweight status/health contract before broader use; tracking issue: Tracking issue not found
- [src/api/yield.ts](../src/api/yield.ts) — Experimental; remains a standalone router and needs a clearer contract with the core explorer before wider use; tracking issue: Tracking issue not found

## Mock/stub modules

- [src/api/backfill.ts](../src/api/backfill.ts) — Mock/stub; creates mock file metadata and leaves the completion callback unimplemented; tracking issue: [issue #7](https://github.com/octraban/octraban_backend/issues/7)
- [src/api/data-market.ts](../src/api/data-market.ts) — Mock/stub; returns randomized proof-stub offsets and lengths instead of a real provider response; tracking issue: [issue #7](https://github.com/octraban/octraban_backend/issues/7)
- [src/api/developer/billing.ts](../src/api/developer/billing.ts) — Mock/stub; returns a generated transaction reference and a placeholder invoice body; tracking issue: [issue #7](https://github.com/octraban/octraban_backend/issues/7)
- [src/api/flash-loans.ts](../src/api/flash-loans.ts) — Mock/stub; uses a fake transaction object and a stubbed mempool-risk score; tracking issue: [issue #7](https://github.com/octraban/octraban_backend/issues/7)
- [src/api/oracle-feeds.ts](../src/api/oracle-feeds.ts) — Mock/stub; returns hardcoded demo prices and is explicitly marked as a demo endpoint; tracking issue: [issue #7](https://github.com/octraban/octraban_backend/issues/7)
- [src/api/predict.ts](../src/api/predict.ts) — Mock/stub; uses mock perturbation data and no real forecasting provider path; tracking issue: [issue #7](https://github.com/octraban/octraban_backend/issues/7)
- [src/api/reputation.ts](../src/api/reputation.ts) — Mock/stub; uses mock chain data and compatibility mock routes; tracking issue: [issue #7](https://github.com/octraban/octraban_backend/issues/7)
- [src/api/sandbox.ts](../src/api/sandbox.ts) — Mock/stub; explicitly returns stubbed payloads and does not implement full breakpoint support; tracking issue: [issue #8](https://github.com/octraban/octraban_backend/issues/8)
- [src/api/treasury.ts](../src/api/treasury.ts) — Mock/stub; uses Math.random-based identifiers and no real treasury execution path in the inspected code; tracking issue: [issue #7](https://github.com/octraban/octraban_backend/issues/7)

## Support-only helpers

- [src/api/build-queue.ts](../src/api/build-queue.ts) — Support utility rather than a primary API router.
- [src/api/compiler.ts](../src/api/compiler.ts) — Support utility rather than a primary API router.
- [src/api/stellar/middleware.ts](../src/api/stellar/middleware.ts) — Support utility rather than a primary API router.

## Core explorer boundary

Each primary API module is assigned to exactly one recommendation below.

### Keep in core
- [src/api/router.ts](../src/api/router.ts)
- [src/api/abi-extract.ts](../src/api/abi-extract.ts)
- [src/api/authorizations.ts](../src/api/authorizations.ts)
- [src/api/bridge-tracker.ts](../src/api/bridge-tracker.ts)
- [src/api/contracts.ts](../src/api/contracts.ts)
- [src/api/events.ts](../src/api/events.ts)
- [src/api/exports.ts](../src/api/exports.ts)
- [src/api/market.ts](../src/api/market.ts)
- [src/api/network.ts](../src/api/network.ts)
- [src/api/nft.ts](../src/api/nft.ts)
- [src/api/portfolio.ts](../src/api/portfolio.ts)
- [src/api/protocol.ts](../src/api/protocol.ts)
- [src/api/render.ts](../src/api/render.ts)
- [src/api/sync-state.ts](../src/api/sync-state.ts)
- [src/api/token-metadata.ts](../src/api/token-metadata.ts)
- [src/api/token-prices.ts](../src/api/token-prices.ts)
- [src/api/tokens.ts](../src/api/tokens.ts)
- [src/api/transactions.ts](../src/api/transactions.ts)
- [src/api/verify.ts](../src/api/verify.ts)
- [src/api/wallets.ts](../src/api/wallets.ts)
- [src/api/webhooks.ts](../src/api/webhooks.ts)
- [src/api/admin/api-keys.ts](../src/api/admin/api-keys.ts)
- [src/api/admin/errors.ts](../src/api/admin/errors.ts)
- [src/api/auth.ts](../src/api/auth.ts)
- [src/api/authMultisig.ts](../src/api/authMultisig.ts)
- [src/api/authOAuth2.ts](../src/api/authOAuth2.ts)
- [src/api/authProfile.ts](../src/api/authProfile.ts)
- [src/api/authSecurity.ts](../src/api/authSecurity.ts)
- [src/api/authWebhooks.ts](../src/api/authWebhooks.ts)
- [src/api/developer/auth.ts](../src/api/developer/auth.ts)
- [src/api/developer/keys.ts](../src/api/developer/keys.ts)
- [src/api/developer/portal.ts](../src/api/developer/portal.ts)
- [src/api/developer/rate-limits.ts](../src/api/developer/rate-limits.ts)
- [src/api/developer/router.ts](../src/api/developer/router.ts)
- [src/api/developer/usage.ts](../src/api/developer/usage.ts)
- [src/api/developer/webhooks.ts](../src/api/developer/webhooks.ts)
- [src/api/rate-limits.ts](../src/api/rate-limits.ts)
- [src/api/search.ts](../src/api/search.ts)

### Keep in core, but mark experimental
- [src/api/aa.ts](../src/api/aa.ts)
- [src/api/abi.ts](../src/api/abi.ts)
- [src/api/admin.ts](../src/api/admin.ts)
- [src/api/alerts.ts](../src/api/alerts.ts)
- [src/api/analytics.ts](../src/api/analytics.ts)
- [src/api/compiler-router.ts](../src/api/compiler-router.ts)
- [src/api/i18n.ts](../src/api/i18n.ts)
- [src/api/nlq.ts](../src/api/nlq.ts)
- [src/api/protocol-economics.ts](../src/api/protocol-economics.ts)
- [src/api/simulate.ts](../src/api/simulate.ts)
- [src/api/stellar/accounts.ts](../src/api/stellar/accounts.ts)
- [src/api/stellar/anchors.ts](../src/api/stellar/anchors.ts)
- [src/api/stellar/bridge.ts](../src/api/stellar/bridge.ts)
- [src/api/stellar/classic-assets.ts](../src/api/stellar/classic-assets.ts)
- [src/api/stellar/extended.ts](../src/api/stellar/extended.ts)
- [src/api/stellar/index.ts](../src/api/stellar/index.ts)
- [src/api/stellar/network-health.ts](../src/api/stellar/network-health.ts)
- [src/api/stellar/overview.ts](../src/api/stellar/overview.ts)
- [src/api/stellar/payments.ts](../src/api/stellar/payments.ts)
- [src/api/advanced-events.ts](../src/api/advanced-events.ts)
- [src/api/identity.ts](../src/api/identity.ts)
- [src/api/sdks.ts](../src/api/sdks.ts)

### Move to separate packages

- `packages/mev-intelligence`
  - Included modules: [src/api/arbitrage.ts](../src/api/arbitrage.ts), [src/api/mev.ts](../src/api/mev.ts), [src/api/sandwich.ts](../src/api/sandwich.ts).
  - Reason for separation: Specialized MEV and trading-intelligence functionality has a distinct release cadence, data pipeline, and operational risk profile.
  - Interface with the core explorer: A read-only event and transaction analytics contract for explorer links, summaries, and status cards.
  - Operational benefit: Independent scaling, ownership, testing, deployment, and failure isolation.
- `packages/risk-compliance`
  - Included modules: [src/api/compliance.ts](../src/api/compliance.ts), [src/api/commodity-compliance.ts](../src/api/commodity-compliance.ts), [src/api/dtcc-settlement.ts](../src/api/dtcc-settlement.ts), [src/api/reentrancy.ts](../src/api/reentrancy.ts), [src/api/resource-audit.ts](../src/api/resource-audit.ts), [src/api/rwa-compliance.ts](../src/api/rwa-compliance.ts), [src/api/sac-trustlines.ts](../src/api/sac-trustlines.ts), [src/api/settlement-batch.ts](../src/api/settlement-batch.ts), [src/api/systemic.ts](../src/api/systemic.ts).
  - Reason for separation: Risk, audit, settlement, and compliance workflows require specialized controls, review, and domain ownership.
  - Interface with the core explorer: Read-only risk summaries, status badges, and webhook callbacks keyed by canonical explorer entities.
  - Operational benefit: Tighter security boundaries, clearer ownership, and a reduced blast radius.
- `packages/predictive-oracle`
  - Included modules: [src/api/forecast.ts](../src/api/forecast.ts), [src/api/intelligence.ts](../src/api/intelligence.ts), [src/api/oracle-audit.ts](../src/api/oracle-audit.ts), [src/api/oracle-intelligence.ts](../src/api/oracle-intelligence.ts).
  - Reason for separation: Prediction and oracle-intelligence endpoints depend on specialized data pipelines and model/provider integrations.
  - Interface with the core explorer: A normalized metrics, provenance, and health contract consumed by the core explorer.
  - Operational benefit: Independent provider management, scaling, testing, and release cadence.
- `packages/operations-lab`
  - Included modules: [src/api/benchmarks.ts](../src/api/benchmarks.ts), [src/api/emergency.ts](../src/api/emergency.ts), [src/api/emergency-alerts.ts](../src/api/emergency-alerts.ts), [src/api/emergency-analysis.ts](../src/api/emergency-analysis.ts), [src/api/emergency-health.ts](../src/api/emergency-health.ts), [src/api/emergency-incidents.ts](../src/api/emergency-incidents.ts), [src/api/emergency-router.ts](../src/api/emergency-router.ts), [src/api/emergency-viz.ts](../src/api/emergency-viz.ts), [src/api/feed.ts](../src/api/feed.ts), [src/api/feedSSE.ts](../src/api/feedSSE.ts), [src/api/freeze.ts](../src/api/freeze.ts), [src/api/fuzzing.ts](../src/api/fuzzing.ts), [src/api/playground.ts](../src/api/playground.ts), [src/api/schedule.ts](../src/api/schedule.ts), [src/api/virtualList.ts](../src/api/virtualList.ts).
  - Reason for separation: Emergency, fuzzing, playground, benchmark, feed, scheduling, and visualization tools have experimental operational lifecycles.
  - Interface with the core explorer: A lightweight health, alert-summary, and event contract with no direct dependency on core request handling.
  - Operational benefit: Safer experimentation, isolated failures, and easier feature gating.
- `packages/data-products`
  - Included modules: [src/api/assets.ts](../src/api/assets.ts), [src/api/revenue.ts](../src/api/revenue.ts), [src/api/tax.ts](../src/api/tax.ts), [src/api/token-holders.ts](../src/api/token-holders.ts).
  - Reason for separation: Revenue, tax, holder, and asset data products can evolve independently from canonical explorer APIs.
  - Interface with the core explorer: Curated read-only exports and summary endpoints based on stable explorer identifiers.
  - Operational benefit: Decoupled data pipelines, ownership, deployment, and release management.
- `packages/defi-analytics`
  - Included modules: [src/api/dashboards.ts](../src/api/dashboards.ts), [src/api/dex.ts](../src/api/dex.ts), [src/api/dex-analytics.ts](../src/api/dex-analytics.ts), [src/api/gas.ts](../src/api/gas.ts), [src/api/governance.ts](../src/api/governance.ts), [src/api/yield.ts](../src/api/yield.ts).
  - Reason for separation: DEX, gas, governance, dashboard, and yield analytics form an optional DeFi product surface rather than canonical explorer infrastructure.
  - Interface with the core explorer: Read-only transaction, token, pool, and protocol data contracts from the core explorer.
  - Operational benefit: Independent scaling and a clearer distinction between canonical data and derived analytics.
- `packages/contract-analysis`
  - Included modules: [src/api/bn254.ts](../src/api/bn254.ts), [src/api/checked-arithmetic.ts](../src/api/checked-arithmetic.ts), [src/api/composability.ts](../src/api/composability.ts), [src/api/factory-tracker.ts](../src/api/factory-tracker.ts), [src/api/graph.ts](../src/api/graph.ts), [src/api/privacy.ts](../src/api/privacy.ts), [src/api/protocol26-state-extension.ts](../src/api/protocol26-state-extension.ts), [src/api/signers.ts](../src/api/signers.ts), [src/api/storage-trap.ts](../src/api/storage-trap.ts), [src/api/upgrade-trace.ts](../src/api/upgrade-trace.ts).
  - Reason for separation: Cryptographic, arithmetic, composability, privacy, signer, storage-trap, and upgrade analysis require specialized dependencies and security review.
  - Interface with the core explorer: A contract-code, ABI, storage, and execution-trace contract supplied by the core explorer.
  - Operational benefit: Dependency isolation, focused testing, independent ownership, and lower operational risk.
- `packages/storage-services`
  - Included modules: [src/api/archive.ts](../src/api/archive.ts), [src/api/storage.ts](../src/api/storage.ts).
  - Reason for separation: Archive and storage management have infrastructure and retention concerns separate from public explorer routing.
  - Interface with the core explorer: Stable object identifiers, retrieval metadata, and health/status interfaces.
  - Operational benefit: Independent capacity planning, retention policies, deployment, and failure isolation.
- `packages/threat-intelligence`
  - Included modules: [src/api/tip.ts](../src/api/tip.ts).
  - Reason for separation: Threat-intelligence workflows are a distinct security product with separate data sources and operational ownership.
  - Interface with the core explorer: Read-only indicators and alert summaries linked to explorer entities.
  - Operational benefit: Stronger security boundaries and independent provider and release management.

### Remove or disable until implemented
- [src/api/backfill.ts](../src/api/backfill.ts)
- [src/api/data-market.ts](../src/api/data-market.ts)
- [src/api/developer/billing.ts](../src/api/developer/billing.ts)
- [src/api/flash-loans.ts](../src/api/flash-loans.ts)
- [src/api/oracle-feeds.ts](../src/api/oracle-feeds.ts)
- [src/api/predict.ts](../src/api/predict.ts)
- [src/api/reputation.ts](../src/api/reputation.ts)
- [src/api/sandbox.ts](../src/api/sandbox.ts)
- [src/api/treasury.ts](../src/api/treasury.ts)


## Tracking gaps

- The broad explorer surface does not have a dedicated repository issue in the inspected workspace, so it should be tracked as a product-level follow-up.
- The mock/stub modules are covered by [issue #7](https://github.com/octraban/octraban_backend/issues/7) and [issue #8](https://github.com/octraban/octraban_backend/issues/8).
- Auth, developer, and Stellar routes should be tracked as a boundary-validation effort rather than as part of the core router contract.

## Prioritized next steps

- P0: remove or disable the mock/stub modules and keep their public behavior from looking production-ready.
- P1: establish feature flags or validation gates for the experimental modules in the core and Stellar surfaces.
- P2: split the specialized analytics, risk, oracle, and operations modules into the proposed packages.
- P3: add route-level tests and ownership docs for the auth, developer, and admin API boundaries.

## Verification notes

- Router registration was inspected in [src/index.ts](../src/index.ts), [src/api/router.ts](../src/api/router.ts), [src/api/developer/router.ts](../src/api/developer/router.ts), [src/api/stellar/index.ts](../src/api/stellar/index.ts), and [src/api/admin.ts](../src/api/admin.ts).
- The inventory was reconciled against the actual TypeScript file set under [src/api](../src/api).
- Recommendation coverage was validated across 123 unique primary modules: 0 duplicates and 0 missing modules.
- The document intentionally avoids changing application code and stays limited to this status inventory.