import { CommissionRun } from '../../entities/commission-run.entity';
import { CommissionLine } from '../../entities/commission-line.entity';
import { AccountingExporter, AccountingExportResult } from './accounting-exporter';
import { CsvAccountingExporter } from './csv-accounting-exporter';

/**
 * PLACEHOLDER: the real DATEV column spec (Belegfeld/Konto/Gegenkonto/BU-Schlüssel,
 * EXTF header, etc.) has not been provided by the accountant yet (see PROGRESS.md
 * open question). Producing a fabricated EXTF-formatted file risks accounting
 * silently importing wrong data, so until the spec is confirmed this exporter
 * reuses the generic CSV layout under a DATEV-labelled filename. Replace the body
 * of `export()` with the real DATEV mapping once the spec is confirmed; the
 * interface and registry wiring already support the swap without further changes.
 */
export class DatevAccountingExporter implements AccountingExporter {
  readonly format = 'datev';
  private readonly fallback = new CsvAccountingExporter();

  export(run: CommissionRun, lines: CommissionLine[]): AccountingExportResult {
    const generic = this.fallback.export(run, lines);
    return { ...generic, filename: `datev-platzhalter-${run.periode}-${run.id}.csv` };
  }
}
