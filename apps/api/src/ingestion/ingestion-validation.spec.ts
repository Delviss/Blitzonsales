import { ClientType, IngestionErrorKategorie } from '@blitzon/shared';
import { classifyRecord, IngestionRecordView, IngestionResolution, isBlocked } from './ingestion-validation';

const baseRecord = (over: Partial<IngestionRecordView> = {}): IngestionRecordView => ({
  swaOrderNumber: 'SWG0264122',
  joulesId: 'SWG0264122',
  repName: 'Sean Tyler Kreuzer',
  orgName: null,
  clientType: ClientType.Privat,
  status: 'In Belieferung',
  surchargeCt: null,
  laufzeitMonate: null,
  gesamtverbrauch: null,
  expectedSwa: null,
  actualSwa: null,
  ...over,
});

const okResolution = (over: Partial<IngestionResolution> = {}): IngestionResolution => ({
  repMatched: true,
  orgMatched: true,
  statusKnown: true,
  toleranceAbs: 1,
  ...over,
});

const kategorien = (rec: IngestionRecordView, res: IngestionResolution) =>
  classifyRecord(rec, res).map((e) => e.kategorie);

describe('classifyRecord', () => {
  it('passes a clean private record with no findings', () => {
    expect(classifyRecord(baseRecord(), okResolution())).toEqual([]);
  });

  it('flags a missing order number and blocks booking', () => {
    const errors = classifyRecord(baseRecord({ swaOrderNumber: null }), okResolution());
    expect(errors.map((e) => e.kategorie)).toContain(IngestionErrorKategorie.OrderNumberMissing);
    expect(isBlocked(errors)).toBe(true);
  });

  it('flags an unknown rep as blocking', () => {
    const errors = classifyRecord(baseRecord(), okResolution({ repMatched: false }));
    expect(errors.map((e) => e.kategorie)).toContain(IngestionErrorKategorie.UnknownRep);
    expect(isBlocked(errors)).toBe(true);
  });

  it('flags a missing rep as unassignable', () => {
    const errors = classifyRecord(baseRecord({ repName: null }), okResolution());
    expect(errors.map((e) => e.kategorie)).toContain(IngestionErrorKategorie.Unassignable);
    expect(isBlocked(errors)).toBe(true);
  });

  it('flags an unknown organisation only when a name was delivered', () => {
    expect(kategorien(baseRecord({ orgName: null }), okResolution({ orgMatched: false }))).not.toContain(
      IngestionErrorKategorie.UnknownOrg,
    );
    expect(kategorien(baseRecord({ orgName: 'Team X' }), okResolution({ orgMatched: false }))).toContain(
      IngestionErrorKategorie.UnknownOrg,
    );
  });

  it('flags a commercial contract without a term or surcharge', () => {
    const errors = classifyRecord(
      baseRecord({ clientType: ClientType.Gewerbe, laufzeitMonate: null, gesamtverbrauch: null, surchargeCt: null }),
      okResolution(),
    );
    const cats = errors.map((e) => e.kategorie);
    expect(cats).toContain(IngestionErrorKategorie.CommercialTermMissing);
    expect(cats).toContain(IngestionErrorKategorie.SurchargeInvalid);
    expect(isBlocked(errors)).toBe(true);
  });

  it('accepts a commercial contract with a positive surcharge and consumption', () => {
    const errors = classifyRecord(
      baseRecord({ clientType: ClientType.Gewerbe, gesamtverbrauch: 120000, surchargeCt: 4 }),
      okResolution(),
    );
    expect(errors).toEqual([]);
  });

  it('does not require a surcharge for a private contract', () => {
    expect(kategorien(baseRecord({ clientType: ClientType.Privat, surchargeCt: null }), okResolution())).not.toContain(
      IngestionErrorKategorie.SurchargeInvalid,
    );
  });

  it('flags an unknown status', () => {
    const errors = classifyRecord(baseRecord({ status: 'Fantasiestatus' }), okResolution({ statusKnown: false }));
    expect(errors.map((e) => e.kategorie)).toContain(IngestionErrorKategorie.StatusInvalid);
    expect(isBlocked(errors)).toBe(true);
  });

  it('surfaces a missing actual SWA commission without blocking booking', () => {
    const errors = classifyRecord(baseRecord({ expectedSwa: 160, actualSwa: null }), okResolution());
    const swa = errors.find((e) => e.kategorie === IngestionErrorKategorie.SwaUnverifiable);
    expect(swa).toBeDefined();
    expect(swa!.sperrend).toBe(false);
    expect(isBlocked(errors)).toBe(false);
  });

  it('surfaces an SWA deviation beyond tolerance without blocking', () => {
    const errors = classifyRecord(baseRecord({ expectedSwa: 160, actualSwa: 140 }), okResolution({ toleranceAbs: 1 }));
    expect(errors.map((e) => e.kategorie)).toContain(IngestionErrorKategorie.SwaUnverifiable);
    expect(isBlocked(errors)).toBe(false);
  });

  it('does not flag an SWA figure that matches within tolerance', () => {
    const errors = classifyRecord(baseRecord({ expectedSwa: 160, actualSwa: 160.4 }), okResolution({ toleranceAbs: 1 }));
    expect(errors.map((e) => e.kategorie)).not.toContain(IngestionErrorKategorie.SwaUnverifiable);
  });
});
