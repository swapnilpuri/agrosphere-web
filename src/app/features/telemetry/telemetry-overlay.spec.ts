import { describe, it, expect, vi } from 'vitest';
import { Color, ColorMaterialProperty, Entity, GeoJsonDataSource, JulianDate } from 'cesium';
import { CesiumViewerService } from '../digital-twin/cesium-viewer.service';
describe('Selected-block environmental overlay', () => {
  it('uses authoritative bounds without an estate polygon instead of a delayed data-source flight', () => {
    const engine = new CesiumViewerService();
    const bounds = vi.spyOn(engine, 'bounds').mockImplementation(() => {});
    const viewer = { flyTo: vi.fn() };
    Object.assign(engine, {
      viewer,
      features: [
        {
          referenceEntityId: 'block-a',
          referenceEntityType: 'BLOCK',
          boundingBox: [80, 6, 80.02, 6.01],
        },
        {
          referenceEntityId: 'block-b',
          referenceEntityType: 'BLOCK',
          boundingBox: [81, 7, 81.02, 7.01],
        },
      ],
      sources: new Map([['BLOCK', new GeoJsonDataSource()]]),
    });
    engine.reset();
    expect(bounds).toHaveBeenCalledWith([80, 6, 80.02, 6.01]);
    expect(engine.fly('block-b')).toBe(true);
    expect(bounds).toHaveBeenLastCalledWith([81, 7, 81.02, 7.01]);
    expect(viewer.flyTo).not.toHaveBeenCalled();
  });
  it('changes only the selected fill, preserves its outline, restores styling and destroys cleanly', () => {
    const engine = new CesiumViewerService();
    const source = new GeoJsonDataSource();
    const selected = source.entities.add(
      new Entity({ id: 'geometry-a', properties: { referenceEntityId: 'block-a' }, polygon: {} }),
    );
    const other = source.entities.add(
      new Entity({ id: 'geometry-b', properties: { referenceEntityId: 'block-b' }, polygon: {} }),
    );
    const viewer = {
      isDestroyed: () => false,
      scene: { requestRender: vi.fn() },
      destroy: vi.fn(),
    };
    Object.assign(engine, { viewer, sources: new Map([['BLOCK', source]]) });
    const time = JulianDate.now();
    const fill = (entity: Entity) =>
      (entity.polygon!.material as ColorMaterialProperty).color!.getValue(time) as Color;
    engine.select('block-a');
    const before = Color.clone(fill(selected));
    const unchanged = Color.clone(fill(other));
    engine.setTelemetryOverlay('block-a', '#1e88e5');
    expect(Color.equals(fill(selected), Color.fromCssColorString('#1e88e5').withAlpha(0.75))).toBe(
      true,
    );
    expect(Color.equals(selected.polygon!.outlineColor!.getValue(time), Color.YELLOW)).toBe(true);
    expect(Color.equals(fill(other), unchanged)).toBe(true);
    engine.setTelemetryOverlay('block-a');
    expect(Color.equals(fill(selected), before)).toBe(true);
    engine.setTelemetryOverlay('block-a', '#1e88e5');
    engine.select('block-b');
    expect(Color.equals(fill(selected), Color.fromCssColorString('#1e88e5').withAlpha(0.75))).toBe(
      false,
    );
    engine.destroy();
    expect(viewer.destroy).toHaveBeenCalledOnce();
  });
});
