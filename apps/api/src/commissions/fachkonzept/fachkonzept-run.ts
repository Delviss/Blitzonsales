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
  PlausibilityStatus,
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
  plausibility,
  salaryProtection,
  swaTierLevel,
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
  /** SWA new-customer tier (I-14): drives the expected SWA commission. */
  swaNewCustomerTier: Tier[];
  /** absolute € tolerance for the plausibility control (I-14). */
  plausibilityToleranceAbs: number;
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
  /** whether the rep is currently active. Inactive reps with open risks are
   * blocked from standard payouts (I-26, Fachkonzept ch. 7.5). Defaults true. */
  aktiv?: boolean;
  /** whether the rep still carries open risks (open clawbacks / storno balance /
   * negative balance). Only relevant while inactive (I-26). */
  offeneRisiken?: boolean;
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
  /** actual SWA commission from the booking list — the plausibility truth (I-14). */
  actualSwaProvision: number | null;
  /** commercial SWA half confirmations (no prepayment, I-21). */
  kreditcheckConfirmed: boolean;
  lieferbeginnConfirmed: boolean;
}

/**
 * A late-arriving contract that belongs to an already **closed** month (I-34,
 * Fachkonzept ch. 12.3 / 5.2). After a month is closed its figures are
 * immutable, so a contract that only became commissionable afterwards (the
 * classic July-negative → August-positive case, ch. 14.1) is booked in the
 * current open month as an **addendum**, tagged with the original capture month
 * and SWA order number rather than reopening the closed month.
 */
export interface AddendumContract extends RunContract {
  /** the original (now closed) capture month this correction belongs to (JJJJ-MM). */
  urspruungsMonat: string;
  /** SWA order number of the original contract, carried for the reference. */
  swaOrderNumber?: string | null;
}

export interface FachkonzeptRunInput {
  periode: string; // JJJJ-MM
  config: FachkonzeptRunConfig;
  reps: RunRep[];
  contracts: RunContract[];
  /** contracts from earlier closed months booked in this month as addenda (I-34). */
  addenda?: AddendumContract[];
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
  /** true when this line settles a contract from an already-closed month (I-34). */
  istAddendum?: boolean;
  /** the original capture month referenced by an addendum line (I-34). */
  urspruungsMonat?: string | null;
}

export interface RepSummary {
  repId: string;
  isPartner: boolean;
  qualifiedNewCount: number;
  tierRate: number;
  /** gross variable commission due this month (own lines + overheads earned). */
  variableProvision: number;
  /** paid out after salary protection / storno withholding / negative-balance recovery. */
  auszahlung: number;
  /** signed change to the negative-commission balance (+accrual / −recovery, I-18). */
  negativsaldoDelta: number;
  /** portion of the carried negative balance recovered this month (I-18). */
  negativsaldoRecovered: number;
  /** the rep's negative-commission balance after this run (I-18). */
  negativsaldoAfter: number;
  /** 10% withheld into the storno account (employee only, I-18). */
  stornoEinbehalt: number;
  /** storno withholding attributed to private commission (I-23 ch. 10.1). */
  stornoEinbehaltPrivat: number;
  /** storno withholding attributed to commercial commission (I-23 ch. 10.1). */
  stornoEinbehaltGewerbe: number;
  /** standard payout held because the rep is inactive with open risks (I-26).
   * The commission is still computed and the storno withholding still accrues;
   * only the cash-out is blocked, released later via a manual storno freigabe. */
  auszahlungGesperrt: boolean;
}

/**
 * Expected-vs-actual SWA commission for one contract in the billing month
 * (I-14). Existing customers and unqualified new contracts are excluded from the
 * SWA tier and get no plausibility row.
 */
export interface PlausibilitySummary {
  contractId: string;
  kategorie: 'neukunde' | 'gewerbe';
  erwartet: number;
  tatsaechlich: number | null;
  abweichung: number | null;
  status: PlausibilityStatus;
}

/** Monthly SWA new-customer tier + plausibility roll-up (I-14). */
export interface SwaTierSummary {
  /** company-wide qualified new-customer volume feeding the SWA tier (new private + all commercial). */
  qualifizierteNeukunden: number;
  /** per-contract rate at the reached tier. */
  erreichteStufe: number;
  naechsteStufeAb: number | null;
  naechsteStufeSatz: number | null;
  erwartetGesamt: number;
  tatsaechlichGesamt: number;
  abweichungGesamt: number;
  anzahlAbweichung: number;
  anzahlOffen: number;
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
  /** per-contract expected-vs-actual SWA commission (I-14). */
  plausibilities: PlausibilitySummary[];
  /** monthly SWA new-customer tier + plausibility roll-up (I-14). */
  swaTier: SwaTierSummary;
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
  const { config: c, reps } = input;
  const repById = new Map(reps.map((r) => [r.id, r]));
  const lines: RunLine[] = [];
  const reserves: ReserveSummary[] = [];
  const plausibilities: PlausibilitySummary[] = [];
  const warnungen: string[] = [];

  // I-34: addenda are booked in this open month alongside the month's own
  // contracts, but every line they produce is tagged with the original (closed)
  // capture month so the closed month is never reopened. They otherwise flow
  // through the exact same qualification / tier / plausibility logic.
  const addenda = input.addenda ?? [];
  const addendumMonatById = new Map<string, string>(addenda.map((a) => [a.id, a.urspruungsMonat]));
  const contracts: RunContract[] = [...input.contracts, ...addenda];
  const pushLine = (l: RunLine): void => {
    const m = addendumMonatById.get(l.contractId);
    if (m) {
      l.istAddendum = true;
      l.urspruungsMonat = m;
      if (!l.begruendung.includes('Nachtrag')) {
        l.begruendung = `Nachtrag zu ${m}: ${l.begruendung}`;
      }
    }
    lines.push(l);
  };

  // Per-rep gross variable commission accumulator (own income + overheads earned)
  // and the subset that stems from commercial contracts (for the storno split, I-23).
  const variableByRep = new Map<string, number>();
  const variableGewerbeByRep = new Map<string, number>();
  const addVariable = (repId: string | null, amount: number, gewerbe = false) => {
    if (!repId || amount === 0) return;
    variableByRep.set(repId, round2((variableByRep.get(repId) ?? 0) + amount));
    if (gewerbe) variableGewerbeByRep.set(repId, round2((variableGewerbeByRep.get(repId) ?? 0) + amount));
  };

  const isQualifyingStatus = (s: string) => c.qualifyingStatuses.includes(s);
  const isNewPrivate = (ct: RunContract) =>
    asEnum(ct.clientType) === ClientType.Privat &&
    asEnum(ct.startDeliveryType) === StartDeliveryType.Neukunde;
  const isCommercial = (ct: RunContract) => asEnum(ct.clientType) === ClientType.Gewerbe;
  const meetsMin = (ct: RunContract) =>
    meetsMinimumVolume(asEnum(ct.energie) as TariffEnergyType, ct.verbrauch, {
      strom: c.minConsumptionStrom,
      gas: c.minConsumptionGas,
    });
  const newPrivateQualifies = (ct: RunContract) =>
    isNewPrivate(ct) && isQualifyingStatus(ct.status) && meetsMin(ct);

  // --- Pass 1: two counts -----------------------------------------------------
  //  · per-rep qualified new private customers → the employee/partner tier (I-15)
  //  · company-wide qualified new-customer volume → the SWA tier (I-14): every
  //    qualified new private contract plus every commercial contract (commercial
  //    always counts as new; existing customers are excluded).
  const qualifiedNewByRep = new Map<string, number>();
  let swaQualifiedNewCount = 0;
  for (const ct of contracts) {
    if (ct.repId && newPrivateQualifies(ct)) {
      qualifiedNewByRep.set(ct.repId, (qualifiedNewByRep.get(ct.repId) ?? 0) + 1);
    }
    if (newPrivateQualifies(ct) || isCommercial(ct)) swaQualifiedNewCount += 1;
  }
  const swaExpectedPerNewCustomer = tierRateForCount(swaQualifiedNewCount, c.swaNewCustomerTier);

  const addPlausibility = (
    contractId: string,
    kategorie: 'neukunde' | 'gewerbe',
    erwartet: number,
    tatsaechlich: number | null,
  ) => {
    const p = plausibility(erwartet, tatsaechlich, c.plausibilityToleranceAbs);
    plausibilities.push({ contractId, kategorie, ...p });
  };

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
        pushLine({
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
      pushLine({
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
      addVariable(ct.repId, shares.immediate, true);
      // I-14: commercial counts as new for the SWA tier count, but its expected
      // SWA commission is the commercial engine total (consumption × surcharge),
      // not the flat per-customer tier rate.
      addPlausibility(ct.id, 'gewerbe', total.totalCommission, ct.actualSwaProvision);
      pushLine({
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
      pushLine({
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
      // I-34: a carried-over addendum that still does not qualify stays silent —
      // it is not booked and produces no line, so it keeps being re-checked in
      // later months without cluttering every run with a €0 placeholder.
      if (addendumMonatById.has(ct.id)) continue;
      const grund = !isQualifyingStatus(ct.status)
        ? `Status "${ct.status}" qualifiziert nicht`
        : 'Mindestverbrauch nicht erreicht';
      pushLine({
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
    pushLine({
      contractId: ct.id,
      repId: ct.repId,
      kategorie: 'neukunde_staffel',
      betrag: rate,
      faellig: true,
      datencheck: false,
      begruendung: `Neukunde, Staffel bei ${count} qualifizierten Neukunden ⇒ € ${rate}/Vertrag`,
    });
    addVariable(ct.repId, rate);
    // I-14: expected SWA commission at the company-wide new-customer tier.
    addPlausibility(ct.id, 'neukunde', swaExpectedPerNewCustomer, ct.actualSwaProvision);
    emitOverheads();
  }

  // --- Pass 3: per-rep salary protection & storno withholding (I-18) --------
  const repSummaries: RepSummary[] = [];
  const involvedRepIds = new Set<string>([...variableByRep.keys(), ...qualifiedNewByRep.keys()]);
  // Attribute the storno withholding to private vs commercial commission for the
  // ch. 10.1 storno-account breakdown (I-23), proportional to their share of the
  // rep's variable commission.
  const splitStorno = (repId: string, stornoWithheld: number): { privat: number; gewerbe: number } => {
    const total = variableByRep.get(repId) ?? 0;
    if (stornoWithheld <= 0 || total <= 0) return { privat: 0, gewerbe: 0 };
    const gewerbeBase = variableGewerbeByRep.get(repId) ?? 0;
    const gewerbe = round2(stornoWithheld * (gewerbeBase / total));
    return { privat: round2(stornoWithheld - gewerbe), gewerbe };
  };
  for (const repId of involvedRepIds) {
    const rep = repById.get(repId);
    const isPartner = rep?.isPartner ?? false;
    const variable = variableByRep.get(repId) ?? 0;
    const qualifiedNewCount = qualifiedNewByRep.get(repId) ?? 0;
    const tiers = isPartner ? c.partnerTier : c.employeeTier;

    // I-26: an inactive rep who still carries open risks is blocked from
    // standard payouts; the commission is still computed but not paid out — a
    // release happens later as a manual storno freigabe.
    const inaktivGesperrt = rep?.aktiv === false && rep?.offeneRisiken === true;
    if (inaktivGesperrt) {
      warnungen.push(`Rep ${repId}: inaktiv mit offenen Risiken — Standard-Auszahlung gesperrt (I-26).`);
    }

    if (isPartner) {
      // Partners are not salaried: raw commission, no Fixum, no storno withholding.
      repSummaries.push({
        repId,
        isPartner,
        qualifiedNewCount,
        tierRate: tierRateForCount(qualifiedNewCount, tiers),
        variableProvision: variable,
        auszahlung: inaktivGesperrt ? 0 : variable,
        negativsaldoDelta: 0,
        negativsaldoRecovered: 0,
        negativsaldoAfter: 0,
        stornoEinbehalt: 0,
        stornoEinbehaltPrivat: 0,
        stornoEinbehaltGewerbe: 0,
        auszahlungGesperrt: inaktivGesperrt,
      });
      continue;
    }
    const carried = Number(rep?.negativsaldo ?? 0);
    const salary = salaryProtection(variable, { fixum: c.fixum, stornoRate: c.stornoAccountRate }, carried);
    const storno = splitStorno(repId, salary.stornoWithheld);
    repSummaries.push({
      repId,
      isPartner,
      qualifiedNewCount,
      tierRate: tierRateForCount(qualifiedNewCount, tiers),
      variableProvision: variable,
      auszahlung: inaktivGesperrt ? 0 : salary.paid,
      negativsaldoDelta: salary.negativeBalanceDelta,
      negativsaldoRecovered: salary.negativeBalanceRecovered,
      negativsaldoAfter: salary.negativeBalanceAfter,
      stornoEinbehalt: salary.stornoWithheld,
      stornoEinbehaltPrivat: storno.privat,
      stornoEinbehaltGewerbe: storno.gewerbe,
      auszahlungGesperrt: inaktivGesperrt,
    });
  }
  repSummaries.sort((a, b) => a.repId.localeCompare(b.repId));

  // --- SWA new-customer tier + plausibility roll-up (I-14) ------------------
  const level = swaTierLevel(swaQualifiedNewCount, c.swaNewCustomerTier);
  const withActual = plausibilities.filter((p) => p.tatsaechlich != null);
  const swaTier: SwaTierSummary = {
    qualifizierteNeukunden: swaQualifiedNewCount,
    erreichteStufe: level.reachedRate,
    naechsteStufeAb: level.nextThreshold,
    naechsteStufeSatz: level.nextRate,
    erwartetGesamt: round2(plausibilities.reduce((s, p) => s + p.erwartet, 0)),
    tatsaechlichGesamt: round2(withActual.reduce((s, p) => s + (p.tatsaechlich ?? 0), 0)),
    abweichungGesamt: round2(withActual.reduce((s, p) => s + (p.abweichung ?? 0), 0)),
    anzahlAbweichung: plausibilities.filter((p) => p.status === PlausibilityStatus.Abweichung).length,
    anzahlOffen: plausibilities.filter((p) => p.status === PlausibilityStatus.Offen).length,
  };
  if (swaTier.anzahlAbweichung > 0) {
    warnungen.push(`${swaTier.anzahlAbweichung} Vertrag/Verträge mit SWA-Abweichung (Plausibilitätskontrolle, I-14).`);
  }

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
    plausibilities,
    swaTier,
    totals: { faelligGesamt, rueckstellungGesamt, stornoEinbehaltGesamt, reserveTargetGesamt, anzahlDatencheck },
    warnungen,
  };
}
