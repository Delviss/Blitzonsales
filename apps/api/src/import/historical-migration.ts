import { CLAWBACK_STATUS, ClientType, KEIN_SATZ_STATUS, VertragStatus } from '@blitzon/shared';

/**
 * The source-agnostic view of a contract used to decide whether it belongs to
 * the *required historical migration set* (I-12, Fachkonzept ch. 4.2). Go-live
 * must migrate the still-open / at-risk contracts; older, fully-settled
 * contracts may be imported as archive only.
 */
export interface RiskContractView {
  clientType: string | null;
  status: string | null;
  /** Reference date the risk is judged against (usually the go-live date). */
  referenceDate: string;
  erfassungsdatum: string | null;
  lieferbeginn: string | null;
  /** Storno liability window in months (ConfigKey.StornoProtectionMonths). */
  stornoProtectionMonths: number;
  swaGesamtprovision: number | null;
  swaZahlbetrag: number | null;
  /** The 20% commercial reserve has not yet been released. */
  reserveOffen: boolean;
  /** The 12-month commercial retention commission is not yet due/released. */
  retentionOffen: boolean;
  /** Total consumption vs. the contractually expected consumption. */
  gesamtverbrauch: number | null;
  erwarteterVerbrauch: number | null;
}

export type RiskReason =
  | 'privat_stornohaftung'
  | 'gewerbe_zweite_swa_haelfte'
  | 'gewerbe_retention_offen'
  | 'gewerbe_ruecklage_offen'
  | 'gewerbe_unterverbrauch';

/** Whole months from `from` to `to` (negative if `to` precedes `from`). */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  return months;
}

/**
 * Classify a contract's historical migration risk (I-12). Returns every reason
 * it is still at risk; an empty result means it is settled and may be archived
 * rather than actively migrated.
 *
 *   • Private: still within the 6-month storno liability window and still
 *     commission-bearing (not already reversed / rejected).
 *   • Commercial: any open exposure — an unpaid 2nd SWA half, open retention
 *     commission, an unreleased 20% reserve, or possible under-consumption.
 */
export function classifyHistoricalRisk(v: RiskContractView): RiskReason[] {
  const reasons: RiskReason[] = [];
  const isCommercial = v.clientType === ClientType.Gewerbe;
  const status = (v.status ?? '') as VertragStatus;
  const reversed = CLAWBACK_STATUS.has(status);
  const rejected = KEIN_SATZ_STATUS.has(status);

  if (!isCommercial) {
    // Private: at risk while inside the storno liability window and still
    // commission-bearing (an already-reversed/rejected contract is resolved).
    const anchor = v.lieferbeginn ?? v.erfassungsdatum;
    if (anchor && !reversed && !rejected) {
      const elapsed = monthsBetween(anchor, v.referenceDate);
      if (elapsed < v.stornoProtectionMonths) reasons.push('privat_stornohaftung');
    }
    return reasons;
  }

  // Commercial: a rejected contract carries no exposure; everything else is
  // checked for each open component.
  if (rejected) return reasons;

  // Open 2nd SWA half: less has been paid than the total (unknown ⇒ treat as open).
  if (v.swaGesamtprovision == null || v.swaZahlbetrag == null || v.swaZahlbetrag < v.swaGesamtprovision) {
    reasons.push('gewerbe_zweite_swa_haelfte');
  }
  if (v.retentionOffen) reasons.push('gewerbe_retention_offen');
  if (v.reserveOffen) reasons.push('gewerbe_ruecklage_offen');
  if (v.gesamtverbrauch != null && v.erwarteterVerbrauch != null && v.gesamtverbrauch < v.erwarteterVerbrauch) {
    reasons.push('gewerbe_unterverbrauch');
  }
  return reasons;
}

/** Whether a contract belongs to the required historical migration set (I-12). */
export function isAtRisk(v: RiskContractView): boolean {
  return classifyHistoricalRisk(v).length > 0;
}
