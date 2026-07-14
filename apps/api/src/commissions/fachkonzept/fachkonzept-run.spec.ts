import { ClientType, ConfigKey, FACHKONZEPT_DEFAULTS, STATUS_MASTER_DEFAULTS, StartDeliveryType, TariffEnergyType, Tier } from '@blitzon/shared';
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
    // I-06: qualifying statuses now come from the status master, not config.
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
  actualSwaProvision: null,
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

  it('computes the SWA tier company-wide and reports per-contract deviations (I-14)', () => {
    const res = computeFachkonzeptRun({
      periode: '2026-06',
      config: defaultConfig(),
      reps: [emp('A')],
      contracts: [
        // actual €160 matches the reached tier ⇒ ok
        baseContract({ id: 'c1', repId: 'A', actualSwaProvision: 160 }),
        // actual €120 deviates from the €160 tier ⇒ abweichung
        baseContract({ id: 'c2', repId: 'A', actualSwaProvision: 120 }),
        // no actual yet ⇒ offen
        baseContract({ id: 'c3', repId: 'A', actualSwaProvision: null }),
      ],
    });
    expect(res.swaTier.qualifizierteNeukunden).toBe(3);
    expect(res.swaTier.erreichteStufe).toBe(160); // 0–99 anchor
    expect(res.swaTier.naechsteStufeAb).toBe(100);
    expect(res.plausibilities).toHaveLength(3);
    const byId = Object.fromEntries(res.plausibilities.map((p) => [p.contractId, p]));
    expect(byId.c1.status).toBe('ok');
    expect(byId.c2.status).toBe('abweichung');
    expect(byId.c2.abweichung).toBe(40);
    expect(byId.c3.status).toBe('offen');
    expect(res.swaTier.anzahlAbweichung).toBe(1);
    expect(res.swaTier.anzahlOffen).toBe(1);
  });

  it('counts commercial contracts into the SWA new-customer tier (I-14)', () => {
    const contracts = [
      ...Array.from({ length: 99 }, (_, i) => baseContract({ id: `n${i}`, repId: 'A' })),
      baseContract({
        id: 'g1', repId: 'A', clientType: ClientType.Gewerbe,
        gesamtverbrauch: 10000, surchargeCt: 3, kreditcheckConfirmed: true, lieferbeginnConfirmed: true,
      }),
    ];
    const res = computeFachkonzeptRun({ periode: '2026-06', config: defaultConfig(), reps: [emp('A')], contracts });
    // 99 private + 1 commercial = 100 ⇒ crosses into the €175 SWA tier.
    expect(res.swaTier.qualifizierteNeukunden).toBe(100);
    expect(res.swaTier.erreichteStufe).toBe(175);
    // the commercial contract's expected SWA is its engine total, not the flat tier rate.
    const g = res.plausibilities.find((p) => p.contractId === 'g1')!;
    expect(g.kategorie).toBe('gewerbe');
    expect(g.erwartet).toBe(300); // 10000 × 3 ct
  });

  it('recovers a carried negativsaldo from a later positive month (I-18)', () => {
    // 40 qualified new ⇒ €90 each ⇒ €3600 variable, storno 360, net 3240.
    // above Fixum = 3240 − 2116 = 1124 available to draw down a carried €800.
    const contracts = Array.from({ length: 40 }, (_, i) => baseContract({ id: `c${i}`, repId: 'A' }));
    const res = computeFachkonzeptRun({
      periode: '2026-06',
      config: defaultConfig(),
      reps: [emp('A', { negativsaldo: 800 })],
      contracts,
    });
    const a = res.repSummaries.find((r) => r.repId === 'A')!;
    expect(a.stornoEinbehalt).toBe(360);
    expect(a.negativsaldoRecovered).toBe(800);
    expect(a.negativsaldoDelta).toBe(-800);
    expect(a.negativsaldoAfter).toBe(0);
    expect(a.auszahlung).toBe(3240 - 800);
  });

  it('splits the storno withholding into private and commercial reserved shares (I-23)', () => {
    // one private new (€90 after tier? no — 1 new ⇒ €70) + one commercial immediate.
    const res = computeFachkonzeptRun({
      periode: '2026-06',
      config: defaultConfig(),
      reps: [emp('A')],
      contracts: [
        baseContract({ id: 'c1', repId: 'A' }), // €70 private
        baseContract({
          id: 'g1', repId: 'A', clientType: ClientType.Gewerbe,
          gesamtverbrauch: 120000, surchargeCt: 4, kreditcheckConfirmed: true, lieferbeginnConfirmed: true,
        }), // €1200 commercial immediate
      ],
    });
    const a = res.repSummaries.find((r) => r.repId === 'A')!;
    // variable = 70 + 1200 = 1270 (< Fixum) ⇒ no storno withholding this month.
    expect(a.variableProvision).toBe(1270);
    expect(a.stornoEinbehalt).toBe(0);
    expect(a.stornoEinbehaltPrivat).toBe(0);
    expect(a.stornoEinbehaltGewerbe).toBe(0);
  });

  it('attributes the storno split proportionally in a positive month (I-23)', () => {
    // 40 private new (€90 each = €3600) + one commercial immediate (€1200) = €4800 var.
    const contracts = [
      ...Array.from({ length: 40 }, (_, i) => baseContract({ id: `c${i}`, repId: 'A' })),
      baseContract({
        id: 'g1', repId: 'A', clientType: ClientType.Gewerbe,
        gesamtverbrauch: 120000, surchargeCt: 4, kreditcheckConfirmed: true, lieferbeginnConfirmed: true,
      }),
    ];
    const res = computeFachkonzeptRun({ periode: '2026-06', config: defaultConfig(), reps: [emp('A')], contracts });
    const a = res.repSummaries.find((r) => r.repId === 'A')!;
    expect(a.variableProvision).toBe(4800);
    expect(a.stornoEinbehalt).toBe(480); // 10% of 4800
    // gewerbe share = 480 × 1200/4800 = 120 ; private = 360.
    expect(a.stornoEinbehaltGewerbe).toBe(120);
    expect(a.stornoEinbehaltPrivat).toBe(360);
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

  // I-26 · inactive employee with open risks: standard payout is held
  it('holds the standard payout of an inactive rep with open risks (I-26)', () => {
    const contracts = Array.from({ length: 40 }, (_, i) => baseContract({ id: `c${i}`, repId: 'A' }));
    const res = computeFachkonzeptRun({
      periode: '2026-06',
      config: defaultConfig(),
      reps: [emp('A', { aktiv: false, offeneRisiken: true })],
      contracts,
    });
    const a = res.repSummaries.find((r) => r.repId === 'A')!;
    // Commission is still computed and the storno withholding still accrues …
    expect(a.variableProvision).toBe(3600);
    expect(a.stornoEinbehalt).toBe(360);
    // … but the cash-out is blocked (released later via a manual storno freigabe).
    expect(a.auszahlungGesperrt).toBe(true);
    expect(a.auszahlung).toBe(0);
    expect(res.warnungen.some((w) => w.includes('I-26'))).toBe(true);
  });

  it('does not hold an inactive rep who no longer carries open risks (I-26)', () => {
    const contracts = Array.from({ length: 40 }, (_, i) => baseContract({ id: `c${i}`, repId: 'A' }));
    const res = computeFachkonzeptRun({
      periode: '2026-06',
      config: defaultConfig(),
      reps: [emp('A', { aktiv: false, offeneRisiken: false })],
      contracts,
    });
    const a = res.repSummaries.find((r) => r.repId === 'A')!;
    expect(a.auszahlungGesperrt).toBe(false);
    expect(a.auszahlung).toBe(3240);
  });
});
