import { describe, it, expect } from 'vitest';
import { boundaryRequest, BoundaryTarget, previewBoundaries } from './boundary-import';
const geometry = {
  type: 'Polygon',
  coordinates: [
    [
      [9.4, 0.4],
      [9.41, 0.4],
      [9.41, 0.41],
      [9.4, 0.4],
    ],
  ],
};
const collection = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: { name: 'Supplied boundary' }, geometry }],
};
const targets: BoundaryTarget[] = [
  { key: 'BLOCK:field', id: 'field', kind: 'BLOCK', code: 'F1', label: 'Field F1' },
];
describe('GeoJSON onboarding preview', () => {
  it('preserves supplied African coordinates and requires explicit canonical mapping and provenance', () => {
    const rows = previewBoundaries(JSON.stringify(collection), 'estate');
    expect(rows[0].geometry).toEqual(geometry);
    expect(rows[0].bounds).toEqual([9.4, 0.4, 9.41, 0.41]);
    expect(() => boundaryRequest('estate', 'survey.geojson', rows, targets, '')).toThrow();
    expect(() => boundaryRequest('estate', 'survey.geojson', rows, targets, 'REAL')).toThrow();
    rows[0].target = 'BLOCK:field';
    rows[0].code = 'field_boundary';
    const body = boundaryRequest('estate', 'survey.geojson', rows, targets, 'REAL');
    expect(body.geojson.features[0].properties).toEqual({
      estateId: 'estate',
      referenceEntityId: 'field',
      referenceEntityType: 'BLOCK',
      featureCode: 'FIELD_BOUNDARY',
      status: 'ACTIVE',
      sourceType: 'IMPORT',
      dataProvenance: 'REAL',
    });
  });
  it('rejects projected coordinates, open rings, non-polygons and foreign estate IDs', () => {
    for (const value of [
      { ...collection, crs: {} },
      { ...collection, features: [] },
      {
        type: 'FeatureCollection',
        features: [{ ...collection.features[0], geometry: { type: 'Point', coordinates: [9, 0] } }],
      },
      {
        type: 'FeatureCollection',
        features: [{ ...collection.features[0], properties: { estateId: 'foreign' } }],
      },
      {
        type: 'FeatureCollection',
        features: [
          {
            ...collection.features[0],
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [500, 0],
                  [501, 0],
                  [501, 1],
                  [500, 0],
                ],
              ],
            },
          },
        ],
      },
      {
        type: 'FeatureCollection',
        features: [
          {
            ...collection.features[0],
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [9, 0],
                  [10, 0],
                  [10, 1],
                  [9, 1],
                ],
              ],
            },
          },
        ],
      },
    ])
      expect(() => previewBoundaries(JSON.stringify(value), 'estate')).toThrow();
  });
  it('accepts MultiPolygon and rejects duplicate target assignments or duplicate codes', () => {
    const rows = previewBoundaries(
      JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            ...collection.features[0],
            geometry: { type: 'MultiPolygon', coordinates: [geometry.coordinates] },
          },
        ],
      }),
      'estate',
    );
    rows[0].target = targets[0].key;
    rows[0].code = 'BOUNDARY';
    expect(
      boundaryRequest('estate', 'a.geojson', rows, targets, 'SIMULATED').geojson.features[0]
        .geometry.type,
    ).toBe('MultiPolygon');
    expect(() =>
      boundaryRequest('estate', 'a.geojson', [...rows, ...rows], targets, 'REAL'),
    ).toThrow();
  });
  it('limits each import to 100 supplied features and rejects malformed input', () => {
    expect(() => previewBoundaries('{', 'estate')).toThrow();
    expect(() =>
      previewBoundaries(
        JSON.stringify({ ...collection, features: Array(101).fill(collection.features[0]) }),
        'estate',
      ),
    ).toThrow();
  });
});
