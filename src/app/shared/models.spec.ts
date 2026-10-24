import { describe, it, expect } from 'vitest';
import { aggregate, searchBlocks, display, assetCategory, Block, Asset } from './models';
const blocks = [
  {
    id: 'uuid-a',
    blockCode: 'B-12',
    name: 'North',
    plantedAreaHectares: 2.25,
    plantedTreeCount: 100,
    tappableTreeCount: 80,
    status: 'ACTIVE',
  },
  {
    id: 'uuid-b',
    blockCode: 'B-13',
    name: 'North',
    plantedAreaHectares: 1.5,
    plantedTreeCount: 60,
    tappableTreeCount: 0,
    status: 'INACTIVE',
  },
] as Block[];
describe('Estate projections', () => {
  it('keeps duplicate-name identities and searches codes case-insensitively', () => {
    expect(searchBlocks(blocks, 'north').map((b) => b.id)).toEqual(['uuid-a', 'uuid-b']);
    expect(searchBlocks(blocks, ' b-12 ')).toEqual([blocks[0]]);
  });
  it('aggregates authoritative counts including inactive blocks', () =>
    expect(aggregate(blocks)).toEqual({
      blocks: 2,
      area: 3.75,
      planted: 160,
      tappable: 80,
      active: 1,
      inactive: 1,
    }));
  it('handles empty and absent values without hiding zero', () => {
    expect(aggregate([]).area).toBe(0);
    expect(display(0)).toBe('0');
    expect(display(null)).toBe('Not supplied');
  });
  it('categorizes supplied roads and sensor assets', () => {
    expect(assetCategory({ assetType: 'ROAD' } as Asset)).toBe('ROAD');
    expect(assetCategory({ assetType: 'SENSOR_MARKER' } as Asset)).toBe('SENSOR');
  });
});
