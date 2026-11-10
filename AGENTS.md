# Repository instructions

## Owner-approved II-1 — 2026-10-31

The owner accepted II-D01–10/II-T01–09 and the eleven exact executable artifacts for independent local Contracts 0.7.0 release and Operations/Web pinning. See Architecture INCIDENT_INSPECTION_CONTRACT_APPROVAL.md. Implement the scoped SIMULATED inspections/incidents screens through pinned Gateway contracts, preserving current features/config/index. Existing historical feature exclusions are superseded only for II-1. II-D07/08 and WA D08/D09 remain open; REAL collection, live-stack/realm/private-environment, role/credential, production/destructive migration, Git publication and AEO actions remain excluded.

This independent Git repository implements Milestone 2: Angular/CesiumJS browser digital twin. Preserve independent build, release, CI and Docker deployment. Do not create a parent repository, submodule, sibling runtime dependency, backend/BFF, shared persistence model, cloud deployment or new service endpoint.

Business HTTP calls go exclusively through the configured Gateway /api/v1 routes. Types are generated from pinned OpenAPI snapshots under contracts/. Preserve canonical UUIDs and Spatial geometry/version/provenance. WGS84 GeoJSON coordinates are longitude/latitude; use Spatial-provided hectares, never planar degree area. Procedural trees would be illustrative; none are rendered here. No operations, telemetry streams, analytics projections or AI features are authorized.

Use feature-oriented standalone Angular components, Signals for local state, RxJS cancellation, Keycloak public Code/PKCE auth, and a dedicated Cesium lifecycle abstraction. Tokens remain in memory and must only attach to Gateway business routes. Do not log credentials or tokens. Keep private runtime config, traces with live credentials, large assets and local environment files out of Git. No remote creation or push is authorized.

Run npm.cmd ci, npm.cmd run lint, npm.cmd run format:check, npm.cmd run typecheck, npm.cmd run api:check, npm.cmd test, npm.cmd run build, npm.cmd run e2e and npm.cmd run e2e:graphics. Run browser suites sequentially. Live E2E needs the independently maintained infrastructure and private environment credentials; traces are disabled. Verify Docker packaging when the engine is available. Report executed, failed and unavailable checks honestly; never infer reference-device FPS from software WebGL smoke results.

Version independently using SemVer/CHANGELOG.md. Coordinate contract changes with owning repositories; do not modify services to accommodate frontend assumptions.

## Owner-authorized estate administration - 2026-10-28

The owner requested estate/field administration screens and real plantation onboarding. Implement creation/editing of estates, divisions and rubber blocks plus previewed GeoJSON boundary import through existing pinned Gateway contracts and existing server authorization. Preserve current UI, private runtime configuration and unrelated staged work. Real plantation names/counts/boundaries must come from the owner; never invent or relabel simulated data as real. Workers/attendance, new backend endpoints, contract changes, production/AEO and remote Git actions remain outside this increment.

## Owner-authorized WA-1 — 2026-10-29

The owner accepted the worker/attendance design and executable Contracts 0.6.0 candidate, authorizing WA-T01–T09. This supersedes historical worker/Operations exclusions only for the minimal SIMULATED registry and daily roll call in docs/WORKFORCE.md. Use the independent Operations pin and narrow workforce permissions. Preserve original config/index and existing features. D08 workload/rollout and D09 privacy/retention remain gates. No REAL worker data, commit/push/publish, production/destructive migration, existing-stack/private-environment or AEO change is authorized.

## AN-1 exact executable accepted — 2026-10-31

Architecture ALERTS_NOTIFICATIONS_CONTRACT_APPROVAL.md records owner acceptance of the exact four artifacts, local Contracts 0.8.0 release and Operations/Web pins. Continue accepted AN-T03–09 by dependency; preserve prior features/artifacts and reviewed bytes. Generated-only verification; AN-D07/08 and WA/II/M2 gates remain open. No non-generated account rollout, REAL, existing-stack/private configuration/role/credential/external delivery/Git/deployment/destructive/data-reset/AEO action. Gateway adds only /api/v1/alerts/**; Infrastructure generated-only drills reuse existing topology without a new alert queue.

## AN-1 local verification state — 2026-10-31

Architecture ALERTS_NOTIFICATIONS_VERIFICATION.md records local implementation and generated-only checks after exact executable acceptance. Earlier preparation labels are historical. Preserve 0.8.0 pins/old bytes/V1–V5/Web config/index and existing data/volumes. Default-disabled subject-policy gate, AN-D07/08, WA/II/M2 and no non-generated rollout/REAL/live-stack/private configuration/role/credential/Git/deployment/AEO exclusions remain.

## Owner-approved AN privacy extension — 2026-10-31

Architecture ALERTS_PRIVACY_APPROVAL.md records exact five-artifact privacy candidate acceptance (manifest ea6402a205d1da7a0801090b0acabac58ae164ba6544b474d709d8a4a608286b), local independent Contracts 0.9.0 release/archive/pins and generated-only AP-T02–07 implementation. Preserve accepted bytes, V1–V6, old events/records and all staged work/Web config. Additive privacy storage and narrowly scoped maintenance may be tested only in separately owned disposable generated databases. No existing-stack/private configuration/actual-account/REAL/existing role or credential/destructive migration/historical conversion/external delivery/Git publication/deployment/AEO action. AP-T08 local-stack execution remains separately gated; do not repeat II-1. Prior approval/pending labels remain historical within their scope; do not ask again for this exact acceptance.

## Owner-approved TLM-02 — 2026-11-04

Architecture MQTT_POC_OVERLAY_APPROVAL.md accepts exact review 0d8a67aef15b295dbca267adad300ab0c94c2c88ec37cbff0c6a69c1ff7a49c9. Implement bounded deterministic SIMULATED fixture publisher and read-only selected-block Web detail/freshness overlay using unchanged Contracts 0.10.0 pin. Generated-only disposable verification, no new schema/role, no repeated executable approval. Preserve existing UI/config/index/data and all original gates; no existing-stack/private config/REAL/production/Git/deployment/AEO action.

## ANL-01 bounded runtime continuation — 2026-11-05

Owner instructed "please resume" immediately after the bounded runtime/dashboard approval request. Architecture ANALYTICS_POC_ADAPTER_APPROVAL.md records that continuation authority for exact review 855fe1894c530cf7942d3175e7a3eae850d0b34abff976a5e6bf7ba87a5618f3: SIMULATED materialized Analytics, Analytics-only Gateway route, read-only Web dashboard and new owned disposable verification. Existing 0.11.0 contracts/pins unchanged; exact SQL/grant engineering review precedes new-fixture installation. No existing-stack/private config/data/roles/credentials, REAL, production/Git/deployment/AEO action. Preserve indexes/prior features and original owner/field/milestone gates.

## ANL-01 finite admission approved

Owner approved exact admission review SHA-256 5c9a6787f0ebf2ad0d3d172e5fc3ac2ebb9d83ea9936c3664331fa81fe8629f8. Architecture ANALYTICS_POC_ADMISSION_APPROVAL.md records finite generated profile, bounded parser/diagnostic/test changes and new owned disposable verification. Prior approvals satisfied; preserve exact contracts, migrations, indexes/private config/data and all owner/field/REAL/AEO/Git/deployment exclusions.

## ANL-02 bounded runtime approved — 2026-11-05

Architecture ANALYTICS_ENVIRONMENT_ADAPTER_APPROVAL.md records owner acceptance of exact runtime/SQL manifest afff8ff5a13e1167d53ab569f0ea28c5f003def01fab9318db455f291f537ea8. Implement SIMULATED environmental parser/immutable persistence/consumer/scoped API, read-only Web with independent 0.12.0 pin and new owned disposable verification; generated fixture credentials included. Exact SQL/grant engineering review before installation. No new producer/role or Gateway prefix widening. Preserve old artifacts/V1/V2/config/data/index and all original gates. No existing-stack/private config/account/role/credential, REAL, Git publication/deployment or AEO action. Historical pending labels are superseded only for this scope.
