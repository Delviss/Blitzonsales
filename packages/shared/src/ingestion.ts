/**
 * Shared ingestion / data-quality types for Wave 3 (Epic P2, I-08…I-12).
 *
 * Every contract figure enters BlitzON Control through one of two ingestion
 * channels — the Joules/SWA API (I-08/I-09) or an Excel/CSV/settlement-list
 * upload (I-12). Both channels share the same archive (I-10), the same
 * order-number upsert and the same data-quality error list (I-11), so the types
 * that describe those cross-channel concepts live here.
 */

/** Where an ingested payload came from (I-10). */
export enum IngestionSource {
  /** A fetch against the Joules/SWA REST API. */
  Api = 'api',
  /** An uploaded Excel/CSV/settlement-list file. */
  File = 'file',
}

/**
 * Why a record was routed to the data-quality error list instead of being
 * booked (I-11, Fachkonzept ch. 11.1 „Datenqualität"). A flagged record never
 * triggers automatic financial automation until it is corrected.
 */
export enum IngestionErrorKategorie {
  /** No SWA order number — the record cannot be keyed or traced. */
  OrderNumberMissing = 'order_number_missing',
  /** The named sales rep is not in the master data. */
  UnknownRep = 'unknown_rep',
  /** The named organisation is not in the master data. */
  UnknownOrg = 'unknown_org',
  /** A commercial (Gewerbe) contract without a term / total consumption. */
  CommercialTermMissing = 'commercial_term_missing',
  /** Surcharge (ct/kWh) missing or not a valid positive number. */
  SurchargeInvalid = 'surcharge_invalid',
  /** Status is not in the status master (I-06) / not a known status. */
  StatusInvalid = 'status_invalid',
  /** The SWA commission cannot be verified against the expected tier value. */
  SwaUnverifiable = 'swa_unverifiable',
  /** The order has no assignable rep/org at all (Fachkonzept „nicht zuordenbar"). */
  Unassignable = 'unassignable',
}

/**
 * A single data-quality finding for one record (mirrors the Joules `ErrorSchema`
 * shape, I-11). `feld` names the offending field where applicable.
 */
export interface IngestionErrorItem {
  kategorie: IngestionErrorKategorie;
  grund: string;
  feld?: string | null;
  /** Whether this finding blocks automatic booking of the record. */
  sperrend: boolean;
}

/** Lifecycle status of a sync run (I-09). */
export enum SyncRunStatus {
  /** Completed successfully. */
  Ok = 'ok',
  /** Completed but some records failed / were flagged. */
  Teilweise = 'teilweise',
  /** Aborted by an API / transport error. */
  Fehler = 'fehler',
  /** No usable Joules credential configured — the client is externally blocked. */
  NichtKonfiguriert = 'nicht_konfiguriert',
}
