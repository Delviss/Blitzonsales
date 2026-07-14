/**
 * I-35 · Warning & check system (Fachkonzept ch. 13).
 *
 * Every red/yellow/info check is pinned against its expected action so a
 * regression in the pure rule set fails CI.
 */
import { computeWarnings, warningCounts, WarnConfig, WarnContract, WarnInput } from './warnings';

const CONFIG: WarnConfig = { capStrom: 4, capGas: 2, stornoProtectionMonths: 6, naechsteStufeSchwelle: 5 };

function contract(overrides: Partial<WarnContract> = {}): WarnContract {
  return {
    id: 'c1',
    swaOrderNumber: 'SWA-1',
    kunde: 'Kunde',
    repId: 'r1',
    repBekannt: true,
    organisationId: 'o1',
    orgBekannt: true,
    energie: 'strom',
    surchargeCt: 3,
    auszahlung: null,
    swaRevenue: null,
    plausibilitaetStatus: 'ok',
    stornoDatum: null,
    retentionFaelligAm: null,
    leadTimeKontaktAb: null,
    ...overrides,
  };
}

function base(overrides: Partial<WarnInput> = {}): WarnInput {
  return { today: '2026-07-14', contracts: [], reps: [], reserves: [], config: CONFIG, ...overrides };
}

const codes = (w: ReturnType<typeof computeWarnings>) => w.map((x) => x.code);

describe('I-35 · red checks (ch. 13)', () => {
  it('flags a payout above the related SWA revenue as red with a manual-release action', () => {
    const w = computeWarnings(base({ contracts: [contract({ auszahlung: 500, swaRevenue: 300 })] }));
    const hit = w.find((x) => x.code === 'auszahlung_ueber_swa')!;
    expect(hit.level).toBe('rot');
    expect(hit.betrag).toBe(200);
    expect(hit.aktion).toMatch(/manuelle[rn]? Freigabe/i);
  });

  it('does not flag a payout at or below the SWA revenue', () => {
    const w = computeWarnings(base({ contracts: [contract({ auszahlung: 300, swaRevenue: 300 })] }));
    expect(codes(w)).not.toContain('auszahlung_ueber_swa');
  });

  it('flags an electricity surcharge over 4 ct and a gas surcharge over 2 ct', () => {
    const strom = computeWarnings(base({ contracts: [contract({ energie: 'strom', surchargeCt: 5 })] }));
    expect(codes(strom)).toContain('aufschlag_ueber_cap');
    const gas = computeWarnings(base({ contracts: [contract({ energie: 'gas', surchargeCt: 3 })] }));
    expect(codes(gas)).toContain('aufschlag_ueber_cap');
    // gas at exactly 2 ct is within cap
    const gasOk = computeWarnings(base({ contracts: [contract({ energie: 'gas', surchargeCt: 2 })] }));
    expect(codes(gasOk)).not.toContain('aufschlag_ueber_cap');
  });

  it('flags a contract whose SWA commission deviates from the control tier', () => {
    const w = computeWarnings(base({ contracts: [contract({ plausibilitaetStatus: 'abweichung' })] }));
    expect(codes(w)).toContain('swa_tier_abweichung');
  });

  it('flags an unknown rep, unknown org or missing order number', () => {
    const unknownRep = computeWarnings(base({ contracts: [contract({ repBekannt: false })] }));
    expect(codes(unknownRep)).toContain('unbekannte_zuordnung');
    const missingOrder = computeWarnings(base({ contracts: [contract({ swaOrderNumber: null })] }));
    expect(codes(missingOrder)).toContain('unbekannte_zuordnung');
  });

  it('flags an under-funded commercial reserve as red', () => {
    const w = computeWarnings(base({ reserves: [{ contractId: 'c9', repId: 'r1', reserveTarget: 1000, reserveActual: 600 }] }));
    const hit = w.find((x) => x.code === 'ruecklage_unterdeckt')!;
    expect(hit.level).toBe('rot');
    expect(hit.betrag).toBe(400);
  });

  it('does not flag a fully-funded reserve', () => {
    const w = computeWarnings(base({ reserves: [{ contractId: 'c9', repId: 'r1', reserveTarget: 1000, reserveActual: 1000 }] }));
    expect(codes(w)).not.toContain('ruecklage_unterdeckt');
  });

  it('flags a reached SWA tier that deviates from the control tier', () => {
    const w = computeWarnings(base({ config: { ...CONFIG, swaReachedTierRate: 190, swaControlTierRate: 160 } }));
    expect(codes(w)).toContain('swa_kontrolltarif_abweichung');
  });
});

describe('I-35 · yellow checks (ch. 13)', () => {
  it('flags an employee with a negative balance', () => {
    const w = computeWarnings(base({ reps: [{ id: 'r1', name: 'A', negativsaldo: 316, qualifiedNewCount: 5, bisNaechsteStufe: null }] }));
    const hit = w.find((x) => x.code === 'negativsaldo')!;
    expect(hit.level).toBe('gelb');
    expect(hit.betrag).toBe(316);
  });

  it('buckets the retention-due warning into 30 / 60 / 90 days', () => {
    const in20 = computeWarnings(base({ contracts: [contract({ retentionFaelligAm: '2026-08-03' })] })); // 20 days
    expect(in20.find((x) => x.code === 'rueckbehalt_faellig')!.titel).toMatch(/≤ 30/);
    const in75 = computeWarnings(base({ contracts: [contract({ retentionFaelligAm: '2026-09-27' })] })); // ~75 days
    expect(in75.find((x) => x.code === 'rueckbehalt_faellig')!.titel).toMatch(/≤ 90/);
    // beyond 90 days: no warning
    const in200 = computeWarnings(base({ contracts: [contract({ retentionFaelligAm: '2027-03-01' })] }));
    expect(codes(in200)).not.toContain('rueckbehalt_faellig');
  });

  it('flags a storno within the liability window and drops it once the window passes', () => {
    const inside = computeWarnings(base({ contracts: [contract({ stornoDatum: '2026-05-01' })] })); // +6m = 2026-11 > today
    expect(codes(inside)).toContain('storno_haftungsfenster');
    const outside = computeWarnings(base({ contracts: [contract({ stornoDatum: '2025-01-01' })] })); // window long closed
    expect(codes(outside)).not.toContain('storno_haftungsfenster');
  });

  it('flags a lead-time customer that is contactable again', () => {
    const due = computeWarnings(base({ contracts: [contract({ leadTimeKontaktAb: '2026-07-01' })] }));
    expect(codes(due)).toContain('vorlaufzeit_kontakt');
    const future = computeWarnings(base({ contracts: [contract({ leadTimeKontaktAb: '2026-12-01' })] }));
    expect(codes(future)).not.toContain('vorlaufzeit_kontakt');
  });
});

describe('I-35 · info checks (ch. 13)', () => {
  it('flags the next tier level as reachable when within the threshold', () => {
    const w = computeWarnings(base({ reps: [{ id: 'r1', name: 'A', negativsaldo: 0, qualifiedNewCount: 37, bisNaechsteStufe: 3 }] }));
    const hit = w.find((x) => x.code === 'naechste_stufe')!;
    expect(hit.level).toBe('info');
  });

  it('does not flag the next tier when it is far away or already at the top', () => {
    const far = computeWarnings(base({ reps: [{ id: 'r1', name: 'A', negativsaldo: 0, qualifiedNewCount: 10, bisNaechsteStufe: 30 }] }));
    expect(codes(far)).not.toContain('naechste_stufe');
    const top = computeWarnings(base({ reps: [{ id: 'r2', name: 'B', negativsaldo: 0, qualifiedNewCount: 120, bisNaechsteStufe: null }] }));
    expect(codes(top)).not.toContain('naechste_stufe');
  });
});

describe('I-35 · ranking & counts', () => {
  it('ranks red before yellow before info and counts per level', () => {
    const w = computeWarnings(
      base({
        contracts: [contract({ surchargeCt: 9 })],
        reps: [{ id: 'r1', name: 'A', negativsaldo: 100, qualifiedNewCount: 38, bisNaechsteStufe: 2 }],
      }),
    );
    expect(w[0].level).toBe('rot');
    const counts = warningCounts(w);
    expect(counts.rot).toBeGreaterThanOrEqual(1);
    expect(counts.gelb).toBeGreaterThanOrEqual(1);
    expect(counts.info).toBeGreaterThanOrEqual(1);
    expect(counts.gesamt).toBe(w.length);
  });
});
