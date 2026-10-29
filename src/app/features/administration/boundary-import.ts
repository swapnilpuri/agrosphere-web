import type { components } from '../../../api/spatial.generated';
export type BoundaryGeometry = Extract<
  components['schemas']['Geometry'],
  { type: 'Polygon' | 'MultiPolygon' }
>;
export interface BoundaryRow {
  label: string;
  geometry: BoundaryGeometry;
  bounds: number[];
  target: string;
  code: string;
}
export interface BoundaryTarget {
  key: string;
  id: string;
  kind: 'ESTATE' | 'DIVISION' | 'BLOCK';
  code: string;
  label: string;
}
export type Provenance = 'REAL' | 'SIMULATED' | 'ESTIMATED' | 'PREDICTED';
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a GeoJSON object.');
  return value as Record<string, unknown>;
}
export function previewBoundaries(raw: string, estateId: string): BoundaryRow[] {
  let collection: Record<string, unknown>;
  try {
    collection = object(JSON.parse(raw));
  } catch {
    throw new Error('Choose a valid GeoJSON FeatureCollection file.');
  }
  if (
    'crs' in collection ||
    collection['type'] !== 'FeatureCollection' ||
    !Array.isArray(collection['features']) ||
    !collection['features'].length ||
    collection['features'].length > 100
  )
    throw new Error(
      'Use an RFC 7946 FeatureCollection with 1–100 polygons, WGS84 longitude/latitude, and no crs member.',
    );
  return collection['features'].map((value: unknown, index: number) => {
    const feature = object(value);
    if (feature['type'] !== 'Feature' || 'crs' in feature)
      throw new Error('Every entry must be a GeoJSON Feature without crs.');
    const properties = feature['properties'] == null ? {} : object(feature['properties']);
    if (properties['estateId'] && properties['estateId'] !== estateId)
      throw new Error('The file refers to a different estate. Select the correct estate first.');
    const geometry = object(feature['geometry']);
    if ('crs' in geometry || !['Polygon', 'MultiPolygon'].includes(String(geometry['type'])))
      throw new Error('Boundary import accepts Polygon and MultiPolygon geometry only.');
    const polygons =
      geometry['type'] === 'Polygon' ? [geometry['coordinates']] : geometry['coordinates'];
    if (!Array.isArray(polygons) || !polygons.length)
      throw new Error('A boundary cannot be empty.');
    const bounds = [Infinity, Infinity, -Infinity, -Infinity];
    for (const polygon of polygons) {
      if (!Array.isArray(polygon) || !polygon.length)
        throw new Error('A polygon needs at least one closed ring.');
      for (const ring of polygon) {
        if (!Array.isArray(ring) || ring.length < 4)
          throw new Error('Each ring needs at least four positions.');
        for (const point of ring) {
          if (
            !Array.isArray(point) ||
            point.length < 2 ||
            point.length > 3 ||
            !point.every((n: unknown) => typeof n === 'number' && Number.isFinite(n)) ||
            Math.abs(point[0]) > 180 ||
            Math.abs(point[1]) > 90
          )
            throw new Error(
              'Positions must be WGS84 longitude/latitude (optionally altitude), within valid ranges.',
            );
          bounds[0] = Math.min(bounds[0], point[0]);
          bounds[1] = Math.min(bounds[1], point[1]);
          bounds[2] = Math.max(bounds[2], point[0]);
          bounds[3] = Math.max(bounds[3], point[1]);
        }
        if (JSON.stringify(ring[0]) !== JSON.stringify(ring[ring.length - 1]))
          throw new Error('Polygon rings must close: the first and last position must match.');
      }
    }
    return {
      label: String(
        properties['name'] ?? properties['featureCode'] ?? 'Boundary ' + (index + 1),
      ).slice(0, 200),
      geometry: geometry as unknown as BoundaryGeometry,
      bounds,
      target: '',
      code: '',
    };
  });
}
export function boundaryRequest(
  estateId: string,
  filename: string,
  rows: BoundaryRow[],
  targets: BoundaryTarget[],
  provenance: string,
): components['schemas']['ImportInput'] {
  if (!['REAL', 'SIMULATED', 'ESTIMATED', 'PREDICTED'].includes(provenance))
    throw new Error('Choose the provenance of these boundaries.');
  if (!rows.length || rows.length > 100) throw new Error('Choose 1–100 boundaries.');
  const seenTargets = new Set<string>();
  const codes = new Set<string>();
  const features: components['schemas']['GeoFeatureInput'][] = rows.map((row) => {
    const target = targets.find((t) => t.key === row.target);
    if (!target || seenTargets.has(row.target))
      throw new Error(
        'Map every polygon to a different estate, division or field. Combine separate parts of one boundary into a MultiPolygon.',
      );
    seenTargets.add(row.target);
    const code = row.code.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(code) || codes.has(code))
      throw new Error(
        'Boundary codes must be unique, at most 64 characters, and contain letters, numbers, underscores or hyphens.',
      );
    codes.add(code);
    return {
      type: 'Feature',
      geometry: row.geometry,
      properties: {
        estateId,
        referenceEntityId: target.id,
        referenceEntityType: target.kind,
        featureCode: code,
        status: 'ACTIVE',
        sourceType: 'IMPORT',
        dataProvenance: provenance as Provenance,
      },
    };
  });
  return { estateId, sourceFilename: filename, geojson: { type: 'FeatureCollection', features } };
}
