import { VertragStatus } from '@blitzon/shared';

export const CANONICAL_FIELDS = [
  'joulesId',
  'repName',
  'produktName',
  'kunde',
  'plz',
  'ort',
  'strHsnr',
  'verbrauch',
  'erfassungsdatum',
  'lieferbeginn',
  'vertragEnde',
  'status',
] as const;

export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

export interface NormalizedRow {
  joulesId: string | null;
  repName: string | null;
  produktName: string | null;
  kunde: string | null;
  plz: string | null;
  ort: string | null;
  strHsnr: string | null;
  verbrauch: number | null;
  erfassungsdatum: string | null;
  lieferbeginn: string | null;
  vertragEnde: string | null;
  status: string | null;
}

/**
 * Best-effort aliases for the Joules "Verträge / Anträge" export tab.
 * Real column headers should be confirmed against a sample export; see
 * PROGRESS.md open questions.
 */
const HEADER_ALIASES: Record<CanonicalField, string[]> = {
  joulesId: ['joulesid', 'joules_id', 'id', 'antragsnummer', 'antragsid', 'vertragsnummer'],
  repName: ['verkaeufer', 'vertriebspartner', 'berater', 'mitarbeiter', 'rep', 'handelsvertreter', 'aussendienst'],
  produktName: ['produkt', 'tarif', 'produktname'],
  kunde: ['kunde', 'kundenname', 'name', 'kundenbezeichnung'],
  plz: ['plz', 'postleitzahl'],
  ort: ['ort', 'stadt', 'wohnort'],
  strHsnr: ['strasse', 'str', 'strhsnr', 'adresse', 'strassehsnr'],
  verbrauch: ['verbrauch', 'jahresverbrauch', 'kwh', 'verbrauchkwh'],
  erfassungsdatum: ['erfassungsdatum', 'erfasstam', 'erfasstdatum', 'datum'],
  lieferbeginn: ['lieferbeginn', 'lieferstart', 'beginn', 'lieferdatum'],
  // I-33: contract end is stored for every contract for later existing-customer outreach.
  vertragEnde: ['vertragende', 'vertragsende', 'laufzeitende', 'endedatum', 'contractend', 'enddatum'],
  status: ['status', 'vertragsstatus', 'antragsstatus'],
};

export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/\u00e4/g, 'ae')
    .replace(/\u00f6/g, 'oe')
    .replace(/\u00fc/g, 'ue')
    .replace(/\u00df/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Maps raw column headers to canonical field names, first match wins. */
export function buildHeaderMap(rawHeaders: string[]): Map<CanonicalField, string> {
  const map = new Map<CanonicalField, string>();
  const normalizedToRaw = rawHeaders.map(h => ({ raw: h, normalized: normalizeHeader(h) }));
  for (const field of CANONICAL_FIELDS) {
    const aliases = HEADER_ALIASES[field];
    const match = normalizedToRaw.find(h => aliases.includes(h.normalized));
    if (match) map.set(field, match.raw);
  }
  return map;
}

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

export function excelSerialToIso(serial: number): string {
  const ms = EXCEL_EPOCH_MS + Math.round(serial) * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Accepts a Date, an Excel serial number, an ISO string, or DD.MM.YYYY. Returns null when empty or serial 0. */
export function parseDateValue(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (typeof raw === 'number') {
    if (raw === 0) return null;
    return excelSerialToIso(raw);
  }
  const s = String(raw).trim();
  if (!s) return null;
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const deMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (deMatch) return `${deMatch[3]}-${deMatch[2].padStart(2, '0')}-${deMatch[1].padStart(2, '0')}`;
  const serial = Number(s);
  if (!Number.isNaN(serial) && serial > 0) return excelSerialToIso(serial);
  return null;
}

export function parseNumberValue(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return raw;
  const cleaned = String(raw).trim().replace(/\./g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

function str(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s === '' ? null : s;
}

export function mapRow(raw: Record<string, unknown>, headerMap: Map<CanonicalField, string>): NormalizedRow {
  const get = (field: CanonicalField) => {
    const header = headerMap.get(field);
    return header === undefined ? null : raw[header];
  };
  return {
    joulesId: str(get('joulesId')),
    repName: str(get('repName')),
    produktName: str(get('produktName')),
    kunde: str(get('kunde')),
    plz: str(get('plz')),
    ort: str(get('ort')),
    strHsnr: str(get('strHsnr')),
    verbrauch: parseNumberValue(get('verbrauch')),
    erfassungsdatum: parseDateValue(get('erfassungsdatum')),
    lieferbeginn: parseDateValue(get('lieferbeginn')),
    vertragEnde: parseDateValue(get('vertragEnde')),
    status: str(get('status')),
  };
}

export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

const STATUS_LOOKUP = new Map<string, VertragStatus>(
  Object.values(VertragStatus).map(v => [v.toLowerCase(), v]),
);

/** Falls back to Datencheck for unrecognised/empty status so the row surfaces for backoffice review. */
export function resolveStatus(raw: string | null): VertragStatus {
  if (!raw) return VertragStatus.Datencheck;
  return STATUS_LOOKUP.get(raw.trim().toLowerCase()) ?? VertragStatus.Datencheck;
}
