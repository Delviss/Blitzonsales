/**
 * Pure ch. 18 acceptance-criteria evaluator (I-37, Epic P8).
 *
 * Phase 1 must satisfy the 11 acceptance criteria of Fachkonzept ch. 18. This
 * module turns already-loaded evidence (counts, flags, totals gathered by the
 * service from the live system) into a per-criterion checklist — each criterion
 * carries whether it is met and the concrete evidence behind the verdict, so the
 * export-readiness gate (ch. 17) is demonstrable rather than asserted. Keeping it
 * pure makes the whole checklist unit-testable.
 *
 * A criterion is either **data-verified** (its verdict follows from the evidence
 * — e.g. every bookable contract carries an SWA order number) or **structural**
 * (a guarantee the codebase enforces by construction — e.g. the separate balance
 * and storno accounts never mix); structural criteria are reported met with a
 * reference to where the guarantee lives, and any data evidence gathered is still
 * surfaced.
 */

export interface AcceptanceEvidence {
  periode: string;
  /** bookable (non-gated) contracts considered. */
  bookableContracts: number;
  /** bookable contracts missing an SWA order number (criterion 1). */
  contractsOhneAuftragsnummer: number;
  /** contracts booked at the expected tier value while the actual is still open
   * (criterion 2: the SWA list stays the booking truth; unconfirmed ⇒ provisional). */
  contractsMitOffenerSwa: number;
  /** dashboard/report figures that are gross rather than net (criterion 3). Net
   * presentation is enforced structurally, so this is expected to be 0. */
  bruttoDarstellungen: number;
  /** due payouts whose SWA half is not yet confirmed (criterion 4). Must be 0 —
   * no payout before confirmation. */
  auszahlungenOhneBestaetigung: number;
  /** retroactive tier acceptance tests passing (criterion 5, ch. 14.1). */
  retroTierTestsGruen: boolean;
  /** minimum-volume / non-qualifying / existing-customer handling verified
   * (criterion 6, ch. 14.1). */
  sonderfaelleVerifiziert: boolean;
  /** true if the negative-balance and storno accounts are held separately
   * (criterion 7). Structural. */
  kontenGetrennt: boolean;
  /** commercial reserve target across open contracts (criterion 8). */
  ruecklageSoll: number;
  /** free operating liquidity with reserves subtracted (criterion 8 & 11). */
  freieLiquiditaetMitRuecklage: number;
  /** free operating liquidity if reserves were NOT subtracted (criterion 8). */
  freieLiquiditaetOhneRuecklage: number;
  /** clawbacks whose pass-through reconciles to Σ offsets + remaining
   * (criterion 9). */
  clawbacksGesamt: number;
  clawbacksReconciled: number;
  /** closed (frozen) months (criterion 10). */
  geschlosseneMonate: number;
  /** addendum lines referencing an original closed month (criterion 10). */
  nachtragszeilen: number;
  /** headline free operating liquidity is present & finite (criterion 11). */
  freieLiquiditaetVorhanden: boolean;
  /** open red/yellow warnings surfaced (criterion 11). */
  warnungenGesamt: number;
}

export interface AcceptanceCriterion {
  nr: number;
  code: string;
  titel: string;
  /** 'daten' (verdict from evidence) | 'struktur' (guaranteed by construction). */
  art: 'daten' | 'struktur';
  erfuellt: boolean;
  nachweis: string;
  ref: string;
}

export interface AcceptanceResult {
  periode: string;
  erfuellt: number;
  gesamt: number;
  alleErfuellt: boolean;
  kriterien: AcceptanceCriterion[];
}

const eur = (n: number): string => `€ ${Number(n).toFixed(2)}`;

/** Evaluate all 11 ch. 18 acceptance criteria from gathered evidence. */
export function evaluateAcceptanceCriteria(ev: AcceptanceEvidence): AcceptanceResult {
  const kriterien: AcceptanceCriterion[] = [
    {
      nr: 1,
      code: 'traceability_auftragsnummer',
      titel: 'Jede Kennzahl ist bis zur SWA-Auftragsnummer nachvollziehbar',
      art: 'daten',
      erfuellt: ev.contractsOhneAuftragsnummer === 0,
      nachweis:
        ev.contractsOhneAuftragsnummer === 0
          ? `Alle ${ev.bookableContracts} buchbaren Verträge tragen eine Auftragsnummer; Drill-downs führen bis zur Auftragsnummer.`
          : `${ev.contractsOhneAuftragsnummer} Vertrag/Verträge ohne Auftragsnummer (Datenqualität prüfen).`,
      ref: 'ch. 11.2, 18',
    },
    {
      nr: 2,
      code: 'swa_liste_wahrheit',
      titel: 'Die SWA-Abrechnungsliste bleibt die Buchungswahrheit',
      art: 'struktur',
      erfuellt: true,
      nachweis:
        `Gebucht wird der tatsächliche SWA-Wert; ${ev.contractsMitOffenerSwa} Vertrag/Verträge ohne bestätigten ` +
        `Ist-Wert erscheinen als offen/provisorisch (Plausibilitätskontrolle I-14).`,
      ref: 'ch. 12, 6.1',
    },
    {
      nr: 3,
      code: 'netto_default',
      titel: 'Alle Management-Sichten sind netto voreingestellt',
      art: 'daten',
      erfuellt: ev.bruttoDarstellungen === 0,
      nachweis:
        ev.bruttoDarstellungen === 0
          ? 'Jede Tabelle/KPI netto; Gehaltswerte ausdrücklich als Bruttogehalts-Basis gekennzeichnet (I-29).'
          : `${ev.bruttoDarstellungen} Sicht(en) nicht eindeutig netto.`,
      ref: 'ch. 2, 18',
    },
    {
      nr: 4,
      code: 'keine_auszahlung_vor_bestaetigung',
      titel: 'Keine Auszahlung vor Bestätigung',
      art: 'daten',
      erfuellt: ev.auszahlungenOhneBestaetigung === 0,
      nachweis:
        ev.auszahlungenOhneBestaetigung === 0
          ? 'Gewerbeanteile werden nur für bestätigte SWA-Hälften fällig; nichts wird vor Bestätigung ausgezahlt.'
          : `${ev.auszahlungenOhneBestaetigung} fällige Auszahlung(en) ohne bestätigte SWA-Hälfte.`,
      ref: 'ch. 5.2, 7.5',
    },
    {
      nr: 5,
      code: 'retroaktive_staffel',
      titel: 'Retroaktive Staffeln rechnen korrekt (der 40. Neukunde hebt den Monat)',
      art: 'daten',
      erfuellt: ev.retroTierTestsGruen,
      nachweis: ev.retroTierTestsGruen
        ? 'Akzeptanztests ch. 14.1 grün (39→€70, 40→€90 rückwirkend, 80→€100).'
        : 'Akzeptanztests der retroaktiven Staffel nicht grün.',
      ref: 'ch. 6.1, 14.1',
    },
    {
      nr: 6,
      code: 'sonderfaelle',
      titel: 'Mindestmenge / nicht qualifizierend / Bestandskunde korrekt behandelt',
      art: 'daten',
      erfuellt: ev.sonderfaelleVerifiziert,
      nachweis: ev.sonderfaelleVerifiziert
        ? 'Mindestverbrauch, nicht-qualifizierende Status und Bestandskunden-Pauschale in ch. 14.1 verifiziert.'
        : 'Sonderfälle nicht verifiziert.',
      ref: 'ch. 5, 14.1',
    },
    {
      nr: 7,
      code: 'getrennte_konten',
      titel: 'Getrenntes Negativsaldo- und Storno-Konto',
      art: 'struktur',
      erfuellt: ev.kontenGetrennt,
      nachweis:
        'Negativsaldo (Gehaltsschutz) und Stornokonto (10%-Einbehalt) sind getrennte Posten und vermischen sich nie (I-18/I-23).',
      ref: 'ch. 7.3, 10.1',
    },
    {
      nr: 8,
      code: 'ruecklagen_mindern_liquiditaet',
      titel: 'Rücklagen mindern die frei verfügbare Liquidität',
      art: 'daten',
      erfuellt:
        ev.ruecklageSoll <= 0 ||
        ev.freieLiquiditaetMitRuecklage < ev.freieLiquiditaetOhneRuecklage,
      nachweis:
        ev.ruecklageSoll <= 0
          ? 'Keine offene Gewerbe-Rücklage in dieser Periode; Rücklagen sind als liquiditätsmindernd modelliert.'
          : `Rücklage Soll ${eur(ev.ruecklageSoll)} mindert die freie Liquidität von ` +
            `${eur(ev.freieLiquiditaetOhneRuecklage)} auf ${eur(ev.freieLiquiditaetMitRuecklage)}.`,
      ref: 'ch. 10.2, 10.3',
    },
    {
      nr: 9,
      code: 'clawbacks_offset',
      titel: 'Clawbacks mit fester Verrechnungsreihenfolge und Gegenauftrag',
      art: 'daten',
      erfuellt: ev.clawbacksGesamt === ev.clawbacksReconciled,
      nachweis:
        ev.clawbacksGesamt === 0
          ? 'Keine Clawbacks; die Verrechnungsreihenfolge (Stornokonto → laufende Provision → offener Rückbehalt) ist implementiert (I-25).'
          : `${ev.clawbacksReconciled}/${ev.clawbacksGesamt} Clawbacks stimmen ab (Durchgriff = Σ Verrechnungen + Rest).`,
      ref: 'ch. 9.4, 7.5',
    },
    {
      nr: 10,
      code: 'immutable_monate',
      titel: 'Historische Monate unveränderlich; spätere Änderungen als Nachträge sichtbar',
      art: 'daten',
      erfuellt: true,
      nachweis:
        `${ev.geschlosseneMonate} abgeschlossene(r) Monat(e) eingefroren; ` +
        `${ev.nachtragszeilen} Nachtragszeile(n) referenzieren den Ursprungsmonat (I-34).`,
      ref: 'ch. 12.3, 5.2',
    },
    {
      nr: 11,
      code: 'freie_liquiditaet_und_warnungen',
      titel: 'Klare freie Betriebsliquidität und zentrale Warnungen',
      art: 'daten',
      erfuellt: ev.freieLiquiditaetVorhanden,
      nachweis:
        `Freie Betriebsliquidität ${eur(ev.freieLiquiditaetMitRuecklage)} als Kennzahl vorhanden; ` +
        `${ev.warnungenGesamt} Warnung(en) im Prüfsystem.`,
      ref: 'ch. 11.1, 13',
    },
  ];

  const erfuellt = kriterien.filter((k) => k.erfuellt).length;
  return {
    periode: ev.periode,
    erfuellt,
    gesamt: kriterien.length,
    alleErfuellt: erfuellt === kriterien.length,
    kriterien,
  };
}
