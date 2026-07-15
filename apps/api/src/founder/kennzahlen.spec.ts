import {
  computeFreeLiquidity,
  rollupEmployees,
  rollupPartners,
  rollupCommercial,
  RepRollupLine,
} from './kennzahlen';

describe('Founder KPI roll-ups (I-27, ch. 11.1)', () => {
  describe('free operating liquidity (ch. 18: reserves reduce free liquidity)', () => {
    it('subtracts every committed obligation from the confirmed inflow', () => {
      const r = computeFreeLiquidity({
        bestaetigterSwaUmsatz: 10000,
        faelligeAuszahlungen: 3000,
        arbeitgeberkosten: 600,
        stornoKontoReserviert: 500,
        gebundeneGewerbeRuecklage: 1200,
        offeneClawbackForderungen: 200,
      });
      // 10000 - 3000 - 600 - 500 - 1200 - 200
      expect(r.wert).toBe(4500);
      expect(r.komponenten.gebundeneGewerbeRuecklage).toBe(1200);
    });

    it('can go negative when reserves are committed before revenue is confirmed', () => {
      const r = computeFreeLiquidity({
        bestaetigterSwaUmsatz: 0,
        faelligeAuszahlungen: 800,
        arbeitgeberkosten: 160,
        stornoKontoReserviert: 0,
        gebundeneGewerbeRuecklage: 960,
        offeneClawbackForderungen: 0,
      });
      expect(r.wert).toBe(-1920);
    });

    it('reserves and storno buffer each reduce the figure', () => {
      const base = {
        bestaetigterSwaUmsatz: 5000,
        faelligeAuszahlungen: 0,
        arbeitgeberkosten: 0,
        stornoKontoReserviert: 0,
        gebundeneGewerbeRuecklage: 0,
        offeneClawbackForderungen: 0,
      };
      const withReserve = computeFreeLiquidity({ ...base, gebundeneGewerbeRuecklage: 1000 });
      const withStorno = computeFreeLiquidity({ ...base, stornoKontoReserviert: 400 });
      expect(withReserve.wert).toBe(4000);
      expect(withStorno.wert).toBe(4600);
    });
  });

  const reps: RepRollupLine[] = [
    { repId: 'e1', isPartner: false, variableProvision: 2730, auszahlung: 2457, negativsaldoAfter: 0, stornoEinbehalt: 273 },
    { repId: 'e2', isPartner: false, variableProvision: 1000, auszahlung: 900, negativsaldoAfter: 150, stornoEinbehalt: 100 },
    { repId: 'p1', isPartner: true, variableProvision: 1680, auszahlung: 1680, negativsaldoAfter: 0, stornoEinbehalt: 0 },
  ];

  describe('rollupEmployees', () => {
    it('sums employees only, and reports gross-salary basis + employer cost separately', () => {
      const t = rollupEmployees(reps, { fixum: 1800, employerCostRate: 0.2 });
      expect(t.anzahl).toBe(2);
      expect(t.provision).toBe(3730);
      expect(t.nettoAuszahlung).toBe(3357);
      expect(t.bruttoGehaltBasis).toBe(3600); // 2 × 1800 — a gross payroll figure
      expect(t.negativsaldoGesamt).toBe(150);
      expect(t.stornoEinbehalt).toBe(373);
      expect(t.arbeitgeberkosten).toBe(round(3357 * 0.2));
      expect(t.deckungsbeitrag).toBe(round(3730 - 3357 * 0.2));
    });
  });

  describe('rollupPartners', () => {
    it('reports partner payout net and BlitzON margin against confirmed SWA revenue', () => {
      const t = rollupPartners(reps, { offeneRuecklage: 500, bestaetigterSwaUmsatzPartner: 2400 });
      expect(t.anzahl).toBe(1);
      expect(t.umsatz).toBe(1680);
      expect(t.nettoAuszahlung).toBe(1680);
      expect(t.offeneRuecklage).toBe(500);
      expect(t.blitzonMarge).toBe(720); // 2400 − 1680
    });
  });

  describe('rollupCommercial', () => {
    it('passes through the aggregate with the under-funding and risk counts', () => {
      const t = rollupCommercial({
        anzahl: 1,
        gesamtProvision: 4800,
        sofortAnteil: 1200,
        ruecklageAnteil: 1200,
        reserveTarget: 960,
        reserveActual: 800,
        unterdeckung: 160,
        risiken: 1,
      });
      expect(t.gesamtProvision).toBe(4800);
      expect(t.unterdeckung).toBe(160);
      expect(t.risiken).toBe(1);
    });
  });
});

function round(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
