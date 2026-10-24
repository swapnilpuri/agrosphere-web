# Milestone 2 completion report

Date: October 24, 2026 (America/Chicago). Web release: 0.2.0. Work is confined to agrosphere-web; backend source, API contracts in owning repositories, data ownership, and independent deployment remain intact. No Git commit/push, remote repository creation, cloud resource or Milestone 3 implementation was performed.

## A. Implementation summary

Implemented a standalone Angular enterprise shell with responsive/collapsible navigation, breadcrumbs, estate name/code search and canonical selection, authenticated user/logout controls, empty/loading/error/retry states and keyboard-accessible forms.

The dashboard aggregates every accessible Estate page, division and block, showing estate/division/block totals, planted hectares, planted/tappable trees and active/inactive counts with a lazy ECharts chart. It uses existing metadata only.

The digital twin combines an estate explorer, division navigation, block code/name search, a reusable Cesium globe, selectable/highlighted polygons, camera fly-to/reset, 2D/3D navigation, category legends/visibility and independent source-layer controls. The details panel separates business metadata from Spatial geometry hectares/version/provenance. Duplicate display names do not affect canonical UUID joins.

Key components: ShellComponent, DashboardComponent, DigitalTwinComponent, CesiumViewerComponent, CesiumViewerService, BlockDetailComponent, LayerManagerComponent, LoginComponent, EstateStore, EstateApi and SpatialApi.

Decisions follow the existing architecture: direct Cesium integration, local Signals plus RxJS cancellation, generated OpenAPI types and small adapters, shell-scoped data, runtime public configuration, no NgRx/BFF/backend coupling.

## B. API integration

Business requests use the existing Gateway, normally http://localhost:8080, preserving /api/v1:

- Estate GET /estates; /estates/{estateId}/divisions; /estates/{estateId}/blocks; /blocks/{id}.
- Spatial GET /spatial/estates/{estateId}/features; /layers; /assets.
- Typed adapters also expose current block geometry and POST point query; the viewer reuses loaded geometry to avoid redundant selection requests.

Collection adapters fetch every page with size=100 using actual page/size/totalElements responses. Estate 0.2.0 and Spatial 0.3.0 OpenAPI snapshots match both the published contracts and inspected infrastructure snapshots. Generated types are checked for drift without sibling build dependencies.

Discrepancies are documented in INTEGRATION.md: service server URLs versus public Gateway, AGRONOMIST role mismatch, Spatial reference types, inactive geometry filtering, lack of current effective-time fields, absent Estate provenance, source-layer metadata limits and inferred division lifecycle. No service was modified to fit a frontend assumption.

## C. GIS and 3D

Default terrain is the offline ellipsoid; imagery defaults to none. Runtime configuration supports custom imagery templates, custom terrain, optional scoped public ion tokens/world terrain and explicit attribution. Cesium attribution remains visible. Provider failures fall back to ellipsoid/no imagery; unavailable WebGL retains searchable metadata and details.

Authoritative Polygon/MultiPolygon/Point/LineString geometry stays in WGS84 longitude/latitude order. Supplied bounding boxes drive camera navigation; supplied GIS hectares are never recomputed from planar degrees. GeometryCollection is outside the actual contract. Only ACTIVE geometry renders; IDs, geometryVersion, timestamps and provenance remain intact.

Positioned road/facility/sensor/other asset markers are categorized independently. TREE_MODEL assets are excluded; no per-tree entity forest or surveyed-tree claim is introduced. Allowlisted HTTPS GeoJSON and 3D Tiles catalog sources have independent visibility. Other catalog formats remain metadata.

Viewer instances and event handlers are destroyed on teardown. Async generation checks discard stale loads. requestRenderMode limits idle work; source/visibility/selection changes retain the viewer instance. Business picking is restricted to the authoritative block data source.

## D. Authentication

The existing agrosphere realm / agrosphere-web public client uses Authorization Code with PKCE S256, openid + agrosphere-api scopes, and issuer-administered roles/estate_ids. Tokens stay in adapter memory and renew before Gateway calls/on expiration. Direct login initializes the adapter; logout retains its ID-token end-session hint until redirect.

Only configured Gateway business routes receive tokens. A 401 clears the session and returns to login; 403 explains denial. Workspace roles are PLATFORM_ADMIN, ESTATE_ADMIN, ESTATE_MANAGER or VIEWER. AGRONOMIST alone cannot read Estate metadata under the current backend policy. Backend/Gateway authorization remains authoritative.

## E. Testing and evidence

Executed locally:

| Check                                            | Result                                                         |
| ------------------------------------------------ | -------------------------------------------------------------- |
| npm dependency installation and lockfile         | Passed; Docker npm ci also passed                              |
| npm run lint                                     | Passed                                                         |
| npm run format:check                             | Passed                                                         |
| npm run typecheck                                | Passed                                                         |
| npm run api:check                                | Passed                                                         |
| npm test                                         | 31 tests passed in 12 files                                    |
| npm run build                                    | Passed; upstream Cesium CommonJS optimization warnings remain  |
| npm run e2e                                      | 2 deterministic UI tests passed                                |
| npm run e2e:graphics                             | Software-WebGL graphics workflow passed                        |
| npm run e2e:live                                 | Real Keycloak/Gateway seeded-estate workflow passed            |
| docker build -t agrosphere-web:0.2.0 .           | Passed                                                         |
| Container nginx -t, SPA route, headers, /healthz | Passed                                                         |
| npm audit                                        | Zero reported vulnerabilities after compatible tooling patches |
| git diff --check                                 | Passed                                                         |

Tests cover paginated API paths, errors, UUID joins, duplicate-name search, aggregate accuracy, selectors, layer state, stale estate cancellation, route guard, auth initialization/renewal/logout, token destination boundaries, dashboard and details, and viewer lifecycle. The graphics suite exercises Polygon + MultiPolygon ingestion, actual canvas picking, canonical block details, 2D/3D controls and route teardown/remount. Live validation also verifies an actual canvas pick from the ten-block seeded estate. The non-WebGL suite verifies metadata remains usable.

Live browser validation used existing private development credentials in environment variables and the previous SIMULATED integration estate. It authenticated against real Keycloak, selected the canonical estate, retrieved real Gateway block metadata, rendered supplied estate geometry, searched/navigated, toggled a layer and logged out. Live traces are disabled. No credential or token was committed or printed.

Early validation found and fixed Cesium API typing issues, a missing Keycloak logout ID-token hint, direct-login adapter initialization, incomplete synthetic identity-provider browser/CORS handling, block-scale camera placement, overlapping parent-boundary picks and shared highlight materials. The final live test clears the details panel, picks a real polygon on the canvas, and verifies that its canonical block metadata is retrieved again. Browser suites run sequentially to avoid shared port/artifact interference. Synthetic fixtures disable Chromium's loopback access check; this is test configuration only.

A fixture viewer navigation/remount observation was approximately 3.8–6.4 seconds in earlier software-rendered runs; this is not a reference-device initial-load/FPS benchmark. No 30 FPS or 10-second production target is claimed.

## F. Exact PowerShell execution

Existing backend integration environment:

```powershell
Set-Location C:\Projects\agrosphere\agrosphere-infrastructure
docker compose --profile apps up -d --wait --wait-timeout 240
```

New backend setup additionally requires the infrastructure README's init_local.py, configure_identity.py and dev_identity.py steps. Create seeded SIMULATED data with its smoke_platform.py when needed. Existing populated volumes must be preserved.

Frontend:

```powershell
Set-Location C:\Projects\agrosphere\agrosphere-web
npm.cmd ci
npm.cmd start
```

Build and automated checks:

```powershell
npm.cmd run lint
npm.cmd run format:check
npm.cmd run typecheck
npm.cmd run api:check
npm.cmd test
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run e2e
npm.cmd run e2e:graphics
# Set private E2E_USERNAME/E2E_PASSWORD and optional E2E_ESTATE_ID/E2E_BLOCK_CODE:
npm.cmd run e2e:live
docker build -t agrosphere-web:0.2.0 .
docker run --rm -p 127.0.0.1:4200:8080 agrosphere-web:0.2.0
```

The existing backend stack was started and remains running. Temporary frontend container validation was stopped. Run npm.cmd start to open the local development application.

## Acceptance limits

Functional Definition of Done items 1–17 were exercised through builds, tests, live browser integration and Docker validation. The broader milestone performance exit gate remains incomplete: reference-hardware smoothness/30 FPS and repeatable initial useful estate view timing have not been measured. This report does not declare that performance gate complete.

Optional licensed online imagery/world terrain, external 3D Tiles/GeoJSON hosts and sensor positions were not live-validated against deployment providers. Raster catalog rendering, editable/history-selected geometry, dark theme and operational/IoT/AI layers are outside this implementation. There is no authoritative per-layer membership API or surveyed tree dataset to invent.

CI is implemented but has not been executed on GitHub because code was not pushed. Independent backend integration was exercised; the entire backend fault/recovery suite was not rerun because no backend implementation changed.

## G. Milestone 3 recommendation

1. Define independently versioned Operations contracts for tapping rounds, collections/weights/DRC, incidents and block eligibility, with explicit units, audit history and estate authorization. Implement and test them in Operations before adding web workflows.
2. Define authenticated MQTT telemetry ingestion in Telemetry with device identity, observation timestamps, deduplication/replay and SIMULATED provenance. Keep browser access behind Gateway APIs; never expose broker credentials.
3. Build Analytics-owned projections from versioned domain/telemetry events, with reconciled units, freshness indicators and reproducible derived KPI tests.
4. Add Operations forms and timestamped telemetry/analytics overlays to the existing feature/layer registry, with scoped live integration fixtures, measured performance and failure/recovery tests.

Stop here at Milestone 2; these are recommendations only.
