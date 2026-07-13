export enum VertragStatus {
  LieferterminStehtFest = 'Liefertermin steht fest',
  InBelieferung = 'In Belieferung',
  ImWechsel = 'Im Wechsel',
  Datencheck = 'Datencheck',
  Exportiert = 'Exportiert',
  Abgelehnt = 'Abgelehnt',
  Widerruf = 'Widerruf',
  Storno = 'Storno',
  KreditcheckNichtBestanden = 'Kreditcheck nicht bestanden',
  ManuellerKreditcheck = 'Manueller Kreditcheck',
}

export const ZAEHLT_STATUS = new Set([
  VertragStatus.LieferterminStehtFest,
  VertragStatus.InBelieferung,
  VertragStatus.ImWechsel,
  VertragStatus.Datencheck,
  VertragStatus.Exportiert,
]);

export const KEIN_SATZ_STATUS = new Set([
  VertragStatus.Abgelehnt,
  VertragStatus.KreditcheckNichtBestanden,
  VertragStatus.ManuellerKreditcheck,
]);

export const CLAWBACK_STATUS = new Set([
  VertragStatus.Widerruf,
  VertragStatus.Storno,
]);

/**
 * Coarse category of a contract status in the status master (I-06). Purely
 * descriptive; qualification is driven by the explicit `qualifiziert` flag, not
 * the category.
 */
export enum StatusKategorie {
  Aktiv = 'aktiv',
  Pruefung = 'pruefung',
  Abgelehnt = 'abgelehnt',
  Clawback = 'clawback',
}

/** A single status-master entry (I-06, Fachkonzept ch. 5.1 / 4.1). */
export interface StatusMasterEntry {
  /** Status code / key (the Joules status text is used as the key today). */
  code: string;
  /** Human-readable label. */
  bezeichnung: string;
  /** Whether this status is *released as qualifying* for the tier engine. */
  qualifiziert: boolean;
  /** Coarse category (see StatusKategorie). */
  kategorie: StatusKategorie;
}

/**
 * Default status master (I-06). Stands in for Joules `OPTIONS /clients/statuses`
 * until a live sync exists (see PROGRESS.md open question on the Joules API).
 *
 * Safety rule (Fachkonzept ch. 5.1): only statuses explicitly released as
 * qualifying (`qualifiziert: true`) ever count; every other status — including
 * any status not present in the master at all — does not qualify.
 */
export const STATUS_MASTER_DEFAULTS: StatusMasterEntry[] = [
  { code: VertragStatus.LieferterminStehtFest, bezeichnung: 'Liefertermin steht fest', qualifiziert: true, kategorie: StatusKategorie.Aktiv },
  { code: VertragStatus.InBelieferung, bezeichnung: 'In Belieferung', qualifiziert: true, kategorie: StatusKategorie.Aktiv },
  { code: VertragStatus.ImWechsel, bezeichnung: 'Im Wechsel', qualifiziert: true, kategorie: StatusKategorie.Aktiv },
  { code: VertragStatus.Exportiert, bezeichnung: 'Exportiert', qualifiziert: true, kategorie: StatusKategorie.Aktiv },
  { code: VertragStatus.Datencheck, bezeichnung: 'Datencheck', qualifiziert: false, kategorie: StatusKategorie.Pruefung },
  { code: VertragStatus.ManuellerKreditcheck, bezeichnung: 'Manueller Kreditcheck', qualifiziert: false, kategorie: StatusKategorie.Pruefung },
  { code: VertragStatus.KreditcheckNichtBestanden, bezeichnung: 'Kreditcheck nicht bestanden', qualifiziert: false, kategorie: StatusKategorie.Abgelehnt },
  { code: VertragStatus.Abgelehnt, bezeichnung: 'Abgelehnt', qualifiziert: false, kategorie: StatusKategorie.Abgelehnt },
  { code: VertragStatus.Widerruf, bezeichnung: 'Widerruf', qualifiziert: false, kategorie: StatusKategorie.Clawback },
  { code: VertragStatus.Storno, bezeichnung: 'Storno', qualifiziert: false, kategorie: StatusKategorie.Clawback },
];

export enum EnergieArt {
  Strom = 'Strom',
  Gas = 'Gas',
}

/**
 * Access roles (I-05, Fachkonzept ch. 2.1 / 4.1 / 17).
 *
 * Phase 1 is a Founder/Backoffice tool only; the employee and partner portals
 * are prepared in the data model but not built. The role set is therefore split
 * into two groups:
 *
 *   • Phase-1 roles — may reach Phase-1 surfaces:
 *       AdminGf   → Founder / Admin (full access)
 *       Backoffice→ Backoffice / Accounting (operational + reporting)
 *       ReadOnly  → optional read-only viewer (GET surfaces only)
 *
 *   • Reserved portal roles — exist in the model but are exposed by no Phase-1
 *     UI or endpoint (their data-visibility scoping is groundwork for the future
 *     portals):
 *       Aussendienst → employee portal (reserved)
 *       Partner      → partner portal (reserved)
 *       Teamleiter   → legacy internal team-lead (deprecated, reserved)
 *
 * See PHASE1_READ_ROLLEN / PHASE1_OPERATIONS_ROLLEN / RESERVIERTE_PORTAL_ROLLEN.
 */
export enum Rolle {
  AdminGf = 'admin_gf',
  Backoffice = 'backoffice',
  ReadOnly = 'readonly',
  Aussendienst = 'aussendienst',
  Partner = 'partner',
  Teamleiter = 'teamleiter',
}

/** Founder/Backoffice/read-only may read Phase-1 surfaces (I-05). */
export const PHASE1_READ_ROLLEN: Rolle[] = [Rolle.AdminGf, Rolle.Backoffice, Rolle.ReadOnly];

/**
 * Roles that may perform Phase-1 operations (create/generate runs, import,
 * export). Read-only is deliberately excluded so it can never mutate state.
 */
export const PHASE1_OPERATIONS_ROLLEN: Rolle[] = [Rolle.AdminGf, Rolle.Backoffice];

/**
 * Portal roles reserved in the model but exposed by no Phase-1 UI/endpoint
 * (I-05 acceptance: portal roles exist in the model without UI).
 */
export const RESERVIERTE_PORTAL_ROLLEN: Rolle[] = [Rolle.Aussendienst, Rolle.Partner, Rolle.Teamleiter];

export enum KommissionTyp {
  Normal = 'normal',
  Clawback = 'clawback',
}

export enum RunStatus {
  Entwurf = 'entwurf',
  Freigegeben = 'freigegeben',
}

export interface Organisation {
  id: string;
  name: string;
  parentId: string | null;
  typ: string | null;
}

export interface Produkt {
  id: string;
  name: string;
  energie: EnergieArt;
  bestand: boolean;
}

export interface SalesRep {
  id: string;
  name: string;
  organisationId: string;
  iban: string | null;
  aktiv: boolean;
}

export interface AppUser {
  id: string;
  email: string;
  rolle: Rolle;
  organisationId: string | null;
  twofaEnabled: boolean;
}

export interface Vertrag {
  id: string;
  joulesId: string;
  repId: string;
  produktId: string;
  organisationId: string;
  kunde: string | null;
  plz: string | null;
  ort: string | null;
  strHsnr: string | null;
  verbrauch: number | null;
  erfassungsdatum: string | null;
  lieferbeginn: string | null;
  status: VertragStatus;
  importBatchId: string | null;
}

export interface KommissionsZeile {
  id: string;
  runId: string;
  contractId: string;
  repId: string;
  regelId: string | null;
  betrag: number;
  typ: KommissionTyp;
  storniertDurch: string | null;
  begruendung: string | null;
}
