# API and authentication integration

Reviewed before implementation: web AGENTS/README/source/dependencies; architecture ADR-0001 through ADR-0011, milestone roadmap; contracts OpenAPI Estate 0.2.0 and Spatial 0.3.0; Estate controller/README; Spatial controller/persistence/README and synthetic plantation GeoJSON; Gateway routes; infrastructure startup, realm client and previous smoke result IDs.

Snapshots under contracts/ match the inspected infrastructure response contracts, which match the published JSON-form OpenAPI YAML definitions. Generated clients are compile-time schema aliases plus small typed HttpClient adapters, not handwritten copies of DTO fields. Regeneration has no sibling source dependency.

## Routes

All business routes below use the configured Gateway base URL, preserving /api/v1. Lists use size=100 and request every page using response page/size/totalElements.

| Service | Gateway endpoint                                | Use                                                    |
| ------- | ----------------------------------------------- | ------------------------------------------------------ |
| Estate  | GET /api/v1/estates                             | Accessible estates, estate search, dashboard           |
| Estate  | GET /api/v1/estates/{estateId}/divisions        | Division explorer and totals                           |
| Estate  | GET /api/v1/estates/{estateId}/blocks           | Block search and totals                                |
| Estate  | GET /api/v1/blocks/{id}                         | Selected canonical block metadata                      |
| Spatial | GET /api/v1/spatial/estates/{estateId}/features | Geometry, bounds, source, version, calculated hectares |
| Spatial | GET /api/v1/spatial/estates/{estateId}/layers   | Source layer catalog                                   |
| Spatial | GET /api/v1/spatial/estates/{estateId}/assets   | Positioned twin asset markers                          |
| Spatial | GET /api/v1/spatial/blocks/{blockId}/geometry   | Typed adapter available for current geometry           |
| Spatial | POST /api/v1/spatial/query/point                | Typed adapter available for explicit spatial lookup    |

Current geometry and point-query adapters are tested/exposed but the viewer uses its already-loaded authoritative features for selection and navigation, avoiding repeated queries. No operational KPI, clone detail or road collection endpoint is invented. The block DTO already contains rubberCloneCode.

## Verified discrepancies and constraints

- The web scaffold's AGENTS scope was Milestone 0; the explicit Milestone 2 request supersedes it, and web instructions now reflect this implementation.
- OpenAPI server URLs identify internal services (8081/8082). Browser clients intentionally use the Gateway (8080) with the same paths.
- Spatial referenceEntityType permits only ESTATE, DIVISION and BLOCK. Roads/facilities/sensors arrive as assetType metadata and optional positions, rather than fabricated ROAD feature references. Roads represented only by a point appear as markers, not invented line geometry.
- Spatial features include inactive/superseded records. Rendering explicitly filters ACTIVE records and preserves geometryVersion; it does not choose versions by array order.
- Spatial's Feature DTO has updatedAt/createdAt and geometryVersion, but no current validFrom/validTo fields. Historical effective ranges exist in the history response only. The UI does not invent effective times.
- Spatial layers carry sourceUri and format metadata; no per-layer feature membership route exists. Catalog controls operate on separate allowlisted external source objects; category controls operate on the authoritative estate features/assets.
- Estate DTOs have no dataProvenance field. The frontend does not label business metadata REAL without evidence. Spatial provenance is displayed from the response. Fixture data is explicitly SIMULATED.
- AGRONOMIST is authorized by Spatial but not Estate. The metadata-dependent web workspace requires PLATFORM_ADMIN, ESTATE_ADMIN, ESTATE_MANAGER or VIEWER. Supporting AGRONOMIST across both requires an owning-service security/contract decision.
- Parent division lifecycle remains inferred in Spatial from block events. Estate division metadata remains authoritative; no frontend correction or backend modification is introduced.
- No contract change is required. Provider credentials, licensed online sources, raster catalog adapters, and history selection are separate work, not invented backend capabilities.

Errors cover 400/401/403/404/409/429/500/503, network failures and timeouts with correlation references where supplied. Retries are explicit to avoid a 429 retry storm. Estate metadata can remain usable during a Spatial failure. Route changes and estate changes dispose/cancel obsolete work.

## Identity

Use the existing realm agrosphere and public client agrosphere-web. Redirect/web origin http://localhost:4200 matches the existing local integration realm. Code flow with S256 PKCE requests openid and agrosphere-api scopes; the realm supplies agrosphere-api, estate-service and spatial-service audiences plus issuer-managed roles/estate_ids. No realm or service changes are required. Production URLs, HTTPS, CORS and browser cookie behavior must be configured together.

References checked against [Keycloak JavaScript adapter](https://www.keycloak.org/securing-apps/javascript-adapter), [Cesium Viewer](https://cesium.com/learn/cesiumjs/ref-doc/Viewer.html) and [GeoJsonDataSource](https://cesium.com/learn/cesiumjs/ref-doc/GeoJsonDataSource.html).
