# Technische und organisatorische Maßnahmen (Art. 32 DSGVO)

Anlage 2 zum Auftragsverarbeitungsvertrag. Beschreibt, wie die Zeiterfassung
personenbezogene Daten schützt. **Stand: 11. 10. 2026.** Bei jeder
sicherheitsrelevanten Änderung am Code mitpflegen; die technischen Einzelheiten
stehen in `docs/sicherheit.md`.

Vorlage, keine Rechtsberatung. Punkte in [eckigen Klammern] ergänzt der
Betreiber; Punkte mit ☐ sind noch nicht umgesetzt und vor dem Echtbetrieb zu
erledigen oder aus dem Text zu nehmen.

## 1. Vertraulichkeit (Art. 32 Abs. 1 lit. b DSGVO)

### 1.1 Zutrittskontrolle (physisch)
Der Betreiber betreibt keine eigenen Server. Gehostet wird bei Supabase Inc.
in Rechenzentren von Amazon Web Services in Irland (eu-west-1). Zutritt regeln
deren zertifizierte Verfahren (SOC 2 Typ II, ISO 27001).
Arbeitsplätze des Betreibers: [abschließbare Büroräume / Homeoffice-Regelung].

### 1.2 Zugangskontrolle (Systeme)
- Anmeldung mit E-Mail und Passwort; mindestens 12 Zeichen mit Buchstaben und
  Ziffern, serverseitig erzwungen.
- Keine Selbstregistrierung: Zugänge legt nur die Verwaltung des jeweiligen
  Unternehmens an, per Einladung (die Person setzt ihr Passwort selbst) oder
  mit Erstpasswort zur persönlichen Übergabe.
- Gleiche Fehlermeldung für unbekannte Adresse und falsches Passwort;
  Begrenzung der Anmeldeversuche durch Supabase Auth.
- „Passwort vergessen“ per Einmal-Link (gültig eine Stunde); danach werden alle
  anderen Anmeldungen beendet.
- Deaktivierte Zugänge werden sofort gesperrt, alle Sitzungen beendet.
- Administrative Zugänge des Betreibers (Supabase, GitHub, Cloudflare, npm):
  ☐ Zwei-Faktor-Anmeldung aktiv.

### 1.3 Zugriffskontrolle (Daten)
- **Mandantentrennung** durch Row Level Security in der Datenbank: jede
  Abfrage liefert nur Daten des eigenen Unternehmens. Die Prüfung liegt in der
  Datenbank, nicht in der Oberfläche, und gilt auch bei direkten Aufrufen der
  Schnittstelle.
- **Rollen:** Mitarbeiter sehen nur die eigenen Daten; die Verwaltung sieht
  die Daten ihres Unternehmens; der Inhaber ist vor Herabstufung, Sperre und
  Passwortänderung durch andere geschützt.
- Rolle und Unternehmenszugehörigkeit setzt ausschließlich der Server; Angaben
  aus dem Browser werden dafür nie übernommen.
- **Dienstverträge** liegen in einem privaten Speicher je Unternehmen und
  Person; Zugriff nur für die Verwaltung des Unternehmens und die Person
  selbst. Anzeige über signierte Links, die nach 60 Sekunden verfallen.
- Der geheime Datenbankschlüssel (`service_role`) liegt nur in der
  serverseitigen Funktion; der Build bricht ab, sollte er ins Browser-Bündel
  geraten.
- Der Betreiber greift auf Kundendaten nur zu, soweit es für Betrieb und
  Fehlerbehebung nötig ist und der Kunde zugestimmt hat (siehe AVV § 4).

### 1.4 Trennungskontrolle
Alle Unternehmen liegen in einer Datenbank, strikt getrennt über eine
Unternehmenskennung je Datensatz, die aus der Person abgeleitet und nie aus
der Eingabe übernommen wird. Abgesichert durch automatisierte Angriffstests.

### 1.5 Pseudonymisierung und Verschlüsselung
- Übertragung ausschließlich verschlüsselt (TLS/HTTPS, HSTS); direkte
  Datenbankverbindungen nur mit SSL.
- Speicherung verschlüsselt (AES-256 bei Supabase/AWS), einschließlich
  Backups und Dateien.
- Passwörter nur als bcrypt-Hash.
- Pseudonymisierung ist für den Zweck nicht geeignet (Arbeitszeit muss der
  Person zugeordnet sein).

## 2. Integrität (Art. 32 Abs. 1 lit. b DSGVO)

### 2.1 Weitergabekontrolle
- Keine Weitergabe an Dritte außer den Unterauftragsverarbeitern (AVV,
  Anlage 1).
- Strenge Content Security Policy: der Browser darf nur mit der eigenen
  Anwendung und dem eigenen Supabase-Projekt kommunizieren.
- Exporte (PDF, CSV) erstellt der Browser lokal; CSV-Zellen werden gegen
  Formel-Einschleusung entschärft.

### 2.2 Eingabekontrolle
- **Unveränderliches Änderungsprotokoll:** jede Änderung an Zeiten,
  Abwesenheiten, Verträgen, Stammdaten, Unternehmen und Dienstverträgen wird
  mit Zeitpunkt, Urheber, altem und neuem Wert protokolliert. Das Protokoll
  lässt sich von niemandem ändern oder löschen, auch nicht mit dem geheimen
  Schlüssel; einzige Ausnahme ist die Löschung nach Ablauf der
  Aufbewahrungsfrist.
- Stempelzeiten setzt der Server, nicht der Browser; nachträgliche Änderungen
  sind als „nachgetragen“ gekennzeichnet.
- Monatsabschluss: abgeschlossene Monate sind für alle gesperrt; Wiederöffnen
  nur durch den Inhaber mit Begründung im Protokoll.
- Dienstverträge werden nie überschrieben; ein SHA-256-Prüfwert macht eine
  ausgetauschte Datei erkennbar.

## 3. Verfügbarkeit und Belastbarkeit (Art. 32 Abs. 1 lit. b und c DSGVO)

- Hosting in redundanten Rechenzentren (AWS eu-west-1).
- ☐ Tägliche Backups mit 7 Tagen Aufbewahrung (Supabase Pro-Plan); der
  Gratis-Plan hat keine Backups.
- ☐ Wiederherstellung einmal erprobt; Ergebnis: [Datum, Dauer].
- Begrenzung der Abfragezeit (8 Sekunden) und der Ergebnismenge (1000 Zeilen)
  gegen Überlastung.
- Auslieferung der Oberfläche über das weltweite Netz von Cloudflare.

## 4. Verfahren zur regelmäßigen Überprüfung (Art. 32 Abs. 1 lit. d DSGVO)

- Automatische Prüfung bei jeder Änderung am Code (GitHub Actions): Suche nach
  Geheimnissen im Code (gitleaks), bekannte Schwachstellen in Abhängigkeiten
  (`npm audit`), Tests, Prüfung des Browser-Bündels auf Schlüssel.
- Automatisierte Angriffstests gegen die Zugriffsregeln (`npm run test:rls`).
- Abhängigkeiten werden von Dependabot mit 7 Tagen Wartezeit aktualisiert.
- Überprüfung dieser Maßnahmen mindestens jährlich und bei wesentlichen
  Änderungen. Letzte Überprüfung: 8. 10. 2026 (Sicherheitsprüfung nach OWASP
  Top 10:2025, siehe `docs/sicherheit.md`).
- ☐ Externer Penetrationstest vor der Aufnahme fremder Unternehmen.

## 5. Auftragskontrolle und Organisation

- Unterauftragsverarbeiter nur mit Auftragsverarbeitungsvertrag (AVV,
  Anlage 1).
- Löschung nach Ablauf der Aufbewahrungsfrist (Standard: 7 Jahre ab Ende des
  Austrittsjahres) über eine eigene Funktion, die vorher Fristablauf und
  Status prüft.
- Meldung von Datenschutzverletzungen an den Kunden unverzüglich, spätestens
  innerhalb von 24 Stunden nach Bekanntwerden (AVV § 7).
- Mit Kundendaten befasste Personen sind auf Vertraulichkeit verpflichtet
  (§ 6 DSG): [Namen bzw. „nur der Betreiber selbst“].
- Ansprechpartner für Datenschutz beim Betreiber: [Name, E-Mail].
