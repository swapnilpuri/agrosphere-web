import { Injectable } from '@angular/core';
import {
  Viewer,
  GeoJsonDataSource,
  EllipsoidTerrainProvider,
  CesiumTerrainProvider,
  createWorldTerrainAsync,
  Ion,
  UrlTemplateImageryProvider,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Entity,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  Rectangle,
  JulianDate,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Cesium3DTileset,
} from 'cesium';
import { Asset, Category, Feature, Layer, assetCategory, colors } from '../../shared/models';
import { AppConfig } from '../../core/config';
@Injectable()
export class CesiumViewerService {
  private readonly external = new Map<string, GeoJsonDataSource | Cesium3DTileset>();
  private sourceVisible: ReadonlySet<string> = new Set();
  private config: AppConfig['cesium'] = {};
  private report: (message: string) => void = () => {};
  private onCameraBusy: (busy: boolean) => void = () => {};
  private cameraListeners: (() => void)[] = [];
  private viewer?: Viewer;
  private handler?: ScreenSpaceEventHandler;
  private sources = new Map<Category, GeoJsonDataSource>();
  private generation = 0;
  private readonly materials = new WeakMap<Entity, ColorMaterialProperty>();
  private readonly outlines = new WeakMap<Entity, ConstantProperty>();
  private selected = '';
  private hovered = '';
  private visible: ReadonlySet<Category> = new Set();
  private features: Feature[] = [];
  async initialize(
    container: HTMLElement,
    config: AppConfig['cesium'],
    select: (id: string) => void,
    status: (message: string) => void,
    cameraBusy: (busy: boolean) => void = () => {},
  ) {
    this.config = config;
    this.report = status;
    this.viewer = new Viewer(container, {
      baseLayer: false,
      terrainProvider: new EllipsoidTerrainProvider(),
      animation: false,
      timeline: false,
      geocoder: false,
      baseLayerPicker: false,
      infoBox: false,
      selectionIndicator: false,
      homeButton: false,
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
    });
    this.onCameraBusy = cameraBusy;
    const viewer = this.viewer;
    this.cameraListeners = [
      viewer.camera.moveStart.addEventListener(() => cameraBusy(true)),
      viewer.camera.moveEnd.addEventListener(() => cameraBusy(false)),
    ];
    viewer.scene.globe.baseColor = Color.fromCssColorString('#183d42');
    status('Offline ellipsoid · no imagery');
    this.handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    this.handler.setInputAction((event: { position: Cartesian2 }) => {
      for (const picked of viewer.scene.drillPick(event.position)) {
        if (
          picked?.id instanceof Entity &&
          this.sources.get('BLOCK')?.entities.contains(picked.id)
        ) {
          const p = picked.id.properties?.getValue(JulianDate.now());
          if (p?.referenceEntityType === 'BLOCK') {
            select(p.referenceEntityId);
            break;
          }
        }
      }
    }, ScreenSpaceEventType.LEFT_CLICK);
    this.handler.setInputAction((event: { endPosition: Cartesian2 }) => {
      const picked = viewer.scene.pick(event.endPosition);
      this.hovered =
        picked?.id instanceof Entity
          ? (picked.id.properties?.getValue(JulianDate.now())?.referenceEntityId ?? '')
          : '';
      this.paint();
    }, ScreenSpaceEventType.MOUSE_MOVE);
    if (config.ionToken) Ion.defaultAccessToken = config.ionToken;
    try {
      if (config.imageryUrl) {
        const provider = new UrlTemplateImageryProvider({
          url: config.imageryUrl,
          credit: config.attribution ?? '',
        });
        provider.errorEvent.addEventListener(() => {
          if (!viewer.isDestroyed()) {
            viewer.imageryLayers.removeAll();
            status('Imagery unavailable · ellipsoid fallback');
          }
        });
        viewer.imageryLayers.addImageryProvider(provider);
        status('Custom imagery · ellipsoid');
      }
      if (config.terrainUrl || (config.worldTerrain && config.ionToken)) {
        const terrain = config.terrainUrl
          ? await CesiumTerrainProvider.fromUrl(config.terrainUrl)
          : await createWorldTerrainAsync();
        if (viewer.isDestroyed()) return;
        viewer.terrainProvider = terrain;
        terrain.errorEvent.addEventListener(() => {
          if (!viewer.isDestroyed()) {
            viewer.terrainProvider = new EllipsoidTerrainProvider();
            status('Terrain unavailable · ellipsoid fallback');
          }
        });
        status('Configured terrain' + (config.imageryUrl ? ' + imagery' : ''));
      }
    } catch {
      if (!viewer.isDestroyed()) {
        viewer.terrainProvider = new EllipsoidTerrainProvider();
        status('Provider unavailable · ellipsoid fallback');
      }
    }
  }
  async load(features: Feature[], assets: Asset[], layers: Layer[]) {
    const viewer = this.viewer;
    if (!viewer || viewer.isDestroyed()) return;
    const generation = ++this.generation;
    this.features = features;
    viewer.dataSources.removeAll(true);
    for (const item of this.external.values())
      if (item instanceof Cesium3DTileset) viewer.scene.primitives.remove(item);
    this.external.clear();
    this.sources.clear();
    const groups = new Map<Category, object[]>();
    for (const f of features) {
      const list = groups.get(f.referenceEntityType) ?? [];
      list.push({
        type: 'Feature',
        id: f.id,
        geometry: f.geometry,
        bbox: f.boundingBox,
        properties: { ...f, geometry: undefined },
      });
      groups.set(f.referenceEntityType, list);
    }
    for (const a of assets) {
      if (!a.position || a.assetType === 'TREE_MODEL') continue;
      const category = assetCategory(a);
      const list = groups.get(category) ?? [];
      list.push({
        type: 'Feature',
        id: a.id,
        geometry: a.position,
        properties: {
          assetId: a.id,
          referenceEntityId: a.id,
          referenceEntityType: category,
          dataProvenance: a.dataProvenance,
        },
      });
      groups.set(category, list);
    }
    await Promise.all(
      [...groups].map(async ([category, items]) => {
        const color = Color.fromCssColorString(colors[category]);
        const source = await GeoJsonDataSource.load(
          { type: 'FeatureCollection', features: items },
          {
            stroke: color,
            fill: color.withAlpha(
              category === 'ESTATE' ? 0.06 : category === 'DIVISION' ? 0.1 : 0.4,
            ),
            strokeWidth: 2,
            markerColor: color,
            clampToGround: true,
          },
        );
        if (generation !== this.generation || viewer.isDestroyed()) {
          return;
        }
        this.sources.set(category, source);
        await viewer.dataSources.add(source);
        source.show = this.visible.has(category);
      }),
    );
    await Promise.all(
      layers.map(async (layer) => {
        if (!layer.sourceUri || !['GEOJSON', '3D_TILES'].includes(layer.format)) return;
        let url: URL;
        try {
          url = new URL(layer.sourceUri);
        } catch {
          return;
        }
        if (
          url.protocol !== 'https:' ||
          url.username ||
          url.password ||
          !(this.config.allowedLayerOrigins ?? []).includes(url.origin)
        )
          return;
        try {
          const item =
            layer.format === 'GEOJSON'
              ? await GeoJsonDataSource.load(url.href, { clampToGround: true })
              : await Cesium3DTileset.fromUrl(url.href);
          if (generation !== this.generation || viewer.isDestroyed()) {
            if (item instanceof Cesium3DTileset) item.destroy();
            return;
          }
          this.external.set(layer.id, item);
          item.show = this.sourceVisible.has(layer.id);
          if (item instanceof Cesium3DTileset) viewer.scene.primitives.add(item);
          else await viewer.dataSources.add(item);
        } catch {
          if (generation === this.generation && !viewer.isDestroyed())
            this.report('A catalog layer is unavailable · base geometry remains available');
        }
      }),
    );
    if (generation === this.generation && !viewer.isDestroyed()) {
      this.paint();
      this.reset();
      return features.length;
    }
  }
  setSourceVisible(ids: ReadonlySet<string>) {
    this.sourceVisible = ids;
    for (const [id, item] of this.external) item.show = ids.has(id);
    this.viewer?.scene.requestRender();
  }
  setVisible(visible: ReadonlySet<Category>) {
    this.visible = visible;
    for (const [category, source] of this.sources) source.show = visible.has(category);
    this.viewer?.scene.requestRender();
  }
  select(id: string) {
    this.selected = id;
    this.paint();
  }
  private paint() {
    const viewer = this.viewer;
    if (!viewer || viewer.isDestroyed()) return;
    for (const [category, source] of this.sources)
      for (const entity of source.entities.values) {
        const id = entity.properties?.getValue(JulianDate.now())?.referenceEntityId;
        const selected = id === this.selected;
        const hover = id === this.hovered;
        const color = selected
          ? Color.YELLOW
          : hover
            ? Color.WHITE
            : Color.fromCssColorString(colors[category]);
        const nextColor = color.withAlpha(
          entity.polygon
            ? selected
              ? 0.75
              : hover
                ? 0.55
                : category === 'ESTATE'
                  ? 0.06
                  : category === 'DIVISION'
                    ? 0.1
                    : 0.4
            : 1,
        );
        let material = this.materials.get(entity);
        if (!material) {
          material = new ColorMaterialProperty(nextColor);
          this.materials.set(entity, material);
          if (entity.polygon) entity.polygon.material = material;
          if (entity.polyline) entity.polyline.material = material;
        } else if (material.color instanceof ConstantProperty) material.color.setValue(nextColor);
        if (entity.polygon) {
          const z = category === 'BLOCK' ? 2 : category === 'DIVISION' ? 1 : 0;
          if (entity.polygon.zIndex instanceof ConstantProperty) entity.polygon.zIndex.setValue(z);
          else entity.polygon.zIndex = new ConstantProperty(z);
          let outline = this.outlines.get(entity);
          if (!outline) {
            outline = new ConstantProperty(color);
            this.outlines.set(entity, outline);
            entity.polygon.outlineColor = outline;
          } else outline.setValue(color);
        }
      }
    viewer.scene.requestRender();
  }
  fly(id: string) {
    const feature = this.features.find((f) => f.referenceEntityId === id);
    if (!feature) return false;
    this.bounds(feature.boundingBox);
    return true;
  }
  bounds(bbox: number[]) {
    const viewer = this.viewer;
    if (!viewer || viewer.isDestroyed() || bbox.length !== 4 || !bbox.every(Number.isFinite))
      return;
    const destination = viewer.camera.getRectangleCameraCoordinates(
      Rectangle.fromDegrees(bbox[0], bbox[1], bbox[2], bbox[3]),
    );
    if (!destination) return;
    const position = Cartographic.fromCartesian(destination);
    position.height = Math.max(
      position.height,
      (viewer.scene.globe.getHeight(position) ?? 0) + 500,
    );
    this.onCameraBusy(true);
    viewer.camera.flyTo({
      destination: Cartesian3.fromRadians(position.longitude, position.latitude, position.height),
      orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
      duration: 1.1,
      complete: () => this.onCameraBusy(false),
      cancel: () => this.onCameraBusy(false),
    });
  }
  reset() {
    const estate = this.features.find((f) => f.referenceEntityType === 'ESTATE');
    if (estate) this.fly(estate.referenceEntityId);
    else if (this.viewer && this.sources.size)
      void this.viewer.flyTo([...this.sources.values()][0]);
  }
  mode(mode: '2D' | '3D') {
    if (mode === '2D') this.viewer?.scene.morphTo2D(0.5);
    else this.viewer?.scene.morphTo3D(0.5);
  }
  coordinates() {
    const position = this.viewer?.camera.positionCartographic;
    return position
      ? {
          longitude: (position.longitude * 180) / Math.PI,
          latitude: (position.latitude * 180) / Math.PI,
          height: position.height,
        }
      : null;
  }
  destroy() {
    ++this.generation;
    for (const remove of this.cameraListeners) remove();
    this.cameraListeners = [];
    this.handler?.destroy();
    if (this.viewer && !this.viewer.isDestroyed()) this.viewer.destroy();
    this.viewer = undefined;
    this.sources.clear();
  }
}
