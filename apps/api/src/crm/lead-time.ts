/**
 * Pure lead-time rule for contract intake (I-31, Fachkonzept ch. 5.3 / 16).
 *
 * A contract may only be taken if the pre-contract does not run longer than the
 * configured lead time (default 365 days, I-01) from the intake day to the
 * requested delivery start. If it runs longer the SWA status becomes
 * "abgelehnt" with the reason "Vorlaufzeit zu lang", and the tool schedules a
 * follow-up (Wiedervorlage, I-32) for the first admissible intake day — the day
 * on which the same contract could be taken within the lead time.
 *
 * The delivery start is the day after the pre-contract ends (the new supply
 * begins the day the old contract lapses); callers may pass an explicit
 * requested delivery start instead. Everything here is deterministic and side
 * effect free so the worked example can be pinned as a test:
 *   pre-contract ending 01.10.2027 ⇒ first admissible intake day 02.10.2026.
 */

/** The exact SWA rejection reason set on a lead-time breach (Fachkonzept ch. 5.3). */
export const LEAD_TIME_REJECTION_REASON = 'Vorlaufzeit zu lang';

export interface LeadTimeInput {
  /** The day the contract is (or would be) taken — ISO YYYY-MM-DD. */
  intakeDate: string;
  /** Pre-contract end (Vorvertrag). Delivery starts the day after. */
  vorvertragEnde?: string | null;
  /** Explicit requested delivery start, if the source supplies one directly. */
  requestedDeliveryStart?: string | null;
  /** Configured lead time in days (I-01, default 365). */
  leadTimeDays: number;
}

export interface LeadTimeResult {
  /** Whether the contract may be taken on `intakeDate` within the lead time. */
  admissible: boolean;
  /** `LEAD_TIME_REJECTION_REASON` on a breach, otherwise null. */
  rejectionReason: string | null;
  /** The delivery start the rule evaluated against (day after the pre-contract). */
  deliveryStart: string | null;
  /** First intake day on which the contract could be taken within the lead time. */
  firstAdmissibleDate: string | null;
  /** Distance intake → delivery start in days (the effective "lead time" used). */
  leadDays: number | null;
}

const MS_PER_DAY = 86_400_000;

function parseISO(d: string): Date {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd));
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Add (or subtract) whole days to an ISO date in UTC (no DST drift). */
export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

/** Whole days from `a` to `b` (negative if `b` is before `a`). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / MS_PER_DAY);
}

/**
 * Resolve the requested delivery start: an explicit value wins, otherwise the
 * day after the pre-contract ends. Returns null if neither is known.
 */
export function resolveDeliveryStart(input: LeadTimeInput): string | null {
  if (input.requestedDeliveryStart) return input.requestedDeliveryStart;
  if (input.vorvertragEnde) return addDays(input.vorvertragEnde, 1);
  return null;
}

/**
 * Evaluate the lead-time rule at intake (I-31). With no delivery reference the
 * contract is admissible (the rule cannot fire), so an ordinary contract with no
 * pre-contract is unaffected.
 */
export function evaluateLeadTime(input: LeadTimeInput): LeadTimeResult {
  const deliveryStart = resolveDeliveryStart(input);
  if (!deliveryStart) {
    return { admissible: true, rejectionReason: null, deliveryStart: null, firstAdmissibleDate: null, leadDays: null };
  }
  const leadDays = daysBetween(input.intakeDate, deliveryStart);
  const firstAdmissibleDate = addDays(deliveryStart, -input.leadTimeDays);
  const admissible = leadDays <= input.leadTimeDays;
  return {
    admissible,
    rejectionReason: admissible ? null : LEAD_TIME_REJECTION_REASON,
    deliveryStart,
    firstAdmissibleDate,
    leadDays,
  };
}
