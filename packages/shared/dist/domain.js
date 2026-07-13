"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunStatus = exports.KommissionTyp = exports.RESERVIERTE_PORTAL_ROLLEN = exports.PHASE1_OPERATIONS_ROLLEN = exports.PHASE1_READ_ROLLEN = exports.Rolle = exports.EnergieArt = exports.STATUS_MASTER_DEFAULTS = exports.StatusKategorie = exports.CLAWBACK_STATUS = exports.KEIN_SATZ_STATUS = exports.ZAEHLT_STATUS = exports.VertragStatus = void 0;
var VertragStatus;
(function (VertragStatus) {
    VertragStatus["LieferterminStehtFest"] = "Liefertermin steht fest";
    VertragStatus["InBelieferung"] = "In Belieferung";
    VertragStatus["ImWechsel"] = "Im Wechsel";
    VertragStatus["Datencheck"] = "Datencheck";
    VertragStatus["Exportiert"] = "Exportiert";
    VertragStatus["Abgelehnt"] = "Abgelehnt";
    VertragStatus["Widerruf"] = "Widerruf";
    VertragStatus["Storno"] = "Storno";
    VertragStatus["KreditcheckNichtBestanden"] = "Kreditcheck nicht bestanden";
    VertragStatus["ManuellerKreditcheck"] = "Manueller Kreditcheck";
})(VertragStatus || (exports.VertragStatus = VertragStatus = {}));
exports.ZAEHLT_STATUS = new Set([
    VertragStatus.LieferterminStehtFest,
    VertragStatus.InBelieferung,
    VertragStatus.ImWechsel,
    VertragStatus.Datencheck,
    VertragStatus.Exportiert,
]);
exports.KEIN_SATZ_STATUS = new Set([
    VertragStatus.Abgelehnt,
    VertragStatus.KreditcheckNichtBestanden,
    VertragStatus.ManuellerKreditcheck,
]);
exports.CLAWBACK_STATUS = new Set([
    VertragStatus.Widerruf,
    VertragStatus.Storno,
]);
/**
 * Coarse category of a contract status in the status master (I-06). Purely
 * descriptive; qualification is driven by the explicit `qualifiziert` flag, not
 * the category.
 */
var StatusKategorie;
(function (StatusKategorie) {
    StatusKategorie["Aktiv"] = "aktiv";
    StatusKategorie["Pruefung"] = "pruefung";
    StatusKategorie["Abgelehnt"] = "abgelehnt";
    StatusKategorie["Clawback"] = "clawback";
})(StatusKategorie || (exports.StatusKategorie = StatusKategorie = {}));
/**
 * Default status master (I-06). Stands in for Joules `OPTIONS /clients/statuses`
 * until a live sync exists (see PROGRESS.md open question on the Joules API).
 *
 * Safety rule (Fachkonzept ch. 5.1): only statuses explicitly released as
 * qualifying (`qualifiziert: true`) ever count; every other status — including
 * any status not present in the master at all — does not qualify.
 */
exports.STATUS_MASTER_DEFAULTS = [
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
var EnergieArt;
(function (EnergieArt) {
    EnergieArt["Strom"] = "Strom";
    EnergieArt["Gas"] = "Gas";
})(EnergieArt || (exports.EnergieArt = EnergieArt = {}));
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
var Rolle;
(function (Rolle) {
    Rolle["AdminGf"] = "admin_gf";
    Rolle["Backoffice"] = "backoffice";
    Rolle["ReadOnly"] = "readonly";
    Rolle["Aussendienst"] = "aussendienst";
    Rolle["Partner"] = "partner";
    Rolle["Teamleiter"] = "teamleiter";
})(Rolle || (exports.Rolle = Rolle = {}));
/** Founder/Backoffice/read-only may read Phase-1 surfaces (I-05). */
exports.PHASE1_READ_ROLLEN = [Rolle.AdminGf, Rolle.Backoffice, Rolle.ReadOnly];
/**
 * Roles that may perform Phase-1 operations (create/generate runs, import,
 * export). Read-only is deliberately excluded so it can never mutate state.
 */
exports.PHASE1_OPERATIONS_ROLLEN = [Rolle.AdminGf, Rolle.Backoffice];
/**
 * Portal roles reserved in the model but exposed by no Phase-1 UI/endpoint
 * (I-05 acceptance: portal roles exist in the model without UI).
 */
exports.RESERVIERTE_PORTAL_ROLLEN = [Rolle.Aussendienst, Rolle.Partner, Rolle.Teamleiter];
var KommissionTyp;
(function (KommissionTyp) {
    KommissionTyp["Normal"] = "normal";
    KommissionTyp["Clawback"] = "clawback";
})(KommissionTyp || (exports.KommissionTyp = KommissionTyp = {}));
var RunStatus;
(function (RunStatus) {
    RunStatus["Entwurf"] = "entwurf";
    RunStatus["Freigegeben"] = "freigegeben";
})(RunStatus || (exports.RunStatus = RunStatus = {}));
