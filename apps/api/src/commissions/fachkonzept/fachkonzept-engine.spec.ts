import {
  ConfigKey,
  ConfigVersion,
  FACHKONZEPT_DEFAULTS,
  RepRole,
  TariffEnergyType,
  Tier,
  resolveConfig,
  resolveTierRate,
} from '@blitzon/shared';
import {
  clawbackOffset,
  commercialReserve,
  commercialShares,
  commercialSwaHalf,
  commercialTotalCommission,
  existingCustomerCompensation,
  meetsMinimumVolume,
  OffsetTarget,
  overheadClaims,
  retroactiveMonthlyPayout,
  salaryProtection,
  tierRateForCount,
} from './fachkonzept-engine';

const EMP_TIERS = FACHKONZEPT_DEFAULTS[ConfigKey.EmployeeTier] as Tier[];
const PARTNER_TIERS = FACHKONZEPT_DEFAULTS[ConfigKey.PartnerTier] as Tier[];

// ---------------------------------------------------------------------------
// I-01 · Versioned config resolver (valid-from)
// ---------------------------------------------------------------------------
describe('I-01 versioned config resolver', () => {
  const entries: ConfigVersion[] = [
    { key: ConfigKey.Fixum, value: 2000, gueltigAb: '2026-01-01' },
    { key: ConfigKey.Fixum, value: 2116, gueltigAb: '2026-07-01' },
  ];

  it('resolves the version valid as-of a reference date (closed month unchanged)', () => {
    expect(resolveConfig(entries, ConfigKey.Fixum, '2026-06-30')).toBe(2000);
    expect(resolveConfig(entries, ConfigKey.Fixum, '2026-07-01')).toBe(2116);
    expect(resolveConfig(entries, ConfigKey.Fixum, '2026-12-31')).toBe(2116);
  });

  it('returns undefined before the first version', () => {
    expect(resolveConfig(entries, ConfigKey.Fixum, '2025-12-31')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// I-13 · Minimum-volume engine (ch. 6.2)
// ---------------------------------------------------------------------------
describe('I-13 minimum volume', () => {
  const cfg = {
    strom: FACHKONZEPT_DEFAULTS[ConfigKey.MinConsumptionStrom] as number,
    gas: FACHKONZEPT_DEFAULTS[ConfigKey.MinConsumptionGas] as number,
  };

  it('excludes a 900 kWh electricity contract (below 1,000 kWh)', () => {
    expect(meetsMinimumVolume(TariffEnergyType.Strom, 900, cfg)).toBe(false);
  });

  it('counts a 1,000 kWh electricity contract and evaluates gas separately', () => {
    expect(meetsMinimumVolume(TariffEnergyType.Strom, 1000, cfg)).toBe(true);
    expect(meetsMinimumVolume(TariffEnergyType.Gas, 1000, cfg)).toBe(false);
    expect(meetsMinimumVolume(TariffEnergyType.Gas, 4000, cfg)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// I-15 / I-17 · Retroactive employee & partner tiers (ch. 14.1)
// ---------------------------------------------------------------------------
describe('I-15/I-17 retroactive tiers (ch. 14.1)', () => {
  it('39 new customers pay 39 × €70', () => {
    expect(tierRateForCount(39, EMP_TIERS)).toBe(70);
    expect(retroactiveMonthlyPayout(39, EMP_TIERS)).toBe(39 * 70);
  });

  it('the 40th new customer recomputes the whole month to €90 (40 × €90, not 39×70 + 1×90)', () => {
    expect(tierRateForCount(40, EMP_TIERS)).toBe(90);
    expect(retroactiveMonthlyPayout(40, EMP_TIERS)).toBe(40 * 90);
    expect(retroactiveMonthlyPayout(40, EMP_TIERS)).not.toBe(39 * 70 + 90);
  });

  it('80 new customers pay 80 × €100', () => {
    expect(tierRateForCount(80, EMP_TIERS)).toBe(100);
    expect(retroactiveMonthlyPayout(80, EMP_TIERS)).toBe(80 * 100);
  });

  it('partner tiers: 39→€90, 40→€120, 80→€140, 120→€150', () => {
    expect(resolveTierRate(39, PARTNER_TIERS)).toBe(90);
    expect(resolveTierRate(40, PARTNER_TIERS)).toBe(120);
    expect(resolveTierRate(80, PARTNER_TIERS)).toBe(140);
    expect(resolveTierRate(120, PARTNER_TIERS)).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// I-20 · Existing-customer flat compensation (ch. 6.2)
// ---------------------------------------------------------------------------
describe('I-20 existing customer', () => {
  it('applies €50 / €25 / €25 and never counts toward a tier', () => {
    const r = existingCustomerCompensation({
      swaRevenue: FACHKONZEPT_DEFAULTS[ConfigKey.ExistingCustomerSwaRevenue] as number,
      employeePayout: FACHKONZEPT_DEFAULTS[ConfigKey.ExistingCustomerEmployeePayout] as number,
      partnerPayout: FACHKONZEPT_DEFAULTS[ConfigKey.ExistingCustomerPartnerPayout] as number,
    });
    expect(r).toEqual({ swaRevenue: 50, employeePayout: 25, partnerPayout: 25, countsTowardTier: false });
  });
});

// ---------------------------------------------------------------------------
// I-19 · Trainer / team-lead overheads (ch. 7.2)
// ---------------------------------------------------------------------------
describe('I-19 overheads', () => {
  const cfg = {
    trainerNew: FACHKONZEPT_DEFAULTS[ConfigKey.OverheadTrainerNew] as number,
    trainerCommercial: FACHKONZEPT_DEFAULTS[ConfigKey.OverheadTrainerCommercial] as number,
    teamLeadNew: FACHKONZEPT_DEFAULTS[ConfigKey.OverheadTeamLeadNew] as number,
    teamLeadCommercial: FACHKONZEPT_DEFAULTS[ConfigKey.OverheadTeamLeadCommercial] as number,
  };

  it('team-lead amount replaces the trainer amount (no additive stacking)', () => {
    const claims = overheadClaims(
      [{ energie: TariffEnergyType.Strom, trainerRepId: 't1', teamLeadRepId: 'l1', isCommercial: false }],
      cfg,
    );
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ role: RepRole.TeamLead, beneficiaryRepId: 'l1', amount: 10 });
  });

  it('trainer-only assignment pays €5 new / €20 commercial', () => {
    expect(overheadClaims([{ energie: TariffEnergyType.Strom, trainerRepId: 't1', teamLeadRepId: null, isCommercial: false }], cfg)[0].amount).toBe(5);
    expect(overheadClaims([{ energie: TariffEnergyType.Strom, trainerRepId: 't1', teamLeadRepId: null, isCommercial: true }], cfg)[0].amount).toBe(20);
  });

  it('electricity + gas produce two separate claims', () => {
    const claims = overheadClaims(
      [
        { energie: TariffEnergyType.Strom, trainerRepId: null, teamLeadRepId: 'l1', isCommercial: false },
        { energie: TariffEnergyType.Gas, trainerRepId: null, teamLeadRepId: 'l1', isCommercial: false },
      ],
      cfg,
    );
    expect(claims).toHaveLength(2);
    expect(claims.map((c) => c.energie)).toEqual([TariffEnergyType.Strom, TariffEnergyType.Gas]);
  });
});

// ---------------------------------------------------------------------------
// I-21 · Commercial engine (ch. 14.3)
// ---------------------------------------------------------------------------
describe('I-21 commercial engine (ch. 14.3)', () => {
  const cfg = {
    capStrom: FACHKONZEPT_DEFAULTS[ConfigKey.CommercialSurchargeCapStrom] as number,
    capGas: FACHKONZEPT_DEFAULTS[ConfigKey.CommercialSurchargeCapGas] as number,
    employeeImmediate: 0.25,
    employeeRetention: 0.25,
    partnerImmediate: 0.35,
    partnerRetention: 0.35,
  };

  it('120,000 kWh × 4 ct = €4,800 total commission', () => {
    const r = commercialTotalCommission(120_000, 4, TariffEnergyType.Strom, cfg);
    expect(r.totalCommission).toBe(4800);
    expect(r.surchargeCapped).toBe(false);
  });

  it('flags an over-cap surcharge without blocking (electricity 4 ct, gas 2 ct)', () => {
    expect(commercialTotalCommission(1000, 5, TariffEnergyType.Strom, cfg).surchargeCapped).toBe(true);
    expect(commercialTotalCommission(1000, 3, TariffEnergyType.Gas, cfg).surchargeCapped).toBe(true);
    expect(commercialTotalCommission(1000, 2, TariffEnergyType.Gas, cfg).surchargeCapped).toBe(false);
  });

  it('SWA pays two 50% halves', () => {
    expect(commercialSwaHalf(4800)).toBe(2400);
  });

  it('internal split 25% immediate + 25% retention; partner 35% + 35%', () => {
    expect(commercialShares(4800, 'employee', cfg)).toEqual({ immediate: 1200, retention: 1200 });
    expect(commercialShares(4800, 'partner', cfg)).toEqual({ immediate: 1680, retention: 1680 });
  });
});

// ---------------------------------------------------------------------------
// I-24 · Commercial reserve (ch. 10.2)
// ---------------------------------------------------------------------------
describe('I-24 commercial reserve', () => {
  const cfg = { reserveRate: 0.2, employerCostRate: 0.3 };

  it('reserve = 20% of profit-before-reserve on real receipts', () => {
    // swaRevenue 4800, direct payout 1200, employer cost 30% = 360, overheads 20
    // profit = 4800 − 1200 − 360 − 20 = 3220 ; reserve = 644
    const r = commercialReserve(4800, 1200, 20, cfg);
    expect(r.profitBeforeReserve).toBe(3220);
    expect(r.reserveTarget).toBe(644);
  });

  it('never goes negative', () => {
    expect(commercialReserve(100, 500, 0, cfg)).toEqual({ profitBeforeReserve: 0, reserveTarget: 0 });
  });
});

// ---------------------------------------------------------------------------
// I-25 · Clawbacks & offsetting order (ch. 9.4)
// ---------------------------------------------------------------------------
describe('I-25 clawback offsetting', () => {
  it('passes through €2,000 × 50% = €1,000 and offsets in the fixed order', () => {
    const r = clawbackOffset(2000, 0.5, [
      { target: OffsetTarget.StornoAccount, available: 300 },
      { target: OffsetTarget.CurrentCommission, available: 400 },
      { target: OffsetTarget.OpenRetention, available: 1000 },
    ]);
    expect(r.passThrough).toBe(1000);
    expect(r.offsets).toEqual([
      { target: OffsetTarget.StornoAccount, applied: 300 },
      { target: OffsetTarget.CurrentCommission, applied: 400 },
      { target: OffsetTarget.OpenRetention, applied: 300 },
    ]);
    expect(r.remaining).toBe(0);
  });

  it('leaves a reconstructable remaining receivable when sources are insufficient', () => {
    const r = clawbackOffset(2000, 0.5, [{ target: OffsetTarget.StornoAccount, available: 200 }]);
    expect(r.remaining).toBe(800);
    expect(r.offsets).toEqual([{ target: OffsetTarget.StornoAccount, applied: 200 }]);
  });
});

// ---------------------------------------------------------------------------
// I-18 · Salary protection & storno account (invariants; see engine note)
// ---------------------------------------------------------------------------
describe('I-18 salary protection (invariants)', () => {
  const cfg = { fixum: 2116, stornoRate: 0.1 };

  it('pays the Fixum and grows the negative balance when P < F', () => {
    const r = salaryProtection(1800, cfg);
    expect(r.paid).toBe(2116);
    expect(r.negativeBalanceDelta).toBe(316);
    expect(r.stornoWithheld).toBe(0);
  });

  it('withholds 10% to the storno account when P ≥ F, keeping the accounts separate', () => {
    const r = salaryProtection(2300, cfg);
    expect(r.stornoWithheld).toBe(230);
    expect(r.paid).toBe(2070);
    expect(r.negativeBalanceDelta).toBe(0);
  });
});
