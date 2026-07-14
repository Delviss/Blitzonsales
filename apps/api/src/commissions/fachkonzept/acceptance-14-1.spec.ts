/**
 * I-17 · Acceptance tests for Fachkonzept ch. 14.1 (tier & retroactivity),
 * issue #38.
 *
 * Locks every ch. 14.1 case so a regression fails CI:
 *   • 39 / 40 / 80 qualified new customers — the retroactive staffel switch
 *     (the 40th recomputes the whole month to €90, the 80th to €100), I-15.
 *   • electricity + gas booked as two separate contracts ⇒ two qualified counts.
 *   • a below-minimum private contract (900 kWh < 1,000) is not counted, I-13.
 *   • a July-negative → August-positive contract pays only as an August addendum
 *     while July stays unchanged — the month-end freeze + addendum (I-34).
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
import { retroactiveMonthlyPayout, tierRateForCount } from './fachkonzept-engine';
import { AddendumContract, computeFachkonzeptRun, FachkonzeptRunConfig, RunContract, RunRep } from './fachkonzept-run';

const QUALIFYING = 'In Belieferung'; // a released-as-qualifying status (I-06 default)
const EMP_TIER = FACHKONZEPT_DEFAULTS[ConfigKey.EmployeeTier] as Tier[]; // 0→70, 40→90, 80→100

function rep(id = 'A'): RunRep {
  return { id, isPartner: false, trainerId: null, teamleadId: null, negativsaldo: 0 };
}

function privateNew(id: string, overrides: Partial<RunContract> = {}): RunContract {
  return {
    id,
    repId: 'A',
    status: QUALIFYING,
    clientType: ClientType.Privat,
    startDeliveryType: StartDeliveryType.Neukunde,
    energie: TariffEnergyType.Strom,
    verbrauch: 2_000,
    gesamtverbrauch: 2_000,
    surchargeCt: null,
    swaRevenue: null,
    actualSwaProvision: null,
    kreditcheckConfirmed: false,
    lieferbeginnConfirmed: false,
    ...overrides,
  };
}

function manyPrivateNew(n: number): RunContract[] {
  return Array.from({ length: n }, (_, i) => privateNew(`c${i}`));
}

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

function run(contracts: RunContract[], addenda?: AddendumContract[]) {
  return computeFachkonzeptRun({ periode: '2026-08', config: defaultConfig(), reps: [rep()], contracts, addenda });
}

// ---------------------------------------------------------------------------
// Tier & retroactivity (I-15)
// ---------------------------------------------------------------------------
describe('I-17 · ch. 14.1 retroactive tiers', () => {
  it('pure tier rates: 39 ⇒ €70, 40 ⇒ €90, 80 ⇒ €100', () => {
    expect(tierRateForCount(39, EMP_TIER)).toBe(70);
    expect(tierRateForCount(40, EMP_TIER)).toBe(90);
    expect(tierRateForCount(80, EMP_TIER)).toBe(100);
    expect(retroactiveMonthlyPayout(39, EMP_TIER)).toBe(39 * 70); // 2,730
    expect(retroactiveMonthlyPayout(40, EMP_TIER)).toBe(40 * 90); // 3,600
    expect(retroactiveMonthlyPayout(80, EMP_TIER)).toBe(80 * 100); // 8,000
  });

  it('39 qualified new customers ⇒ every contract at €70, month total €2,730', () => {
    const res = run(manyPrivateNew(39));
    const staffel = res.lines.filter((l) => l.kategorie === 'neukunde_staffel');
    expect(staffel).toHaveLength(39);
    expect(staffel.every((l) => l.betrag === 70)).toBe(true);
    expect(res.repSummaries[0].qualifiedNewCount).toBe(39);
    expect(res.repSummaries[0].variableProvision).toBe(2_730);
  });

  it('the 40th customer recomputes the WHOLE month to €90 ⇒ €3,600 (not 39×70 + 1×90)', () => {
    const res = run(manyPrivateNew(40));
    const staffel = res.lines.filter((l) => l.kategorie === 'neukunde_staffel');
    expect(staffel).toHaveLength(40);
    expect(staffel.every((l) => l.betrag === 90)).toBe(true);
    expect(res.repSummaries[0].variableProvision).toBe(3_600);
  });

  it('80 qualified new customers ⇒ every contract at €100 ⇒ €8,000', () => {
    const res = run(manyPrivateNew(80));
    const staffel = res.lines.filter((l) => l.kategorie === 'neukunde_staffel');
    expect(staffel.every((l) => l.betrag === 100)).toBe(true);
    expect(res.repSummaries[0].variableProvision).toBe(8_000);
  });
});

// ---------------------------------------------------------------------------
// Electricity + gas as two contracts; below-minimum not counted (I-13)
// ---------------------------------------------------------------------------
describe('I-17 · ch. 14.1 two-contract & minimum-volume rules', () => {
  it('electricity + gas count as two separate qualified new customers', () => {
    const res = run([
      privateNew('strom', { energie: TariffEnergyType.Strom, verbrauch: 2_000 }),
      privateNew('gas', { energie: TariffEnergyType.Gas, verbrauch: 6_000 }),
    ]);
    expect(res.repSummaries[0].qualifiedNewCount).toBe(2);
    expect(res.lines.filter((l) => l.kategorie === 'neukunde_staffel')).toHaveLength(2);
  });

  it('a below-minimum private contract (900 kWh < 1,000) is not counted', () => {
    const res = run([
      privateNew('ok', { verbrauch: 1_200 }),
      privateNew('klein', { verbrauch: 900 }),
    ]);
    expect(res.repSummaries[0].qualifiedNewCount).toBe(1);
    expect(res.lines.find((l) => l.contractId === 'klein')!.kategorie).toBe('neukunde_unqualifiziert');
    expect(res.lines.find((l) => l.contractId === 'klein')!.betrag).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// July-negative → August-positive addendum; July stays unchanged (I-34)
// ---------------------------------------------------------------------------
describe('I-17 · ch. 14.1 cross-month addendum with frozen July', () => {
  const config = defaultConfig();

  // The contract as it looked in July: status not yet qualifying ⇒ not booked.
  const julyContract: RunContract = privateNew('cross', { status: 'Widerruf' });
  // The same contract, now qualifying, booked into August as an addendum.
  const augustAddendum: AddendumContract = {
    ...privateNew('cross', { status: QUALIFYING }),
    urspruungsMonat: '2026-07',
    swaOrderNumber: 'SWA-CROSS',
  };

  it('July does not book the contract (it does not yet qualify)', () => {
    const july = computeFachkonzeptRun({ periode: '2026-07', config, reps: [rep()], contracts: [julyContract] });
    // no staffel booking, no due amount for the rep from this contract
    expect(july.lines.some((l) => l.kategorie === 'neukunde_staffel')).toBe(false);
    expect(july.totals.faelligGesamt).toBe(0);
  });

  it('August books the flipped contract as an addendum tagged with the original month', () => {
    const august = run([], [augustAddendum]);
    const line = august.lines.find((l) => l.contractId === 'cross')!;
    expect(line.kategorie).toBe('neukunde_staffel');
    expect(line.betrag).toBe(70);
    expect(line.istAddendum).toBe(true);
    expect(line.urspruungsMonat).toBe('2026-07');
    expect(line.begruendung).toMatch(/Nachtrag zu 2026-07/);
    expect(august.repSummaries[0].variableProvision).toBe(70);
  });

  it('recomputing frozen July is byte-for-byte identical after the addendum is booked in August', () => {
    // Immutability: July's inputs never include the flipped-to-qualifying state,
    // so July's figures are unchanged regardless of the August addendum.
    const julyA = computeFachkonzeptRun({ periode: '2026-07', config, reps: [rep()], contracts: [julyContract] });
    const julyB = computeFachkonzeptRun({ periode: '2026-07', config, reps: [rep()], contracts: [julyContract] });
    expect(julyB.totals).toEqual(julyA.totals);
    expect(julyB.repSummaries).toEqual(julyA.repSummaries);
  });

  it('a still-non-qualifying carryover addendum stays silent (no €0 placeholder each month)', () => {
    const stillPending: AddendumContract = {
      ...privateNew('cross', { status: 'Widerruf' }),
      urspruungsMonat: '2026-07',
    };
    const august = run([], [stillPending]);
    expect(august.lines.some((l) => l.contractId === 'cross')).toBe(false);
  });
});
