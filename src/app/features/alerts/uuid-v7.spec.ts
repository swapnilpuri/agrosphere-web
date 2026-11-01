import { describe, it, expect } from 'vitest';
import { uuidV7 } from './uuid-v7';

describe('Alert UUIDv7 keys', () => {
  it('preserves exact millisecond age and RFC version/variant with distinct random keys', () => {
    const at = Date.UTC(2026, 9, 31, 12);
    const keys = Array.from({ length: 100 }, () => uuidV7(at));
    expect(new Set(keys).size).toBe(100);
    for (const key of keys) {
      expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(Number.parseInt(key.replaceAll('-', '').slice(0, 12), 16)).toBe(at);
    }
  });
  it('rejects unrepresentable clocks instead of truncating or inventing an issue time', () => {
    for (const value of [-1, 1.5, NaN, Infinity, 0x1000000000000])
      expect(() => uuidV7(value)).toThrow();
  });
});
