import { ClientType, VertragStatus } from '@blitzon/shared';
import { classifyHistoricalRisk, isAtRisk, monthsBetween, RiskContractView } from './historical-migration';

const priv = (over: Partial<RiskContractView> = {}): RiskContractView => ({
  clientType: ClientType.Privat,
  status: VertragStatus.InBelieferung,
  referenceDate: '2026-07-13',
  erfassungsdatum: '2026-05-01',
  lieferbeginn: '2026-06-01',
  stornoProtectionMonths: 6,
  swaGesamtprovision: null,
  swaZahlbetrag: null,
  reserveOffen: false,
  retentionOffen: false,
  gesamtverbrauch: null,
  erwarteterVerbrauch: null,
  ...over,
});

const gew = (over: Partial<RiskContractView> = {}): RiskContractView =>
  priv({ clientType: ClientType.Gewerbe, reserveOffen: true, retentionOffen: true, ...over });

describe('monthsBetween', () => {
  it('counts whole elapsed months', () => {
    expect(monthsBetween('2026-01-01', '2026-07-01')).toBe(6);
    expect(monthsBetween('2026-06-20', '2026-07-13')).toBe(0);
    expect(monthsBetween('2026-01-15', '2026-07-13')).toBe(5);
  });
});

describe('classifyHistoricalRisk — private', () => {
  it('flags a private contract still inside the storno window', () => {
    expect(classifyHistoricalRisk(priv({ lieferbeginn: '2026-06-01' }))).toEqual(['privat_stornohaftung']);
    expect(isAtRisk(priv({ lieferbeginn: '2026-06-01' }))).toBe(true);
  });

  it('archives a private contract past the storno window', () => {
    expect(classifyHistoricalRisk(priv({ lieferbeginn: '2025-01-01' }))).toEqual([]);
    expect(isAtRisk(priv({ lieferbeginn: '2025-01-01' }))).toBe(false);
  });

  it('does not flag an already-reversed private contract', () => {
    expect(isAtRisk(priv({ status: VertragStatus.Storno }))).toBe(false);
  });
});

describe('classifyHistoricalRisk — commercial', () => {
  it('flags all open commercial exposures', () => {
    const reasons = classifyHistoricalRisk(
      gew({ swaGesamtprovision: 4800, swaZahlbetrag: 2400, gesamtverbrauch: 100000, erwarteterVerbrauch: 120000 }),
    );
    expect(reasons).toEqual(
      expect.arrayContaining([
        'gewerbe_zweite_swa_haelfte',
        'gewerbe_retention_offen',
        'gewerbe_ruecklage_offen',
        'gewerbe_unterverbrauch',
      ]),
    );
  });

  it('treats an unknown SWA split as an open 2nd half (conservative)', () => {
    expect(classifyHistoricalRisk(gew({ swaGesamtprovision: null, swaZahlbetrag: null, reserveOffen: false, retentionOffen: false }))).toEqual([
      'gewerbe_zweite_swa_haelfte',
    ]);
  });

  it('archives a fully-settled commercial contract', () => {
    const settled = gew({
      swaGesamtprovision: 4800,
      swaZahlbetrag: 4800,
      reserveOffen: false,
      retentionOffen: false,
      gesamtverbrauch: 120000,
      erwarteterVerbrauch: 120000,
    });
    expect(isAtRisk(settled)).toBe(false);
  });

  it('carries no exposure for a rejected commercial contract', () => {
    expect(isAtRisk(gew({ status: VertragStatus.Abgelehnt }))).toBe(false);
  });
});
