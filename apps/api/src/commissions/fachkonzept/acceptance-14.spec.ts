/**
 * I-22 · Acceptance tests for Fachkonzept ch. 14.2 (compensation / balance /
 * storno) and ch. 14.3 (commercial), issue #43.
 *
 * These lock the worked-example rows the issue enumerates so any regression
 * fails CI:
 *   • ch. 14.2 salary/balance/storno rows for P = 1,800 / 2,100 / 2,300 /
 *     10,000 / 20,000 (guaranteed Fixum floor, 10% storno withholding into the
 *     separate account, negative-balance accrual in a low month and recovery
 *     from pay above the Fixum in a high month — I-18).
 *   • ch. 14.3 commercial rows: total commission, the 25/25 (employee) and
 *     35/35 (partner) splits, both SWA halves confirmed in one month, and an
 *     under-consumption clawback pass-through (I-21/I-25).
 *
 * The euro figures follow the documented invariants (Fixum €2,116, storno 10%,
 * commercial caps 4 ct / 2 ct, 120,000 kWh × 4 ct = €4,800) that the engine and
 * the earlier unit tests already implement; this suite pins the full rows as a
 * single acceptance gate. See PROGRESS.md open question 11 for the note that the
 * exact intermediate ch. 14.2 figures are confirmed against these invariants.
 */
import {
  ClientType,
  ConfigKey,
  FACHKONZEPT_DEFAULTS,
  STATUS_MASTER_DEFAULTS,
  StartDeliveryType,
  TariffEnergyType,
  Tier,
} from '@blitzon/shared';
import {
  clawbackOffset,
  commercialShares,
  commercialSwaHalf,
  commercialTotalCommission,
  OffsetTarget,
  salaryProtection,
} from './fachkonzept-engine';
import { computeFachkonzeptRun, FachkonzeptRunConfig, RunContract } from './fachkonzept-run';

const FIXUM = FACHKONZEPT_DEFAULTS[ConfigKey.Fixum] as number; // 2116
const STORNO_RATE = FACHKONZEPT_DEFAULTS[ConfigKey.StornoAccountRate] as number; // 0.10
const salaryCfg = { fixum: FIXUM, stornoRate: STORNO_RATE };

const commercialCfg = {
  capStrom: FACHKONZEPT_DEFAULTS[ConfigKey.CommercialSurchargeCapStrom] as number,
  capGas: FACHKONZEPT_DEFAULTS[ConfigKey.CommercialSurchargeCapGas] as number,
  employeeImmediate: FACHKONZEPT_DEFAULTS[ConfigKey.CommercialShareEmployeeImmediate] as number,
  employeeRetention: FACHKONZEPT_DEFAULTS[ConfigKey.CommercialShareEmployeeRetention] as number,
  partnerImmediate: FACHKONZEPT_DEFAULTS[ConfigKey.CommercialSharePartnerImmediate] as number,
  partnerRetention: FACHKONZEPT_DEFAULTS[ConfigKey.CommercialSharePartnerRetention] as number,
};

// ---------------------------------------------------------------------------
// ch. 14.2 · Compensation / balance / storno (I-18)
// ---------------------------------------------------------------------------
describe('I-22 · ch. 14.2 compensation rows', () => {
  interface Row {
    P: number;
    carried?: number;
    paid: number;
    negativeBalanceDelta: number;
    negativeBalanceAfter: number;
    stornoWithheld: number;
  }

  // Each row is one ch. 14.2 worked example: variable commission P, carried
  // negative balance, and the expected paid / balance-change / storno triple.
  const rows: Row[] = [
    // Low months (P < Fixum): the Fixum is paid and the shortfall accrues.
    { P: 1_800, paid: FIXUM, negativeBalanceDelta: FIXUM - 1_800, negativeBalanceAfter: FIXUM - 1_800, stornoWithheld: 0 },
    { P: 2_100, paid: FIXUM, negativeBalanceDelta: FIXUM - 2_100, negativeBalanceAfter: FIXUM - 2_100, stornoWithheld: 0 },
    // At/above Fixum: 10% storno withheld into the separate account.
    // P=2,300 ⇒ storno 230, net 2,070 (< Fixum after withholding, no recovery).
    { P: 2_300, paid: 2_070, negativeBalanceDelta: 0, negativeBalanceAfter: 0, stornoWithheld: 230 },
    // P=10,000 ⇒ storno 1,000, net 9,000.
    { P: 10_000, paid: 9_000, negativeBalanceDelta: 0, negativeBalanceAfter: 0, stornoWithheld: 1_000 },
    // P=20,000 ⇒ storno 2,000, net 18,000.
    { P: 20_000, paid: 18_000, negativeBalanceDelta: 0, negativeBalanceAfter: 0, stornoWithheld: 2_000 },
  ];

  it.each(rows)('P=%s → paid/balance/storno match ch. 14.2', (row) => {
    const r = salaryProtection(row.P, salaryCfg, row.carried ?? 0);
    expect(r.paid).toBe(row.paid);
    expect(r.negativeBalanceDelta).toBe(row.negativeBalanceDelta);
    expect(r.negativeBalanceAfter).toBe(row.negativeBalanceAfter);
    expect(r.stornoWithheld).toBe(row.stornoWithheld);
    // The guaranteed Fixum floor is never breached by salary protection itself:
    // in a low month the paid amount is exactly the Fixum.
    if (row.P < FIXUM) expect(r.paid).toBe(FIXUM);
  });

  // Balance recovery rows: a carried negative balance is drawn down from the pay
  // above the Fixum in a positive month, never breaching the floor (I-18).
  it('P=10,000 with a €5,000 carried balance recovers it fully from pay above the Fixum', () => {
    // storno 1,000, net 9,000, above Fixum = 9,000 − 2,116 = 6,884 ≥ 5,000.
    const r = salaryProtection(10_000, salaryCfg, 5_000);
    expect(r.stornoWithheld).toBe(1_000);
    expect(r.negativeBalanceRecovered).toBe(5_000);
    expect(r.negativeBalanceAfter).toBe(0);
    expect(r.paid).toBe(9_000 - 5_000);
  });

  it('P=20,000 with a €20,000 carried balance recovers only up to the pay above the Fixum', () => {
    // storno 2,000, net 18,000, above Fixum = 18,000 − 2,116 = 15,884 recoverable.
    const r = salaryProtection(20_000, salaryCfg, 20_000);
    expect(r.stornoWithheld).toBe(2_000);
    expect(r.negativeBalanceRecovered).toBe(15_884);
    expect(r.negativeBalanceAfter).toBe(20_000 - 15_884);
    expect(r.paid).toBe(FIXUM); // floor exactly
  });
});

// ---------------------------------------------------------------------------
// ch. 14.3 · Commercial (I-21 / I-25)
// ---------------------------------------------------------------------------
describe('I-22 · ch. 14.3 commercial rows', () => {
  it('total commission: 120,000 kWh × 4 ct = €4,800', () => {
    const r = commercialTotalCommission(120_000, 4, TariffEnergyType.Strom, commercialCfg);
    expect(r.totalCommission).toBe(4_800);
    expect(r.surchargeCapped).toBe(false);
    expect(commercialSwaHalf(4_800)).toBe(2_400);
  });

  it('25/25 employee split and 35/35 partner split on €4,800', () => {
    expect(commercialShares(4_800, 'employee', commercialCfg)).toEqual({ immediate: 1_200, retention: 1_200 });
    expect(commercialShares(4_800, 'partner', commercialCfg)).toEqual({ immediate: 1_680, retention: 1_680 });
  });

  it('both SWA halves confirmed in one month ⇒ the full total is booked (immediate + retention)', () => {
    const contract: RunContract = {
      id: 'g1', repId: 'A', status: 'In Belieferung',
      clientType: ClientType.Gewerbe, startDeliveryType: StartDeliveryType.Neukunde,
      energie: TariffEnergyType.Strom, verbrauch: null,
      gesamtverbrauch: 120_000, surchargeCt: 4, swaRevenue: null, actualSwaProvision: null,
      kreditcheckConfirmed: true, lieferbeginnConfirmed: true, // both halves confirmed
    };
    const res = computeFachkonzeptRun({
      periode: '2026-06', config: defaultConfig(),
      reps: [{ id: 'A', isPartner: false, trainerId: null, teamleadId: null, negativsaldo: 0 }],
      contracts: [contract],
    });
    const sofort = res.lines.find((l) => l.kategorie === 'gewerbe_sofort')!;
    const ruecklage = res.lines.find((l) => l.kategorie === 'gewerbe_ruecklage')!;
    expect(sofort.betrag).toBe(1_200); // 25% of the full €4,800
    expect(sofort.faellig).toBe(true);
    expect(ruecklage.betrag).toBe(1_200); // 25% retention, not yet due
    expect(ruecklage.faellig).toBe(false);
  });

  it('only the credit-check half confirmed ⇒ only 50% of the total is booked', () => {
    const contract: RunContract = {
      id: 'g2', repId: 'A', status: 'In Belieferung',
      clientType: ClientType.Gewerbe, startDeliveryType: StartDeliveryType.Neukunde,
      energie: TariffEnergyType.Strom, verbrauch: null,
      gesamtverbrauch: 120_000, surchargeCt: 4, swaRevenue: null, actualSwaProvision: null,
      kreditcheckConfirmed: true, lieferbeginnConfirmed: false,
    };
    const res = computeFachkonzeptRun({
      periode: '2026-06', config: defaultConfig(),
      reps: [{ id: 'A', isPartner: false, trainerId: null, teamleadId: null, negativsaldo: 0 }],
      contracts: [contract],
    });
    // 50% of €4,800 confirmed ⇒ 25% immediate of €2,400 = €600.
    expect(res.lines.find((l) => l.kategorie === 'gewerbe_sofort')!.betrag).toBe(600);
  });

  it('under-consumption clawback: half the commission is clawed back and offset in order', () => {
    // A €4,800 commercial contract that under-consumes by 50% ⇒ €2,400 SWA
    // clawback. Employee causer share 50% ⇒ €1,200 pass-through, offset first
    // against the storno account then current commission, remainder reconstructable.
    const r = clawbackOffset(2_400, 0.5, [
      { target: OffsetTarget.StornoAccount, available: 480 },
      { target: OffsetTarget.CurrentCommission, available: 500 },
    ]);
    expect(r.passThrough).toBe(1_200);
    expect(r.offsets).toEqual([
      { target: OffsetTarget.StornoAccount, applied: 480 },
      { target: OffsetTarget.CurrentCommission, applied: 500 },
    ]);
    expect(r.remaining).toBe(220); // 1,200 − 480 − 500, invoiced/collected later
    // Invariant: pass-through fully reconstructable from offsets + remaining.
    const offsetSum = r.offsets.reduce((s, o) => s + o.applied, 0);
    expect(offsetSum + r.remaining).toBe(r.passThrough);
  });
});

/** Run config from the shipped defaults (kept in lockstep with the config store). */
function defaultConfig(): FachkonzeptRunConfig {
  const d = FACHKONZEPT_DEFAULTS;
  return {
    qualifyingStatuses: STATUS_MASTER_DEFAULTS.filter((s) => s.qualifiziert).map((s) => s.code),
    minConsumptionStrom: d[ConfigKey.MinConsumptionStrom] as number,
    minConsumptionGas: d[ConfigKey.MinConsumptionGas] as number,
    employeeTier: d[ConfigKey.EmployeeTier] as Tier[],
    partnerTier: d[ConfigKey.PartnerTier] as Tier[],
    swaNewCustomerTier: d[ConfigKey.SwaNewCustomerTier] as Tier[],
    plausibilityToleranceAbs: d[ConfigKey.PlausibilityToleranceAbs] as number,
    fixum: d[ConfigKey.Fixum] as number,
    employerCostRate: d[ConfigKey.EmployerCostRate] as number,
    overheadTrainerNew: d[ConfigKey.OverheadTrainerNew] as number,
    overheadTrainerCommercial: d[ConfigKey.OverheadTrainerCommercial] as number,
    overheadTeamLeadNew: d[ConfigKey.OverheadTeamLeadNew] as number,
    overheadTeamLeadCommercial: d[ConfigKey.OverheadTeamLeadCommercial] as number,
    existingCustomerSwaRevenue: d[ConfigKey.ExistingCustomerSwaRevenue] as number,
    existingCustomerEmployeePayout: d[ConfigKey.ExistingCustomerEmployeePayout] as number,
    existingCustomerPartnerPayout: d[ConfigKey.ExistingCustomerPartnerPayout] as number,
    commercialShareEmployeeImmediate: d[ConfigKey.CommercialShareEmployeeImmediate] as number,
    commercialShareEmployeeRetention: d[ConfigKey.CommercialShareEmployeeRetention] as number,
    commercialSharePartnerImmediate: d[ConfigKey.CommercialSharePartnerImmediate] as number,
    commercialSharePartnerRetention: d[ConfigKey.CommercialSharePartnerRetention] as number,
    commercialSurchargeCapStrom: d[ConfigKey.CommercialSurchargeCapStrom] as number,
    commercialSurchargeCapGas: d[ConfigKey.CommercialSurchargeCapGas] as number,
    commercialReserveRate: d[ConfigKey.CommercialReserveRate] as number,
    stornoAccountRate: d[ConfigKey.StornoAccountRate] as number,
  };
}
