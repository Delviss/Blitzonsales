import { evaluateAcceptance, AcceptanceSignals } from './akzeptanz';

/**
 * I-37 release gate: the 11 acceptance criteria of Fachkonzept ch. 18. This
 * suite pins that, with all invariants met, every criterion passes — and that a
 * regression on any single invariant flips exactly its criterion to red (so the
 * checklist is a real gate, not always-green).
 */
const ALL_MET: AcceptanceSignals = {
  alleZeilenMitAuftragsnummer: true,
  swaListeIstWahrheit: true,
  nettoStandard: true,
  keineAuszahlungVorBestaetigung: true,
  retroStaffelBestanden: true,
  mindestUndBestandBehandelt: true,
  kontenGetrennt: true,
  ruecklagenMindernLiquiditaet: true,
  clawbackOffsetReihenfolge: true,
  monateUnveraenderlichNachtraege: true,
  liquiditaetUndWarnungenSichtbar: true,
};

describe('Acceptance criteria ch. 18 (I-37 release gate)', () => {
  it('passes all 11 criteria when every invariant is met', () => {
    const r = evaluateAcceptance(ALL_MET);
    expect(r.gesamt).toBe(11);
    expect(r.erfuellt).toBe(11);
    expect(r.alleErfuellt).toBe(true);
    // Each criterion carries its chapter + implementing issues for traceability.
    expect(r.kriterien.every((k) => k.kapitel.startsWith('18.') && k.issues.length > 0)).toBe(true);
  });

  it('flips exactly the affected criterion to red on a regression', () => {
    const r = evaluateAcceptance({ ...ALL_MET, ruecklagenMindernLiquiditaet: false });
    expect(r.alleErfuellt).toBe(false);
    expect(r.erfuellt).toBe(10);
    const failed = r.kriterien.filter((k) => !k.erfuellt);
    expect(failed).toHaveLength(1);
    expect(failed[0].kapitel).toBe('18.8');
  });

  it('reports every criterion missing when nothing is satisfied', () => {
    const none = Object.fromEntries(Object.keys(ALL_MET).map((k) => [k, false])) as unknown as AcceptanceSignals;
    const r = evaluateAcceptance(none);
    expect(r.erfuellt).toBe(0);
    expect(r.alleErfuellt).toBe(false);
  });
});
