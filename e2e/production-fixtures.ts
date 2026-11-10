import type { History } from '../src/app/features/production/production-state';
const estateId = '00000000-0000-4000-8000-000000000001';
const blockId = '00000000-0000-4000-8000-000000000003';
export function productionSample(): History {
  return {
    estateId,
    blockId,
    from: '2026-01-01',
    to: '2026-01-02',
    generatedAt: '2026-01-03T12:00:03Z',
    dataProvenance: 'SIMULATED',
    aggregationPolicy: 'SUM_ROUNDED_COLLECTION_KG_V1',
    projectionState: 'OBSERVED_ONLY',
    lastProcessedAt: '2026-01-03T12:00:02Z',
    latestSourceEventAt: '2026-01-03T12:00:01Z',
    missingSourceVersionCount: '0',
    conflictCount: 0,
    unsupportedCount: 0,
    sourceVersionSampleTruncated: false,
    sourceVersionSample: [
      {
        collectionId: '00000000-0000-4000-8000-000000000010',
        aggregateVersion: 0,
        sourceEventId: '00000000-0000-4000-8000-000000000011',
        sourceEventAt: '2026-01-03T12:00:01Z',
        collectionDate: '2026-01-01',
      },
    ],
    days: [
      {
        date: '2026-01-01',
        availability: 'OBSERVED',
        metrics: {
          activeCollectionCount: 1,
          pendingDrcCount: 1,
          calculatedCollectionCount: 0,
          voidedCollectionCount: 0,
          totalWetLatexKg: '10.000',
          pendingWetLatexKg: '10.000',
          calculatedWetLatexKg: '0.000',
          knownDryRubberKg: null,
          isComplete: false,
        },
      },
      { date: '2026-01-02', availability: 'NONE', metrics: null },
    ],
  };
}
