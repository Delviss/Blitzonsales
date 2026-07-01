import { getAccountingExporter } from './accounting-exporter.registry';
import { CommissionRun } from '../../entities/commission-run.entity';
import { CommissionLine } from '../../entities/commission-line.entity';

function makeRun(): CommissionRun {
  return { id: 'run1', periode: '2026-05', organisationId: null, organisation: null, status: 'freigegeben', freigegebenVon: null, freigegebenVonUser: null, freigegebenAm: null, createdBy: null, createdByUser: null } as CommissionRun;
}

function makeLine(betrag: number): CommissionLine {
  return {
    id: 'l1', runId: 'run1', run: null, contractId: 'c1',
    contract: { joulesId: 'SWG123', kunde: 'Max Mustermann' } as any,
    repId: 'r1', rep: { name: 'Anna Fuchs', iban: 'DE00' } as any,
    regelId: null, regel: null, betrag, typ: 'normal', storniertDurch: null, begruendung: null, datencheck: false,
  } as CommissionLine;
}

describe('accounting exporter registry', () => {
  it('defaults to the csv exporter', () => {
    const exporter = getAccountingExporter();
    expect(exporter.format).toBe('csv');
  });

  it('produces a semicolon-delimited CSV with German decimal comma', () => {
    const exporter = getAccountingExporter('csv');
    const result = exporter.export(makeRun(), [makeLine(50.5)]);
    const text = result.buffer.toString('utf8');
    expect(text).toContain('SWG123');
    expect(text).toContain('50,50');
    expect(text.split(';').length).toBeGreaterThan(1);
  });

  it('serves a datev placeholder export without fabricating a fake DATEV header', () => {
    const exporter = getAccountingExporter('datev');
    const result = exporter.export(makeRun(), [makeLine(-30)]);
    expect(result.filename).toContain('datev-platzhalter');
    expect(result.buffer.toString('utf8')).toContain('-30,00');
  });

  it('rejects unknown export formats', () => {
    expect(() => getAccountingExporter('xml')).toThrow(/Unbekanntes Exportformat/);
  });
});
