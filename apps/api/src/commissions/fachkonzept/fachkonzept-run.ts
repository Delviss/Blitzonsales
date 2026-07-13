/**
 * Pure month-orchestration for the BlitzON Fachkonzept commission model.
 *
 * `fachkonzept-engine.ts` holds the individual, worked-example-tested formulas;
 * this module composes them into a whole monthly Provisionslauf. It is still
 * completely pure and deterministic: the service layer resolves the versioned
 * config (I-01) and loads contracts/reps, hands them in as plain data, and this
 * function returns the lines to persist plus the per-rep salary/storno summary
 * and the commercial reserves. Persistence, RBAC and the ledger writes live in
 * `FachkonzeptRunService`.
 *
 * The retroactive tier (I-15) is the reason this cannot be done per-contract:
 * the reached tier for a rep's *whole* month sets the per-contract rate, so the
 * month has to be aggregated before any single line amount is known.
 */
import {
  ClientType,
  StartDeliveryType,
  TariffEnergyType,
  Tier,
} from '@blitzon/shared';
import {
  commercialReserve,
  commercialShares,
  commercialTotalCommission,
  existingCustomerCompensation,
  meetsMinimumVolume,
  overheadClaims,
  salaryProtection,
  tierRateForCount,
} from './fachkonzept-engine';

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** All business values the run needs, already resolved as-of the period (I-01). */
export interface FachkonzeptRunConfig {
  qualifyingStatuses: string[];
  minConsumptionStrom: number;
  minConsumptionGas: number;
  employeeTier: Tier[];
  partnerTier: Tier[];
  fixum: number;
  employerCostRate: number;
  overheadTrainerNew: number;
  overheadTrainerCommercial: number;
  overheadTeamLeadNew: number;
  overheadTeamLeadCommercial: number;
  existingCustomerSwaRevenue: number;
  existingCustomerEmployeePayout: number;
  existingCustomerPartnerPayout: number;
  commercialShareEmployeeImmediate: number;
  commercialShareEmployeeRetention: number;
  commercialSharePartnerImmediate: number;
  commercialSharePartnerRetention: number;
  commercialSurchargeCapStrom: number;
  commercialSurchargeCapGas: number;
  commercialReserveRate: number;
  stornoAccountRate: number;
}

/** A rep as the run sees it (master data resolved by the service). */
export interface RunRep {
  id: string;
  /** partner org ⇒ partner tiers/shares and no salaried Fixum; else employee. */
  isPartner: boolean;
  /** directly-assigned trainer/team-lead of *this* rep (I-19, no pyramid). */
  trainerId: string | null;
  teamleadId: string | null;
  /** carried negative-commission balance (I-18), informational for this run. */
  negativsaldo: number;
}

/** A contract normalized to exactly what the engine consumes. */
export interface RunContract {
  id: string;
  repId: string | null;
  status: string;
  clientType: ClientType | string | null;
  startDeliveryType: StartDeliveryType | string | null;
  energie: TariffEnergyType | string | null;
  /** private consumption for the minimum-volume gate (I-13). */
  verbrauch: number | null;
  /** total/annual consumption for the commercial engine (I-21). */
  gesamtverbrauch: number | null;
  /** surcharge ct/kWh for the commercial engine. */
  surchargeCt: number | null;
  /** SWA revenue actually received (feeds the commercial reserve, I-24). */
  swaRevenue: number | null;
  /** commercial SWA half confirmations (no prepayment, I-21). */
  kreditcheckConfirmed: boolean;
  lieferbeginnConfirmed: boolean;
}

export interface FachkonzeptRunInput {
  periode: string; // JJJJ-MM
  config: FachkonzeptRunConfig;
  reps: RunRep[];
  contracts: RunContract[];
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export type LineKategorie =
  | 'neukunde_staffel'
  | 'neukunde_unqualifiziert'
  | 'bestandskunde'
  | 'gewerbe_sofort'
  | 'gewerbe_ruecklage'
  | 'overhead_trainer'
  | 'overhead_teamlead';

export interface RunLine {
  contractId: string;
  /** the rep this amount is booked to (earner or overhead beneficiary). */
  repId: string | null;
  kategorie: LineKategorie;
  betrag: number;
  /** due for payout this month; retention/unqualified lines are not. */
  faellig: boolean;
  /** needs a human data-check (unqualified, over-cap surcharge, …). */
  datencheck: boolean;
  begruendung: string;
}

export interface RepSummary {
  repId: string;
  isPartner: boolean;
  qualifiedNewCount: number;
  tierRate: number;
  /** gross variable commission due this month (own lines + overheads earned). */
  variableProvision: number;
  /** paid out after salary protection / storno withholding. */
  auszahlung: number;
  /** advance added to the negative-commission balance (employee only, I-18). */
  negativsaldoDelta: number;
  /** 10% withheld into the storno account (employee only, I-18). */
  stornoEinbehalt: number;
}

export interface ReserveSummary {
  contractId: string;
  repId: string | null;
  swaRevenue: number;
  profitBeforeReserve: number;
  reserveTarget: number;
}

export interface FachkonzeptRunResult {
  periode: string;
  lines: RunLine[];
  repSummaries: RepSummary[];
  reserves: ReserveSummary[];
  /** run-level totals for quick display / reconciliation. */
  totals: {
    faelligGesamt: number;
    rueckstellungGesamt: number;
    stornoEinbehaltGesamt: number;
    reserveTargetGesamt: number;
    anzahlDatencheck: number;
  };
  warnungen: string[];
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

const asEnum = (v: unknown): string | null => (v == null ? null : String(v));

/**
 * Compute a full monthly Provisionslauf from resolved config + normalized data.
 * Deterministic and side-effect free.
 */
export function computeFachkonzeptRun(input: FachkonzeptRunInput): FachkonzeptRunResult {
  const { config: c, contracts, reps } = input;
  const repById = new Map(reps.map((r) => [r.id, r]));
  const lines: RunLine[] = [];
  const reserves: ReserveSummary[] = [];
  const warnungen: string[] = [];

  // Per-rep gross variable commission accumulator (own income + overheads earned).
  const variableByRep = new Map<string, number>();
  const addVariable = (repId: string | null, amount: number) => {
    if (!repId || amount === 0) return;
    variableByRep.set(repId, round2((variableByRep.get(repId) ?? 0) + amount));
  };

  // --- Pass 1: count qualified new private customers per rep (drives the tier) -
  const qualifiedNewByRep = new Map<string, number>();
  const isQualifyingStatus = (s: string) => c.qualifyingStatuses.includes(s);
  const isNewPrivate = (ct: RunContract) =>
    asEnum(ct.clientType) === ClientType.Privat &&
    asEnum(ct.startDeliveryType) === StartDeliveryType.Neukunde;
  const meetsMin = (ct: RunContract) =>
    meetsMinimumVolume(asEnum(ct.energie) as TariffEnergyType, ct.verbrauch, {
      strom: c.minConsumptionStrom,
      gas: c.minConsumptionGas,
    });

  for (const ct of contracts) {
    if (!ct.repId) continue;
    if (isNewPrivate(ct) && isQualifyingStatus(ct.status) && meetsMin(ct)) {
      qualifiedNewByRep.set(ct.repId, (qualifiedNewByRep.get(ct.repId) ?? 0) + 1);
    }
  }

  // --- Pass 2: build every line ---------------------------------------------
  for (const ct of contracts) {
    const rep = ct.repId ? repById.get(ct.repId) : undefined;
    const isPartner = rep?.isPartner ?? false;
    const tiers = isPartner ? c.partnerTier : c.employeeTier;
    const energie = asEnum(ct.energie) as TariffEnergyType;
    const commercial = asEnum(ct.clientType) === ClientType.Gewerbe;

    // Overheads follow every commissionable contract; emitted alongside below.
    const emitOverheads = () => {
      if (!rep) return;
      const claims = overheadClaims(
        [{ energie, trainerRepId: rep.trainerId, teamLeadRepId: rep.teamleadId, isCommercial: commercial }],
        {
          trainerNew: c.overheadTrainerNew,
          trainerCommercial: c.overheadTrainerCommercial,
          teamLeadNew: c.overheadTeamLeadNew,
          teamLeadCommercial: c.overheadTeamLeadCommercial,
        },
      );
      for (const claim of claims) {
        const kategorie: LineKategorie = claim.role === 'team_lead' ? 'overhead_teamlead' : 'overhead_trainer';
        lines.push({
          contractId: ct.id,
          repId: claim.beneficiaryRepId,
          kategorie,
          betrag: claim.amount,
          faellig: true,
          datencheck: false,
          begruendung: `Overhead (${claim.role}) für Vertrag ${ct.id}, ${claim.energie}`,
        });
        addVariable(claim.beneficiaryRepId, claim.amount);
      }
    };

    if (commercial) {
      // --- I-21 commercial engine ---
      const total = commercialTotalCommission(
        ct.gesamtverbrauch ?? 0,
        ct.surchargeCt ?? 0,
        energie,
        {
          capStrom: c.commercialSurchargeCapStrom,
          capGas: c.commercialSurchargeCapGas,
          employeeImmediate: c.commercialShareEmployeeImmediate,
          employeeRetention: c.commercialShareEmployeeRetention,
          partnerImmediate: c.commercialSharePartnerImmediate,
          partnerRetention: c.commercialSharePartnerRetention,
        },
      );
      if (total.surchargeCapped) {
        warnungen.push(`Vertrag ${ct.id}: Aufschlag ${ct.surchargeCt} ct überschreitet die Obergrenze.`);
      }
      // A share is due only for the confirmed SWA halves (no prepayment).
      const confirmedFraction = (ct.kreditcheckConfirmed ? 0.5 : 0) + (ct.lieferbeginnConfirmed ? 0.5 : 0);
      const confirmedTotal = round2(total.totalCommission * confirmedFraction);
      const shares = commercialShares(confirmedTotal, isPartner ? 'partner' : 'employee', {
        capStrom: c.commercialSurchargeCapStrom,
        capGas: c.commercialSurchargeCapGas,
        employeeImmediate: c.commercialShareEmployeeImmediate,
        employeeRetention: c.commercialShareEmployeeRetention,
        partnerImmediate: c.commercialSharePartnerImmediate,
        partnerRetention: c.commercialSharePartnerRetention,
      });
      lines.push({
        contractId: ct.id,
        repId: ct.repId,
        kategorie: 'gewerbe_sofort',
        betrag: shares.immediate,
        faellig: true,
        datencheck: total.surchargeCapped,
        begruendung:
          `Gewerbe Sofortanteil: bestätigt ${Math.round(confirmedFraction * 100)}% von € ${total.totalCommission.toFixed(2)}` +
          (total.surchargeCapped ? ' · Aufschlag über Obergrenze' : ''),
      });
      addVariable(ct.repId, shares.immediate);
      lines.push({
        contractId: ct.id,
        repId: ct.repId,
        kategorie: 'gewerbe_ruecklage',
        betrag: shares.retention,
        faellig: false, // due 12 months after actual first payout (I-21)
        datencheck: false,
        begruendung: 'Gewerbe Rückbehalt (12-Monats-Halteanteil), noch nicht fällig',
      });

      // --- I-24 commercial reserve on the real SWA receipt ---
      if (ct.swaRevenue && ct.swaRevenue > 0) {
        const directPayout = shares.immediate; // paid-out share drives employer cost
        const res = commercialReserve(ct.swaRevenue, directPayout, 0, {
          reserveRate: c.commercialReserveRate,
          employerCostRate: c.employerCostRate,
        });
        reserves.push({
          contractId: ct.id,
          repId: ct.repId,
          swaRevenue: ct.swaRevenue,
          profitBeforeReserve: res.profitBeforeReserve,
          reserveTarget: res.reserveTarget,
        });
      }
      emitOverheads();
      continue;
    }

    // --- Private existing customer (I-20) ---
    if (asEnum(ct.startDeliveryType) === StartDeliveryType.Bestandskunde) {
      if (!isQualifyingStatus(ct.status)) continue;
      const comp = existingCustomerCompensation({
        swaRevenue: c.existingCustomerSwaRevenue,
        employeePayout: c.existingCustomerEmployeePayout,
        partnerPayout: c.existingCustomerPartnerPayout,
      });
      const betrag = isPartner ? comp.partnerPayout : comp.employeePayout;
      lines.push({
        contractId: ct.id,
        repId: ct.repId,
        kategorie: 'bestandskunde',
        betrag,
        faellig: true,
        datencheck: false,
        begruendung: 'Bestandskunde Pauschale (zählt nicht zur Staffel)',
      });
      addVariable(ct.repId, betrag);
      emitOverheads();
      continue;
    }

    // --- Private new customer (I-13/I-15) ---
    const qualifies = isQualifyingStatus(ct.status) && meetsMin(ct);
    if (!qualifies) {
      const grund = !isQualifyingStatus(ct.status)
        ? `Status "${ct.status}" qualifiziert nicht`
        : 'Mindestverbrauch nicht erreicht';
      lines.push({
        contractId: ct.id,
        repId: ct.repId,
        kategorie: 'neukunde_unqualifiziert',
        betrag: 0,
        faellig: false,
        datencheck: true,
        begruendung: `Nicht provisionsberechtigt: ${grund}`,
      });
      continue;
    }
    const count = ct.repId ? qualifiedNewByRep.get(ct.repId) ?? 0 : 0;
    const rate = tierRateForCount(count, tiers); // retroactive rate for the whole month
    lines.push({
      contractId: ct.id,
      repId: ct.repId,
      kategorie: 'neukunde_staffel',
      betrag: rate,
      faellig: true,
      datencheck: false,
      begruendung: `Neukunde, Staffel bei ${count} qualifizierten Neukunden ⇒ € ${rate}/Vertrag`,
    });
    addVariable(ct.repId, rate);
    emitOverheads();
  }

  // --- Pass 3: per-rep salary protection & storno withholding (I-18) --------
  const repSummaries: RepSummary[] = [];
  const involvedRepIds = new Set<string>([...variableByRep.keys(), ...qualifiedNewByRep.keys()]);
  for (const repId of involvedRepIds) {
    const rep = repById.get(repId);
    const isPartner = rep?.isPartner ?? false;
    const variable = variableByRep.get(repId) ?? 0;
    const qualifiedNewCount = qualifiedNewByRep.get(repId) ?? 0;
    const tiers = isPartner ? c.partnerTier : c.employeeTier;

    if (isPartner) {
      // Partners are not salaried: raw commission, no Fixum, no storno withholding.
      repSummaries.push({
        repId,
        isPartner,
        qualifiedNewCount,
        tierRate: tierRateForCount(qualifiedNewCount, tiers),
        variableProvision: variable,
        auszahlung: variable,
        negativsaldoDelta: 0,
        stornoEinbehalt: 0,
      });
      continue;
    }
    const salary = salaryProtection(variable, { fixum: c.fixum, stornoRate: c.stornoAccountRate });
    repSummaries.push({
      repId,
      isPartner,
      qualifiedNewCount,
      tierRate: tierRateForCount(qualifiedNewCount, tiers),
      variableProvision: variable,
      auszahlung: salary.paid,
      negativsaldoDelta: salary.negativeBalanceDelta,
      stornoEinbehalt: salary.stornoWithheld,
    });
  }
  repSummaries.sort((a, b) => a.repId.localeCompare(b.repId));

  // --- Totals ---------------------------------------------------------------
  const faelligGesamt = round2(lines.filter((l) => l.faellig).reduce((s, l) => s + l.betrag, 0));
  const rueckstellungGesamt = round2(lines.filter((l) => !l.faellig).reduce((s, l) => s + l.betrag, 0));
  const stornoEinbehaltGesamt = round2(repSummaries.reduce((s, r) => s + r.stornoEinbehalt, 0));
  const reserveTargetGesamt = round2(reserves.reduce((s, r) => s + r.reserveTarget, 0));
  const anzahlDatencheck = lines.filter((l) => l.datencheck).length;

  return {
    periode: input.periode,
    lines,
    repSummaries,
    reserves,
    totals: { faelligGesamt, rueckstellungGesamt, stornoEinbehaltGesamt, reserveTargetGesamt, anzahlDatencheck },
    warnungen,
  };
}
