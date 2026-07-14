/**
 * Pure warning & check system (I-35, Fachkonzept ch. 13, plus ch. 8 partner
 * payout check and ch. 9.1).
 *
 * The Founder dashboard raises red / yellow / info checks. This module holds the
 * pure rule set: the service loads the data (contracts, reps, reserves, config)
 * and hands it in as plain data; this function returns the ranked warning list.
 * Keeping the rules pure means every ch. 13 check is unit-tested against its
 * expected action, independent of persistence.
 *
 *   • Red — payout > related SWA revenue (block/flag, manual release with
 *     reason); commercial reserve actual < target; surcharge over cap
 *     (electricity 4 ct / gas 2 ct); SWA tier deviates from the control tier;
 *     unknown rep/org or missing order number.
 *   • Yellow — employee with a negative balance; retention due in 30/60/90 days;
 *     storno/correction within the liability window; lead-time customer
 *     contactable again.
 *   • Info — next tier level reachable.
 */

export type WarningLevel = 'rot' | 'gelb' | 'info';

export interface Warning {
  level: WarningLevel;
  /** stable machine code for the check. */
  code: string;
  /** ch. 13 grouping label. */
  kategorie: string;
  titel: string;
  beschreibung: string;
  /** the expected action per ch. 13. */
  aktion: string;
  referenzTyp: 'contract' | 'rep' | 'organisation' | 'reserve' | 'run' | null;
  referenzId: string | null;
  betrag?: number | null;
}

export interface WarnContract {
  id: string;
  swaOrderNumber: string | null;
  kunde: string | null;
  repId: string | null;
  /** false ⇒ the contract's rep could not be resolved (unknown rep). */
  repBekannt: boolean;
  organisationId: string | null;
  /** false ⇒ the contract's organisation could not be resolved (unknown org). */
  orgBekannt: boolean;
  energie: string | null; // 'strom' | 'gas'
  surchargeCt: number | null;
  /** payout booked/related to this contract this period. */
  auszahlung: number | null;
  /** related SWA revenue actually received. */
  swaRevenue: number | null;
  /** plausibility status from the SWA control (I-14): 'abweichung' fires red. */
  plausibilitaetStatus: string | null;
  /** date of a storno / correction (JJJJ-MM-DD), for the liability-window check. */
  stornoDatum: string | null;
  /** commercial retention (Halteanteil) due date (JJJJ-MM-DD), for the 30/60/90 check. */
  retentionFaelligAm: string | null;
  /** first day the existing-customer lead-time contact is admissible again (JJJJ-MM-DD). */
  leadTimeKontaktAb: string | null;
}

export interface WarnRep {
  id: string;
  name: string;
  negativsaldo: number;
  qualifiedNewCount: number;
  /** how many more qualified new customers until the next tier, or null at the top. */
  bisNaechsteStufe: number | null;
}

export interface WarnReserve {
  contractId: string | null;
  repId: string | null;
  reserveTarget: number;
  reserveActual: number;
}

export interface WarnConfig {
  /** electricity surcharge cap in ct/kWh (default 4). */
  capStrom: number;
  /** gas surcharge cap in ct/kWh (default 2). */
  capGas: number;
  /** storno liability window in months (ch. 9 / 10.1). */
  stornoProtectionMonths: number;
  /** the company SWA control-tier per-customer rate (ch. 6.1). */
  swaControlTierRate?: number | null;
  /** the reached SWA tier per-customer rate to compare against the control. */
  swaReachedTierRate?: number | null;
  /** info fires when a rep is within this many customers of the next tier (default 5). */
  naechsteStufeSchwelle?: number;
}

export interface WarnInput {
  today: string; // JJJJ-MM-DD
  contracts: WarnContract[];
  reps: WarnRep[];
  reserves: WarnReserve[];
  config: WarnConfig;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const parseDay = (s: string | null): number | null => {
  if (!s) return null;
  const t = Date.parse(`${s.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(t) ? null : t;
};

/** Whole days from `from` to `to` (positive ⇒ `to` is later). */
function daysBetween(from: string, to: string | null): number | null {
  const a = parseDay(from);
  const b = parseDay(to);
  if (a == null || b == null) return null;
  return Math.round((b - a) / 86_400_000);
}

/** Add whole months to a JJJJ-MM-DD date, returning JJJJ-MM-DD. */
function addMonths(date: string, months: number): string {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  const base = new Date(Date.UTC(y, (m - 1) + months, d));
  return base.toISOString().slice(0, 10);
}

const LEVEL_ORDER: Record<WarningLevel, number> = { rot: 0, gelb: 1, info: 2 };

/**
 * Compute the full ch. 13 warning list from already-loaded data. Deterministic
 * and side-effect free. Warnings are returned ranked red → yellow → info.
 */
export function computeWarnings(input: WarnInput): Warning[] {
  const { today, contracts, reps, reserves, config: c } = input;
  const out: Warning[] = [];
  const capFor = (energie: string | null) => (energie === 'gas' ? c.capGas : c.capStrom);
  const schwelle = c.naechsteStufeSchwelle ?? 5;

  // ----- RED ---------------------------------------------------------------
  for (const ct of contracts) {
    // R1 · payout exceeds the related SWA revenue (ch. 8 / 9.1).
    if (ct.auszahlung != null && ct.swaRevenue != null && round2(ct.auszahlung) > round2(ct.swaRevenue)) {
      out.push({
        level: 'rot',
        code: 'auszahlung_ueber_swa',
        kategorie: 'Auszahlung vs. SWA-Ertrag',
        titel: `Auszahlung übersteigt SWA-Ertrag (${ct.kunde ?? ct.swaOrderNumber ?? ct.id})`,
        beschreibung: `Auszahlung € ${round2(ct.auszahlung)} > SWA-Ertrag € ${round2(ct.swaRevenue)}.`,
        aktion: 'Blockieren/kennzeichnen; Auszahlung nur mit begründeter manueller Freigabe.',
        referenzTyp: 'contract',
        referenzId: ct.id,
        betrag: round2(ct.auszahlung - ct.swaRevenue),
      });
    }

    // R3 · surcharge over the cap (electricity 4 ct / gas 2 ct).
    if (ct.surchargeCt != null && ct.surchargeCt > capFor(ct.energie)) {
      out.push({
        level: 'rot',
        code: 'aufschlag_ueber_cap',
        kategorie: 'Aufschlag über Obergrenze',
        titel: `Aufschlag ${ct.surchargeCt} ct über Obergrenze (${ct.energie ?? '—'})`,
        beschreibung: `Aufschlag ${ct.surchargeCt} ct/kWh überschreitet die Obergrenze ${capFor(ct.energie)} ct/kWh.`,
        aktion: 'Aufschlag prüfen und korrigieren (Strom 4 ct / Gas 2 ct).',
        referenzTyp: 'contract',
        referenzId: ct.id,
      });
    }

    // R4 · the contract's SWA commission deviates from the control tier (I-14).
    if (ct.plausibilitaetStatus === 'abweichung') {
      out.push({
        level: 'rot',
        code: 'swa_tier_abweichung',
        kategorie: 'SWA-Tarif weicht von Kontrolltarif ab',
        titel: `SWA-Abweichung (${ct.kunde ?? ct.swaOrderNumber ?? ct.id})`,
        beschreibung: 'Die tatsächliche SWA-Provision weicht vom erwarteten Kontrolltarif ab.',
        aktion: 'Mit der SWA-Abrechnung abgleichen und klären.',
        referenzTyp: 'contract',
        referenzId: ct.id,
      });
    }

    // R5 · unknown rep/org or missing order number.
    if (!ct.repBekannt || !ct.orgBekannt || !ct.swaOrderNumber) {
      const fehlend = [
        !ct.repBekannt ? 'unbekannter Verkäufer' : null,
        !ct.orgBekannt ? 'unbekannte Organisation' : null,
        !ct.swaOrderNumber ? 'fehlende Auftragsnummer' : null,
      ].filter(Boolean);
      out.push({
        level: 'rot',
        code: 'unbekannte_zuordnung',
        kategorie: 'Unbekannte Zuordnung / fehlende Auftragsnummer',
        titel: `Zuordnung unklar (${ct.kunde ?? ct.id})`,
        beschreibung: fehlend.join(', ') + '.',
        aktion: 'Zuordnung klären bzw. Auftragsnummer nachtragen; keine Buchung bis geklärt.',
        referenzTyp: 'contract',
        referenzId: ct.id,
      });
    }
  }

  // R2 · commercial reserve actual below target (under-funded).
  for (const r of reserves) {
    if (round2(r.reserveActual) < round2(r.reserveTarget)) {
      out.push({
        level: 'rot',
        code: 'ruecklage_unterdeckt',
        kategorie: 'Gewerbe-Rücklage unterdeckt',
        titel: 'Gewerbe-Rücklage unter Soll',
        beschreibung: `Ist € ${round2(r.reserveActual)} < Soll € ${round2(r.reserveTarget)}.`,
        aktion: 'Rücklage auffüllen, bevor der Halteanteil ausgezahlt wird.',
        referenzTyp: 'reserve',
        referenzId: r.contractId,
        betrag: round2(r.reserveTarget - r.reserveActual),
      });
    }
  }

  // R4b · company-wide SWA reached tier deviates from the control tier.
  if (
    c.swaControlTierRate != null &&
    c.swaReachedTierRate != null &&
    round2(c.swaReachedTierRate) !== round2(c.swaControlTierRate)
  ) {
    out.push({
      level: 'rot',
      code: 'swa_kontrolltarif_abweichung',
      kategorie: 'SWA-Tarif weicht von Kontrolltarif ab',
      titel: 'Erreichter SWA-Tarif weicht vom Kontrolltarif ab',
      beschreibung: `Erreicht € ${round2(c.swaReachedTierRate)} vs. Kontrolle € ${round2(c.swaControlTierRate)} pro Neukunde.`,
      aktion: 'Neukundenzählung und SWA-Staffel gegen die Kontrolle prüfen.',
      referenzTyp: 'run',
      referenzId: null,
    });
  }

  // ----- YELLOW ------------------------------------------------------------
  for (const rep of reps) {
    // Y1 · employee carrying a negative balance.
    if (round2(rep.negativsaldo) > 0) {
      out.push({
        level: 'gelb',
        code: 'negativsaldo',
        kategorie: 'Mitarbeiter mit Negativsaldo',
        titel: `Negativsaldo: ${rep.name}`,
        beschreibung: `Offener Negativsaldo € ${round2(rep.negativsaldo)}.`,
        aktion: 'Tilgung aus künftigen positiven Monaten beobachten (Fixum bleibt garantiert).',
        referenzTyp: 'rep',
        referenzId: rep.id,
        betrag: round2(rep.negativsaldo),
      });
    }
  }

  for (const ct of contracts) {
    // Y2 · retention (Halteanteil) due within 30 / 60 / 90 days.
    const tage = daysBetween(today, ct.retentionFaelligAm);
    if (tage != null && tage >= 0 && tage <= 90) {
      const bucket = tage <= 30 ? 30 : tage <= 60 ? 60 : 90;
      out.push({
        level: 'gelb',
        code: 'rueckbehalt_faellig',
        kategorie: 'Halteanteil fällig',
        titel: `Halteanteil fällig in ≤ ${bucket} Tagen`,
        beschreibung: `Fällig am ${ct.retentionFaelligAm} (in ${tage} Tagen).`,
        aktion: 'Auszahlung des 12-Monats-Halteanteils vorbereiten.',
        referenzTyp: 'contract',
        referenzId: ct.id,
      });
    }

    // Y3 · storno / correction within the liability window.
    if (ct.stornoDatum) {
      const fensterEnde = addMonths(ct.stornoDatum, c.stornoProtectionMonths);
      const seit = daysBetween(ct.stornoDatum, today);
      const bisEnde = daysBetween(today, fensterEnde);
      if (seit != null && seit >= 0 && bisEnde != null && bisEnde >= 0) {
        out.push({
          level: 'gelb',
          code: 'storno_haftungsfenster',
          kategorie: 'Storno/Korrektur im Haftungsfenster',
          titel: `Storno im Haftungsfenster (${ct.kunde ?? ct.id})`,
          beschreibung: `Storno am ${ct.stornoDatum}; Haftung bis ${fensterEnde}.`,
          aktion: 'Clawback-Risiko beobachten; Rücklage/Stornokonto nicht vorzeitig freigeben.',
          referenzTyp: 'contract',
          referenzId: ct.id,
        });
      }
    }

    // Y4 · lead-time customer contactable again.
    const kontakt = daysBetween(today, ct.leadTimeKontaktAb);
    if (ct.leadTimeKontaktAb && kontakt != null && kontakt <= 0) {
      out.push({
        level: 'gelb',
        code: 'vorlaufzeit_kontakt',
        kategorie: 'Vorlaufzeit-Kunde erneut kontaktierbar',
        titel: `Kunde erneut kontaktierbar (${ct.kunde ?? ct.id})`,
        beschreibung: `Zulässiger Kontakt ab ${ct.leadTimeKontaktAb}.`,
        aktion: 'Wiedervorlage: Kunde innerhalb der Vorlaufzeit erneut ansprechen.',
        referenzTyp: 'contract',
        referenzId: ct.id,
      });
    }
  }

  // ----- INFO --------------------------------------------------------------
  for (const rep of reps) {
    // I1 · next tier level within reach.
    if (rep.bisNaechsteStufe != null && rep.bisNaechsteStufe > 0 && rep.bisNaechsteStufe <= schwelle) {
      out.push({
        level: 'info',
        code: 'naechste_stufe',
        kategorie: 'Nächste Staffelstufe erreichbar',
        titel: `Nächste Stufe erreichbar: ${rep.name}`,
        beschreibung: `Noch ${rep.bisNaechsteStufe} qualifizierte Neukunden bis zur nächsten Staffel.`,
        aktion: 'Information: die retroaktive Höherstufung ist in Reichweite.',
        referenzTyp: 'rep',
        referenzId: rep.id,
      });
    }
  }

  out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.code.localeCompare(b.code));
  return out;
}

/** Roll-up counts per level for the dashboard badge. */
export function warningCounts(warnings: Warning[]): { rot: number; gelb: number; info: number; gesamt: number } {
  const rot = warnings.filter((w) => w.level === 'rot').length;
  const gelb = warnings.filter((w) => w.level === 'gelb').length;
  const info = warnings.filter((w) => w.level === 'info').length;
  return { rot, gelb, info, gesamt: warnings.length };
}
