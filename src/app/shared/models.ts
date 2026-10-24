import type { components as EstateSchemas } from '../../api/estate.generated';
import type { components as SpatialSchemas } from '../../api/spatial.generated';
export type Estate = EstateSchemas['schemas']['Estate'];
export type Division = EstateSchemas['schemas']['Division'];
export type Block = EstateSchemas['schemas']['PlantationBlock'];
export type Feature = SpatialSchemas['schemas']['Feature'];
export type Layer = SpatialSchemas['schemas']['Layer'];
export type Asset = SpatialSchemas['schemas']['Asset'];
export interface Page<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
}
export const categories = [
  'ESTATE',
  'DIVISION',
  'BLOCK',
  'ROAD',
  'FACILITY',
  'SENSOR',
  'ASSET',
] as const;
export type Category = (typeof categories)[number];
export const colors: Record<Category, string> = {
  ESTATE: '#63d6c0',
  DIVISION: '#83b9ff',
  BLOCK: '#79c97c',
  ROAD: '#efc36d',
  FACILITY: '#cb9cfa',
  SENSOR: '#fa9ba9',
  ASSET: '#d7dce5',
};
export function assetCategory(asset: Asset): Category {
  return asset.assetType === 'ROAD'
    ? 'ROAD'
    : asset.assetType === 'SENSOR_MARKER'
      ? 'SENSOR'
      : ['BUILDING', 'FACTORY'].includes(asset.assetType)
        ? 'FACILITY'
        : 'ASSET';
}
export function searchBlocks(blocks: Block[], term: string): Block[] {
  const q = term.trim().toLocaleLowerCase();
  return blocks.filter((b) => (b.blockCode + ' ' + b.name).toLocaleLowerCase().includes(q));
}
export function aggregate(blocks: Block[]) {
  return {
    blocks: blocks.length,
    area: blocks.reduce((n, b) => n + b.plantedAreaHectares, 0),
    planted: blocks.reduce((n, b) => n + b.plantedTreeCount, 0),
    tappable: blocks.reduce((n, b) => n + b.tappableTreeCount, 0),
    active: blocks.filter((b) => b.status === 'ACTIVE').length,
    inactive: blocks.filter((b) => b.status === 'INACTIVE').length,
  };
}
export function display(value: unknown): string {
  return value === null || value === undefined ? 'Not supplied' : String(value);
}
