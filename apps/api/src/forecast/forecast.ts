/**
 * Pure projection helper for the live forecast / preview (I-16, Fachkonzept
 * ch. 11.3).
 *
 * During the running month the tool shows a provisional projection from the
 * current live data: the employee/partner tier and the SWA tier including the
 * retroactive switch (e.g. 10×€70 → at the 40th, 40×€90), the running progress
 * toward the next threshold, and — because nothing is payable until the SWA list
 * confirms it — reversals / status changes that arrived after the last sync as
 * explicit warnings with their financial impact.
 *
 * This module only shapes data that the service has already loaded; it holds no
 * side effects so the retroactive-switch and threshold maths can be unit tested.
 */
import { Tier } from '@blitzon/shared';
import { swaTierLevel } from '../commissions/fachkonzept/fachkonzept-engine';

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** A rep's live tier progress toward the next retroactive threshold (I-16). */
export interface RepTierProjection {
  repId: string;
  isPartner: boolean;
  /** qualified new customers so far this month. */
  qualifiedNewCount: number;
  /** per-contract rate at the currently reached tier (retroactive). */
  reachedRate: number;
  /** the next threshold count, or null if already at the top tier. */
  nextThreshold: number | null;
  /** the per-contract rate once the next threshold is reached, or null. */
  nextRate: number | null;
  /** how many more qualified new customers until the next threshold, or null. */
  bisNaechsteStufe: number | null;
  /** provisional variable commission projected so far. */
  variableProvision: number;
  /**
   * projected additional payout if the next threshold is reached — the
   * retroactive uplift applied to the whole month (count+1) minus the current
   * projection. Null at the top tier.
   */
  potenzialNaechsteStufe: number | null;
}

/** A reversal / late status change surfaced as a warning with its impact (I-16). */
export interface ReversalWarning {
  contractId: string;
  swaOrderNumber: string | null;
  kunde: string | null;
  repId: string | null;
  status: string;
  /** money at risk of being reversed (negative = reduces the projection). */
  finanzielleAuswirkung: number;
}

export interface ReversalInput {
  contractId: string;
  swaOrderNumber: string | null;
  kunde: string | null;
  repId: string | null;
  status: string;
  betrag: number;
}

/**
 * Project a rep's tier progress. The retroactive switch is modelled exactly like
 * the run: the reached rate applies to the *whole* month, and the potential of
 * the next threshold is the uplift across all `count + 1` contracts.
 */
export function projectRepTier(
  repId: string,
  isPartner: boolean,
  qualifiedNewCount: number,
  variableProvision: number,
  tiers: Tier[],
): RepTierProjection {
  const level = swaTierLevel(qualifiedNewCount, tiers);
  let potenzial: number | null = null;
  if (level.nextThreshold != null && level.nextRate != null) {
    // At the next threshold every contract of the month pays the next rate.
    const projectedAtNext = round2(level.nextThreshold * level.nextRate);
    const currentTierValue = round2(qualifiedNewCount * level.reachedRate);
    potenzial = round2(projectedAtNext - currentTierValue);
  }
  return {
    repId,
    isPartner,
    qualifiedNewCount,
    reachedRate: level.reachedRate,
    nextThreshold: level.nextThreshold,
    nextRate: level.nextRate,
    bisNaechsteStufe: level.nextThreshold != null ? level.nextThreshold - qualifiedNewCount : null,
    variableProvision: round2(variableProvision),
    potenzialNaechsteStufe: potenzial,
  };
}

/** Build the reversal warnings and their aggregate financial impact (I-16). */
export function projectReversals(inputs: ReversalInput[]): { warnings: ReversalWarning[]; impactGesamt: number } {
  const warnings = inputs.map((r) => ({
    contractId: r.contractId,
    swaOrderNumber: r.swaOrderNumber,
    kunde: r.kunde,
    repId: r.repId,
    status: r.status,
    finanzielleAuswirkung: round2(-Math.abs(r.betrag)),
  }));
  const impactGesamt = round2(warnings.reduce((s, w) => s + w.finanzielleAuswirkung, 0));
  return { warnings, impactGesamt };
}
