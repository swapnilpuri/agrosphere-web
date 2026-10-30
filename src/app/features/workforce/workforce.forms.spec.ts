import { describe, expect, it } from 'vitest';
import { buildCommand, businessDate, calendarDate, Editor } from './workforce.forms';
describe('Workforce commands', () => {
  it('uses estate-local dates across Gabon, Malawi and DST midnight boundaries', () => {
    const instant = new Date('2026-10-28T22:30:00Z');
    expect(businessDate('Africa/Libreville', instant)).toBe('2026-10-28');
    expect(businessDate('Africa/Blantyre', instant)).toBe('2026-10-29');
    expect(businessDate('America/New_York', new Date('2026-03-08T05:30:00Z'))).toBe('2026-03-08');
    expect(businessDate('invalid')).toBe('');
    expect(() => calendarDate('2026-02-29')).toThrow();
  });
  it('never turns missing evidence into absence and fixes the worker/date', () => {
    const editor: Editor = {
      kind: 'RECORD',
      workerId: 'fixed-id',
      date: '2026-10-29',
      values: { status: '' },
    };
    expect(() => buildCommand(editor, 'estate', '2026-10-29')).toThrow('explicit attendance');
    editor.values['status'] = 'PRESENT';
    expect(buildCommand(editor, 'estate', '2026-10-29').body).toEqual({
      workerRegistrationId: 'fixed-id',
      attendanceDate: '2026-10-29',
      status: 'PRESENT',
    });
    expect(() => buildCommand(editor, 'estate', '2026-10-30')).toThrow();
    editor.values['reason'] = 'SIMULATED late entry';
    expect(buildCommand(editor, 'estate', '2026-10-30').body).toHaveProperty(
      'backdateReason',
      'SIMULATED late entry',
    );
  });
  it('normalizes ASCII codes, preserves Unicode names and always uses SIMULATED', () => {
    const editor: Editor = {
      kind: 'REGISTER',
      values: { code: ' sim-01 ', name: '  Élodie 模拟  ', division: '', date: '2026-10-29' },
    };
    expect(buildCommand(editor, 'estate', '2026-10-29').body).toEqual({
      estateId: 'estate',
      workerCode: 'SIM-01',
      displayName: 'Élodie 模拟',
      divisionId: null,
      activeFrom: '2026-10-29',
      dataProvenance: 'SIMULATED',
    });
    editor.values['code'] = 'ſim-01';
    expect(() => buildCommand(editor, 'estate', '2026-10-29')).toThrow('ASCII');
  });
});
