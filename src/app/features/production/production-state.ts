import type { components } from '../../../api/analytics.generated';
export type History = components['schemas']['DailyProductionHistory'];
export interface HistoryQuery {
  estateId: string;
  blockId: string;
  from: string;
  to: string;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const canonicalId = (value: unknown): value is string =>
  typeof value === 'string' && uuid.test(value);
export function day(value: unknown): value is string {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const n = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === value;
}
export function validQuery(q: HistoryQuery): boolean {
  return (
    canonicalId(q.estateId) &&
    canonicalId(q.blockId) &&
    day(q.from) &&
    day(q.to) &&
    Date.parse(q.to) >= Date.parse(q.from) &&
    Date.parse(q.to) - Date.parse(q.from) <= 366 * 86400000
  );
}
const closed = (value: unknown, keys: string[]) =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join() === [...keys].sort().join();
const count = (n: unknown): n is number =>
  typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const mass = (n: unknown): n is string =>
  typeof n === 'string' && /^(?:0|[1-9][0-9]*)\.[0-9]{3}$/.test(n);
const kg = (n: string) => BigInt(n.replace('.', ''));
function utc(n: unknown): n is string {
  if (
    typeof n !== 'string' ||
    !/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.[0-9]{1,6})?Z$/.test(n)
  )
    return false;
  return (
    Number.isFinite(Date.parse(n)) && new Date(n).toISOString().slice(0, 19) === n.slice(0, 19)
  );
}
/** Exact decimal checking; fail explicitly rather than display rounded unsafe JSON counts/versions. */
export function validHistory(value: History, q: HistoryQuery): boolean {
  try {
    if (
      !closed(value, [
        'estateId',
        'blockId',
        'from',
        'to',
        'generatedAt',
        'dataProvenance',
        'aggregationPolicy',
        'projectionState',
        'lastProcessedAt',
        'latestSourceEventAt',
        'missingSourceVersionCount',
        'conflictCount',
        'unsupportedCount',
        'sourceVersionSample',
        'sourceVersionSampleTruncated',
        'days',
      ]) ||
      !validQuery(q) ||
      !['estateId', 'blockId', 'from', 'to'].every(
        (k) => value[k as keyof History] === q[k as keyof HistoryQuery],
      ) ||
      value.dataProvenance !== 'SIMULATED' ||
      value.aggregationPolicy !== 'SUM_ROUNDED_COLLECTION_KG_V1' ||
      !utc(value.generatedAt) ||
      !count(value.conflictCount) ||
      !count(value.unsupportedCount) ||
      typeof value.missingSourceVersionCount !== 'string' ||
      !/^(?:0|[1-9][0-9]*)$/.test(value.missingSourceVersionCount) ||
      !Array.isArray(value.days) ||
      value.days.length !== (Date.parse(q.to) - Date.parse(q.from)) / 86400000 + 1
    )
      return false;
    if (
      (value.lastProcessedAt !== null && !utc(value.lastProcessedAt)) ||
      (value.latestSourceEventAt !== null && !utc(value.latestSourceEventAt))
    )
      return false;
    const incomplete =
      BigInt(value.missingSourceVersionCount) > 0n ||
      value.conflictCount > 0 ||
      value.unsupportedCount > 0;
    if (value.projectionState !== (incomplete ? 'INCOMPLETE' : 'OBSERVED_ONLY')) return false;
    let roots = 0n;
    const byDay = new Map<string, bigint>();
    for (const [index, row] of value.days.entries()) {
      const expected = new Date(Date.parse(q.from + 'T00:00:00Z') + index * 86400000)
        .toISOString()
        .slice(0, 10);
      if (!closed(row, ['date', 'availability', 'metrics']) || row.date !== expected) return false;
      const m = row.metrics;
      if (m === null) {
        if (row.availability !== 'NONE') return false;
        byDay.set(row.date, 0n);
        continue;
      }
      if (
        !closed(m, [
          'activeCollectionCount',
          'pendingDrcCount',
          'calculatedCollectionCount',
          'voidedCollectionCount',
          'totalWetLatexKg',
          'pendingWetLatexKg',
          'calculatedWetLatexKg',
          'knownDryRubberKg',
          'isComplete',
        ]) ||
        row.availability !== 'OBSERVED' ||
        ![
          m.activeCollectionCount,
          m.pendingDrcCount,
          m.calculatedCollectionCount,
          m.voidedCollectionCount,
        ].every(count) ||
        ![m.totalWetLatexKg, m.pendingWetLatexKg, m.calculatedWetLatexKg].every(mass)
      )
        return false;
      if (
        BigInt(m.activeCollectionCount) !==
          BigInt(m.pendingDrcCount) + BigInt(m.calculatedCollectionCount) ||
        BigInt(m.activeCollectionCount) + BigInt(m.voidedCollectionCount) === 0n ||
        kg(m.totalWetLatexKg) !== kg(m.pendingWetLatexKg) + kg(m.calculatedWetLatexKg) ||
        kg(m.pendingWetLatexKg) > 0n !== m.pendingDrcCount > 0 ||
        kg(m.calculatedWetLatexKg) > 0n !== m.calculatedCollectionCount > 0 ||
        m.isComplete !== (m.pendingDrcCount === 0)
      )
        return false;
      if (
        m.calculatedCollectionCount === 0
          ? m.knownDryRubberKg !== null
          : !mass(m.knownDryRubberKg) || kg(m.knownDryRubberKg) > kg(m.calculatedWetLatexKg)
      )
        return false;
      const n = BigInt(m.activeCollectionCount) + BigInt(m.voidedCollectionCount);
      roots += n;
      byDay.set(row.date, n);
    }
    if (
      !Array.isArray(value.sourceVersionSample) ||
      value.sourceVersionSample.length !== Number(roots < 100n ? roots : 100n) ||
      value.sourceVersionSampleTruncated !== roots > 100n
    )
      return false;
    const ids: string[] = [];
    const samplesByDay = new Map<string, bigint>();
    for (const source of value.sourceVersionSample) {
      if (
        !closed(source, [
          'collectionId',
          'aggregateVersion',
          'sourceEventId',
          'sourceEventAt',
          'collectionDate',
        ]) ||
        !canonicalId(source.collectionId) ||
        !canonicalId(source.sourceEventId) ||
        !count(source.aggregateVersion) ||
        !utc(source.sourceEventAt) ||
        !byDay.has(source.collectionDate) ||
        !value.lastProcessedAt ||
        !value.latestSourceEventAt
      )
        return false;
      ids.push(source.collectionId);
      samplesByDay.set(source.collectionDate, (samplesByDay.get(source.collectionDate) ?? 0n) + 1n);
    }
    if (new Set(ids).size !== ids.length || ids.join() !== [...ids].sort().join()) return false;
    for (const [date, n] of samplesByDay) if (n > byDay.get(date)!) return false;
    return true;
  } catch {
    return false;
  }
}
/** Illustrative relative trend only. Integer ratios avoid overflow/loss of exact table masses. */
export function trend(
  data: History | null,
  field: 'totalWetLatexKg' | 'knownDryRubberKg',
): string[] {
  if (!data) return [];
  const values = data.days.map((d) => d.metrics?.[field] ?? null);
  const all = data.days.flatMap((d) =>
    d.metrics
      ? [d.metrics.totalWetLatexKg, d.metrics.knownDryRubberKg].filter(
          (n): n is string => n !== null,
        )
      : [],
  );
  const max = all.reduce((m, n) => (kg(n) > m ? kg(n) : m), 1n);
  const parts: string[] = [];
  let points: string[] = [];
  values.forEach((n, i) => {
    if (n === null) {
      if (points.length) parts.push(points.join(' '));
      points = [];
    } else
      points.push(
        `${20 + (i * 560) / Math.max(1, values.length - 1)},${150 - Number((kg(n) * 1000n) / max) * 0.13}`,
      );
  });
  if (points.length) parts.push(points.join(' '));
  return parts;
}
