# Frontend architecture

The routed root loads a login screen or guarded shell. ShellComponent owns EstateStore, so estate and selection data are destroyed when the authenticated shell is torn down. Core contains runtime configuration, Keycloak state, route guards, HTTP interception and safe error messages. EstateApi and SpatialApi use generated contract DTOs behind ApiClient.

Features own dashboard, estate navigation, blocks, spatial controls and digital twin composition. The dashboard reads every accessible page and aggregates only supplied Estate metadata. Totals include inactive blocks and remain distinct from GIS-calculated areas. EstateStore uses signals for UI state and switchMap for obsolete estate/detail request cancellation. It clears selection before switching estates and resolves block detail through the canonical UUID route. Duplicate names never serve as keys. No sensitive state or geometry is written to browser storage.

## Cesium boundary

CesiumViewerComponent initializes one viewer after its host exists and destroys handlers/viewer on teardown. CesiumViewerService owns providers, GeoJSON data sources, entity properties, category styles, picking and camera operations. HTTP and business aggregation are outside the rendering service.

Data sources load supplied Polygon, MultiPolygon, Point and LineString geometry without coordinate alteration. GeometryCollection is outside the inspected contract and is unsupported. Feature properties retain Spatial feature UUID, canonical referenceEntityId, referenceEntityType, estateId, geometryVersion and dataProvenance. Only ACTIVE geometry appears. The right panel joins the canonical business block and selected active geometry by referenceEntityId; GIS hectares are provided by Spatial's PostGIS geography calculation.

Estate and division polygons use translucent fills; blocks have higher opacity. Selected blocks use yellow; hover uses white. Layer checkboxes work without reinitializing the viewer. Mouse picks accept only canonical BLOCK properties; external catalog entities cannot masquerade as business blocks. Extents use supplied WGS84 boundingBox=[west,south,east,north]; camera supports estate reset, division navigation and block fly-to. No planar degree-based hectare computation exists.

Async generation checks prevent obsolete GeoJSON/provider results from modifying a destroyed or replaced viewer. Providers and Cesium operations run outside Angular's zone. requestRenderMode avoids idle render loops; no per-tree entities or fabricated trees are created. ECharts is lazy loaded and disposed with its ResizeObserver. The digital twin's large Cesium chunk is lazy loaded independently from the initial shell.

Catalog GeoJSON and 3D Tiles load only from configured exact HTTPS origins, without Gateway tokens. Each source has its own visibility state; categories control authoritative vector features and positioned asset markers separately. Disallowed sources and unsupported formats remain visible as catalog metadata. Model URIs and illustrative tree assets are not instantiated as models.

## Security and session state

Keycloak's supported browser adapter uses Authorization Code, PKCE S256, query callback response mode and memory-only tokens. A same-origin silent-SSO callback restores sessions where browser cookie policies permit it; explicit login works otherwise. The adapter's renewal is used before each Gateway API call and on token expiry. Logout retains the ID token long enough for the OIDC end-session hint, avoiding an unnecessary identity confirmation screen.

Only Gateway origin + configured base path + /api/v1/ receive bearer tokens and correlation IDs. Requests time out after 15 seconds. A 401 clears the session and returns to login; 403 remains an explicit permission error. Display roles are convenience checks; the Gateway and backends enforce signed roles and estate scope. No client secrets, password grant, authentication bypass, or browser token persistence is introduced.

## Testing

npm test runs Angular's Vitest runner with HttpTestingController and deterministic state/component fixtures. Playwright separates fixture UI, software-WebGL smoke, and live Keycloak/Gateway integration. No pixel-only acceptance criteria are used. Fixture screenshots are visual QA aids. Live traces are disabled; do not enable them with private credentials unless using an approved redaction process.

Use the documented scripts for reproducible validation. Production build emits upstream Cesium CommonJS optimization notices; these do not prevent compilation. No 30 FPS or sub-10-second reference-device claim is inferred from build success or software-rendered CI.
