# Admin-Handbuch: BlitzON Control

Dieses Handbuch richtet sich an Admin/GF, Teamleiter und Backoffice bei BlitzON und
beschreibt die alltäglichen Aufgaben in BlitzON Control. Technische Details
(Deployment, Backups, CI) stehen in `docs/runbook.md` (Englisch).

## 1. Anmeldung und Zwei-Faktor-Authentifizierung

Für die Rollen **Admin/GF** und **Backoffice** ist die Zwei-Faktor-Authentifizierung
(2FA) verpflichtend.

- Bei der ersten Anmeldung erscheint statt des Dashboards ein Einrichtungsbildschirm
  mit einem geheimen Schlüssel. Diesen in einer Authenticator-App (z. B. Google
  Authenticator, Authy, Microsoft Authenticator) hinterlegen und den angezeigten
  6-stelligen Code eingeben.
- Bei jeder weiteren Anmeldung wird nach Benutzername/Passwort zusätzlich der
  6-stellige Code aus der App abgefragt.
- Geht das Gerät mit der Authenticator-App verloren: ein:e Admin/GF muss das
  betroffene Benutzerkonto zurücksetzen (Benutzer löschen und neu anlegen, oder
  über die Datenbank `twofa_enabled` und `twofa_secret` auf `false`/`null` setzen
  lassen von der technischen Betreuung); dies ist bewusst nicht selbstständig
  über die Oberfläche möglich, um Missbrauch zu erschweren.

## 2. Provisionssatz ändern

1. Im Menü **Provisionsregeln** öffnen (nur Admin/GF sichtbar).
2. Die passende Regel für Produkt/Organisation suchen oder eine neue anlegen.
3. **Wichtig:** Eine bestehende Regel nicht einfach überschreiben, wenn der neue
   Satz erst ab einem bestimmten Datum gelten soll. Stattdessen:
   - Das `gueltig_bis`-Datum der alten Regel auf den Tag vor dem neuen Satz setzen.
   - Eine neue Regel mit `gueltig_ab` ab dem gewünschten Datum und dem neuen Satz
     anlegen.
   - So bleiben bereits freigegebene Provisionsläufe unverändert, da sie den
     Regelstand zum Zeitpunkt ihrer Berechnung referenzieren (siehe
     `docs/workflow.md`, Flow C).
4. Jede Änderung wird automatisch im Audit-Log mit altem und neuem Wert sowie
   Bearbeiter:in und Zeitpunkt protokolliert.

## 3. Verkäufer:in verwalten

- **Neue Verkäufer:in anlegen**: Menü **Verkäufer** (Admin/GF, Teamleiter,
  Backoffice) → Name, Organisation und IBAN erfassen.
- **Verkäufer:in deaktivieren** (z. B. bei Austritt): Feld `aktiv` auf "Nein"
  setzen. Deaktivierte Verkäufer:innen zählen nicht mehr zur KPI "Aktive
  Verkäufer" im Dashboard, bestehende Verträge und Provisionszeilen bleiben aber
  unverändert erhalten.
- **Login-Konto mit Verkäufer:in verknüpfen**: Beim Anlegen/Bearbeiten eines
  Benutzerkontos mit der Rolle "Aussendienst" das Feld `repId` auf die
  entsprechende Verkäufer-ID setzen. Nur so sieht die Person beim Login ihr
  eigenes, korrektes Dashboard; ohne Verknüpfung sieht sie kein Dashboard mit
  eigenen Daten.
- **Vollständige Löschung einer Person (DSGVO)**: siehe `docs/datenschutz.md`,
  Abschnitt 4: nutzt den Löschantrag-Endpunkt, der personenbezogene Daten
  entfernt, aber Vertrags-/Provisionszahlen aus buchhalterischen Gründen erhält.

## 4. Datencheck-Warteschlange abarbeiten

Backoffice-Aufgabe, siehe `docs/workflow.md` Flow D.

1. Im **Provisionslauf**-Detail werden Zeilen mit "Datencheck: Ja" markiert
   angezeigt (fehlender Lieferbeginn, unbekanntes Produkt oder Status
   "Datencheck").
2. Den zugehörigen Vertrag in Joules nachschlagen und die fehlende Information
   ergänzen (z. B. Lieferbeginn eintragen) oder den Vertrag als abgelehnt
   markieren.
3. Den korrigierten Datensatz erneut über die Import-Funktion hochladen (gleiche
   `joules_id`; der bestehende Vertrag wird aktualisiert, nicht dupliziert).
4. Im Provisionslauf auf **Neu berechnen** klicken, solange der Lauf noch im
   Entwurf ist: die korrigierte Zeile wird neu bewertet und die
   Datencheck-Markierung verschwindet, sofern jetzt alle Pflichtfelder vorhanden
   sind.

## 5. Provisionslauf freigeben (Vier-Augen-Prinzip)

- Ein Provisionslauf kann **nicht** von derselben Person freigegeben werden, die
  ihn erstellt hat; das System weist das mit einer Fehlermeldung zurück.
- Nur Admin/GF darf freigeben.
- Nach der Freigabe ist der Lauf eingefroren: Beträge können nicht mehr verändert
  werden. Korrekturen fließen als neue Zeile (z. B. Rückbuchung) in einen
  späteren Lauf ein, niemals als nachträgliche Änderung am bereits freigegebenen
  Lauf.

## 6. Exporte

Nach der Freigabe stehen im Provisionslauf-Detail folgende Exporte bereit:

- **Buchhaltungsexport (CSV)**: für die Übergabe an die Buchhaltung.
- **DATEV-Export (Platzhalter)**: identischer Inhalt wie der CSV-Export, bis die
  echte DATEV-Spaltenspezifikation vom Steuerberater vorliegt (siehe offene
  Fragen in `PROGRESS.md`).
- **Interner Export (Excel)**: enthält drei Tabellenblätter: Details, Summe je
  Verkäufer:in, Summe je Organisation.
- **Abrechnung (PDF)**: pro Verkäufer:in, über den Button neben der jeweiligen
  Summe im Provisionslauf-Detail; Verkäufer:innen können ihre eigene Abrechnung
  auch selbst über ihr Dashboard herunterladen.

## 7. Rollenübersicht

| Rolle | Sieht | Darf |
|---|---|---|
| Admin/GF | Alles | Alles, inkl. Regeln anlegen, Läufe freigeben, Benutzer verwalten |
| Teamleiter | Nur eigene Organisation | Läufe anlegen/neu berechnen für die eigene Organisation |
| Backoffice | Alle Organisationen | Läufe neu berechnen, Import, Exporte (keine Freigabe) |
| Aussendienst | Nur eigene Verträge/Provisionen | Eigenes Dashboard und eigene Abrechnung einsehen |
