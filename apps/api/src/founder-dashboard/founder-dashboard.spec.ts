import { computeFounderDashboard, FounderDashboardInput } from './founder-dashboard';

/** A baseline input with a clean, fully-net set of figures. */
function baseInput(overrides: Partial<FounderDashboardInput> = {}): FounderDashboardInput {
  return {
    periode: '2026-03',
    swaRevenue: { bestaetigtNetto: 10000, erwartetNetto: 9500, vormonatNetto: 8000, ytdNetto: 27000 },
    newCustomers: { anzahl: 42, erreichteStufe: 90, naechsteStufeAb: 80, naechsteStufeSatz: 100, anzahlAbweichungen: 1 },
    employees: {
      variableProvision: 3600,
      bruttogehaltBasis: 5000,
      auszahlungNetto: 3000,
      negativsaldo: 200,
      arbeitgeberkosten: 600,
      stornokontoReserviert: 900,
      offeneClawbacks: 150,
    },
    partners: { swaErtragNetto: 2000, auszahlungNetto: 1200, offeneRueckbehalte: 300, stornoReserviert: 0 },
    commercial: {
      gesamtprovision: 4800,
      ersteHaelfteBestaetigt: 2400,
      zweiteHaelfteBestaetigt: 2400,
      offeneRueckbehalte: 1200,
      ruecklageSoll: 960,
      ruecklageIst: 960,
    },
    liquidityFlows: { ruecklageSollPeriode: 500, stornoEinbehaltPeriode: 400 },
    warnings: { rot: 1, gelb: 2, info: 3, gesamt: 6 },
    dataQuality: { letzterSync: null, gesperrteVertraege: 0, offeneFehler: 0, unbekannteVerkaeufer: 0, unbekannteOrganisationen: 0 },
    ...overrides,
  };
}

describe('computeFounderDashboard (I-27/I-29, ch. 11.1)', () => {
  it('derives the free-operating-liquidity waterfall from period flows', () => {
    const d = computeFounderDashboard(baseInput());
    const w = d.freieBetriebsliquiditaet;
    // 10000 − 3000 (employees) − 1200 (partners) − 600 (employer cost) − 500 (reserve) − 400 (storno) = 4300
    expect(w.swaErtragBestaetigtNetto).toBe(10000);
    expect(w.minusAuszahlungMitarbeiter).toBe(3000);
    expect(w.minusAuszahlungPartner).toBe(1200);
    expect(w.minusArbeitgeberkosten).toBe(600);
    expect(w.minusGewerbeRuecklageSoll).toBe(500);
    expect(w.minusStornoReserviert).toBe(400);
    expect(w.freieBetriebsliquiditaet).toBe(4300);
  });

  it('reserves reduce free liquidity (ch. 18 acceptance criterion 8)', () => {
    const withReserve = computeFounderDashboard(baseInput());
    const withoutReserve = computeFounderDashboard(
      baseInput({ liquidityFlows: { ruecklageSollPeriode: 0, stornoEinbehaltPeriode: 400 } }),
    );
    expect(withReserve.freieBetriebsliquiditaet.freieBetriebsliquiditaet).toBeLessThan(
      withoutReserve.freieBetriebsliquiditaet.freieBetriebsliquiditaet,
    );
    expect(withoutReserve.freieBetriebsliquiditaet.freieBetriebsliquiditaet - withReserve.freieBetriebsliquiditaet.freieBetriebsliquiditaet).toBeCloseTo(500, 2);
  });

  it('marks the dashboard net throughout and keeps the base-salary basis as a labelled gross figure (I-29)', () => {
    const d = computeFounderDashboard(baseInput());
    expect(d.nettoDarstellung).toBe(true);
    // The gross-salary basis is carried through unchanged; the interface names it explicitly.
    expect(d.employees.bruttogehaltBasis).toBe(5000);
  });

  it('computes the SWA-revenue deviation and the month-over-month trend (net)', () => {
    const d = computeFounderDashboard(baseInput());
    expect(d.swaRevenue.abweichungNetto).toBe(500); // 10000 − 9500
    expect(d.swaRevenue.trendVormonat).toBe(2000); // 10000 − 8000
  });

  it('derives the employee contribution, partner BlitzON margin and commercial under-funding', () => {
    const d = computeFounderDashboard(
      baseInput({
        commercial: {
          gesamtprovision: 4800,
          ersteHaelfteBestaetigt: 2400,
          zweiteHaelfteBestaetigt: 0,
          offeneRueckbehalte: 1200,
          ruecklageSoll: 960,
          ruecklageIst: 600,
        },
      }),
    );
    expect(d.employees.deckungsbeitrag).toBe(6400); // 10000 − 3000 − 600
    expect(d.partners.blitzonMarge).toBe(500); // 2000 − 1200 − 300
    expect(d.commercial.unterdeckung).toBe(360); // 960 − 600
  });
});
