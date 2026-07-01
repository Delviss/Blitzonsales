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

export enum EnergieArt {
  Strom = 'Strom',
  Gas = 'Gas',
}

export enum Rolle {
  AdminGf = 'admin_gf',
  Teamleiter = 'teamleiter',
  Backoffice = 'backoffice',
  Aussendienst = 'aussendienst',
}

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
