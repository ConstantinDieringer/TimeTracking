# Sicherheit

Stand nach der Sicherheitsprüfung vom 8. 10. 2026. Geprüft wurden Datenbank
(Zugriffsregeln, Funktionen, Rechte), Edge Function, Oberfläche,
Abhängigkeiten und der Supabase Security Advisor.

## Umgesetzt und getestet

Jeder Punkt ist durch `npm run test:rls` gegen die Cloud abgesichert, sofern
nicht anders vermerkt.

| Bereich | Maßnahme |
|---|---|
| Trennung der Unternehmen | Row Level Security auf jeder Tabelle; jede Abfrage eines fremden Unternehmens liefert nichts |
| Rechtevergabe | Rolle und Unternehmen setzt nur der Server; Registrierung verleiht keine Rechte |
| Inhaber | per Trigger vor Herabstufung, Deaktivierung und Passwortänderung durch andere geschützt |
| Stempelzeiten | setzt der Server (`now()`), nicht der Browser; jede Änderung macht aus „gestempelt“ „nachgetragen“ |
| Eigenes Profil | Mitarbeiter ändern nur den Anzeigenamen |
| Deaktivierung | wirkt sofort, nicht erst beim Ablauf der Anmeldung (bis zu 1 h) |
| Löschen | Profile kann niemand löschen; Aufzeichnungen nur der Betreiber nach Fristablauf |
| Änderungsprotokoll | per Trigger, für niemanden änderbar, auch nicht für Administratoren |
| Tabellenrechte | je Tabelle nur, wofür es eine Policy gibt; `anon` hat keine |
| Datenbankfunktionen | ohne Anmeldung nicht aufrufbar; neue Funktionen sind standardmäßig gesperrt; fester `search_path` überall |
| Geheimnisse | `service_role`-Schlüssel nur in der Edge Function und zur Laufzeit der Tests, nie im Repository oder Browser-Bündel; `.env` ist von Git ausgeschlossen |
| Browser | Content Security Policy im Build: Skripte nur von der eigenen Herkunft, Verbindungen nur zu Supabase (im Browser geprüft); kein `innerHTML`, React maskiert alle Ausgaben |
| Abhängigkeiten | `npm audit`: 0 bekannte Schwachstellen |

Der Supabase Security Advisor meldet danach nur noch zwei Arten von Hinweisen:

- Sechs `SECURITY DEFINER`-Funktionen sind für Angemeldete aufrufbar. Das ist
  beabsichtigt: die Anwendung braucht sie, und jede prüft selbst, ob der
  Aufrufer berechtigt ist.
- *Leaked Password Protection* ist aus — siehe unten.

## Offen: Einstellungen, die nur du setzen kannst

- [ ] **Supabase → Authentication → Sign In / Providers:** Registrierung aus.
- [ ] **Supabase → Authentication → Policies bzw. Password Security:**
      Mindestlänge 10 Zeichen, Buchstaben und Ziffern verlangen,
      *Leaked Password Protection* an (Pro-Plan).
- [ ] **Supabase → Authentication → Rate Limits:** Standardwerte belassen oder
      senken; optional CAPTCHA für die Anmeldung.
- [ ] **Zwei-Faktor-Anmeldung** für deine Konten bei Supabase und GitHub.
      Wer dort hineinkommt, kommt an alle Daten.
- [ ] **GitHub → Settings → Code security:** Dependabot-Warnungen und
      Secret Scanning einschalten.
- [ ] **Pro-Plan** für tägliche Backups; einmal eine Wiederherstellung
      ausprobieren.
- [ ] **Testzugänge** mit dem Passwort `zeiterfassung` vor dem Echtbetrieb
      entfernen.

## Offen: noch zu bauen

- **Sicherheits-Header beim Hosting:** `Strict-Transport-Security`,
  `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`. Kommt mit dem
  Online-Stellen (z. B. `vercel.json`), weil diese Header vom Server kommen
  müssen.
- **Zwei-Faktor-Anmeldung in der App** für Inhaber und Administratoren
  (Supabase unterstützt TOTP).
- **Passwort ändern** in der App und „Passwort vergessen“ (braucht SMTP).
- **Externer Penetrationstest**, bevor fremde Unternehmen ihre Daten
  anvertrauen. Diese Prüfung ersetzt keinen.
