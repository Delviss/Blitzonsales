import { ClientType, IngestionErrorItem, IngestionErrorKategorie } from '@blitzon/shared';

/**
 * The canonical, source-agnostic view of one ingested contract record. Both the
 * file import (I-12) and the Joules API sync (I-09) normalise their raw payloads
 * into this shape before the shared upsert and the data-quality validation run
 * on it, so the two channels behave identically (I-11).
 */
export interface IngestionRecordView {
  swaOrderNumber: string | null;
  joulesId: string | null;
  repName: string | null;
  orgName: string | null;
  /** ClientType — 'privat' | 'gewerbe'. */
  clientType: string | null;
  status: string | null;
  /** Surcharge ct/kWh for the applicable energy type. */
  surchargeCt: number | null;
  /** Term in months. */
  laufzeitMonate: number | null;
  /** Total / annual consumption (Joules previous_volume). */
  gesamtverbrauch: number | null;
  /** Expected SWA commission from our tier engine (may be null on ingestion). */
  expectedSwa: number | null;
  /** Actual SWA commission from the booking list (may be null until settled). */
  actualSwa: number | null;
}

/**
 * The outcome of resolving a record's rep / organisation / status against the
 * master data. Kept separate from the pure classifier so the classifier stays
 * free of repository access and is fully unit-testable.
 */
export interface IngestionResolution {
  /** A rep name was delivered and matched an active master-data rep. */
  repMatched: boolean;
  /** An org name was delivered and matched a master-data organisation. */
  orgMatched: boolean;
  /** The status is present in the status master (I-06) / a known status. */
  statusKnown: boolean;
  /** Absolute € tolerance for the SWA plausibility check (I-14). */
  toleranceAbs: number;
}

/**
 * Classify a record against the data-quality rules (I-11, Fachkonzept ch. 11.1).
 * Returns every finding; a record is *blocked from automatic booking* iff any
 * finding is `sperrend`. Pure — no I/O.
 *
 * Blocking findings (a hard data problem — no booking until fixed):
 *   • missing SWA order number
 *   • an order with no assignable rep at all (unassignable)
 *   • a delivered rep / org that is unknown in the master data
 *   • a commercial contract without a term / total consumption
 *   • a commercial contract with a missing or invalid (≤0) surcharge
 *   • an invalid / unknown status
 *
 * Non-blocking finding (surfaced in the data-quality view, booking still flows
 * on the expected value per the I-14 plausibility control):
 *   • an SWA commission that cannot yet be verified (no actual figure), or that
 *     deviates from the expected tier value beyond tolerance.
 */
export function classifyRecord(rec: IngestionRecordView, res: IngestionResolution): IngestionErrorItem[] {
  const errors: IngestionErrorItem[] = [];
  const isCommercial = rec.clientType === ClientType.Gewerbe;

  if (!rec.swaOrderNumber) {
    errors.push({
      kategorie: IngestionErrorKategorie.OrderNumberMissing,
      grund: 'SWA-Auftragsnummer fehlt — der Datensatz kann nicht eindeutig zugeordnet werden.',
      feld: 'swaOrderNumber',
      sperrend: true,
    });
  }

  if (!rec.repName) {
    errors.push({
      kategorie: IngestionErrorKategorie.Unassignable,
      grund: 'Kein Verkäufer angegeben — der Auftrag ist keinem Mitarbeiter zuordenbar.',
      feld: 'repName',
      sperrend: true,
    });
  } else if (!res.repMatched) {
    errors.push({
      kategorie: IngestionErrorKategorie.UnknownRep,
      grund: `Verkäufer "${rec.repName}" ist nicht in den Stammdaten hinterlegt.`,
      feld: 'repName',
      sperrend: true,
    });
  }

  if (rec.orgName && !res.orgMatched) {
    errors.push({
      kategorie: IngestionErrorKategorie.UnknownOrg,
      grund: `Organisation "${rec.orgName}" ist nicht in den Stammdaten hinterlegt.`,
      feld: 'orgName',
      sperrend: true,
    });
  }

  if (isCommercial) {
    const hasTerm = (rec.laufzeitMonate ?? 0) > 0 || (rec.gesamtverbrauch ?? 0) > 0;
    if (!hasTerm) {
      errors.push({
        kategorie: IngestionErrorKategorie.CommercialTermMissing,
        grund: 'Gewerbevertrag ohne Laufzeit / Gesamtverbrauch — die Gewerbeberechnung ist nicht möglich.',
        feld: 'laufzeitMonate',
        sperrend: true,
      });
    }
    if (rec.surchargeCt == null || Number.isNaN(rec.surchargeCt) || rec.surchargeCt <= 0) {
      errors.push({
        kategorie: IngestionErrorKategorie.SurchargeInvalid,
        grund: 'Aufschlag (ct/kWh) fehlt oder ist ungültig für einen Gewerbevertrag.',
        feld: 'surchargeCt',
        sperrend: true,
      });
    }
  }

  if (!res.statusKnown) {
    errors.push({
      kategorie: IngestionErrorKategorie.StatusInvalid,
      grund: rec.status
        ? `Status "${rec.status}" ist nicht in den Statusstammdaten hinterlegt.`
        : 'Status fehlt.',
      feld: 'status',
      sperrend: true,
    });
  }

  // I-14: the actual SWA booking list is the truth. If there is no actual figure
  // yet, or it deviates from the expected tier value beyond tolerance, surface it
  // for review — but do not block booking (the expected value still books).
  if (rec.expectedSwa != null) {
    if (rec.actualSwa == null) {
      errors.push({
        kategorie: IngestionErrorKategorie.SwaUnverifiable,
        grund: 'Keine tatsächliche SWA-Provision vorhanden — Plausibilität noch offen.',
        feld: 'actualSwa',
        sperrend: false,
      });
    } else if (Math.abs(rec.expectedSwa - rec.actualSwa) > res.toleranceAbs) {
      errors.push({
        kategorie: IngestionErrorKategorie.SwaUnverifiable,
        grund: `SWA-Provision weicht ab: erwartet ${rec.expectedSwa.toFixed(2)} €, tatsächlich ${rec.actualSwa.toFixed(2)} €.`,
        feld: 'actualSwa',
        sperrend: false,
      });
    }
  }

  return errors;
}

/** Whether any finding blocks automatic booking. */
export function isBlocked(errors: IngestionErrorItem[]): boolean {
  return errors.some((e) => e.sperrend);
}
