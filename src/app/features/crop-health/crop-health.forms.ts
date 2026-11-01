import { CropCommand, CropRow, Inspection } from './crop-health.api';
export type CropMode = 'inspections' | 'incidents';
export type CropAction =
  'create' | 'corrections' | 'amendments' | 'triage' | 'resolve' | 'reopen' | 'void';
export type CropEditor = {
  action: CropAction;
  original: CropRow | null;
  parentVersion: number | null;
  blockId: string;
  observedAt: string;
  outcome: 'CLEAR' | 'FOLLOW_UP';
  findings: string;
  category: 'PEST_SIGNS' | 'DISEASE_SIGNS' | 'TREE_DAMAGE' | 'OTHER_CROP_HEALTH';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  summary: string;
  details: string;
  reason: string;
  backdateReason: string;
  resolvedAt: string;
  resolutionNote: string;
};
export function isInspection(row: CropRow): row is Inspection {
  return 'outcome' in row;
}
export function cropEditor(
  action: CropAction,
  original: CropRow | null,
  parentVersion: number | null,
): CropEditor {
  return {
    action,
    original,
    parentVersion,
    blockId: original?.blockId ?? '',
    observedAt: original?.observedAt ?? new Date(Date.now() - 60000).toISOString(),
    outcome: original && isInspection(original) ? original.outcome : 'CLEAR',
    findings: original && isInspection(original) ? original.findings : '',
    category: original && !isInspection(original) ? original.category : 'TREE_DAMAGE',
    severity: original && !isInspection(original) ? original.severity : 'LOW',
    summary: original && !isInspection(original) ? original.summary : '',
    details: original && !isInspection(original) ? original.details : '',
    reason: '',
    backdateReason: '',
    resolvedAt: new Date(Date.now() - 1000).toISOString(),
    resolutionNote: '',
  };
}
function required(value: string, limit: number, name: string) {
  const text = value.trim();
  if (
    !text ||
    [...text].length > limit ||
    [...text].some((c) => {
      const n = c.codePointAt(0)!;
      return n < 32 || (n >= 127 && n <= 159);
    })
  )
    throw new Error(`${name} is required, without control characters, up to ${limit} characters.`);
  return text;
}
export function cropInstant(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new Error(
      'Enter a timestamp with an explicit offset, for example 2026-10-31T13:00:00+01:00.',
    );
  return value;
}
export function cropCommand(
  mode: CropMode,
  estateId: string,
  editor: CropEditor,
  key: string,
): CropCommand {
  const original = editor.original;
  const body: Record<string, unknown> = {};
  if (editor.action === 'create') {
    if (!editor.blockId) throw new Error('Select an active field.');
    Object.assign(body, { estateId, blockId: editor.blockId, dataProvenance: 'SIMULATED' });
    if (editor.backdateReason.trim())
      body['backdateReason'] = required(editor.backdateReason, 1000, 'Backdate reason');
  } else {
    if (!original) throw new Error('Load the record before making a change.');
    body[mode === 'inspections' ? 'inspectionVersion' : 'expectedVersion'] = original.version;
    body['reason'] = required(editor.reason, 1000, 'Change reason');
    if (isInspection(original) && original.linkedIncidentId)
      body['incidentVersion'] = original.linkedIncidentVersion;
    if (!isInspection(original) && original.inspectionId) {
      if (editor.parentVersion === null)
        throw new Error('Load the linked inspection before changing this incident.');
      body['inspectionVersion'] = editor.parentVersion;
    }
  }
  if (['create', 'corrections', 'amendments'].includes(editor.action)) {
    body['observedAt'] = cropInstant(editor.observedAt);
    if (mode === 'inspections') {
      body['outcome'] = editor.outcome;
      body['findings'] = required(editor.findings, 2000, 'Findings');
    }
    if (
      mode === 'incidents' ||
      (editor.outcome === 'FOLLOW_UP' &&
        (!original || (isInspection(original) && !original.linkedIncidentId)))
    ) {
      const report = {
        category: editor.category,
        severity: editor.severity,
        summary: required(editor.summary, 200, 'Summary'),
        details: required(editor.details, 2000, 'Details'),
      };
      if (mode === 'inspections') body['incident'] = report;
      else Object.assign(body, report);
    }
  }
  if (editor.action === 'resolve') {
    body['resolvedAt'] = cropInstant(editor.resolvedAt);
    body['resolutionNote'] = required(editor.resolutionNote, 1000, 'Resolution note');
  }
  return {
    path: '/' + mode + (original ? '/' + original.id + '/' + editor.action : ''),
    body: structuredClone(body),
    key,
  };
}
