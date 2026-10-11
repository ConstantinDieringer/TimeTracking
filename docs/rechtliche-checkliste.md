# Rechtliche Checkliste

Die Software erledigt, was sich technisch erledigen lässt: Aufzeichnung nach
§ 26 AZG, laufende Prüfung von AZG, ARG, KJBG und UrlG, lückenloses
Änderungsprotokoll, Selbstauskunft der Mitarbeiter, Datenschutzinformation,
Löschung nach Fristablauf, Trennung der Unternehmen. **Rechtskonform wird der
Einsatz aber erst zusammen mit den folgenden Punkten**, die Verträge,
Dokumentation und Organisation betreffen. Diese Liste ist keine
Rechtsberatung; vor dem Verkauf an Kunden von Arbeitsrecht und Datenschutz
prüfen lassen.

## A. Du als Betreiber der Plattform

Rechtlich bist du **Auftragsverarbeiter** (Art. 28 DSGVO): Verantwortlich für
die Daten ist jeweils das Kundenunternehmen.

- [ ] **Auftragsverarbeitungsvertrag (AVV)** mit jedem Kundenunternehmen
      abschließen, bevor echte Daten eingegeben werden.
- [ ] **AVV mit Supabase** abschließen (Dashboard → *Organization Settings →
      Legal Documents*). Supabase ist dein Unterauftragsverarbeiter; das muss
      im AVV mit den Kunden genannt sein, samt Grundlage der Übermittlung in
      die USA (Data Privacy Framework bzw. Standardvertragsklauseln).
- [ ] **Verzeichnis der Verarbeitungstätigkeiten als Auftragsverarbeiter**
      (Art. 30 Abs. 2 DSGVO).
- [ ] **Technische und organisatorische Maßnahmen** dokumentieren (Art. 32
      DSGVO): Row Level Security, Änderungsprotokoll, EU-Hosting, Backups,
      Zugangsschutz. Die README liefert die Grundlage.
- [ ] **Pro-Plan bei Supabase**, bevor echte Daten hineinkommen. Der
      Free-Plan hat keine Backups und pausiert nach einer Woche ohne Nutzung —
      beides verträgt sich nicht mit der Aufbewahrungspflicht.
- [ ] **Testdaten aus der Cloud entfernen** (Testfirmen mit Passwort
      `zeiterfassung`), bevor echte Kunden die Plattform nutzen.
- [ ] Dashboard → *Authentication*: Selbstregistrierung aus, Mindestlänge für
      Passwörter auf mindestens 12 Zeichen, Schutz vor bekannten geleakten
      Passwörtern einschalten, falls im Plan verfügbar.
- [ ] Beim Verkauf: **Impressum** (§ 5 ECG, § 25 MedienG),
      **Datenschutzerklärung** der Website, **AGB** mit Haftungsregelung — die
      Software weist auf Verstöße hin, ersetzt aber keine Rechtsprüfung.
- [ ] **Fachliche Prüfung** der Rechtslogik durch eine Arbeitsrechtsexpertin,
      besonders Kollektivvertragsregeln, Reisezeit, Rufbereitschaft und
      Arbeitsbereitschaft.
- [ ] Einmal im Jahr **Löschlauf** nach Fristablauf (siehe README, Abschnitt
      *Aufbewahrung und Löschung*).

## B. Jedes Kundenunternehmen als Arbeitgeber

- [ ] **Datenschutzinformation** in der Anwendung unter *Datenschutz*
      ausfüllen (Vorlage übernehmen, eckige Klammern ergänzen) und die
      Mitarbeiter vor Beginn der Aufzeichnung darauf hinweisen.
- [ ] **AVV** mit dem Betreiber unterzeichnen.
- [ ] **Verzeichnis der Verarbeitungstätigkeiten** um die Zeiterfassung
      ergänzen (Art. 30 Abs. 1 DSGVO).
- [ ] **Betriebsrat vorhanden?** Dann prüfen, ob eine Betriebsvereinbarung
      nötig ist (§§ 96, 96a ArbVG).
- [ ] **Gleitzeit?** Es braucht eine schriftliche Gleitzeitvereinbarung
      (§ 4b AZG). Die Software bildet deren Parameter ab, ersetzt sie aber
      nicht.
- [ ] **Kollektivvertrag** prüfen: Abweichungen bei Normalarbeitszeit,
      Durchrechnung oder Zuschlägen im Betriebsstandard bzw. Vertrag
      einstellen.
- [ ] **Jugendliche beschäftigt?** KJBG-Pflichten außerhalb der
      Zeiterfassung prüfen, etwa ob ein eigenes Verzeichnis der Jugendlichen
      zu führen ist.
- [ ] **Aufbewahrungsfrist** mit der Steuerberatung abstimmen (eingestellt:
      7 Jahre ab Ende des Austrittsjahres).
- [ ] Aufzeichnungen **regelmäßig kontrollieren** und Befunde abarbeiten — der
      Arbeitgeber bleibt verantwortlich, auch wenn Mitarbeiter selbst erfassen.
- [ ] **Datenschutz-Folgenabschätzung** voraussichtlich nicht nötig, weil die
      Personalverwaltung in der österreichischen DSFA-Ausnahmenverordnung
      genannt ist — im Einzelfall bestätigen lassen.

- [ ] **Dienstverträge in der Anwendung ablegen?** Dann:
      - Datenschutzinformation um den Absatz zu Dienstverträgen ergänzen (in
        der Vorlage enthalten) und das Verzeichnis der Verarbeitungstätigkeiten
        erweitern.
      - Nur ablegen, was für das Arbeitsverhältnis nötig ist. Angaben zu
        Gesundheit, Behinderung oder Gewerkschaft nur, wenn unvermeidbar
        (Art. 9 DSGVO).
      - Ein **Dienstzettel** darf elektronisch übergeben werden, wenn die Person
        ihn abrufen, speichern und ausdrucken kann (§ 2 AVRAG). Die Anwendung
        erfüllt das; als Nachweis gilt das erste Öffnen, das unter
        *Dienstvertrag* im Mitarbeiterblatt steht. Ist es nach angemessener
        Zeit leer, den Dienstzettel zusätzlich auf Papier übergeben.
      - Wo Schriftform verlangt ist (etwa beim Lehrvertrag), ersetzt der Scan
        das unterschriebene Original nicht. Original aufbewahren oder
        qualifiziert elektronisch signieren (ID Austria).
      - Vor dem Löschlauf nach Fristablauf die Dateien der Person in der
        Verwaltung löschen; `purge_employee` verweigert sonst die Löschung.

## C. Was die Software abdeckt

| Pflicht | Umsetzung |
|---|---|
| Arbeitszeitaufzeichnung (§ 26 AZG) | Beginn, Ende, Pausen je Abschnitt; Gleitzeitsaldo |
| Übermittlung an Mitarbeiter (§ 26 Abs 8 AZG) | Selbstbedienung unter *Monat* als PDF/CSV |
| Höchstgrenzen, Pausen, Ruhezeiten | laufende Prüfung nach AZG, ARG, KJBG mit Fundstelle |
| Urlaub (UrlG) | Anspruch, Aliquotierung, Verbrauch |
| Nachvollziehbarkeit von Korrekturen | unveränderliches Protokoll für Zeiten, Abwesenheiten, Verträge, Stammdaten, Unternehmen |
| Zugriffsschutz (Art. 32 DSGVO) | Row Level Security je Person und Unternehmen, Inhaber-Schutz |
| Informationspflicht (Art. 13 DSGVO) | Seite *Datenschutz* mit Vorlage |
| Auskunft (Art. 15 DSGVO) | Selbstauskunft der Zeiten; vollständige Auskunft über die Verwaltung |
| Speicherbegrenzung (Art. 5 DSGVO) | `retention_overview` und `purge_employee` |
| Datenresidenz | Supabase-Projekt in der EU (Irland) |
| Dienstverträge (DSGVO, § 2 AVRAG) | privater Speicher je Unternehmen, Zugriff nur Verwaltung und Person selbst, nur PDF bis 10 MB, kein Überschreiben, SHA-256-Prüfwert, Protokoll von Ablage, erstem Öffnen und Löschung |
| Passwort vergessen | Link per E-Mail, gleiche Antwort für vorhandene und unbekannte Adressen, andere Anmeldungen werden danach beendet |
