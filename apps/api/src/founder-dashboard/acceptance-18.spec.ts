import { AcceptanceEvidence, evaluateAcceptanceCriteria } from './acceptance-18';

/** Evidence from a clean, fully-satisfying Phase-1 system. */
function cleanEvidence(overrides: Partial<AcceptanceEvidence> = {}): AcceptanceEvidence {
  return {
    periode: '2026-03',
    bookableContracts: 50,
    contractsOhneAuftragsnummer: 0,
    contractsMitOffenerSwa: 3,
    bruttoDarstellungen: 0,
    auszahlungenOhneBestaetigung: 0,
    retroTierTestsGruen: true,
    sonderfaelleVerifiziert: true,
    kontenGetrennt: true,
    ruecklageSoll: 960,
    freieLiquiditaetMitRuecklage: 4300,
    freieLiquiditaetOhneRuecklage: 5260,
    clawbacksGesamt: 2,
    clawbacksReconciled: 2,
    geschlosseneMonate: 2,
    nachtragszeilen: 1,
    freieLiquiditaetVorhanden: true,
    warnungenGesamt: 6,
    ...overrides,
  };
}

describe('evaluateAcceptanceCriteria (I-37, ch. 18)', () => {
  it('reports all 11 criteria met for a clean system', () => {
    const r = evaluateAcceptanceCriteria(cleanEvidence());
    expect(r.gesamt).toBe(11);
    expect(r.erfuellt).toBe(11);
    expect(r.alleErfuellt).toBe(true);
    expect(r.kriterien.map((k) => k.nr)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('fails criterion 1 when a bookable contract lacks an SWA order number', () => {
    const r = evaluateAcceptanceCriteria(cleanEvidence({ contractsOhneAuftragsnummer: 2 }));
    expect(r.alleErfuellt).toBe(false);
    expect(r.kriterien.find((k) => k.nr === 1)?.erfuellt).toBe(false);
  });

  it('fails criterion 4 when a payout is due without a confirmed SWA half', () => {
    const r = evaluateAcceptanceCriteria(cleanEvidence({ auszahlungenOhneBestaetigung: 1 }));
    expect(r.kriterien.find((k) => k.nr === 4)?.erfuellt).toBe(false);
  });

  it('criterion 8 requires reserves to strictly reduce free liquidity when a reserve exists', () => {
    const notReducing = evaluateAcceptanceCriteria(
      cleanEvidence({ ruecklageSoll: 500, freieLiquiditaetMitRuecklage: 4300, freieLiquiditaetOhneRuecklage: 4300 }),
    );
    expect(notReducing.kriterien.find((k) => k.nr === 8)?.erfuellt).toBe(false);

    const noReserve = evaluateAcceptanceCriteria(
      cleanEvidence({ ruecklageSoll: 0, freieLiquiditaetMitRuecklage: 4300, freieLiquiditaetOhneRuecklage: 4300 }),
    );
    expect(noReserve.kriterien.find((k) => k.nr === 8)?.erfuellt).toBe(true);
  });

  it('fails criterion 9 when a clawback does not reconcile', () => {
    const r = evaluateAcceptanceCriteria(cleanEvidence({ clawbacksGesamt: 3, clawbacksReconciled: 2 }));
    expect(r.kriterien.find((k) => k.nr === 9)?.erfuellt).toBe(false);
  });
});
