import { BadRequestException } from '@nestjs/common';
import { AccountingExporter } from './accounting-exporter';
import { CsvAccountingExporter } from './csv-accounting-exporter';
import { DatevAccountingExporter } from './datev-accounting-exporter';

const EXPORTERS: Record<string, AccountingExporter> = {
  csv: new CsvAccountingExporter(),
  datev: new DatevAccountingExporter(),
};

export function getAccountingExporter(format = 'csv'): AccountingExporter {
  const exporter = EXPORTERS[format];
  if (!exporter) {
    throw new BadRequestException(`Unbekanntes Exportformat "${format}". Verfügbar: ${Object.keys(EXPORTERS).join(', ')}.`);
  }
  return exporter;
}
