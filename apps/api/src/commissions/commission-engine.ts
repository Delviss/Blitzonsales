import { VertragStatus, ZAEHLT_STATUS, KEIN_SATZ_STATUS, CLAWBACK_STATUS } from '@blitzon/shared';

export interface EngineContract {
  id: string;
  produktId: string | null;
  organisationId: string | null;
  lieferbeginn: string | null;
  erfassungsdatum: string | null;
  status: string;
}

export interface EngineRule {
  id: string;
  typ: string;
  produktId: string | null;
  organisationId: string | null;
  gueltigAb: string;
  gueltigBis: string | null;
  satz: number | null;
}

export interface EngineResult {
  betrag: number;
  typ: 'normal' | 'clawback';
  regelId: string | null;
  begruendung: string;
  datencheck: boolean;
}

/**
 * Picks the applicable rule for a contract: rules scoped to the contract's
 * produkt/organisation win over wildcard rules, ties broken by the most
 * recent gueltigAb. Org hierarchy is not walked (direct match only) —
 * see PROGRESS.md open question on org-hierarchy commission splitting.
 */
export function findApplicableRule(contract: EngineContract, rules: EngineRule[]): EngineRule | null {
  const referenceDate = contract.lieferbeginn ?? contract.erfassungsdatum;
  if (!referenceDate) return null;

  const candidates = rules.filter(r => {
    if (r.produktId && r.produktId !== contract.produktId) return false;
    if (r.organisationId && r.organisationId !== contract.organisationId) return false;
    if (r.gueltigAb > referenceDate) return false;
    if (r.gueltigBis && r.gueltigBis < referenceDate) return false;
    return true;
  });
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const specificityA = (a.produktId ? 2 : 0) + (a.organisationId ? 1 : 0);
    const specificityB = (b.produktId ? 2 : 0) + (b.organisationId ? 1 : 0);
    if (specificityA !== specificityB) return specificityB - specificityA;
    return b.gueltigAb.localeCompare(a.gueltigAb);
  });
  return candidates[0];
}

/** Evaluates a contract that has no existing commission_line yet. */
export function evaluateNewContract(contract: EngineContract, rules: EngineRule[]): EngineResult {
  const status = contract.status as VertragStatus;

  if (KEIN_SATZ_STATUS.has(status)) {
    return { betrag: 0, typ: 'normal', regelId: null, datencheck: false, begruendung: `Kein Anspruch: Status "${contract.status}".` };
  }
  if (CLAWBACK_STATUS.has(status)) {
    return {
      betrag: 0,
      typ: 'normal',
      regelId: null,
      datencheck: false,
      begruendung: `Vertrag storniert ("${contract.status}") ohne vorherigen Provisionsanspruch.`,
    };
  }
  if (!ZAEHLT_STATUS.has(status)) {
    return { betrag: 0, typ: 'normal', regelId: null, datencheck: false, begruendung: `Status "${contract.status}" wird nicht berücksichtigt.` };
  }

  const missingProdukt = !contract.produktId;
  const missingLieferbeginn = !contract.lieferbeginn;
  const isDatencheckStatus = status === VertragStatus.Datencheck;

  if (missingProdukt || missingLieferbeginn || isDatencheckStatus) {
    const gruende: string[] = [];
    if (isDatencheckStatus) gruende.push('Status "Datencheck"');
    if (missingProdukt) gruende.push('Produkt unbekannt');
    if (missingLieferbeginn) gruende.push('Lieferbeginn fehlt');
    return { betrag: 0, typ: 'normal', regelId: null, datencheck: true, begruendung: `Datencheck: ${gruende.join(', ')}.` };
  }

  const rule = findApplicableRule(contract, rules);
  if (!rule || rule.satz == null) {
    return { betrag: 0, typ: 'normal', regelId: null, datencheck: false, begruendung: 'Keine passende Provisionsregel für Produkt/Organisation gefunden.' };
  }
  return {
    betrag: rule.satz,
    typ: 'normal',
    regelId: rule.id,
    datencheck: false,
    begruendung: `Regel "${rule.typ}" (gültig ab ${rule.gueltigAb}): ${rule.satz.toFixed(2)} €.`,
  };
}

/** Evaluates a clawback line for a contract that already has an active (non-storno'd) normal commission line. */
export function evaluateClawback(originalLine: { betrag: number; regelId: string | null }, contract: EngineContract): EngineResult {
  return {
    betrag: -Math.abs(Number(originalLine.betrag)),
    typ: 'clawback',
    regelId: originalLine.regelId,
    datencheck: false,
    begruendung: `Rückbuchung wegen Status "${contract.status}" (ursprünglich ${Number(originalLine.betrag).toFixed(2)} €).`,
  };
}
