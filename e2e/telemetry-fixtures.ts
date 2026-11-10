import { estateId, blockId } from './fixtures';
const generated = '2026-01-01T12:00:00Z';
export const telemetrySample = {
  estateId,
  blockId,
  generatedAt: generated,
  dataProvenance: 'SIMULATED',
  coverage: 'COMPLETE',
  readings: [
    { kind: 'AIR_TEMPERATURE', unit: 'CELSIUS', value: '27.500000' },
    {
      kind: 'INTERVAL_RAINFALL',
      unit: 'MILLIMETRE',
      value: '2.125',
      intervalStart: '2026-01-01T11:59:30Z',
      intervalEnd: generated,
    },
    { kind: 'SOIL_MOISTURE', unit: 'PERCENT', value: '45.125' },
  ].map((value, index) => ({
    ...value,
    schemaVersion: 1,
    observationId: `00000000-0000-4000-8000-00000000002${index}`,
    deviceId: '00000000-0000-4000-8000-000000000010',
    estateId,
    blockId,
    dataProvenance: 'SIMULATED',
    observedAt: generated,
    receivedAt: generated,
  })),
};
