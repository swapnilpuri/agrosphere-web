import type { components } from '../../../api/analytics.generated';
import { canonicalId } from '../production/production-state';
export { canonicalId } from '../production/production-state';
export type EnvironmentHistory = components['schemas']['EnvironmentalHistory'];
export type Observation = EnvironmentHistory['observations'][number];
export interface EnvironmentQuery {
  estateId: string;
  blockId: string;
  from: string;
  to: string;
}
const kinds = ['AIR_TEMPERATURE', 'SOIL_MOISTURE', 'INTERVAL_RAINFALL'] as const;
const units = {
  AIR_TEMPERATURE: 'CELSIUS',
  SOIL_MOISTURE: 'PERCENT',
  INTERVAL_RAINFALL: 'MILLIMETRE',
};
export function utc(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.[0-9]{1,3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 19) === value.slice(0, 19)
  );
}
export function validEnvironmentQuery(q: EnvironmentQuery): boolean {
  return (
    canonicalId(q.estateId) &&
    canonicalId(q.blockId) &&
    utc(q.from) &&
    utc(q.to) &&
    Date.parse(q.to) > Date.parse(q.from) &&
    Date.parse(q.to) - Date.parse(q.from) <= 86400000
  );
}
const closed = (value: unknown, keys: string[]) =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join() === [...keys].sort().join();
const count = (n: unknown): n is number =>
  typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const decimal = (n: unknown): n is string =>
  typeof n === 'string' && n.length <= 20 && /^-?(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$/.test(n);
const micros = (n: string) => {
  const [whole, fraction = ''] = n.replace('-', '').split('.');
  return (
    (n.startsWith('-') ? -1n : 1n) * (BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0')))
  );
};
/** Exact source strings/counts, observed-time ordering and absence/conflict boundaries; no aggregation. */
export function validEnvironmentHistory(value: EnvironmentHistory, q: EnvironmentQuery): boolean {
  try {
    if (
      !validEnvironmentQuery(q) ||
      !closed(value, [
        'estateId',
        'blockId',
        'from',
        'to',
        'generatedAt',
        'dataProvenance',
        'availability',
        'projectionState',
        'totalMatchingCount',
        'truncated',
        'returnedKindCounts',
        'conflictCount',
        'lastProcessedAt',
        'latestSourceEventAt',
        'observations',
      ]) ||
      !(['estateId', 'blockId', 'from', 'to'] as const).every((k) => value[k] === q[k]) ||
      value.dataProvenance !== 'SIMULATED' ||
      !utc(value.generatedAt) ||
      typeof value.totalMatchingCount !== 'string' ||
      !/^(?:0|[1-9][0-9]*)$/.test(value.totalMatchingCount) ||
      !count(value.conflictCount) ||
      !Array.isArray(value.observations) ||
      !closed(value.returnedKindCounts, [...kinds])
    )
      return false;
    const total = BigInt(value.totalMatchingCount);
    if (
      value.observations.length !== Number(total < 1000n ? total : 1000n) ||
      value.truncated !== total > 1000n ||
      value.availability !== (total === 0n ? 'NONE' : 'OBSERVED') ||
      value.projectionState !== (value.conflictCount > 0 ? 'INCOMPLETE' : 'OBSERVED_ONLY')
    )
      return false;
    if (
      (value.lastProcessedAt === null) !== (value.latestSourceEventAt === null) ||
      (value.lastProcessedAt !== null &&
        (!utc(value.lastProcessedAt) ||
          Date.parse(value.lastProcessedAt) > Date.parse(value.generatedAt))) ||
      (value.latestSourceEventAt !== null && !utc(value.latestSourceEventAt)) ||
      ((total > 0n || value.conflictCount > 0) && value.lastProcessedAt === null)
    )
      return false;
    const observations = new Set<string>(),
      events = new Set<string>();
    let prior: Observation | undefined;
    for (const row of value.observations) {
      const rain = row.kind === 'INTERVAL_RAINFALL';
      if (
        !closed(row, [
          'observationId',
          'deviceId',
          'observedAt',
          'receivedAt',
          'kind',
          'unit',
          'value',
          'sourceEventId',
          'sourceEventAt',
          ...(rain ? ['intervalStart', 'intervalEnd'] : []),
        ]) ||
        !canonicalId(row.observationId) ||
        !canonicalId(row.deviceId) ||
        !canonicalId(row.sourceEventId) ||
        !kinds.includes(row.kind) ||
        row.unit !== units[row.kind] ||
        !decimal(row.value) ||
        !utc(row.observedAt) ||
        !utc(row.receivedAt) ||
        !utc(row.sourceEventAt) ||
        row.sourceEventAt !== row.receivedAt ||
        Date.parse(row.observedAt) < Date.parse(q.from) ||
        Date.parse(row.observedAt) >= Date.parse(q.to) ||
        Date.parse(row.observedAt) > Date.parse(row.receivedAt) + 300000 ||
        !value.latestSourceEventAt ||
        Date.parse(row.sourceEventAt) > Date.parse(value.latestSourceEventAt) ||
        observations.has(row.observationId) ||
        events.has(row.sourceEventId)
      )
        return false;
      if (
        row.kind === 'SOIL_MOISTURE' &&
        (micros(row.value) < 0n || micros(row.value) > 100000000n)
      )
        return false;
      if (
        row.kind === 'INTERVAL_RAINFALL' &&
        (micros(row.value) < 0n ||
          !utc(row.intervalStart) ||
          !utc(row.intervalEnd) ||
          Date.parse(row.intervalStart) >= Date.parse(row.intervalEnd) ||
          Date.parse(row.intervalEnd) > Date.parse(row.observedAt))
      )
        return false;
      if (
        prior &&
        (Date.parse(prior.observedAt) > Date.parse(row.observedAt) ||
          (Date.parse(prior.observedAt) === Date.parse(row.observedAt) &&
            prior.observationId >= row.observationId))
      )
        return false;
      observations.add(row.observationId);
      events.add(row.sourceEventId);
      prior = row;
    }
    return kinds.every(
      (k) =>
        count(value.returnedKindCounts[k]) &&
        value.returnedKindCounts[k] === value.observations.filter((row) => row.kind === k).length,
    );
  } catch {
    return false;
  }
}
