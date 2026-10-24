# agrosphere-web

Milestone 0 foundation for the AgroSphere Rubber Plantation Digital Twin.

This is an independent project and Git root. Version: 0.1.0; use independent SemVer tags and CHANGELOG.md. License decision: LICENSE.md (all rights reserved pending selection).

See AGENTS.md for scope and engineering rules. This scaffold provides no business APIs or production features. Architecture lives in the sibling agrosphere-architecture repository; versioned API/event definitions live in agrosphere-contracts. Do not add path dependencies to sibling projects.

## Build and test

Node 22.12+ or Node 24; Angular 21 LTS and TypeScript 5.9.3. Run npm ci, npm run build and npm test. npm start launches the foundation shell only. Environment replacements define API base URL; production expects a same-origin /api reverse proxy. JWT/OIDC client integration is deferred; never place client secrets in browser configuration.

CesiumJS and ECharts are pinned dependencies for Milestone 2, with no GIS viewer or charts implemented. Configure Cesium worker/assets, optional ion token, attribution and terrain licensing when the viewer is added. Features live under src/app/features; API transport belongs in core/api.
