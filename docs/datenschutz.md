# Datenschutz: BlitzON Control

Dieses Dokument beschreibt, welche personenbezogenen Daten BlitzON Control verarbeitet,
zu welchem Zweck, wie lange sie aufbewahrt werden und wie Betroffenenrechte technisch
umgesetzt sind. Es dient als Grundlage für die Prüfung durch BlitzON (Geschäftsführung /
Datenschutzbeauftragte:r) vor dem produktiven Go-Live.

## 1. Verarbeitete personenbezogene Daten

| Kategorie | Felder | Betroffene | Zweck |
|---|---|---|---|
| Login-Konto | E-Mail, Passwort-Hash, Rolle, 2FA-Secret | Mitarbeitende (alle Rollen) | Zugriffssteuerung, Authentifizierung |
| Verkäufer-Stammdaten | Name, IBAN, Organisation | Vertriebsmitarbeitende | Provisionsauszahlung, Zuordnung |
| Vertrag/Kunde | Kundenname, PLZ, Ort, Straße/Hausnummer, Verbrauch, Vertragsstatus | Endkund:innen (Vertragspartner der Energieversorger) | Provisionsermittlung, Nachweis gegenüber Buchhaltung |
| Provisionszeilen | Betrag, Regel, Begründung, Verkäufer-Zuordnung | Vertriebsmitarbeitende | Monatliche Abrechnung, Auditierbarkeit |
| Audit-Log | Aktion, alter/neuer Wert, Benutzer-ID, Zeitpunkt | Mitarbeitende (Bearbeiter:in) | Nachvollziehbarkeit finanzieller Änderungen (Vier-Augen-Prinzip) |
| Import-Batches | Dateiname, hochladende Person, Zeitpunkt, Fehlerliste | Mitarbeitende (Uploader:in) | Nachvollziehbarkeit von Datenimporten |

Keine besonderen Kategorien personenbezogener Daten (Art. 9 DSGVO) werden verarbeitet.

## 2. Rechtsgrundlage und Aufbewahrung

- **Vertragsdaten & Provisionszeilen**: Aufbewahrung gemäß handels-/steuerrechtlicher
  Pflichten (HGB §257, AO §147): grundsätzlich **10 Jahre**. Diese Datensätze werden
  auch nach einem Löschantrag einer betroffenen Person **nicht** gelöscht, sondern der
  Personenbezug wird entfernt (siehe Abschnitt 4).
- **Login-Konten & Verkäufer-Stammdaten**: Aufbewahrung für die Dauer des
  Beschäftigungsverhältnisses zzgl. einer Übergangsfrist zur Abrechnungsprüfung;
  Rechtsgrundlage Art. 6 Abs. 1 lit. b/f DSGVO (Vertragserfüllung, berechtigtes
  Interesse an korrekter Provisionsabrechnung).
- **Audit-Log**: wird nicht separat gelöscht, da er die Grundlage für die
  Nachvollziehbarkeit der aufbewahrungspflichtigen Provisionsdaten bildet; er enthält
  selbst keine Kundendaten.

## 3. Hosting / Standort

Die Referenzinfrastruktur (Postgres, Redis, Applikationsserver) ist für den Betrieb in
einer EU-Region vorzusehen (z. B. Frankfurt/Deutschland). Es sind keine Drittland-
Übermittlungen vorgesehen. Backups (siehe `docs/runbook.md`) verbleiben ebenfalls
innerhalb der EU. **Vor Produktivbetrieb ist der tatsächlich gewählte Hosting-Anbieter
und dessen Rechenzentrumsstandort zu bestätigen und hier zu ergänzen** (das ist
technisch nicht durch diese Codebasis erzwingbar, sondern eine Infrastrukturentscheidung).

## 4. Betroffenenrechte: technische Umsetzung

### Auskunft / Export (Art. 15 DSGVO)

`GET /api/datenschutz/export/:userId`: jede:r Nutzer:in kann die eigenen Daten
exportieren; Admin/GF kann im Auftrag einer betroffenen Person exportieren. Die Antwort
enthält Login-Stammdaten, verknüpfte Verkäuferdaten (falls vorhanden), zugeordnete
Verträge und Provisionszeilen als JSON.

### Löschung (Art. 17 DSGVO), abgewogen gegen Aufbewahrungspflichten

`POST /api/datenschutz/loeschantrag/:userId` (nur Admin/GF) **pseudonymisiert** statt zu
löschen:

- Login: E-Mail wird durch einen nicht adressierbaren Platzhalter ersetzt, Passwort auf
  einen zufälligen, nicht nutzbaren Hash gesetzt, 2FA deaktiviert: das Konto ist damit
  dauerhaft nicht mehr nutzbar.
- Verkäufer-Stammdaten: Name wird durch "Ehemaliger Verkäufer (anonymisiert)" ersetzt,
  IBAN entfernt, als inaktiv markiert.
- **Vertrags- und Provisionsdatensätze bleiben unverändert erhalten** (Fremdschlüssel
  zeigen weiterhin auf den nun anonymisierten Verkäufer), sodass Monats-Summen und
  DATEV-Exporte historisch korrekt, ohne dass die Person darüber identifizierbar bleibt.
- Der Vorgang wird im Audit-Log protokolliert (wer hat wann welchen Löschantrag
  bearbeitet).

### Berichtigung (Art. 16 DSGVO)

Über die bestehenden Stammdaten-Endpunkte (`/api/verkaeufer`, `/api/benutzer`) durch
Admin/GF; jede Änderung wird im Audit-Log mit Alt-/Neu-Wert protokolliert.

## 5. Sicherheitsmaßnahmen (Zusammenfassung)

Details siehe `docs/runbook.md`. Kurzfassung:

- Passwort-Hashing mit bcrypt (Cost-Faktor 12), keine Klartext-Passwörter im System.
- Pflicht-2FA (TOTP) für die Rollen Admin/GF und Backoffice.
- Rollenbasierte Zugriffskontrolle (RBAC) auf jedem Endpunkt; Vertriebsmitarbeitende
  sehen ausschließlich eigene Daten, Teamleiter:innen nur die eigene Organisation.
- Rate-Limiting auf Login und 2FA-Verifikation gegen Brute-Force.
- Vier-Augen-Prinzip: Ersteller:in eines Provisionslaufs kann diesen nicht selbst
  freigeben.
- Alle finanziellen Zustandsänderungen (Regeln, Läufe, Freigaben, Exporte) werden im
  Audit-Log erfasst.
- Bekannte, noch offene Abhängigkeits-Risiken: `xlsx` (SheetJS) hat aktuell keine vom
  Hersteller bereitgestellte Fix-Version für zwei bekannte Advisories (Prototype
  Pollution, ReDoS); das Paket wird ausschließlich serverseitig für Datei-Import/-Export
  mit intern hochgeladenen Dateien verwendet, nicht mit nicht vertrauenswürdigen
  Fremddateien; das Restrisiko ist zu beobachten und bei Verfügbarkeit eines Fixes zu
  schließen.

## 6. Offene Punkte für BlitzON

- Bestätigung des tatsächlichen Hosting-Standorts (Abschnitt 3).
- Festlegung einer verbindlichen Löschfrist für inaktive Verkäufer:innen-Konten nach
  Ausscheiden (aktuell: manueller Löschantrag durch Admin/GF, kein automatischer Ablauf).
- Benennung einer verantwortlichen Stelle / Datenschutzbeauftragten für eingehende
  Betroffenenanfragen.
