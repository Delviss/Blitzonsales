import { CommissionRun } from '../../entities/commission-run.entity';
import { CommissionLine } from '../../entities/commission-line.entity';

export interface AccountingExportResult {
  filename: string;
  buffer: Buffer;
  contentType: string;
}

/**
 * A pluggable accounting export format. CSV is the production default; DATEV is
 * registered as a placeholder so the real column mapping can be dropped in later
 * without touching the controller/service that call this interface (see
 * PROGRESS.md open question on the DATEV column spec).
 */
export interface AccountingExporter {
  readonly format: string;
  export(run: CommissionRun, lines: CommissionLine[]): AccountingExportResult;
}

export function formatDecimalComma(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

export function csvEscape(value: string): string {
  if (value.includes(';') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
