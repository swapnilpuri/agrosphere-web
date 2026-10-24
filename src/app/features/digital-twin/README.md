# Digital twin feature

CesiumViewerComponent owns the Angular lifecycle; CesiumViewerService owns rendering, picking, providers and camera navigation. DigitalTwinComponent composes the explorer, layer controls and block details. See docs/ARCHITECTURE.md and docs/INTEGRATION.md for contracts and lifecycle rules. TREE_MODEL assets are intentionally excluded from entity rendering.
