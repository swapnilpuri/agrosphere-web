import { BlockWrite, DivisionWrite, EstateWrite } from '../../api/estate/estate.api';

export type RecordKind = 'estate' | 'division' | 'block';
export interface Option {
  value: string;
  label: string;
}
export interface Field {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: string;
  maxLength?: number;
  pattern?: string;
  options?: Option[];
  hint?: string;
}
export type Values = Record<string, string | number | null>;

function text(data: FormData, name: string, maximum: number): string {
  const value = String(data.get(name) ?? '').trim();
  if (!value || value.length > maximum) throw new Error('Supply a valid ' + name + '.');
  return value;
}
function code(data: FormData, name: string) {
  const value = text(data, name, 64).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(value))
    throw new Error('Codes may contain letters, numbers, underscores and hyphens.');
  return value;
}
function decimal(data: FormData, name: string, optional = false): number | null {
  const value = String(data.get(name) ?? '').trim();
  if (!value && optional) return null;
  if (!/^\d+(?:\.\d{1,4})?$/.test(value) || Number(value) > 9999999999.9999)
    throw new Error('Areas must be nonnegative hectares with at most four decimal places.');
  return Number(value);
}
function count(data: FormData, name: string) {
  const value = String(data.get(name) ?? '');
  if (!/^\d+$/.test(value) || Number(value) > 2147483647)
    throw new Error('Supply a nonnegative whole tree count.');
  return Number(value);
}
function status(data: FormData): 'ACTIVE' | 'INACTIVE' {
  const value = data.get('status');
  if (value !== 'ACTIVE' && value !== 'INACTIVE') throw new Error('Choose a status.');
  return value;
}
export function estateBody(data: FormData, version?: number): EstateWrite {
  const country = text(data, 'countryCode', 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new Error('Use a two-letter country code.');
  const timezone = text(data, 'timezone', 100);
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
  } catch {
    throw new Error('Supply an IANA timezone, such as Asia/Colombo or America/Chicago.');
  }
  return {
    estateCode: code(data, 'estateCode'),
    name: text(data, 'name', 200),
    countryCode: country,
    timezone,
    totalAreaHectares: decimal(data, 'totalAreaHectares', true),
    status: status(data),
    ...(version === undefined ? {} : { version }),
  };
}
export function divisionBody(data: FormData, estateId: string, version?: number): DivisionWrite {
  return {
    estateId,
    divisionCode: code(data, 'divisionCode'),
    name: text(data, 'name', 200),
    status: status(data),
    ...(version === undefined ? {} : { version }),
  };
}
export function blockBody(
  data: FormData,
  estateId: string,
  allowedDivisions: string[],
  version?: number,
): BlockWrite {
  const divisionId = text(data, 'divisionId', 36);
  if (!allowedDivisions.includes(divisionId)) throw new Error('Choose a division in this estate.');
  const plantedTreeCount = count(data, 'plantedTreeCount');
  const tappableTreeCount = count(data, 'tappableTreeCount');
  if (tappableTreeCount > plantedTreeCount)
    throw new Error('Tappable trees cannot exceed planted trees.');
  const plantingDate = String(data.get('plantingDate') ?? '').trim() || null;
  if (
    plantingDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(plantingDate) ||
      !Number.isFinite(Date.parse(plantingDate)) ||
      new Date(plantingDate).toISOString().slice(0, 10) !== plantingDate)
  )
    throw new Error('Supply a valid planting date.');
  return {
    estateId,
    divisionId,
    blockCode: code(data, 'blockCode'),
    name: text(data, 'name', 200),
    cropType: 'RUBBER',
    rubberCloneCode: data.get('rubberCloneCode') ? code(data, 'rubberCloneCode') : null,
    plantingDate,
    plantedAreaHectares: decimal(data, 'plantedAreaHectares')!,
    plantedTreeCount,
    tappableTreeCount,
    status: status(data),
    ...(version === undefined ? {} : { version }),
  };
}

const codeField = (name: string, label: string): Field => ({
  name,
  label,
  required: true,
  maxLength: 64,
});
export function fields(kind: RecordKind, divisions: Option[], clones: Option[]): Field[] {
  const result: Field[] = [
    codeField(
      kind === 'estate' ? 'estateCode' : kind === 'division' ? 'divisionCode' : 'blockCode',
      kind === 'block' ? 'Field code' : 'Code',
    ),
    { name: 'name', label: 'Name', required: true, maxLength: 200 },
  ];
  if (kind === 'estate')
    result.push(
      {
        name: 'countryCode',
        label: 'Country code',
        required: true,
        pattern: '[A-Za-z]{2}',
        maxLength: 2,
        hint: 'GA = Gabon; MW = Malawi. Other two-letter country codes are supported.',
      },
      {
        name: 'timezone',
        label: 'Timezone',
        required: true,
        maxLength: 100,
        hint: 'Gabon: Africa/Libreville. Malawi: Africa/Blantyre.',
      },
      {
        name: 'totalAreaHectares',
        label: 'Total area (ha)',
        type: 'number',
        min: 0,
        max: 9999999999.9999,
        step: '0.0001',
        hint: 'Leave blank if unknown.',
      },
    );
  if (kind === 'block')
    result.push(
      { name: 'divisionId', label: 'Division', required: true, options: divisions },
      { name: 'rubberCloneCode', label: 'Rubber clone', options: clones },
      { name: 'plantingDate', label: 'Planting date', type: 'date' },
      {
        name: 'plantedAreaHectares',
        label: 'Planted area (ha)',
        type: 'number',
        required: true,
        min: 0,
        max: 9999999999.9999,
        step: '0.0001',
      },
      {
        name: 'plantedTreeCount',
        label: 'Planted trees',
        type: 'number',
        required: true,
        min: 0,
        max: 2147483647,
        step: '1',
      },
      {
        name: 'tappableTreeCount',
        label: 'Tappable trees',
        type: 'number',
        required: true,
        min: 0,
        max: 2147483647,
        step: '1',
      },
    );
  result.push({
    name: 'status',
    label: 'Status',
    required: true,
    options: [
      { value: 'ACTIVE', label: 'Active' },
      { value: 'INACTIVE', label: 'Inactive' },
    ],
  });
  return result;
}
