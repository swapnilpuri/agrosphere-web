# Repository instructions

This independent Git repository implements Milestone 2: Angular/CesiumJS browser digital twin. Preserve independent build, release, CI and Docker deployment. Do not create a parent repository, submodule, sibling runtime dependency, backend/BFF, shared persistence model, cloud deployment or new service endpoint.

Business HTTP calls go exclusively through the configured Gateway /api/v1 routes. Types are generated from pinned OpenAPI snapshots under contracts/. Preserve canonical UUIDs and Spatial geometry/version/provenance. WGS84 GeoJSON coordinates are longitude/latitude; use Spatial-provided hectares, never planar degree area. Procedural trees would be illustrative; none are rendered here. No operations, telemetry streams, analytics projections or AI features are authorized.

Use feature-oriented standalone Angular components, Signals for local state, RxJS cancellation, Keycloak public Code/PKCE auth, and a dedicated Cesium lifecycle abstraction. Tokens remain in memory and must only attach to Gateway business routes. Do not log credentials or tokens. Keep private runtime config, traces with live credentials, large assets and local environment files out of Git. No remote creation or push is authorized.

Run npm.cmd ci, npm.cmd run lint, npm.cmd run format:check, npm.cmd run typecheck, npm.cmd run api:check, npm.cmd test, npm.cmd run build, npm.cmd run e2e and npm.cmd run e2e:graphics. Run browser suites sequentially. Live E2E needs the independently maintained infrastructure and private environment credentials; traces are disabled. Verify Docker packaging when the engine is available. Report executed, failed and unavailable checks honestly; never infer reference-device FPS from software WebGL smoke results.

Version independently using SemVer/CHANGELOG.md. Coordinate contract changes with owning repositories; do not modify services to accommodate frontend assumptions.

## Owner-authorized estate administration - 2026-10-28

The owner requested estate/field administration screens and real plantation onboarding. Implement creation/editing of estates, divisions and rubber blocks plus previewed GeoJSON boundary import through existing pinned Gateway contracts and existing server authorization. Preserve current UI, private runtime configuration and unrelated staged work. Real plantation names/counts/boundaries must come from the owner; never invent or relabel simulated data as real. Workers/attendance, new backend endpoints, contract changes, production/AEO and remote Git actions remain outside this increment.

## Owner-authorized WA-1 — 2026-10-29

The owner accepted the worker/attendance design and executable Contracts 0.6.0 candidate, authorizing WA-T01–T09. This supersedes historical worker/Operations exclusions only for the minimal SIMULATED registry and daily roll call in docs/WORKFORCE.md. Use the independent Operations pin and narrow workforce permissions. Preserve original config/index and existing features. D08 workload/rollout and D09 privacy/retention remain gates. No REAL worker data, commit/push/publish, production/destructive migration, existing-stack/private-environment or AEO change is authorized.
