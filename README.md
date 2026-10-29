# AgroSphere web — Estate/GIS and plantation administration

Independent Angular 21 / TypeScript 5.9 / CesiumJS application, local candidate version 0.3.0 (unpublished). Estate business metadata and Spatial geometry are read exclusively through the API Gateway. No service database, messaging queue, backend source dependency, cloud deployment, or operations functionality is introduced.

## Windows PowerShell: run locally

Prerequisites: Node 24 (or 22.12+), npm, Docker Desktop with Linux containers, and the existing independently maintained backend integration environment.

Start the backend from its own repository. Initialize credentials only on a new workstation; init_local.py refuses to overwrite an existing .env. Identity scripts are only needed when provisioning or updating the local realm. Do not delete populated volumes.

```powershell
Set-Location C:\Projects\agrosphere\agrosphere-infrastructure
# First setup only:
python scripts/init_local.py
python -m pip install -r requirements-test.txt
python scripts/validate.py
docker compose --profile apps up -d --build --wait --wait-timeout 240
python scripts/configure_identity.py
python scripts/dev_identity.py
# Create SIMULATED test records when needed (preserves records):
python scripts/smoke_platform.py
```

For an already provisioned stack, use docker compose --profile apps up -d --wait --wait-timeout 240. Follow the infrastructure README for credential rotation, released images, and troubleshooting. Private development credentials are in its ignored local-secrets/dev-users.json; never paste them into frontend configuration.

```powershell
Set-Location C:\Projects\agrosphere\agrosphere-web
npm.cmd ci
npm.cmd start
```

Open http://localhost:4200. Sign in through Keycloak at http://localhost:8180 using an assigned development account. A VIEWER/ESTATE_MANAGER/ESTATE_ADMIN needs administrator-assigned estate_ids; PLATFORM_ADMIN has global access. An AGRONOMIST-only user has no Estate Service access and receives an explanatory screen.

## Build and check

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
npm.cmd run preview
```

Browser tests start a preview server automatically and require a production build first. Run suites sequentially because they share port 4200. UI tests mock the identity protocol and Gateway responses; they do not prove backend authentication. Graphics tests use Chromium software WebGL and assert data ingestion, selection, layer interaction, teardown and absence of runtime errors. Live tests use the actual integration environment, not fixtures.

```powershell
# Supply these privately in the shell; values are never committed:
$env:E2E_USERNAME = 'YOUR_ASSIGNED_USERNAME'
$env:E2E_PASSWORD = 'YOUR_PRIVATE_PASSWORD'
# Optional canonical estate UUID and block code:
$env:E2E_ESTATE_ID = 'YOUR_ESTATE_UUID'
$env:E2E_BLOCK_CODE = 'YOUR_SEEDED_BLOCK_CODE'
npm.cmd run e2e:live
Remove-Item Env:E2E_PASSWORD
```

Live traces are disabled to avoid storing credentials or tokens. Reports and fixture traces are ignored. Missing live credentials cause an explicit skip. Run the infrastructure acceptance suite separately for backend failure/recovery checks; web CI does not rebuild backend services.

## Runtime configuration

Edit public/config.json for development. The same JSON is loaded before Angular bootstrap, without caching; mount a deployment-specific config.json into the Docker image to configure it without rebuilding. It contains public browser configuration only.

```json
{
  "apiBaseUrl": "http://localhost:8080",
  "keycloak": {
    "url": "http://localhost:8180",
    "realm": "agrosphere",
    "clientId": "agrosphere-web"
  },
  "cesium": {
    "worldTerrain": false,
    "ionToken": "",
    "imageryUrl": "",
    "terrainUrl": "",
    "attribution": "",
    "allowedLayerOrigins": []
  }
}
```

Use an empty apiBaseUrl for same-origin Gateway routes; an upstream reverse proxy must route /api to the Gateway. The frontend Nginx serves static files only. The optional development proxy is used with npm.cmd start -- --proxy-config proxy.conf.json and an empty apiBaseUrl. Browser code never uses container-only service addresses. The legacy src/environments files remain for scaffold compatibility; runtime config is authoritative.

Default: offline ellipsoid, no imagery, no token, no provider requests. Configure imageryUrl with an HTTPS URL template and explicit attribution, terrainUrl with a Cesium terrain endpoint, or worldTerrain=true plus a scoped public ionToken. Browser-visible ion tokens are public; restrict assets/origins and quotas. Provider licensing, commercial use rights, and attribution must be reviewed by the operator. Cesium's credit display remains visible. Custom provider failures return to ellipsoid/no imagery; unavailable WebGL retains searchable business details.

The offline map still displays supplied estate/division/block polygons. The spatial-feature count is the number of loaded records, not proof that the selected block or division has its own boundary. Choose an estate with imported geometry, enable its layer categories and use Reset view. Some local integration estates contain only one block polygon or no geometry; a complete demo contains estate/division boundaries and ten block polygons. No satellite imagery or surveyed tree models are supplied by those fixtures. A delayed geometry response now reapplies the current selection after loading, so an earlier missing-geometry warning does not remain after the boundary becomes available.

HTTPS source layers load only from exact origins listed in allowedLayerOrigins. GeoJSON and 3D Tiles are supported; other formats remain catalog metadata. No application bearer token is sent to layer/imagery/terrain hosts. Configure public access or a separately designed provider authentication scheme. No remote model URI is executed: positioned twin assets appear as category markers, including roads, facilities and sensors.

## Production container

```powershell
npm.cmd run build
docker build -t agrosphere-web:0.2.0 .
# Port 4200 matches the existing local Keycloak redirect and Gateway CORS configuration:
docker run --rm --name agrosphere-web -p 127.0.0.1:4200:8080 agrosphere-web:0.2.0
# Optionally mount an operator-maintained public configuration:
# docker run --rm -p 127.0.0.1:4200:8080 --mount "type=bind,source=C:\private-config\web-config.json,target=/usr/share/nginx/html/config.json,readonly" agrosphere-web:0.2.0
```

The unprivileged Nginx container listens on 8080, provides SPA fallback and /healthz, and includes a Docker health check. Security headers cover framing, content sniffing, referrer and permissions policies plus a CSP compatible with Cesium workers. Before non-local use, supply HTTPS at the edge, exact Keycloak redirect/web origins, exact Gateway CORS origins, and an environment-specific CSP with approved identity/provider hosts. Enable HSTS at the HTTPS edge. Nginx health proves static hosting, not Gateway or identity readiness.

## Implementation and evidence

See [component architecture and Cesium notes](docs/ARCHITECTURE.md), [API/auth integration and discrepancies](docs/INTEGRATION.md), and [Milestone 2 completion report](docs/MILESTONE_2_REPORT.md). API snapshots are pinned independently under contracts/; regenerate types with npm.cmd run api:generate. No sibling repository is needed for npm ci, tests, build, or Docker.

Current limits: no geometry editing/history selector, imagery raster catalog adapter, external provider credentials, surveyed tree instances, dark theme, operations, IoT streams, or predictions. A full reference-device FPS/load benchmark and licensed online provider validation remain required before claiming those acceptance targets.

License remains reserved pending the existing project license decision; see LICENSE.md.

## Estate and field administration

Open /administration using the **Estate administration** navigation link. Platform administrators can create estates; estate administrators/managers can edit assigned estates and create/edit divisions and rubber fields. Viewers have read-only access. Backend JWT/scope checks remain authoritative. Forms preserve observed versions on edits and retain entries when a save conflicts; refresh/reopen rather than silently overwriting newer data. Status changes use existing edit APIs; no delete action is added.

[Administration/onboarding guide](docs/ESTATE_ADMINISTRATION.md) covers required records and boundary mapping. A blank, header-only worksheet is available at /onboarding/plantation-data-worksheet.csv. Gabon (GA, Africa/Libreville) and Malawi (MW, Africa/Blantyre) are suggested examples; other country/timezone inputs are supported. No real plantation name, location, area or tree count has been supplied, so no real records are prepopulated. Unknown optional values remain blank/null; required field counts/areas must be gathered rather than guessed.

Boundary import accepts owner-supplied WGS84 GeoJSON polygons (1–100 features, up to 1 MiB), previews coordinates and canonical record mapping, and requires an explicit provenance choice. Existing geometry is excluded from this add-only workflow. Server-side geometry validation and import job results remain authoritative. A failed atomic import retains the preview and displays its validation report. Pending jobs cannot be resubmitted and have a status-check action. This does not add workers, attendance, Operations screens, new service endpoints or real survey data.
