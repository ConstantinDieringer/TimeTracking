-- Härtung nach Sicherheitsprüfung
--
--   1. Stempelzeiten setzt der Server. Bisher schickte der Browser Beginn und
--      Ende mit; wer die Uhr seines Rechners verstellte oder die Schnittstelle
--      direkt ansprach, konnte beliebige Zeiten als „gestempelt“ ausweisen.
--      Der Unterschied gestempelt/nachgetragen ist aber genau das, worauf sich
--      die Beweiskraft der Aufzeichnung stützt.
--   2. Mitarbeiter ändern an ihrem Profil nur noch den Anzeigenamen.
--   3. Deaktivierte Benutzer verlieren sofort jeden Zugriff, nicht erst, wenn
--      ihr Token abläuft.
--   4. Funktionen: kein Aufruf ohne Anmeldung, fester search_path überall,
--      Erweiterung btree_gist aus dem öffentlichen Schema.

-- ---------------------------------------------------------------------------
-- 1. Gestempelt heißt: vom Server gestempelt
-- ---------------------------------------------------------------------------

-- Wer nichts angibt, trägt nach. „Gestempelt“ muss ausdrücklich beansprucht
-- werden — und wird dann vom Trigger unten überprüft.
alter table time_entries alter column source set default 'manual';

create or replace function public.enforce_stamp_time()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Betreiber, Seed und service_role (ohne Benutzer-Token) bleiben unberührt:
  -- sie tragen bewusst historische Daten ein.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.source = 'stamped' then
      if new.ended_at is not null then
        -- Ein abgeschlossener Abschnitt kann nicht gestempelt sein.
        new.source := 'manual';
      else
        new.started_at := now();
        new.work_date := (now() at time zone 'Europe/Vienna')::date;
      end if;
    end if;
    return new;
  end if;

  -- UPDATE
  if old.source = 'manual' then
    -- Nachgetragenes wird nie nachträglich zu Gestempeltem.
    new.source := 'manual';
  elsif new.source = 'stamped' then
    if old.ended_at is null and new.ended_at is not null
       and new.started_at = old.started_at and new.work_date = old.work_date then
      -- Ausstempeln: die Uhrzeit kommt vom Server.
      new.ended_at := now();
    elsif new.started_at is distinct from old.started_at
       or new.ended_at is distinct from old.ended_at
       or new.work_date is distinct from old.work_date then
      -- Jede andere Änderung an den Zeiten ist eine Korrektur.
      new.source := 'manual';
    end if;
  end if;

  return new;
end;
$$;

create trigger time_entries_enforce_stamp
  before insert or update on time_entries
  for each row execute function public.enforce_stamp_time();

-- ---------------------------------------------------------------------------
-- 2. Eigenes Profil: nur der Anzeigename
-- ---------------------------------------------------------------------------

drop policy if exists profiles_update_own on profiles;

create policy profiles_update_own
  on profiles for update
  to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    -- `profiles.` ist die neue Zeile, `p.` der gespeicherte Stand. Ohne den
    -- Tabellennamen bezögen sich die Spalten auf p selbst und jeder Vergleich
    -- wäre trivial wahr.
    and exists (
      select 1
      from profiles p
      where p.id = auth.uid()
        and p.role = profiles.role
        and p.personnel_number is not distinct from profiles.personnel_number
        and p.birth_date is not distinct from profiles.birth_date
        and p.hired_on = profiles.hired_on
        and p.left_on is not distinct from profiles.left_on
        and p.state = profiles.state
        and p.active = profiles.active
        and p.organization_id is not distinct from profiles.organization_id
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Deaktiviert heißt: sofort ohne Zugriff
-- ---------------------------------------------------------------------------

-- Ein deaktiviertes Konto hat kein Unternehmen mehr — damit greifen alle
-- Policies, die am Unternehmen hängen. Das eigene Profil bleibt lesbar, damit
-- die Anwendung „Zugang deaktiviert“ anzeigen kann.
create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select organization_id from public.profiles where id = auth.uid() and active;
$$;

-- Die Insert-Policies prüften für eigene Einträge das Unternehmen nicht.
drop policy if exists time_entries_insert_own on time_entries;
create policy time_entries_insert_own
  on time_entries for insert
  to authenticated
  with check (
    public.current_organization_id() is not null
    and (
      employee_id = auth.uid()
      or (
        public.is_admin()
        and (select organization_id from profiles p where p.id = employee_id)
            = public.current_organization_id()
      )
    )
  );

drop policy if exists absences_insert_own on absences;
create policy absences_insert_own
  on absences for insert
  to authenticated
  with check (
    public.current_organization_id() is not null
    and (
      employee_id = auth.uid()
      or (
        public.is_admin()
        and (select organization_id from profiles p where p.id = employee_id)
            = public.current_organization_id()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Funktionen
-- ---------------------------------------------------------------------------

alter function public.touch_updated_at() set search_path = public, pg_temp;
alter function public.reject_overlapping_segments() set search_path = public, pg_temp;
alter function public.current_employee_id() set search_path = public, pg_temp;
alter function public.contract_on(uuid, date) set search_path = public, pg_temp;

-- PostgreSQL gibt jede neue Funktion per Standard für PUBLIC frei. Ab jetzt
-- nicht mehr: wer eine Funktion braucht, bekommt sie ausdrücklich.
alter default privileges for role postgres in schema public revoke execute on functions from public;

-- Alles zurücknehmen …
revoke execute on all functions in schema public from public, anon;

-- … Triggerfunktionen auch für Angemeldete (Trigger laufen ohne dieses Recht) …
revoke execute on function
  public.handle_new_user(),
  public.write_audit_log(),
  public.protect_owner(),
  public.check_organization_owner(),
  public.set_organization_from_employee(),
  public.touch_updated_at(),
  public.reject_overlapping_segments(),
  public.enforce_stamp_time()
from authenticated;

-- … und gezielt erlauben, was die Anwendung und die Policies aufrufen.
grant execute on function
  public.is_admin(),
  public.is_owner(),
  public.current_organization_id(),
  public.current_employee_id(),
  public.contract_on(uuid, date),
  public.save_contract_defaults(jsonb),
  public.save_privacy_notice(text),
  public.transfer_ownership(uuid)
to authenticated;

-- rls_auto_enable gehört Supabase; falls die Rechte daran nicht änderbar sind,
-- bleibt es beim Hinweis des Advisors.
do $$
begin
  revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
exception when others then
  raise notice 'rls_auto_enable: Rechte nicht änderbar (%).', sqlerrm;
end;
$$;

-- btree_gist trägt den Ausschluss überlappender Verträge. Die Operatoren
-- werden über ihre Kennung referenziert, das Verschieben ändert daran nichts.
alter extension btree_gist set schema extensions;
