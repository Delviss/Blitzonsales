/**
 * Pure calculation core for the BlitzON Fachkonzept commission model.
 *
 * Every function here is deterministic and side-effect free so it can be unit
 * tested against the worked examples in the Fachkonzept (ch. 14). None of the
 * business values are hardcoded: callers resolve them from the versioned config
 * store (I-01) and pass them in. Persistence, API wiring and the SWA sync live
 * elsewhere; this module is only the maths.
 */
import { TariffEnergyType, RepRole, Tier, resolveTierRate } from '@blitzon/shared';

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// ---------------------------------------------------------------------------
// I-13 · Qualification & minimum volume
// ---------------------------------------------------------------------------

export interface MinimumVolumeConfig {
  strom: number; // default 1000 kWh
  gas: number; // default 4000 kWh
}

/**
 * A private contract below the minimum consumption is not commissionable at
 * all: no SWA commission, no payout, no tier count (Fachkonzept ch. 6.2).
 * Electricity and gas are evaluated separately. Commercial contracts are not
 * subject to the private minimum.
 */
export function meetsMinimumVolume(
  energie: TariffEnergyType,
  verbrauch: number | null,
  cfg: MinimumVolumeConfig,
): boolean {
  if (verbrauch == null) return false;
  const min = energie === TariffEnergyType.Gas ? cfg.gas : cfg.strom;
  return verbrauch >= min;
}

// ---------------------------------------------------------------------------
// I-14 / I-15 · Retroactive tiers (Staffeln)
// ---------------------------------------------------------------------------

/**
 * Total monthly payout for a rep/partner given the number of *qualified* new
 * customers in the billing month. The reached tier rate applies retroactively
 * to every contract of the month — the 40th new customer recomputes the whole
 * month to €90 (not 39×€70 + 1×€90) (Fachkonzept ch. 7.1, issue I-15).
 */
export function retroactiveMonthlyPayout(qualifiedNewCount: number, tiers: Tier[]): number {
  if (qualifiedNewCount <= 0) return 0;
  const rate = resolveTierRate(qualifiedNewCount, tiers);
  return round2(qualifiedNewCount * rate);
}

/** Per-contract rate at the reached tier (the retroactive rate). */
export function tierRateForCount(qualifiedNewCount: number, tiers: Tier[]): number {
  return resolveTierRate(qualifiedNewCount, tiers);
}

// ---------------------------------------------------------------------------
// I-20 · Existing-customer flat compensation
// ---------------------------------------------------------------------------

export interface ExistingCustomerConfig {
  swaRevenue: number; // €50 net
  employeePayout: number; // €25 (gross-salary basis)
  partnerPayout: number; // €25 net
}

export interface ExistingCustomerResult {
  swaRevenue: number;
  employeePayout: number;
  partnerPayout: number;
  countsTowardTier: false;
}

/**
 * Existing private customers have a flat compensation and never enter a tier
 * (Fachkonzept ch. 6.2, issue I-20).
 */
export function existingCustomerCompensation(cfg: ExistingCustomerConfig): ExistingCustomerResult {
  return {
    swaRevenue: cfg.swaRevenue,
    employeePayout: cfg.employeePayout,
    partnerPayout: cfg.partnerPayout,
    countsTowardTier: false,
  };
}

// ---------------------------------------------------------------------------
// I-19 · Trainer / team-lead overheads
// ---------------------------------------------------------------------------

export interface OverheadConfig {
  trainerNew: number; // €5
  trainerCommercial: number; // €20
  teamLeadNew: number; // €10
  teamLeadCommercial: number; // €60
}

export interface OverheadClaim {
  role: RepRole.Trainer | RepRole.TeamLead;
  beneficiaryRepId: string;
  amount: number;
  energie: TariffEnergyType;
}

/**
 * Overheads flow only via a *direct* training relationship; there is no
 * multi-level pyramid. The team-lead amount *replaces* the trainer amount (no
 * addition). Electricity + gas produce two separate claims (Fachkonzept ch.
 * 7.2, issue I-19).
 *
 * @param assignments one entry per energy contract with the directly-assigned
 *   trainer and team-lead (either may be absent) as of the capture date.
 */
export function overheadClaims(
  assignments: Array<{
    energie: TariffEnergyType;
    trainerRepId: string | null;
    teamLeadRepId: string | null;
    isCommercial: boolean;
  }>,
  cfg: OverheadConfig,
): OverheadClaim[] {
  const claims: OverheadClaim[] = [];
  for (const a of assignments) {
    if (a.teamLeadRepId) {
      // Team-lead replaces trainer.
      claims.push({
        role: RepRole.TeamLead,
        beneficiaryRepId: a.teamLeadRepId,
        amount: a.isCommercial ? cfg.teamLeadCommercial : cfg.teamLeadNew,
        energie: a.energie,
      });
    } else if (a.trainerRepId) {
      claims.push({
        role: RepRole.Trainer,
        beneficiaryRepId: a.trainerRepId,
        amount: a.isCommercial ? cfg.trainerCommercial : cfg.trainerNew,
        energie: a.energie,
      });
    }
  }
  return claims;
}

// ---------------------------------------------------------------------------
// I-21 · Commercial (Gewerbe) engine
// ---------------------------------------------------------------------------

export interface CommercialConfig {
  capStrom: number; // 4 ct
  capGas: number; // 2 ct
  employeeImmediate: number; // 0.25
  employeeRetention: number; // 0.25
  partnerImmediate: number; // 0.35
  partnerRetention: number; // 0.35
}

export type CommercialHalf = 'kreditpruefung' | 'lieferbeginn';

export interface CommercialTotalResult {
  totalCommission: number;
  surchargeCapped: boolean;
}

/**
 * Total commercial commission = total consumption × surcharge (ct → €),
 * rounded to 2 decimals. Over-cap surcharges are flagged red but *not* blocked
 * (Fachkonzept ch. 9.1, issue I-21). Example: 120,000 kWh × 4 ct = €4,800.
 */
export function commercialTotalCommission(
  totalConsumptionKwh: number,
  surchargeCt: number,
  energie: TariffEnergyType,
  cfg: CommercialConfig,
): CommercialTotalResult {
  const cap = energie === TariffEnergyType.Gas ? cfg.capGas : cfg.capStrom;
  return {
    totalCommission: round2(totalConsumptionKwh * (surchargeCt / 100)),
    surchargeCapped: surchargeCt > cap,
  };
}

/**
 * SWA pays the total in two halves — 50% after the credit check, 50% at
 * delivery start. A share becomes due only when its matching SWA half is
 * confirmed (no prepayment) (issue I-21).
 */
export function commercialSwaHalf(total: number): number {
  return round2(total * 0.5);
}

export interface CommercialShareResult {
  immediate: number;
  retention: number;
}

/**
 * Internal split 25% immediate + 25% retention; partner split 35% + 35%. The
 * retention share falls due 12 months after the *actual* first payout, and
 * only if the contract is still positive and the employee still active
 * (enforced by the caller). Amounts are per the confirmed portion of the total
 * (issue I-21).
 */
export function commercialShares(
  confirmedTotal: number,
  kind: 'employee' | 'partner',
  cfg: CommercialConfig,
): CommercialShareResult {
  const immediateRate = kind === 'partner' ? cfg.partnerImmediate : cfg.employeeImmediate;
  const retentionRate = kind === 'partner' ? cfg.partnerRetention : cfg.employeeRetention;
  return {
    immediate: round2(confirmedTotal * immediateRate),
    retention: round2(confirmedTotal * retentionRate),
  };
}

// ---------------------------------------------------------------------------
// I-24 · Commercial reserve (20%)
// ---------------------------------------------------------------------------

export interface ReserveConfig {
  reserveRate: number; // 0.20
  employerCostRate: number; // 0.30
}

export interface ReserveResult {
  profitBeforeReserve: number;
  reserveTarget: number;
}

/**
 * Per received SWA commercial payment (real receipts only):
 *   profitBeforeReserve = max(0, swaRevenue − directPayout − employerCost − directOverheads)
 *   reserveTarget       = reserveRate × profitBeforeReserve
 * The reserve is non-freely-available liquidity, released only after contract
 * end / final billing (Fachkonzept ch. 10.2, issue I-24). Employer cost is
 * charged on the direct payout.
 */
export function commercialReserve(
  swaRevenue: number,
  directPayout: number,
  directOverheads: number,
  cfg: ReserveConfig,
): ReserveResult {
  const employerCost = directPayout * cfg.employerCostRate;
  const profitBeforeReserve = Math.max(0, swaRevenue - directPayout - employerCost - directOverheads);
  return {
    profitBeforeReserve: round2(profitBeforeReserve),
    reserveTarget: round2(cfg.reserveRate * profitBeforeReserve),
  };
}

// ---------------------------------------------------------------------------
// I-25 · Clawbacks & offsetting order
// ---------------------------------------------------------------------------

/** The fixed offsetting order for a clawback receivable (Fachkonzept ch. 9.4). */
export enum OffsetTarget {
  StornoAccount = 'storno_account',
  CurrentCommission = 'current_commission',
  OpenRetention = 'open_retention',
  InvoiceDeparted = 'invoice_departed',
  Collections = 'collections',
}

export interface OffsetSource {
  target: OffsetTarget;
  available: number;
}

export interface OffsetApplication {
  target: OffsetTarget;
  applied: number;
}

export interface ClawbackResult {
  passThrough: number;
  offsets: OffsetApplication[];
  remaining: number;
}

/**
 * Compute the causer-accurate pass-through of an SWA clawback and offset it in
 * the fixed order: storno account → current commission → open retention
 * commission → invoice to a departed employee → collections. The remaining
 * receivable is always reconstructable (Fachkonzept ch. 9.4, issue I-25).
 *
 * Example: €2,000 SWA clawback × 50% employee share = €1,000 pass-through.
 *
 * @param sources available amounts per offset target, applied in enum order.
 */
export function clawbackOffset(
  swaClawback: number,
  causerShare: number,
  sources: OffsetSource[],
): ClawbackResult {
  const passThrough = round2(Math.abs(swaClawback) * causerShare);
  const order = [
    OffsetTarget.StornoAccount,
    OffsetTarget.CurrentCommission,
    OffsetTarget.OpenRetention,
    OffsetTarget.InvoiceDeparted,
    OffsetTarget.Collections,
  ];
  let remaining = passThrough;
  const offsets: OffsetApplication[] = [];
  for (const target of order) {
    if (remaining <= 0) break;
    const source = sources.find((s) => s.target === target);
    if (!source || source.available <= 0) continue;
    const applied = round2(Math.min(remaining, source.available));
    offsets.push({ target, applied });
    remaining = round2(remaining - applied);
  }
  return { passThrough, offsets, remaining: round2(remaining) };
}

// ---------------------------------------------------------------------------
// I-18 · Base salary, negative balance & 10% storno account
// ---------------------------------------------------------------------------
//
// NOTE: the exact ch. 14.2 euro figures require the full Fachkonzept document
// (the issue body is truncated in the tracker). The invariants below are the
// unambiguous ones: two strictly separate accounts, salary protection to the
// Fixum, and a 10% storno withholding on the positive commission. The precise
// interaction (e.g. whether the withholding is netted before or after salary
// protection) is flagged as an open question and must be confirmed against the
// Fachkonzept before the first real payout.

export interface SalaryConfig {
  fixum: number; // €2,116
  stornoRate: number; // 0.10
}

export interface SalaryResult {
  /** Amount actually paid out to the employee this month (gross-salary basis). */
  paid: number;
  /** Change to the negative commission balance (advance from salary protection). */
  negativeBalanceDelta: number;
  /** Amount withheld into the storno account (10% of positive commission). */
  stornoWithheld: number;
}

/**
 * Salary protection with two strictly separate accounts (issue I-18):
 *  - variable commission P below the Fixum F ⇒ the employee is paid F and the
 *    shortfall (F − P) accrues to the *negative commission balance* (an advance
 *    recovered from later positive months).
 *  - P at or above F ⇒ 10% of P is withheld into the *storno account*; the two
 *    accounts never mix.
 */
export function salaryProtection(variableCommission: number, cfg: SalaryConfig): SalaryResult {
  const P = variableCommission;
  const F = cfg.fixum;
  if (P < F) {
    return { paid: round2(F), negativeBalanceDelta: round2(F - P), stornoWithheld: 0 };
  }
  const stornoWithheld = round2(P * cfg.stornoRate);
  return { paid: round2(P - stornoWithheld), negativeBalanceDelta: 0, stornoWithheld };
}
