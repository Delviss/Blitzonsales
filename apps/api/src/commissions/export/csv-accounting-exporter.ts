import { CommissionRun } from '../../entities/commission-run.entity';
import { CommissionLine } from '../../entities/commission-line.entity';
import { AccountingExporter, AccountingExportResult, csvEscape, formatDecimalComma } from './accounting-exporter';

const HEADER = ['Belegnummer', 'Verkaeufer', 'IBAN', 'Vertrag', 'Kunde', 'Betrag', 'Typ', 'Periode'];

/** Default accounting export: a generic semicolon-delimited CSV, German decimal comma. */
export class CsvAccountingExporter implements AccountingExporter {
  readonly format = 'csv';

  export(run: CommissionRun, lines: CommissionLine[]): AccountingExportResult {
    const rows = lines.map(l => [
      l.contract?.joulesId ?? '',
      l.rep?.name ?? '',
      l.rep?.iban ?? '',
      l.contract?.joulesId ?? '',
      l.contract?.kunde ?? '',
      formatDecimalComma(Number(l.betrag)),
      l.typ,
      run.periode,
    ]);
    const csv = [HEADER, ...rows].map(r => r.map(csvEscape).join(';')).join('\r\n');
    return {
      filename: `buchhaltung-csv-${run.periode}-${run.id}.csv`,
      buffer: Buffer.from(csv, 'utf8'),
      contentType: 'text/csv; charset=utf-8',
    };
  }
}
