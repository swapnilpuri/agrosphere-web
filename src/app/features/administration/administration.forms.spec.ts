import { describe, it, expect } from 'vitest';
import { blockBody, divisionBody, estateBody } from './administration.forms';
function data(values: Record<string, string | undefined>) {
  const result = new FormData();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined) result.set(key, value);
  return result;
}
const estate = {
  estateCode: ' ga_rubber ',
  name: 'Owner supplied name',
  countryCode: 'ga',
  timezone: 'Africa/Libreville',
  status: 'ACTIVE',
};
const block = {
  divisionId: 'division',
  blockCode: 'f01',
  name: 'Owner supplied field',
  plantedAreaHectares: '12.3456',
  plantedTreeCount: '100',
  tappableTreeCount: '80',
  status: 'ACTIVE',
};
describe('Estate administration requests', () => {
  it('supports Gabon and Malawi without inventing an estate area or create version', () => {
    const result = estateBody(data(estate));
    expect(result).toMatchObject({
      countryCode: 'GA',
      timezone: 'Africa/Libreville',
      estateCode: 'GA_RUBBER',
      totalAreaHectares: null,
    });
    expect(result).not.toHaveProperty('version');
    expect(
      estateBody(data({ ...estate, countryCode: 'MW', timezone: 'Africa/Blantyre' })).countryCode,
    ).toBe('MW');
  });
  it('carries the observed version and fixed estate relationship for edits', () => {
    expect(estateBody(data(estate), 7).version).toBe(7);
    expect(
      divisionBody(
        data({ divisionCode: 'd1', name: 'North', status: 'ACTIVE', estateId: 'forged' }),
        'actual',
        3,
      ),
    ).toEqual({
      estateId: 'actual',
      divisionCode: 'D1',
      name: 'North',
      status: 'ACTIVE',
      version: 3,
    });
  });
  it('keeps optional observations null and preserves known zero counts', () => {
    const body = blockBody(
      data({ ...block, plantedTreeCount: '0', tappableTreeCount: '0' }),
      'estate',
      ['division'],
    );
    expect(body).toMatchObject({
      estateId: 'estate',
      cropType: 'RUBBER',
      plantingDate: null,
      rubberCloneCode: null,
      plantedAreaHectares: 12.3456,
      plantedTreeCount: 0,
      tappableTreeCount: 0,
    });
    expect(body).not.toHaveProperty('version');
  });
  it('rejects missing counts, excess precision, foreign divisions and impossible tree totals', () => {
    for (const changes of [
      { plantedTreeCount: '' },
      { plantedAreaHectares: '1.00001' },
      { tappableTreeCount: '101' },
      { divisionId: 'foreign' },
      { plantingDate: '2026-02-30' },
    ])
      expect(() => blockBody(data({ ...block, ...changes }), 'estate', ['division'])).toThrow();
  });
  it('rejects bad timezones, countries, codes, status and negative area', () => {
    for (const changes of [
      { timezone: 'not/a-zone' },
      { countryCode: 'GAB' },
      { estateCode: 'bad/code' },
      { status: 'UNKNOWN' },
      { totalAreaHectares: '-1' },
    ])
      expect(() => estateBody(data({ ...estate, ...changes }))).toThrow();
  });
});
