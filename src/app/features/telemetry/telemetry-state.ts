import type { components } from '../../../api/telemetry.generated';

export type LatestReadings = components['schemas']['LatestReadings'];
export type Reading = LatestReadings['readings'][number];
export type Freshness = 'CURRENT' | 'STALE' | 'NONE' | 'CLOCK_AHEAD';
export const telemetryKinds = ['AIR_TEMPERATURE', 'SOIL_MOISTURE', 'INTERVAL_RAINFALL'] as const;
export const telemetryLabels = {
  AIR_TEMPERATURE: 'Air temperature',
  SOIL_MOISTURE: 'Soil moisture',
  INTERVAL_RAINFALL: 'Interval rainfall',
};
export const telemetryUnits = { CELSIUS: '°C', PERCENT: '%', MILLIMETRE: 'mm' };
export const telemetryColors: Record<Freshness, string> = {
  CURRENT: '#1e88e5',
  STALE: '#d99400',
  NONE: '#85979b',
  CLOCK_AHEAD: '#ab7de1',
};
export function freshness(
  reading: Reading | undefined,
  serverMs: number,
  limitSeconds: number,
): Freshness {
  if (!reading) return 'NONE';
  const observed = Date.parse(reading.observedAt);
  if (observed > serverMs) return 'CLOCK_AHEAD';
  return serverMs - observed <= limitSeconds * 1000 ? 'CURRENT' : 'STALE';
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function canonicalId(id: unknown): id is string {
  return typeof id === 'string' && uuid.test(id);
}
function utc(text: unknown): text is string {
  if (
    typeof text !== 'string' ||
    !/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(text)
  )
    return false;
  const value = Date.parse(text);
  return Number.isFinite(value) && new Date(value).toISOString().slice(0, 19) === text.slice(0, 19);
}
/** Reject cross-scope/non-SIMULATED/malformed responses before presenting them as trusted data. */
export function validLatest(value: LatestReadings, estate: string, block: string): boolean {
  if (
    !value ||
    value.estateId !== estate ||
    value.blockId !== block ||
    value.dataProvenance !== 'SIMULATED' ||
    !utc(value.generatedAt) ||
    !Array.isArray(value.readings) ||
    value.readings.length > 3
  )
    return false;
  const kinds: string[] = [];
  for (const r of value.readings) {
    if (
      !r ||
      r.estateId !== estate ||
      r.blockId !== block ||
      r.dataProvenance !== 'SIMULATED' ||
      r.schemaVersion !== 1 ||
      !canonicalId(r.deviceId) ||
      !canonicalId(r.observationId) ||
      !utc(r.observedAt) ||
      !utc(r.receivedAt) ||
      Date.parse(r.receivedAt) > Date.parse(value.generatedAt) ||
      Date.parse(r.observedAt) > Date.parse(r.receivedAt) + 300_000 ||
      typeof r.value !== 'string' ||
      !/^-?(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$/.test(r.value)
    )
      return false;
    if (r.kind === 'AIR_TEMPERATURE') {
      if (r.unit !== 'CELSIUS' || 'intervalStart' in r || 'intervalEnd' in r) return false;
    } else if (r.kind === 'SOIL_MOISTURE') {
      if (
        r.unit !== 'PERCENT' ||
        Number(r.value) < 0 ||
        Number(r.value) > 100 ||
        'intervalStart' in r ||
        'intervalEnd' in r
      )
        return false;
    } else if (r.kind === 'INTERVAL_RAINFALL') {
      if (
        r.unit !== 'MILLIMETRE' ||
        Number(r.value) < 0 ||
        !utc(r.intervalStart) ||
        !utc(r.intervalEnd) ||
        Date.parse(r.intervalStart) >= Date.parse(r.intervalEnd) ||
        Date.parse(r.intervalEnd) > Date.parse(r.observedAt)
      )
        return false;
    } else return false;
    kinds.push(r.kind);
  }
  if (new Set(kinds).size !== kinds.length || kinds.join() !== [...kinds].sort().join())
    return false;
  return (
    value.coverage === (kinds.length === 0 ? 'NONE' : kinds.length === 3 ? 'COMPLETE' : 'PARTIAL')
  );
}
