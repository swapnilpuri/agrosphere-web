import { Command, Day, Schemas, Worker } from './workforce.api';
export type Kind =
  'REGISTER' | 'PROFILE' | 'CLOSE' | 'OPEN' | 'RECORD' | 'CORRECT' | 'VOID' | 'RERECORD';
export type Editor = {
  kind: Kind;
  worker?: Worker;
  day?: Day;
  workerId?: string;
  date?: string;
  values: Record<string, string>;
};
export function businessDate(zone: string, now = new Date()): string {
  try {
    if (!zone) return '';
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    return ['year', 'month', 'day'].map((k) => parts.find((p) => p.type === k)?.value).join('-');
  } catch {
    return '';
  }
}
export function calendarDate(value: string): string {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new Error('Enter a valid calendar date.');
  return value;
}
export function nextDate(value: string): string {
  const date = new Date(calendarDate(value));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
function text(value: string, max: number): string {
  const normalized = value.trim();
  if (
    !normalized ||
    [...normalized].length > max ||
    [...normalized].some(
      (c) => c.codePointAt(0)! < 32 || (c.codePointAt(0)! >= 127 && c.codePointAt(0)! <= 159),
    )
  )
    throw new Error(`Enter 1–${max} characters without control characters.`);
  return normalized;
}
export function buildCommand(editor: Editor, estateId: string, today: string): Command {
  if (!today) throw new Error('A valid estate timezone is required.');
  const v = editor.values,
    kind = editor.kind,
    worker = editor.worker,
    day = editor.day;
  const version = worker?.version ?? day?.version;
  if (version !== undefined && (!Number.isSafeInteger(version) || version < 0))
    throw new Error('Version cannot be represented safely. Refresh this record.');
  const reason =
    kind === 'REGISTER' || (kind === 'RECORD' && editor.date === today)
      ? ''
      : text(v['reason'] ?? '', 1000);
  let body: object,
    path: string,
    method: 'POST' | 'PATCH' = 'POST';
  switch (kind) {
    case 'REGISTER': {
      const code = v['code'].trim();
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(code))
        throw new Error(
          'Worker code must be 1–64 ASCII letters, digits, underscores or hyphens, starting with a letter or digit.',
        );
      const activeFrom = calendarDate(v['date']);
      if (activeFrom > today) throw new Error('Registration cannot start in the future.');
      body = {
        estateId,
        workerCode: code.toUpperCase(),
        displayName: text(v['name'], 200),
        divisionId: v['division'] || null,
        activeFrom,
        dataProvenance: 'SIMULATED',
      } satisfies Schemas['WorkerRegister'];
      path = '/workers';
      break;
    }
    case 'PROFILE': {
      if (!worker) throw new Error('Select a worker.');
      const displayName = text(v['name'], 200),
        divisionId = v['division'] || null;
      if (displayName === worker.displayName && divisionId === worker.divisionId)
        throw new Error('Change the name or division before saving.');
      body = { version, reason, displayName, divisionId };
      path = '/workers/' + worker.id;
      method = 'PATCH';
      break;
    }
    case 'CLOSE': {
      const period = worker?.activePeriods.find((p) => p.activeTo === null);
      if (!worker || !period) throw new Error('No open active period.');
      const activeTo = calendarDate(v['date']);
      if (activeTo <= period.activeFrom || activeTo > nextDate(today))
        throw new Error('Exclusive end must follow the start and be no later than tomorrow.');
      body = {
        version: worker.version,
        activePeriodId: period.id,
        activeTo,
        reason,
      } satisfies Schemas['WorkerClosePeriod'];
      path = '/workers/' + worker.id + '/close-period';
      break;
    }
    case 'OPEN': {
      if (!worker || worker.activePeriods.some((p) => p.activeTo === null))
        throw new Error('Close the current period first.');
      const activeFrom = calendarDate(v['date']);
      if (
        activeFrom > today ||
        worker.activePeriods.some((p) => !p.activeTo || activeFrom < p.activeTo)
      )
        throw new Error('Start must follow previous periods and cannot be in the future.');
      body = { version: worker.version, activeFrom, reason } satisfies Schemas['WorkerOpenPeriod'];
      path = '/workers/' + worker.id + '/open-period';
      break;
    }
    default: {
      const status = v['status'];
      if (kind !== 'VOID' && status !== 'PRESENT' && status !== 'ABSENT' && status !== 'EXCUSED')
        throw new Error('Select an explicit attendance status.');
      if (kind === 'RECORD') {
        const attendanceDate = calendarDate(editor.date ?? '');
        if (attendanceDate > today || !editor.workerId)
          throw new Error('Select an eligible worker and a date no later than today.');
        body = {
          workerRegistrationId: editor.workerId,
          attendanceDate,
          status: status as Schemas['AttendanceRecord']['status'],
          ...(reason ? { backdateReason: reason } : {}),
        } satisfies Schemas['AttendanceRecord'];
        path = '/attendance/days';
      } else {
        if (!day) throw new Error('Select an attendance record.');
        if (kind === 'CORRECT' && status === day.status)
          throw new Error('Select a different status.');
        body =
          kind === 'VOID'
            ? ({ version: day.version, reason } satisfies Schemas['AttendanceVoid'])
            : ({
                version: day.version,
                reason,
                status: status as Schemas['AttendanceChange']['status'],
              } satisfies Schemas['AttendanceChange']);
        path =
          '/attendance/days/' +
          day.id +
          '/' +
          { CORRECT: 'corrections', VOID: 'void', RERECORD: 're-record' }[kind];
      }
    }
  }
  return { method, path, body, key: crypto.randomUUID() };
}
