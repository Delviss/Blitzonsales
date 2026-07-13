import { ClientType, ConfigKey, FACHKONZEPT_DEFAULTS, StartDeliveryType, TariffEnergyType, Tier } from '@blitzon/shared';
import {
  computeFachkonzeptRun,
  FachkonzeptRunConfig,
  RunContract,
  RunRep,
} from './fachkonzept-run';

/** Build the run config straight from the shipped defaults so the test stays in
 * lockstep with the versioned config store. */
function defaultConfig(): FachkonzeptRunConfig {
  const d = FACHKONZEPT_DEFAULTS;
  return {
    qualifyingStatuses: d[ConfigKey.QualifyingStatuses] as string[],
    minConsumptionStrom: d[ConfigKey.MinConsumptionStrom] as number,
    minConsumptionGas: d[ConfigKey.MinConsumptionGas] as number,
    employeeTier: d[ConfigKey.EmployeeTier] as Tier[],
    partnerTier: d[ConfigKey.PartnerTier] as Tier[],
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

const baseContract = (over: Partial<RunContract>): RunContract => ({
  id: 'c',
  repId: 'A',
  status: 'In Belieferung',
  clientType: ClientType.Privat,
  startDeliveryType: StartDeliveryType.Neukunde,
  energie: TariffEnergyType.Strom,
  verbrauch: 2000,
  gesamtverbrauch: null,
  surchargeCt: null,
  swaRevenue: null,
  kreditcheckConfirmed: false,
  lieferbeginnConfirmed: false,
  ...over,
});

const emp = (id: string, over: Partial<RunRep> = {}): RunRep => ({
  id,
  isPartner: false,
  trainerId: null,
  teamleadId: null,
  negativsaldo: 0,
  ...over,
});

describe('computeFachkonzeptRun', () => {
  it('applies the reached tier retroactively to the whole month (I-15)', () => {
    // 40 qualified new customers ⇒ every line is €90, not 39×€70 + 1×€90.
    const contracts = Array.from({ length: 40 }, (_, i) => baseContract({ id: `c${i}`, repId: 'A' }));
    const res = computeFachkonzeptRun({
      periode: '2026-06',
      config: defaultConfig(),
      reps: [emp('A')],
      contracts,
    });
    const staffel = res.lines.filter((l) => l.kategorie === 'neukunde_staffel');
    expect(staffel).toHaveLength(40);
    expect(staffel.every((l) => l.betrag === 90)).toBe(true);
    const a = res.repSummaries.find((r) => r.repId === 'A')!;
    expect(a.qualifiedNewCount).toBe(40);
    expect(a.tierRate).toBe(90);
    expect(a.variableProvision).toBe(3600);
    // 3600 ≥ Fixum ⇒ 10% storno withheld, remainder paid.
    expect(a.stornoEinbehalt).toBe(360);
    expect(a.auszahlung).toBe(3240);
    expect(a.negativsaldoDelta).toBe(0);
  });

  it('protects the Fixum and accrues the shortfall for a low month (I-18)', () => {
    const res = computeFachkonzeptRun({
      periode: '2026-06',
      config: defaultConfig(),
      reps: [emp('A')],
      contracts: [baseContract({ id: 'c1', repId: 'A' })], // 1 new ⇒ €70 variable
    });
    const a = res.repSummaries.find((r) => r.repId === 'A')!;
    expect(a.variableProvision).toBe(70);
    expect(a.auszahlung).toBe(2116);
    expect(a.negativsaldoDelta).toBe(2116 - 70);
    expect(a.stornoEinbehalt).toBe(0);
  });

  it('routes overheads to a directly-assigned trainer, not the seller (I-19)', () => {
    const res = computeFachkonzeptRun({
      periode: '2026-06',
      config: defaultConfig(),
      reps: [emp('A', { trainerId: 'T' }), emp('T')],
      contracts: [baseContract({ id: 'c1', repId: 'A' })],
    });
    const overhead = res.lines.filter((l) => l.kategorie === 'overhead_trainer');
    expect(overhead).toHaveLength(1);
    expect(overhead[0].repId).toBe('T');
    expect(overhead[0].betrag).toBe(5);
    expect(res.repSummaries.find((r) => r.repId === 'T')!.variableProvision).toBe(5);
  });

  it('gives existing customers the flat rate and keeps them out of the tier (I-20)', () => {
    const res = computeFachkonzeptRun({
      periode: '2026-06',
      config: defaultConfig(),
      reps: [emp('A')],
      contracts: [
        baseContract({ id: 'c1', repId: 'A', startDeliveryType: StartDeliveryType.Bestandskunde }),
        baseContract({ id: 'c2', repId: 'A' }), // one genuine new customer
      ],
    });
    const a = res.repSummaries.find((r) => r.repId === 'A')!;
    expect(a.qualifiedNewCount).toBe(1); // the Bestandskunde does not count
    const bestand = res.lines.find((l) => l.kategorie === 'bestandskunde')!;
    expect(bestand.betrag).toBe(25);
  });

  it('drops sub-minimum private contracts to a data-check line with €0 (I-13)', () => {
    const res = computeFachkonzeptRun({
      periode: '2026-06',
      config: defaultConfig(),
      reps: [emp('A')],
      contracts: [baseContract({ id: 'c1', repId: 'A', verbrauch: 500 })],
    });
    const line = res.lines[0];
    expect(line.kategorie).toBe('neukunde_unqualifiziert');
    expect(line.betrag).toBe(0);
    expect(line.datencheck).toBe(true);
    expect(res.repSummaries.find((r) => r.repId === 'A')).toBeUndefined();
  });

  it('splits the commercial engine into a due immediate share and a non-due retention (I-21/I-24)', () => {
    const res = computeFachkonzeptRun({
      periode: '2026-06',
      config: defaultConfig(),
      reps: [emp('A')],
      contracts: [
        baseContract({
          id: 'g1',
          repId: 'A',
          clientType: ClientType.Gewerbe,
          startDeliveryType: StartDeliveryType.Neukunde,
          gesamtverbrauch: 120000,
          surchargeCt: 4, // 120000 × 4 ct = €4,800 total
          swaRevenue: 4000,
          kreditcheckConfirmed: true,
          lieferbeginnConfirmed: true,
        }),
      ],
    });
    const sofort = res.lines.find((l) => l.kategorie === 'gewerbe_sofort')!;
    const ruecklage = res.lines.find((l) => l.kategorie === 'gewerbe_ruecklage')!;
    expect(sofort.betrag).toBe(1200); // 4800 × 25%
    expect(sofort.faellig).toBe(true);
    expect(ruecklage.betrag).toBe(1200);
    expect(ruecklage.faellig).toBe(false);
    expect(res.totals.rueckstellungGesamt).toBe(1200);
    // reserve: profit = 4000 − 1200 − (1200×0.3) = 2440 ⇒ 20% = 488
    const reserve = res.reserves[0];
    expect(reserve.reserveTarget).toBe(488);
  });

  it('only pays the confirmed SWA halves (no prepayment, I-21)', () => {
    const res = computeFachkonzeptRun({
      periode: '2026-06',
      config: defaultConfig(),
      reps: [emp('A')],
      contracts: [
        baseContract({
          id: 'g1',
          repId: 'A',
          clientType: ClientType.Gewerbe,
          gesamtverbrauch: 120000,
          surchargeCt: 4,
          kreditcheckConfirmed: true,
          lieferbeginnConfirmed: false, // only 50% confirmed
        }),
      ],
    });
    const sofort = res.lines.find((l) => l.kategorie === 'gewerbe_sofort')!;
    expect(sofort.betrag).toBe(600); // 4800 × 50% confirmed × 25%
  });

  it('flags an over-cap surcharge without blocking it (I-21)', () => {
    const res = computeFachkonzeptRun({
      periode: '2026-06',
      config: defaultConfig(),
      reps: [emp('A')],
      contracts: [
        baseContract({
          id: 'g1',
          repId: 'A',
          clientType: ClientType.Gewerbe,
          gesamtverbrauch: 100000,
          surchargeCt: 5, // over the 4 ct cap
          kreditcheckConfirmed: true,
          lieferbeginnConfirmed: true,
        }),
      ],
    });
    const sofort = res.lines.find((l) => l.kategorie === 'gewerbe_sofort')!;
    expect(sofort.datencheck).toBe(true);
    expect(res.warnungen.length).toBeGreaterThan(0);
    expect(sofort.betrag).toBe(1250); // 100000 × 5 ct = 5000 → 25%
  });

  it('pays partners raw (partner tiers, no Fixum, no storno withholding)', () => {
    const res = computeFachkonzeptRun({
      periode: '2026-06',
      config: defaultConfig(),
      reps: [emp('P', { isPartner: true })],
      contracts: [baseContract({ id: 'c1', repId: 'P' })],
    });
    const p = res.repSummaries.find((r) => r.repId === 'P')!;
    expect(p.isPartner).toBe(true);
    expect(p.tierRate).toBe(90); // partner tier base rate
    expect(p.variableProvision).toBe(90);
    expect(p.auszahlung).toBe(90); // raw, no Fixum protection
    expect(p.stornoEinbehalt).toBe(0);
  });
});
