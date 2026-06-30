"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunStatus = exports.KommissionTyp = exports.Rolle = exports.EnergieArt = exports.CLAWBACK_STATUS = exports.KEIN_SATZ_STATUS = exports.ZAEHLT_STATUS = exports.VertragStatus = void 0;
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
var EnergieArt;
(function (EnergieArt) {
    EnergieArt["Strom"] = "Strom";
    EnergieArt["Gas"] = "Gas";
})(EnergieArt || (exports.EnergieArt = EnergieArt = {}));
var Rolle;
(function (Rolle) {
    Rolle["AdminGf"] = "admin_gf";
    Rolle["Teamleiter"] = "teamleiter";
    Rolle["Backoffice"] = "backoffice";
    Rolle["Aussendienst"] = "aussendienst";
})(Rolle || (exports.Rolle = Rolle = {}));
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
