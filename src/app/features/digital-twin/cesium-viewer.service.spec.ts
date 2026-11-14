import { describe, expect, it, vi } from 'vitest';
import {
  Camera,
  Cartesian3,
  Cartographic,
  Event as CesiumEvent,
  GeographicProjection,
  OrthographicOffCenterFrustum,
  SceneMode,
  Viewer,
} from 'cesium';
import { CesiumViewerService } from './cesium-viewer.service';
import { Feature } from '../../shared/models';

describe('Cesium field focus coordinates', () => {
  for (const mode of [SceneMode.COLUMBUS_VIEW, SceneMode.SCENE2D]) {
    it(`keeps projected field coordinates in scene mode ${mode}`, () => {
      const projection = new GeographicProjection();
      const scene = {
        mapProjection: projection,
        drawingBufferWidth: 1280,
        drawingBufferHeight: 720,
        globe: { getHeight: () => undefined },
        mode,
      };
      // Actual installed Cesium camera/projection; no browser or WebGL substitute claim.
      const camera = new Camera(
        scene as unknown as ConstructorParameters<typeof Camera>[0],
      ) as Camera & { update: (mode: SceneMode) => void };
      if (mode === SceneMode.SCENE2D)
        camera.frustum = new OrthographicOffCenterFrustum({
          left: -100000,
          right: 100000,
          bottom: -100000,
          top: 100000,
          near: 1,
          far: 500000000,
        }) as unknown as Camera['frustum'];
      camera.update(mode);
      const fly = vi.spyOn(camera, 'flyTo').mockImplementation(() => {});
      const service = new CesiumViewerService();
      (service as unknown as { viewer: Viewer }).viewer = {
        camera,
        scene,
        isDestroyed: () => false,
      } as unknown as Viewer;
      service.bounds([35, -15, 35.02, -14.99]);
      const options = fly.mock.calls[0][0];
      const destination = options.destination;
      expect(destination).toHaveProperty('z');
      const point = destination as Cartesian3;
      const centre = Cartesian3.clone(point);
      if (mode === SceneMode.COLUMBUS_VIEW) {
        camera.setView({ destination: point, orientation: options.orientation, convert: false });
        expect(camera.pitch).toBeCloseTo(-Math.PI / 4, 10);
        const distance = -camera.position.z / camera.direction.z;
        Cartesian3.add(
          camera.position,
          Cartesian3.multiplyByScalar(camera.direction, distance, new Cartesian3()),
          centre,
        );
      } else {
        expect(options.orientation).toMatchObject({ pitch: -Math.PI / 2 });
      }
      const target = projection.unproject(centre);
      expect(target.longitude).toBeCloseTo((35.01 * Math.PI) / 180, 12);
      expect(target.latitude).toBeCloseTo((-14.995 * Math.PI) / 180, 12);
      expect(options.convert).toBe(false);
      expect(point.z).toBeGreaterThanOrEqual(500);
      expect(Number.isFinite(Cartographic.toCartesian(target).x)).toBe(true);
    });
  }

  it('replays only the latest explicit focus during a morph and leaves ordinary mode changes alone', () => {
    const canvas = document.createElement('canvas');
    const projection = new GeographicProjection();
    const scene = {
      canvas,
      mapProjection: projection,
      drawingBufferWidth: 1280,
      drawingBufferHeight: 720,
      globe: { getHeight: () => undefined },
      mode: SceneMode.COLUMBUS_VIEW as SceneMode,
      morphStart: new CesiumEvent(),
      morphComplete: new CesiumEvent(),
      requestRender: vi.fn(),
    };
    const camera = new Camera(
      scene as unknown as ConstructorParameters<typeof Camera>[0],
    ) as Camera & { update: (mode: SceneMode) => void };
    camera.update(scene.mode);
    const fly = vi.spyOn(camera, 'flyTo').mockImplementation(() => {});
    const cancel = vi.spyOn(camera, 'cancelFlight').mockImplementation(() => {});
    const viewer = {
      camera,
      scene,
      isDestroyed: () => false,
      destroy: vi.fn(),
    } as unknown as Viewer;
    const service = new CesiumViewerService();
    const lifecycle = service as unknown as {
      viewer: Viewer;
      observeCamera: (viewer: Viewer, busy: (busy: boolean) => void) => void;
    };
    lifecycle.viewer = viewer;
    lifecycle.observeCamera(viewer, () => {});
    (service as unknown as { features: Feature[] }).features = [
      { referenceEntityId: 'first', boundingBox: [35, -15, 35.02, -14.99] } as Feature,
      { referenceEntityId: 'latest', boundingBox: [36, -15, 36.02, -14.99] } as Feature,
    ];
    service.select('first');
    scene.morphStart.raiseEvent();
    expect(cancel).toHaveBeenCalledOnce();
    scene.mode = SceneMode.MORPHING;
    service.fly('first');
    service.select('latest');
    service.fly('latest');
    expect(fly).not.toHaveBeenCalled();
    scene.mode = SceneMode.COLUMBUS_VIEW;
    scene.morphComplete.raiseEvent();
    const target = projection.unproject(
      fly.mock.calls[0][0].destination as Parameters<typeof projection.unproject>[0],
    );
    expect(target.longitude).toBeCloseTo((36.01 * Math.PI) / 180, 12);
    fly.mockClear();
    // A selected field must not force the newly chosen 3D globe back into an
    // overhead close-up. Preserve the native pose and perspective frustum.
    scene.mode = SceneMode.SCENE3D;
    camera.update(scene.mode);
    const frustum = camera.frustum;
    const position = Cartesian3.clone(camera.position);
    scene.morphStart.raiseEvent();
    scene.morphComplete.raiseEvent();
    expect(fly).not.toHaveBeenCalled();
    expect(camera.frustum).toBe(frustum);
    expect(camera.position).toEqual(position);
    service.destroy();
    expect(scene.morphStart.numberOfListeners).toBe(0);
    expect(scene.morphComplete.numberOfListeners).toBe(0);
  });
});
