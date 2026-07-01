import { VertragStatus } from '@blitzon/shared';
import {
  buildHeaderMap,
  excelSerialToIso,
  mapRow,
  normalizeHeader,
  normalizeName,
  parseDateValue,
  parseNumberValue,
  resolveStatus,
} from './import-normalizer';

describe('normalizeHeader', () => {
  it('strips diacritics, case and punctuation', () => {
    expect(normalizeHeader('Straße / Hs-Nr.')).toBe('strassehsnr');
    expect(normalizeHeader('Verkäufer')).toBe('verkaeufer');
  });
});

describe('buildHeaderMap', () => {
  it('maps known aliases regardless of casing/spacing', () => {
    const map = buildHeaderMap(['Joules-ID', 'Verkäufer', 'Produkt', 'Lieferbeginn', 'Status', 'Sonstiges']);
    expect(map.get('joulesId')).toBe('Joules-ID');
    expect(map.get('repName')).toBe('Verkäufer');
    expect(map.get('produktName')).toBe('Produkt');
    expect(map.get('lieferbeginn')).toBe('Lieferbeginn');
    expect(map.get('status')).toBe('Status');
    expect(map.has('kunde')).toBe(false);
  });
});

describe('excelSerialToIso', () => {
  it('converts a known Excel serial to ISO', () => {
    // 45658 == 2025-01-01 in Excel's 1900 date system
    expect(excelSerialToIso(45658)).toBe('2025-01-01');
  });
});

describe('parseDateValue', () => {
  it('returns null for empty/serial-0 values', () => {
    expect(parseDateValue(null)).toBeNull();
    expect(parseDateValue('')).toBeNull();
    expect(parseDateValue(0)).toBeNull();
  });

  it('parses Excel serial numbers', () => {
    expect(parseDateValue(45658)).toBe('2025-01-01');
  });

  it('parses ISO date strings', () => {
    expect(parseDateValue('2026-07-15')).toBe('2026-07-15');
  });

  it('parses German DD.MM.YYYY dates', () => {
    expect(parseDateValue('15.07.2026')).toBe('2026-07-15');
  });

  it('parses a Date instance', () => {
    expect(parseDateValue(new Date(Date.UTC(2026, 6, 15)))).toBe('2026-07-15');
  });
});

describe('parseNumberValue', () => {
  it('parses German thousand/decimal separators', () => {
    expect(parseNumberValue('1.234,5')).toBe(1234.5);
  });

  it('passes through plain numbers', () => {
    expect(parseNumberValue(3500)).toBe(3500);
  });

  it('returns null for empty values', () => {
    expect(parseNumberValue(null)).toBeNull();
    expect(parseNumberValue('')).toBeNull();
  });
});

describe('mapRow', () => {
  it('extracts canonical fields via the header map', () => {
    const headerMap = buildHeaderMap(['Joules-ID', 'Verkäufer', 'Lieferbeginn', 'Verbrauch']);
    const row = mapRow({ 'Joules-ID': 'J-1', 'Verkäufer': ' Max Mustermann ', Lieferbeginn: 45658, Verbrauch: '1.500,0' }, headerMap);
    expect(row.joulesId).toBe('J-1');
    expect(row.repName).toBe('Max Mustermann');
    expect(row.lieferbeginn).toBe('2025-01-01');
    expect(row.verbrauch).toBe(1500);
    expect(row.kunde).toBeNull();
  });
});

describe('normalizeName', () => {
  it('trims and lowercases', () => {
    expect(normalizeName('  Max Mustermann ')).toBe('max mustermann');
  });
});

describe('resolveStatus', () => {
  it('matches known statuses case-insensitively', () => {
    expect(resolveStatus('in belieferung')).toBe(VertragStatus.InBelieferung);
    expect(resolveStatus('Widerruf')).toBe(VertragStatus.Widerruf);
  });

  it('falls back to Datencheck for unknown or empty status', () => {
    expect(resolveStatus(null)).toBe(VertragStatus.Datencheck);
    expect(resolveStatus('Unbekannter Status')).toBe(VertragStatus.Datencheck);
  });
});
