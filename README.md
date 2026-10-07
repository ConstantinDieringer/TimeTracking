# Zeiterfassung Österreich

Arbeitszeiterfassung für ein kleines Team, abgestimmt auf das österreichische
Arbeitsrecht: AZG, ARG, KJBG und UrlG. Die Aufzeichnung ist so angelegt, dass
sie einer Prüfung nach § 26 AZG standhält, und die Grenzen werden nicht nur
dokumentiert, sondern laufend überwacht.

## Schnellstart

Voraussetzungen: Node ≥ 20 und Docker.

```bash
npm install
npm run db:start        # startet Postgres, Auth und Studio in Docker
cp .env.example .env    # URL und ANON_KEY aus der Ausgabe von db:start eintragen
npm run dev             # http://localhost:5173
```

Die Testzugänge aus `supabase/seed.sql`, Passwort jeweils `zeiterfassung`:

**Honestas Capital GmbH** — deckt zusammen jeden Zweig der Rechtslogik ab:

| E-Mail | Rolle | Besonderheit |
|---|---|---|
| `admin@example.at` | Verwaltung | Leitende Angestellte, vom AZG ausgenommen |
| `anna@example.at` | Mitarbeiterin | Vollzeit mit Gleitzeit **ohne** ganztägigen Verbrauch |
| `sofia@example.at` | Mitarbeiterin | Teilzeit 20 h — zeigt Mehrarbeit gegen Überstunde |
| `jonas@example.at` | Mitarbeiter | Lehrling, wird am 17. 9. 2026 achtzehn |

**Musterbau GmbH** — der zweite Mandant, die Gegenprobe:

| E-Mail | Rolle | Besonderheit |
|---|---|---|
| `chef@musterbau.at` | Verwaltung | sieht von Honestas nichts, obwohl er Administrator ist |
| `lisa@musterbau.at` | Mitarbeiterin | trägt dieselbe Personalnummer wie jemand drüben |

Melde dich einmal mit jedem der beiden Administratoren an: die
Mitarbeiterlisten überschneiden sich in keinem einzigen Eintrag.

## Befehle

| Befehl | Wirkung |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm run build` | Produktionsbündel nach `web/dist` |
| `npm test` | Unit-Tests der Rechtslogik und der Exporte |
| `npm run test:rls` | Prüfung der Zugriffstrennung gegen die laufende Datenbank |
| `npm run db:start` / `db:stop` | lokale Supabase-Instanz |
| `npm run db:reset` | Schema und Testdaten neu aufsetzen |
| `npm run db:types` | Datenbanktypen für das Frontend neu erzeugen |

Die lokale Instanz läuft auf den Ports 544xx statt der Supabase-Standardports
54321 ff., damit sie neben anderen lokalen Projekten bestehen kann.

## Aufbau

```
packages/legal/    Rechtslogik — reine TypeScript-Funktionen, ohne Supabase und React
supabase/          Schema, RLS-Policies, Trigger, Seed, eine Edge Function
web/               React-Oberfläche
```

Die Trennung ist Absicht. `packages/legal` ist der Teil, bei dem Fehler teuer
sind; er kennt weder Datenbank noch Oberfläche und ist deshalb vollständig
testbar. Die Oberfläche setzt nur zusammen, was dort gerechnet wurde.

### Mehrere Unternehmen in einer Datenbank

Jeder Kunde ist eine Zeile in `organizations`; jede andere Tabelle trägt eine
`organization_id`. Row Level Security trennt damit nicht nur Mitarbeiter von
Mitarbeiter, sondern auch Unternehmen von Unternehmen. Ein Administrator ist
Administrator **genau eines** Betriebs — es gibt bewusst keine Rolle, die
darüber hinwegsieht, auch nicht für den Betreiber.

Die Mandantenspalte wird auf jeder Tabelle mitgeführt statt über den
Mitarbeiter hergeleitet. Das ist Redundanz mit Absicht: eine Policy, die
`organization_id = current_organization_id()` prüft, ist auf einen Blick
richtig, während eine mit verschachtelter Unterabfrage bei jeder Änderung neu
durchdacht werden muss. Ein Trigger setzt die Spalte aus dem Mitarbeiter und
überschreibt dabei, was der Client mitschickt — sonst ließe sich ein Datensatz
durch Setzen der Spalte in einen fremden Mandanten schieben.

Eindeutig **je Unternehmen**, nicht global: Personalnummern, Vertragsarten und
der Betriebsstandard. Zwei Firmen dürfen beide eine „P-001" und beide eine
Vertragsart „Vollzeit" haben. Gesetzliche Werte wie die
Geringfügigkeitsgrenze stehen dagegen ohne Unternehmen in `settings`
(`organization_id is null`) — lesbar für alle, änderbar für niemanden.

`npm run test:rls` prüft das mit zwei echten Mandanten gegeneinander.

### Einen neuen Kunden anlegen

Unternehmen entstehen nur auf Einladung, also von Hand durch den Betreiber.
Drei Schritte, der mittlere im Supabase-Dashboard:

```sql
-- 1. Unternehmen anlegen. Legt zugleich die sieben Vertragsarten und einen
--    leeren Betriebsstandard an und gibt die Kennung zurück.
select public.create_organization('Muster GmbH');
```

**2.** Dashboard → *Authentication → Users → Add user*: E-Mail und Passwort
setzen, „Auto Confirm" anhaken.

```sql
-- 3. Den Benutzer zum ersten Administrator dieses Unternehmens machen.
--    Der Name ist optional, aber empfehlenswert: sonst steht in der Anwendung
--    der Teil vor dem @ der E-Mail-Adresse.
select public.assign_to_organization(
  'admin@muster.at',
  '<kennung-aus-schritt-1>',
  'admin',
  'Maria Muster'
);
```

Ab da macht der Kunde alles selbst: Betriebsstandard festlegen, Mitarbeiter
anlegen, Verträge pflegen. Beide Funktionen sind für angemeldete Benutzer
gesperrt und laufen nur im SQL-Editor.

### Kein eigener Server

Die Anwendung ist ein statisches Bündel, das direkt mit Supabase spricht. Die
Zugriffstrennung liegt in **Row Level Security** in Postgres, nicht im
Frontend-Code: ein Mitarbeiter bekommt fremde Zeiten auch mit manipuliertem
Client nicht zu sehen, weil die Datenbank die Zeilen gar nicht herausgibt.
`npm run test:rls` meldet sich als echte Benutzer an und versucht genau das.

Einzige Ausnahme ist die Edge Function `admin-users`: das Anlegen von Benutzern
braucht den `service_role`-Schlüssel, der nicht ins Browser-Bundle darf.

### Betriebsstandard

Unter **Verwaltung → Betriebsstandard** liegen die Werte, die für alle gleich
sind: kollektivvertragliche Normalarbeitszeit, Kollektivvertrag, Bundesland,
Urlaubsanspruch und die Gleitzeitparameter. Neue Verträge starten damit, jeder
einzelne kann abweichen.

Zwei Angaben sind bewusst **ohne Vorgabewert** und müssen gesetzt werden:

- **Das Bundesland** — ein stillschweigendes „Wien" wäre für acht von neun
  Betrieben falsch.
- **Der ganztägige Verbrauch von Zeitguthaben** bei Gleitzeit — als Auswahl
  Ja/Nein ohne Vorbelegung, nicht als Häkchen. Ein Häkchen, das niemand
  anfasst, bedeutet „nein"; wer es übersieht, verbucht Überstunden als
  Normalarbeitszeit oder umgekehrt. Beides kostet Geld, in unterschiedliche
  Richtungen. Das Formular speichert erst, wenn die Frage beantwortet ist.

Gespeichert wird das in der Tabelle `settings` unter dem Schlüssel
`contract_defaults`.

### Änderungsprotokoll

Jede Änderung an Zeiten, Abwesenheiten und Verträgen schreibt ein
**Postgres-Trigger** mit Alt- und Neuwert, Zeitpunkt und Benutzer. Bewusst als
Trigger und nicht im Anwendungscode: so lässt er sich vom Client nicht umgehen.
Auf `audit_log` gibt es keine Policy für INSERT, UPDATE oder DELETE — auch ein
Administrator kann das Protokoll nicht bereinigen.

Da es keinen Freigabe-Workflow gibt, trägt dieses Protokoll die
Prüfungsfestigkeit allein. Nachträge und Korrekturen bleiben erlaubt — bei
vergessenem Ausstempeln sind sie unvermeidlich —, aber sie sind lückenlos
nachvollziehbar.

## Was die Rechtslogik abdeckt

| Bereich | Umsetzung |
|---|---|
| Feiertage | 13 gesetzliche nach § 7 ARG, bewegliche über die Osterberechnung |
| Karfreitag | **kein** Feiertag; stattdessen persönlicher Feiertag nach § 7a ARG |
| Landesfeiertage | werden angezeigt, lösen aber kein Feiertagsentgelt aus |
| Höchstarbeitszeit | 12 h/Tag, 60 h/Woche, Ø 48 h über 17 Wochen (§ 9 AZG) |
| Ruhepause | ≥ 30 min bei > 6 h, Teilung in 2 × 15 oder 3 × 10 (§ 11 AZG) |
| Ruhezeit | ≥ 11 h, über die Zeitumstellung korrekt gemessen (§ 12 AZG) |
| Wochenruhe | 36 h einschließlich Sonntag, Ersatzruhe (§§ 3, 6 ARG) |
| Gleitzeit | § 4b: Periode, Rahmen, Übertrag, 10-h- gegen 12-h-Grenze |
| Mehrarbeit / Überstunde | 25 % nach § 19d gegen 50 % nach § 10 AZG |
| Jugendliche | KJBG, tagesgenau nach Geburtsdatum statt nach Kennzeichen |
| Urlaub | 25 bzw. 30 Arbeitstage, im Ein- und Austrittsjahr aliquot (§ 2 UrlG) |
| Geringfügigkeit | Warnung an der Grenze von 551,10 € (Wert 2026) |

Drei Stellen verdienen besondere Erwähnung, weil sie in der Praxis am
häufigsten falsch gerechnet werden:

**Die zwölfte Stunde bei Gleitzeit.** Nach § 4b Abs 4 AZG sind zwölf Stunden
tägliche Normalarbeitszeit nur dann zulässig, wenn die Gleitzeitvereinbarung
ganztägigen Verbrauch von Zeitguthaben vorsieht und ihn im Zusammenhang mit der
wöchentlichen Ruhezeit nicht ausschließt. Fehlt eine der beiden Bedingungen,
ist jede Stunde über der zehnten eine Überstunde mit 50 % Zuschlag. Das Tool
fragt die Bedingung beim Anlegen der Vereinbarung ab und lässt die höhere
Grenze nur dann zu.

**Mehrarbeit ist keine Überstunde.** Stunden über dem individuell vereinbarten
Teilzeitausmaß, aber unter der kollektivvertraglichen Normalarbeitszeit, sind
Mehrarbeit mit 25 %. Erst darüber beginnt die Überstunde mit 50 %. Der Vertrag
führt deshalb zwei getrennte Stundenwerte.

**Die Zeitumstellung.** Eine Ruhezeit von 22:00 bis 09:00 beträgt im Oktober
zwölf Stunden und im März zehn. Gerechnet wird durchgehend zwischen
Zeitpunkten, nie zwischen Uhrzeiten; die Tests decken beide Umstellungstage ab.

## Gestaltung

Die Oberfläche soll nicht nach KI-Generat aussehen. Der Fingerabdruck
generierter Oberflächen ist erstaunlich einheitlich — Inter,
Indigo-zu-Violett-Verlauf, drei abgerundete Karten nebeneinander, Badge über
der Überschrift, Glassmorphismus. `web/src/styles/tokens.css` enthält deshalb
nicht nur die Festlegungen, sondern auch eine ausdrückliche Gegenliste. Kurz:

- IBM Plex statt Inter, Zeiten in IBM Plex Mono mit Tabellenziffern
- ein einziger Akzent in gedecktem Tannengrün, keine Verläufe
- warmes Papierweiß statt Reinweiß
- Haarlinien statt Karten und Schatten, Radius 2 px statt 12 px
- linksbündige Tabellen mit echter Datendichte statt zentrierter Hero-Sektionen
- kein Tailwind und keine Komponentenbibliothek, deren Defaults genau diese
  Optik erzeugen

Jede Warnung nennt ihre Fundstelle im Gesetz. Das ist keine Zierde: eine
Meldung, die ihre Grundlage angibt, lässt sich nachschlagen und gegebenenfalls
widerlegen.

## Offene Punkte

- **SMTP.** Supabase Auth verschickt Einladungs- und Reset-Mails, der eingebaute
  Versand ist aber nur für die Entwicklung gedacht. Für den Echtbetrieb einen
  SMTP-Zugang in `supabase/config.toml` eintragen. Bis dahin legt der Admin
  Zugänge mit einem Erstpasswort an und übergibt es persönlich.
- **Kollektivvertrag.** Die Normalarbeitszeit ist im Betriebsstandard und je
  Vertrag einstellbar (38,5 oder 40 Stunden zur Auswahl, abweichende Werte frei
  eingebbar). Ein konkretes KV-Regelwerk mit eigenen Zuschlagssätzen ließe sich
  in `packages/legal/src/settings.ts` ergänzen.
- **Mehrarbeitszuschlag.** Die Ungleichbehandlung von Teilzeitkräften (25 %
  gegenüber 50 %) steht unionsrechtlich in Diskussion. Die Sätze sind deshalb
  konfigurierbar und nicht fest verdrahtet.
- **PDF-Schrift.** Das Monatsjournal setzt Helvetica statt IBM Plex, weil
  @fontsource nur WOFF und WOFF2 liefert und pdf-lib daraus nichts einbetten
  kann. WinAnsi deckt den deutschen Zeichenvorrat vollständig ab.
- **Betrieb.** Supabase-Projekt in der EU-Region anlegen und eine Löschroutine
  nach Ablauf der Aufbewahrungsfrist ergänzen (§ 26 AZG: mindestens ein Jahr,
  bei Lenkern 24 Monate).
