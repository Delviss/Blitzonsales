import { ConfigKey, FACHKONZEPT_DEFAULTS, Tier } from '@blitzon/shared';
import { projectRepTier, projectReversals } from './forecast';

const EMP_TIERS = FACHKONZEPT_DEFAULTS[ConfigKey.EmployeeTier] as Tier[];

// ---------------------------------------------------------------------------
// I-16 · Live forecast / preview (ch. 11.3)
// ---------------------------------------------------------------------------
describe('I-16 forecast projection', () => {
  it('projects the retroactive switch: 10×€70 now, potential to reach 40×€90', () => {
    // 10 qualified new customers → reached €70, projected 10×70 = €700.
    const p = projectRepTier('r1', false, 10, 700, EMP_TIERS);
    expect(p.reachedRate).toBe(70);
    expect(p.nextThreshold).toBe(40);
    expect(p.nextRate).toBe(90);
    expect(p.bisNaechsteStufe).toBe(30);
    // At the next threshold the whole month recomputes to 40×€90 = €3,600.
    // Potential uplift over the current 10×€70 = €700 is €2,900.
    expect(p.potenzialNaechsteStufe).toBe(40 * 90 - 10 * 70);
  });

  it('reports no next threshold / potential at the top tier', () => {
    const p = projectRepTier('r1', false, 90, 9000, EMP_TIERS);
    expect(p.reachedRate).toBe(100);
    expect(p.nextThreshold).toBeNull();
    expect(p.potenzialNaechsteStufe).toBeNull();
    expect(p.bisNaechsteStufe).toBeNull();
  });

  it('exactly at a threshold reports the reached rate and looks to the following one', () => {
    const p = projectRepTier('r1', false, 40, 3600, EMP_TIERS);
    expect(p.reachedRate).toBe(90);
    expect(p.nextThreshold).toBe(80);
    expect(p.nextRate).toBe(100);
  });

  it('surfaces reversals as negative-impact warnings and aggregates them', () => {
    const { warnings, impactGesamt } = projectReversals([
      { contractId: 'c1', swaOrderNumber: 'A-1', kunde: 'Meier', repId: 'r1', status: 'Storno', betrag: 160 },
      { contractId: 'c2', swaOrderNumber: 'A-2', kunde: 'Schulz', repId: 'r1', status: 'Widerruf', betrag: 90 },
    ]);
    expect(warnings[0].finanzielleAuswirkung).toBe(-160);
    expect(warnings[1].finanzielleAuswirkung).toBe(-90);
    expect(impactGesamt).toBe(-250);
  });
});
