# Auftrag: Rollen, Inhaber und sichere Kontozuordnung

> **Stand 8. 10. 2026:** Phase 1 ist umgesetzt, Phase 1b bis auf die
> Dashboard-Schritte (Registrierung abschalten, Site URL) und den echten
> ersten Mandanten. Entwickelt und getestet wird gegen die Cloud, nicht mit
> Docker. In der Cloud liegen die Testdaten aus `seed.sql` (Honestas Capital
> GmbH und Musterbau GmbH als Testfirmen) — vor dem Echtbetrieb entfernen.
> Zusätzlich nötig war `20261008120100_tabellenrechte.sql`: neue
> Cloud-Projekte vergeben keine Tabellenrechte mehr automatisch. Die Edge
> Function setzt Rolle und Unternehmen per service_role-Update am Profil, weil
> GoTrue `app_metadata` erst nach dem INSERT schreibt.

Du arbeitest im Repo `TimeTracking` (Zeiterfassung Österreich, Supabase +
React, siehe `README.md`). Lies zuerst die README und die Migrationen unter
`supabase/migrations/`. Der Nutzer ist kein Entwickler: erkläre Schritte, die
er selbst ausführen muss (Terminal, Dashboard), einfach und einzeln.

## Zielbild der Plattform (abgestimmt mit dem Nutzer)

- Mehrere **Firmen** (Tabelle `organizations`) in einer Datenbank, strikt per
  RLS getrennt. Eindeutig ist nur die interne UUID, **nicht der Name** — zwei
  Firmen dürfen gleich heißen, Namen lassen sich nicht „wegschnappen“.
- **Konto und Firmenzugehörigkeit sind getrennt.** Wer sich registriert, hat
  nur ein Konto ohne Firma und ohne Rolle. Firma und Rolle kommen
  ausschließlich über serverseitig kontrollierte Wege dazu, **nie** aus Daten,
  die der Client mitschickt:
  - **Weg A – Firma gründen:** später nach bezahltem Abo (Stripe-Webhook) →
    Server legt Firma an, Gründer wird **Inhaber**. Bis dahin legt der
    Betreiber Firmen von Hand per SQL an.
  - **Weg B – Einladung:** Admin lädt per E-Mail ein → Einladung speichert
    Firma und Rolle → Eingeladener nimmt an, Server prüft bestätigte E-Mail =
    eingeladene E-Mail → Zuordnung.
- **Rollen je Firma:** genau **ein Inhaber** → beliebig viele **Admins** →
  **Mitarbeiter**. Eingeladene starten als Mitarbeiter; Admins können
  Mitarbeiter zu Admins befördern und Admins herabstufen.
- **Inhaber-Schutz** (statt plattformweitem Super-Admin): Admins können den
  Inhaber weder herabstufen, deaktivieren, verschieben noch sein Passwort
  setzen. Der Inhaber kann die Inhaberschaft an einen aktiven Benutzer seiner
  Firma übertragen und ist danach normaler Admin. So kann sich eine Firma nie
  komplett aussperren. Später gehört das Abo dem Inhaber.
- **Kein Plattform-Super-Admin in der App.** Der Betreiber sieht keine
  Kundendaten (Auftragsverarbeiter); Notfälle löst er über das
  Supabase-Dashboard.
- Eine E-Mail-Adresse gehört vorerst zu genau einer Firma.

## Heutiger Stand und gefundene Lücken

- `handle_new_user()` (zuletzt definiert in
  `supabase/migrations/20260917120400_mandanten.sql`) liest `role`,
  `organization_id` und `hired_on` aus `raw_user_meta_data`. Diese Daten kann
  jeder Benutzer bei `supabase.auth.signUp({ options: { data } })` selbst
  setzen → **bei offener Registrierung kann sich jeder zum Admin einer
  beliebigen Firma machen.** Lokal ist `enable_signup = false`, im neuen
  Cloud-Projekt ist die Registrierung aber standardmäßig an.
- Die Edge Function `supabase/functions/admin-users/index.ts` (`create`)
  übergibt Rolle und Firma ebenfalls über `user_metadata`.
- Policy `profiles_admin_all` erlaubt jedem Admin, jedes Profil seiner Firma zu
  ändern — inklusive Rolle und `active` anderer Admins. Es gibt keinen Inhaber;
  eine Firma kann sich selbst aussperren.
- Rolle wird in der Oberfläche nur beim Anlegen gewählt
  (`web/src/components/NeuerZugang.tsx`); nachträgliches Befördern fehlt in
  `web/src/pages/AdminMitarbeiter.tsx`.
- `create_organization(name)` und `assign_to_organization(email, org, role,
  display_name)` existieren, sind für `authenticated` gesperrt und laufen nur
  im SQL-Editor.

## Phase 1 – jetzt umsetzen

Neue Migration anlegen (z. B. `supabase/migrations/20261008120000_inhaber.sql`).
Bestehende Migrationsdateien **nicht** mehr ändern, auch wenn die Cloud noch
leer ist — das ist ab jetzt die Regel.

1. **Registrierung ohne Rolle/Firma aus Client-Daten**
   - `handle_new_user()` neu: `role`, `organization_id`, `hired_on` nur noch
     aus `raw_app_meta_data` (setzbar ausschließlich mit `service_role`);
     `display_name` darf aus `raw_user_meta_data` kommen. Ohne app_metadata:
     keine Firma, Rolle `employee`.
   - Edge Function `create`: Rolle, Firma, Eintrittsdatum über `app_metadata`
     statt `user_metadata`.
   - `enable_signup = false` bleibt vorerst (lokal und Cloud).

2. **Inhaber**
   - Spalte `organizations.owner_id uuid references profiles(id)`; für
     bestehende Firmen befüllen, danach `not null` (Henne-Ei bei der Anlage
     beachten: Firma anlegen → Profil zuordnen → owner_id setzen, ggf.
     `deferrable` oder Reihenfolge in einer Funktion).
   - Hilfsfunktion `is_owner()` (security definer, analog `is_admin()`).
   - **BEFORE UPDATE-Trigger auf `profiles`**: Ist die Zeile Inhaber ihrer
     Firma, sind `role <> 'admin'`, `active = false` und Änderung von
     `organization_id` verboten. Gilt auch für `service_role` (Trigger greifen
     anders als RLS immer). Ausnahme nur innerhalb von `transfer_ownership`
     (z. B. per `set_config('app.ownership_transfer', 'on', true)`).
   - Funktion `transfer_ownership(p_new_owner uuid)`: nur der Inhaber; Ziel
     muss aktiv und in derselben Firma sein; Ziel wird Admin und Inhaber,
     alter Inhaber bleibt Admin. Für `authenticated` ausführbar.
   - `create_organization` erweitern bzw. neu: Firma + Inhaber in einem
     Schritt (`p_name`, `p_owner_email`, `p_owner_display_name`). Für
     `authenticated`/`anon` gesperrt. Diese Funktion ruft später der
     Stripe-Webhook auf.
   - Edge Function: `set-password` und `set-active` auf den Inhaber abweisen,
     außer der Aufrufer ist der Inhaber selbst (Passwort). Reihenfolge in
     `set-active` beibehalten: erst Profil (Trigger prüft), dann Auth-Sperre.

3. **Befördern/Herabstufen in der Oberfläche**
   - `AdminMitarbeiter.tsx`: Rolle umschalten (Mitarbeiter ↔ Admin), für den
     Inhaber deaktiviert, mit Kennzeichnung „Inhaber“. Deaktivieren-Knopf für
     den Inhaber ausblenden.
   - Für den Inhaber: „Inhaberschaft übertragen“ (Auswahl eines aktiven
     Benutzers, Bestätigungsdialog).
   - `web/src/lib/session.tsx`: `isOwner` ergänzen. Benutzer ohne Firma
     bekommen eine eigene Seite „Keinem Unternehmen zugeordnet“ statt einer
     leeren App.
   - Gestaltungsregeln aus der README und `web/src/styles/tokens.css`
     einhalten.

4. **Seed, Tests, Typen, Doku**
   - `supabase/seed.sql`: Inhaber setzen (Honestas: `admin@example.at`,
     Musterbau: `chef@musterbau.at`); einen zweiten Admin bei Honestas
     ergänzen, damit Admin-gegen-Inhaber testbar ist.
   - `supabase/test/rls.test.ts` erweitern, u. a.:
     - `signUp` mit `data: { role: 'admin', organization_id: <fremd> }` ergibt
       ein Profil ohne Firma und ohne Adminrechte (Test braucht offene
       Registrierung — z. B. Benutzer per service_role mit `user_metadata`
       anlegen, das trifft denselben Trigger).
     - Admin kann Inhaber nicht herabstufen/deaktivieren/verschieben.
     - Admin kann Mitarbeiter befördern und Admin herabstufen.
     - Nur der Inhaber kann übertragen; danach Rollen korrekt.
     - Inhaber kann nicht in fremde Firma übertragen.
   - `npm run db:reset`, `npm test`, `npm run test:rls`, `npm run build`
     müssen grün sein (Docker Desktop muss laufen).
   - `npm run db:types` und README aktualisieren (Rollen, Anlage neuer Kunden
     mit neuer `create_organization`-Signatur, Testzugänge).
   - Commit auf `main` (deutsche Commit-Message, Umlaute als ae/oe/ue wie in
     den bisherigen Commits) und `git push`.

## Phase 1b – Cloud in Betrieb nehmen (direkt danach, mit dem Nutzer)

Cloud-Projekt „Time Tracker“, Ref `hqgqroyuxiaxtpflcetv`, Region eu-west-1,
ist bereits verknüpft (`supabase link`) und noch **leer**. Die CLI ist mit dem
richtigen Konto angemeldet. `db push --dry-run` lief sauber.

1. `npx supabase db push --dry-run`, dann `npx supabase db push`. Seed **nie**
   in die Cloud.
2. `npx supabase functions deploy admin-users`.
3. Dashboard (Nutzer anleiten): *Authentication → Sign In / Providers*:
   „Allow new users to sign up“ **aus**; *URL Configuration*: Site URL setzen
   (vorerst `http://localhost:5173`, später die echte Domain).
4. Ersten Mandanten anlegen: `create_organization('Honestas Capital GmbH',
   …)` im SQL-Editor, Inhaber-Benutzer vorher unter *Authentication → Users →
   Add user* (Auto Confirm). Passwörter tippt der Nutzer selbst, nie in den
   Chat.
5. Lokal testen: `.env` auf Cloud-URL und Anon-Key umstellen (Anon-Key unter
   *Project Settings → API*), `npm run dev`, als Inhaber einloggen.

## Phase 2 – Einladungen per E-Mail (später, eigene Session)

- SMTP für Supabase Auth einrichten (z. B. Postmark/Brevo), Mail-Vorlagen.
- Tabelle `invitations` (Firma, E-Mail, Rolle, eingeladen von, Token-Hash,
  Ablauf, angenommen am); RLS: nur Admins der eigenen Firma.
- Annahme über security-definer-Funktion `accept_invitation(token)`: prüft
  bestätigte E-Mail des Aufrufers = eingeladene E-Mail, Ablauf, Firma aktiv.
- Einladungsmail nennt **wer** einlädt (Name + E-Mail) und die Firma —
  Schutz gegen Täuschung durch gleichnamige Fake-Firmen.
- Danach kann die Registrierung geöffnet werden; Konten ohne Einladung landen
  in keiner Firma.

## Phase 3 – Zukunft, nicht jetzt

- Selbstregistrierung mit Stripe-Abo; Webhook (Edge Function) ruft
  `create_organization` auf. Optional UID-Prüfung über VIES.
- Abo-Ende: Firma gesperrt bzw. Lesemodus mit Export; Löschung erst nach
  Ablauf der Aufbewahrungsfrist (§ 26 AZG).
- Optional: Domain-Verifizierung, Betreiber-Sperre einer Firma (`active`
  existiert bereits).
