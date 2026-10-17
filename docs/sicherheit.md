# Sicherheit

Stand nach der zweiten Sicherheitsprüfung vom 8. 10. 2026, diesmal entlang des
„Sicherheitsleitfadens für ein Supabase-basiertes Zeiterfassungs-SaaS“
(OWASP Top 10:2025, Supabase-Risiken, Manipulation von Zeiteinträgen,
Supply Chain). Geprüft wurden Datenbank, Edge Function, Oberfläche, Build und
Abhängigkeiten.

## Umgesetzt und getestet

Jeder Punkt ist durch `npm run test:rls` gegen die Cloud abgesichert (74
Angriffstests), sofern nicht anders vermerkt.

| Bereich | Maßnahme |
|---|---|
| Trennung der Unternehmen | Row Level Security auf jeder Tabelle; jede Abfrage eines fremden Unternehmens liefert nichts |
| Rechtevergabe | Rolle und Unternehmen setzt nur der Server; Registrierung verleiht keine Rechte; `user_metadata` liefert nur den Namen |
| Inhaber | per Trigger vor Herabstufung, Deaktivierung und Passwortänderung durch andere geschützt |
| Passwort anderer Administratoren | setzt nur der Inhaber — wer es setzt, könnte sich sonst als dieser Administrator ausgeben |
| Stempelzeiten | setzt der Server (`now()`), nicht der Browser; jede Änderung macht aus „gestempelt“ „nachgetragen“ |
| **Monatsabschluss** | die Verwaltung schließt vergangene Monate ab; danach kann niemand mehr Zeiten oder Abwesenheiten darin ändern, löschen, anlegen oder hineinschieben — auch die Verwaltung nicht. Wieder öffnen nur der Inhaber, mit Begründung im Protokoll |
| **Plausibilität** | keine Zeiten in der Zukunft; der Arbeitstag weicht höchstens einen Tag vom Beginn ab (sonst ließe er sich am Abschluss vorbeischieben) |
| **Längengrenzen** | Anmerkungen 2000 Zeichen, Namen 200, Einstellungen 100 kB |
| Eigenes Profil | Mitarbeiter ändern nur den Anzeigenamen |
| Deaktivierung | wirkt sofort, nicht erst beim Ablauf der Anmeldung; alle Sitzungen werden beendet |
| Löschen | Profile kann niemand löschen; Aufzeichnungen nur der Betreiber nach Fristablauf |
| **Änderungsprotokoll** | per Trigger, für niemanden änderbar — jetzt auch nicht mit dem `service_role`-Schlüssel. Passwort- und Zugangsänderungen über die Edge Function stehen mit dem echten Urheber darin |
| Tabellenrechte | je Tabelle nur, wofür es eine Policy gibt; `anon` hat nichts, auch nicht auf künftigen Tabellen, Sequenzen und Funktionen |
| Datenbankfunktionen | ohne Anmeldung nicht aufrufbar; fester `search_path` überall; jede `SECURITY DEFINER`-Funktion prüft den Aufrufer selbst |
| GraphQL | abgeschaltet (`pg_graphql` entfernt) — die App nutzt nur REST |
| Abfragezeit | `statement_timeout` 8 s für Angemeldete, 3 s für `anon`; höchstens 1000 Zeilen je Abfrage |
| **Edge Function** | CORS nur für erlaubte Herkünfte statt `*`; jedes Feld wird auf Typ und Format geprüft; keine Datenbank-Fehlermeldungen nach außen; Passwort ≥ 12 Zeichen; nach dem Zurücksetzen werden alle Sitzungen beendet |
| Geheimnisse | `service_role`-Schlüssel nur in der Edge Function und zur Laufzeit der Tests. **Neu:** der Browser startet nicht, wenn ein geheimer Schlüssel in `VITE_SUPABASE_ANON_KEY` steht, und `npm run build` bricht ab, wenn einer im Bündel landet (`scripts/check-bundle.mjs`) |
| Browser | strenge Content Security Policy, jetzt nur zum eigenen Supabase-Projekt; keine Source Maps; kein `innerHTML`, React maskiert alle Ausgaben |
| **Sicherheits-Header** | der Build legt `dist/_headers` an (CSP mit `frame-ancestors`, HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`); `vite preview` schickt sie lokal mit |
| **E-Mails** | englische Vorlagen für alle Abläufe und Sicherheitsbenachrichtigungen (Passwort, E-Mail, Zwei-Faktor, Anmeldemethoden geändert); ohne Bilder von fremden Servern, mit Hinweis auf Phishing; höchstens eine Mail je Minute an dieselbe Adresse |
| **CSV-Export** | Zellen, die mit `=`, `+`, `-`, `@`, Tab oder CR beginnen, werden als Text entschärft (Unit-Test) |
| Anmeldung | gleiche Meldung für unbekannte Adresse und falsches Passwort; nach zu vielen Versuchen ein eigener Hinweis |
| Abhängigkeiten | `npm audit`: 0 bekannte Schwachstellen |
| **CI** | `.github/workflows/sicherheit.yml`: gitleaks, `npm ci --ignore-scripts`, `npm audit`, Tests, Build mit Bündelprüfung. Dependabot mit 7 Tagen Wartezeit für neue Versionen |

## Abgleich mit dem Leitfaden

| Risiko aus dem Leitfaden | Stand |
|---|---|
| Tabellen ohne RLS, Default-Grants, zu weite Policies | erledigt |
| IDOR / fremde Mandanten | erledigt, getestet |
| Rechteausweitung Mitarbeiter → Admin → Inhaber | erledigt; Admins dürfen laut abgestimmtem Rollenkonzept andere Admins befördern und herabstufen, aber nicht den Inhaber |
| Mass Assignment (`role`, `organization_id`, `source`) | per Policy und Trigger erledigt |
| `service_role` im Frontend | doppelt abgesichert (Laufzeitprüfung und Bündelprüfung) |
| `SECURITY DEFINER` ohne `search_path`, Views ohne `security_invoker` | erledigt; es gibt keine Views |
| PostgREST-Filter-Injection (`.or()` mit Text) | kommt im Code nicht vor |
| XSS | React maskiert; kein `innerHTML`; CSP |
| CSRF | nicht anwendbar: Token im `Authorization`-Header, keine Cookies |
| SSRF | nicht anwendbar: die App lädt keine fremden URLs; PDF mit `pdf-lib` ohne HTML |
| Storage-Buckets | ein privater Bucket `dienstvertraege`: nur PDF bis 10 MB, Zugriff per Policy nur Verwaltung des Unternehmens und die Person selbst, kein Überschreiben; Anzeige über signierte Links mit 60 Sekunden Gültigkeit |
| Einladungs-Flow | Einladung über `inviteUserByEmail` in der Edge Function: Unternehmen und Rolle setzt der Server, der Link führt nur auf erlaubte Herkünfte (`ALLOWED_ORIGINS`); Registrierung bleibt aus |
| Manipulation von Zeiteinträgen | Serverzeit beim Stempeln, Monatsabschluss, Plausibilität, unveränderliches Protokoll |
| CSV-/Formel-Injection | erledigt |
| Fehler verraten Interna | Edge Function erledigt; Meldungen aus der Datenbank sind eigene deutsche Texte |
| Supply Chain | Lockfile, CI ohne Installationsskripte, Dependabot mit Wartezeit, gitleaks |
| Hash-Kette im Protokoll | bewusst nicht: ohne externen Anker kann der Betreiber sie neu berechnen, und die gesetzliche Löschung nach Fristablauf würde sie ohnehin brechen. Das Protokoll ist stattdessen per Trigger für alle unveränderlich |
| MFA für Inhaber und Administratoren | offen, siehe unten |

## Offen: Einstellungen, die nur du setzen kannst

- [x] Registrierung aus, Passwort mindestens 12 Zeichen mit Buchstaben und
      Ziffern, sicherer Passwort- und E-Mail-Wechsel, E-Mail-Bestätigung an,
      Sicherheitsbenachrichtigungen an, SSL-Pflicht für direkte
      Datenbankverbindungen — per CLI gesetzt, festgehalten in
      `supabase/config.toml` unter `[remotes.cloud]`.
- [ ] *Leaked Password Protection* an (Pro-Plan).
- [ ] **Eigener Mailversand (SMTP)** mit SPF/DKIM/DMARC. Erst damit lassen
      sich die englischen E-Mail-Vorlagen aus `supabase/templates/` in die
      Cloud übertragen (`npx supabase config diff` ansehen, dann
      `npx supabase config push`); der Gratis-Plan sperrt Vorlagen sonst.
- [ ] **Supabase → Authentication → Rate Limits:** Standardwerte belassen oder
      senken; optional CAPTCHA für die Anmeldung.
- [ ] **Beim Online-Stellen:** die Adresse der App für die Edge Function
      freigeben, sonst lehnt sie Aufrufe aus dem Browser ab:
      `npx supabase secrets set ALLOWED_ORIGINS=https://deine-adresse.at`.
      Gesetzt am 11. 10. 2026 für die lokalen Adressen und
      `https://timetracking.constantin-dieringer.workers.dev`; mit der
      finalen Domain ergänzen (die Liste ersetzt die alte vollständig).
      Die Header aus `web/dist/_headers` beim Hoster übernehmen (Netlify und
      Cloudflare Pages lesen die Datei selbst).
- [ ] **Zwei-Faktor-Anmeldung** für deine Konten bei Supabase, GitHub und npm.
      Wer dort hineinkommt, kommt an alle Daten.
- [ ] **GitHub → Settings → Code security:** Dependabot-Warnungen, Secret
      Scanning und Push Protection einschalten.
- [ ] **Pro-Plan** für tägliche Backups; einmal eine Wiederherstellung
      ausprobieren.
- [ ] **Testzugänge** aus `seed.sql` vor dem Echtbetrieb entfernen.

## Offen: noch zu bauen

- **Zwei-Faktor-Anmeldung in der App** für Inhaber und Administratoren
  (Supabase unterstützt TOTP). Vorher zu entscheiden: wer hilft dem Inhaber,
  wenn er sein Handy verliert? Es gibt bewusst keinen Plattform-Admin.
- **Passwort ändern** in der App. „Passwort vergessen“ und Einladungen sind
  gebaut, kommen aber erst mit eigenem SMTP bei allen an.
- **Externer Penetrationstest**, bevor fremde Unternehmen ihre Daten
  anvertrauen. Diese Prüfung ersetzt keinen.
