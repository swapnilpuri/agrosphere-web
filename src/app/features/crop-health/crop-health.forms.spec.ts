import { describe, expect, it } from 'vitest';
import { cropCommand, cropEditor, cropInstant } from './crop-health.forms';
import { Incident, Inspection } from './crop-health.api';
const id = '00000000-0000-4000-8000-000000000001';
const base = {
  id,
  estateId: id,
  blockId: id,
  estateTimezone: 'Africa/Libreville',
  dataProvenance: 'SIMULATED' as const,
  version: 3,
  observedAt: '2026-10-31T10:00:00Z',
  createdAt: '2026-10-31T10:00:00Z',
  updatedAt: '2026-10-31T11:00:00Z',
};
const incident: Incident = {
  ...base,
  inspectionId: id,
  category: 'TREE_DAMAGE',
  severity: 'LOW',
  summary: 'SIMULATED report',
  details: 'SIMULATED details',
  status: 'OPEN',
  resolvedAt: null,
  resolutionNote: null,
};
const inspection: Inspection = {
  ...base,
  findings: 'SIMULATED findings',
  outcome: 'FOLLOW_UP',
  state: 'RECORDED',
  linkedIncidentId: id,
  linkedIncidentStatus: 'OPEN',
  linkedIncidentVersion: 5,
};
describe('crop report commands', () => {
  it('creates only SIMULATED evidence and requires a field', () => {
    const editor = cropEditor('create', null, null);
    editor.findings = ' SIMULATED clear ';
    expect(() => cropCommand('inspections', id, editor, 'key')).toThrow('Select an active field');
    editor.blockId = id;
    const command = cropCommand('inspections', id, editor, 'key');
    expect(command.body['dataProvenance']).toBe('SIMULATED');
    expect(command.body['findings']).toBe('SIMULATED clear');
    expect(command.body['incident']).toBeUndefined();
  });
  it('requires complete incident evidence for first FOLLOW_UP', () => {
    const e = cropEditor('create', null, null);
    Object.assign(e, { blockId: id, findings: 'SIMULATED', outcome: 'FOLLOW_UP' });
    expect(() => cropCommand('inspections', id, e, 'key')).toThrow('Summary');
    e.summary = 'SIMULATED summary';
    e.details = 'SIMULATED details';
    expect(cropCommand('inspections', id, e, 'key').body['incident']).toMatchObject({
      summary: e.summary,
    });
  });
  it('freezes a detached body and retains paired original versions', () => {
    const e = cropEditor('corrections', inspection, null);
    e.reason = 'SIMULATED correction';
    e.findings = 'SIMULATED changed';
    const command = cropCommand('inspections', id, e, 'same-key');
    e.findings = 'Later draft';
    expect(command.body).toMatchObject({
      inspectionVersion: 3,
      incidentVersion: 5,
      findings: 'SIMULATED changed',
    });
    expect(command.key).toBe('same-key');
    expect(command.body['incident']).toBeUndefined();
  });
  it('requires linked inspection version and reason for incident transitions', () => {
    const e = cropEditor('triage', incident, null);
    e.reason = 'SIMULATED triage';
    expect(() => cropCommand('incidents', id, e, 'key')).toThrow('linked inspection');
    e.parentVersion = 7;
    expect(cropCommand('incidents', id, e, 'key').body).toEqual({
      expectedVersion: 3,
      inspectionVersion: 7,
      reason: e.reason,
    });
  });
  it('resolution requires explicit time and note; no actor fields are generated', () => {
    const e = cropEditor('resolve', { ...incident, inspectionId: null }, null);
    e.reason = 'SIMULATED closure';
    expect(() => cropCommand('incidents', id, e, 'key')).toThrow('Resolution note');
    e.resolutionNote = 'SIMULATED resolved';
    const body = cropCommand('incidents', id, e, 'key').body;
    expect(body['inspectionVersion']).toBeUndefined();
    expect(body['recordedBy']).toBeUndefined();
    expect(body['resolutionNote']).toBe(e.resolutionNote);
  });
  it('rejects offsetless and excessive precision while preserving explicit offsets', () => {
    for (const at of ['2026-10-31T10:00:00', '2026-10-31T10:00:00.1234567Z'])
      expect(() => cropInstant(at)).toThrow();
    expect(cropInstant('2026-10-31T11:00:00.123456+01:00')).toBe(
      '2026-10-31T11:00:00.123456+01:00',
    );
  });
  it('rejects control characters and oversized text with Unicode codepoint lengths', () => {
    const e = cropEditor('create', null, null);
    e.blockId = id;
    for (const value of ['SIMULATED\ninvalid', 'x'.repeat(2001)]) {
      e.findings = value;
      expect(() => cropCommand('inspections', id, e, 'key')).toThrow();
    }
    e.findings = '🌱'.repeat(2000);
    expect(cropCommand('inspections', id, e, 'key').body['findings']).toBe(e.findings);
  });
});
