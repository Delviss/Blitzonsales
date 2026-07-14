/**
 * The 11 acceptance criteria of Fachkonzept ch. 18 (I-37) as a pure, testable
 * checklist. This is the Phase-1 **release gate**: the system must demonstrably
 * satisfy every criterion. Each check is expressed as a predicate over live
 * system signals the service collects, so the checklist can be evaluated against
 * a running instance *and* pinned in a unit test with representative signals.
 *
 * Every criterion names the implementing issue(s) so a red check points straight
 * at the responsible module.
 */

export interface AcceptanceSignals {
  /** every commission line + ledger event references an SWA order number (I-03/I-28). */
  alleZeilenMitAuftragsnummer: boolean;
  /** the actual SWA list is the booking truth; expected only drives plausibility (I-14). */
  swaListeIstWahrheit: boolean;
  /** management views are net by default; salary is labelled gross-salary (I-29). */
  nettoStandard: boolean;
  /** nothing is paid before the SWA list confirms it; forecast is provisional (I-16). */
  keineAuszahlungVorBestaetigung: boolean;
  /** the retroactive tier acceptance suite (ch. 14.1) is green (I-15/I-17). */
  retroStaffelBestanden: boolean;
  /** minimum-volume / non-qualifying / existing-customer handled (I-13/I-20). */
  mindestUndBestandBehandelt: boolean;
  /** negative-balance account and storno account are kept separate (I-18/I-23). */
  kontenGetrennt: boolean;
  /** reserves reduce free liquidity in the KPI computation (I-24/I-27). */
  ruecklagenMindernLiquiditaet: boolean;
  /** clawbacks pass through in the fixed offset order (I-25). */
  clawbackOffsetReihenfolge: boolean;
  /** closed months are immutable; late info surfaces as a visible addendum (I-34). */
  monateUnveraenderlichNachtraege: boolean;
  /** free operating liquidity + key warnings are clearly surfaced (I-27/I-35). */
  liquiditaetUndWarnungenSichtbar: boolean;
}

export interface AcceptanceCriterion {
  id: number;
  kapitel: string;
  titel: string;
  issues: string;
  erfuellt: boolean;
}

const DEFS: { id: number; kapitel: string; titel: string; issues: string; key: keyof AcceptanceSignals }[] = [
  { id: 1, kapitel: '18.1', titel: 'Jede Kennzahl ist bis zur einzelnen SWA-Auftragsnummer nachvollziehbar', issues: 'I-03, I-28', key: 'alleZeilenMitAuftragsnummer' },
  { id: 2, kapitel: '18.2', titel: 'Die SWA-Abrechnungsliste ist die Buchungswahrheit', issues: 'I-14, I-12', key: 'swaListeIstWahrheit' },
  { id: 3, kapitel: '18.3', titel: 'Alle Management-Ansichten sind netto; Gehalt ist als Bruttolohn gekennzeichnet', issues: 'I-29', key: 'nettoStandard' },
  { id: 4, kapitel: '18.4', titel: 'Keine Auszahlung vor Bestätigung durch die SWA-Liste', issues: 'I-16', key: 'keineAuszahlungVorBestaetigung' },
  { id: 5, kapitel: '18.5', titel: 'Rückwirkende Staffeln (39→€70 / 40→€90 / 80→€100) bestehen', issues: 'I-15, I-17', key: 'retroStaffelBestanden' },
  { id: 6, kapitel: '18.6', titel: 'Mindestverbrauch / nicht-qualifiziert / Bestandskunde korrekt behandelt', issues: 'I-13, I-20', key: 'mindestUndBestandBehandelt' },
  { id: 7, kapitel: '18.7', titel: 'Negativsaldo-Konto und Stornokonto sind getrennt', issues: 'I-18, I-23', key: 'kontenGetrennt' },
  { id: 8, kapitel: '18.8', titel: 'Rücklagen mindern die freie Liquidität', issues: 'I-24, I-27', key: 'ruecklagenMindernLiquiditaet' },
  { id: 9, kapitel: '18.9', titel: 'Clawbacks laufen in fester Verrechnungsreihenfolge durch', issues: 'I-25', key: 'clawbackOffsetReihenfolge' },
  { id: 10, kapitel: '18.10', titel: 'Abgeschlossene Monate sind unveränderlich; Nachträge sind sichtbar', issues: 'I-34', key: 'monateUnveraenderlichNachtraege' },
  { id: 11, kapitel: '18.11', titel: 'Freie Betriebsliquidität und zentrale Warnungen sind klar sichtbar', issues: 'I-27, I-35', key: 'liquiditaetUndWarnungenSichtbar' },
];

export interface AcceptanceResult {
  kriterien: AcceptanceCriterion[];
  erfuellt: number;
  gesamt: number;
  alleErfuellt: boolean;
}

/** Evaluate the 11 ch. 18 criteria against the collected live signals. */
export function evaluateAcceptance(signals: AcceptanceSignals): AcceptanceResult {
  const kriterien = DEFS.map((d) => ({
    id: d.id,
    kapitel: d.kapitel,
    titel: d.titel,
    issues: d.issues,
    erfuellt: signals[d.key],
  }));
  const erfuellt = kriterien.filter((k) => k.erfuellt).length;
  return { kriterien, erfuellt, gesamt: kriterien.length, alleErfuellt: erfuellt === kriterien.length };
}
