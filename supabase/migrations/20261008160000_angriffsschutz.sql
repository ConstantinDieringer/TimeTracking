-- Angriffsschutz nach dem Sicherheitsleitfaden für Supabase-Zeiterfassung
--
-- Die Grundlagen (RLS auf jeder Tabelle, Rechte je Tabelle, Inhaberschutz,
-- Serverzeit beim Stempeln) stehen in den Vormigrationen. Hier kommt dazu, was
-- der Leitfaden für Zeiterfassung im Besonderen verlangt:
--
--   1. Monatsabschluss. Ein abgerechneter Monat lässt sich nicht mehr
--      nachträglich ändern — weder vom Mitarbeiter (Überstunden aufblähen)
--      noch von der Verwaltung (Stunden kürzen, Ruhezeitverstöße löschen).
--      Wieder öffnen kann nur der Inhaber, mit Begründung im Protokoll.
--   2. Das Änderungsprotokoll ist auch für den service_role-Schlüssel und den
--      Betreiber unveränderlich. Bisher schützten es nur fehlende Rechte; ein
--      Fehler in der Edge Function hätte es umschreiben können.
--   3. Plausibilität: keine Zeiten in der Zukunft, Arbeitstag passend zum
--      Beginn. Sonst ließe sich ein Abschnitt per `work_date` in einen anderen
--      Monat schieben und damit am Monatsabschluss vorbei.
--   4. Längengrenzen für Freitext. Ein Mitarbeiter soll nicht Megabytes in
--      eine Anmerkung schreiben können, die dann jede Auswertung lädt.
--   5. anon bekommt nichts, auch nicht auf künftigen Tabellen und Funktionen.
--   6. Zeitlimit je Abfrage und keine GraphQL-Schnittstelle, die niemand nutzt.

-- ---------------------------------------------------------------------------
-- 1. Monatsabschluss
-- ---------------------------------------------------------------------------

create table period_locks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  -- Immer der Monatserste; ein Abschluss gilt für den ganzen Kalendermonat.
  month date not null,
  locked_by uuid references profiles (id) on delete set null,
  locked_at timestamptz not null default now(),

  constraint period_locks_month_start check (month = date_trunc('month', month)::date),
  unique (organization_id, month)
);

comment on table period_locks is
  'Abgeschlossene Monate je Unternehmen. Zeiten und Abwesenheiten darin sind für alle Benutzer gesperrt.';

alter table period_locks enable row level security;

-- Lesen dürfen alle im Unternehmen: die Oberfläche zeigt den Abschluss an.
-- Geschrieben wird nur über lock_month und unlock_month.
create policy period_locks_select
  on period_locks for select
  to authenticated
  using (organization_id = public.current_organization_id());

grant select on period_locks to authenticated;
grant select, insert, update, delete on period_locks to service_role;

-- Prüft für jeden geänderten Abschnitt und jede Abwesenheit, ob der Monat
-- abgeschlossen ist. Für den alten und den neuen Stand: sonst ließe sich ein
-- Eintrag aus dem gesperrten Monat herausschieben und dort löschen.
create or replace function public.enforce_period_lock()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_days date[] := '{}';
  new_days date[] := '{}';
  old_org uuid;
  new_org uuid;
  locked date;
begin
  -- Betreiber und service_role (ohne Benutzer-Token) bleiben unberührt, wie
  -- bei enforce_stamp_time: die Löschung nach Fristablauf muss durchgehen.
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'time_entries' then
    if tg_op <> 'INSERT' then
      old_days := array[old.work_date, (old.started_at at time zone 'Europe/Vienna')::date];
      old_org := old.organization_id;
    end if;
    if tg_op <> 'DELETE' then
      new_days := array[new.work_date, (new.started_at at time zone 'Europe/Vienna')::date];
    end if;
  else
    if tg_op <> 'INSERT' then
      old_days := array[old.absence_date];
      old_org := old.organization_id;
    end if;
    if tg_op <> 'DELETE' then
      new_days := array[new.absence_date];
    end if;
  end if;

  -- Das Unternehmen des neuen Stands kommt aus dem Mitarbeiter, nicht aus
  -- der Zeile: welcher BEFORE-Trigger zuerst läuft, entscheidet der Name.
  if tg_op <> 'DELETE' then
    select organization_id into new_org from public.profiles where id = new.employee_id;
  end if;

  select pl.month into locked
  from public.period_locks pl
  where (pl.organization_id = old_org
         and pl.month = any (select date_trunc('month', d)::date from unnest(old_days) d))
     or (pl.organization_id = new_org
         and pl.month = any (select date_trunc('month', d)::date from unnest(new_days) d))
  limit 1;

  if locked is not null then
    raise exception 'Der Monat % ist abgeschlossen und lässt sich nicht mehr ändern.',
      to_char(locked, 'MM/YYYY')
      using errcode = 'insufficient_privilege',
            hint = 'Wieder öffnen kann nur der Inhaber, mit Begründung.';
  end if;

  return coalesce(new, old);
end;
$$;

-- Die Namen sortieren nach time_entries_enforce_stamp: Postgres führt
-- BEFORE-Trigger alphabetisch aus, und geprüft werden soll die Serverzeit,
-- nicht die mitgeschickte.
create trigger time_entries_period_lock
  before insert or update or delete on time_entries
  for each row execute function public.enforce_period_lock();

create trigger absences_period_lock
  before insert or update or delete on absences
  for each row execute function public.enforce_period_lock();

create or replace function public.lock_month(p_month date)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  org uuid := public.current_organization_id();
  first_day date := date_trunc('month', p_month)::date;
  lock_id uuid;
begin
  if org is null or not public.is_admin() then
    raise exception 'Den Monatsabschluss macht die Verwaltung.'
      using errcode = 'insufficient_privilege';
  end if;

  if first_day >= date_trunc('month', now() at time zone 'Europe/Vienna')::date then
    raise exception 'Abschließen lassen sich nur vergangene Monate.'
      using errcode = 'check_violation';
  end if;

  -- Ein noch laufender Abschnitt ließe sich sonst nie mehr ausstempeln.
  if exists (
    select 1 from public.time_entries
    where organization_id = org
      and ended_at is null
      and date_trunc('month', work_date)::date = first_day
  ) then
    raise exception 'In diesem Monat ist noch jemand eingestempelt. Erst den Abschnitt beenden.'
      using errcode = 'check_violation';
  end if;

  insert into public.period_locks (organization_id, month, locked_by)
  values (org, first_day, auth.uid())
  on conflict (organization_id, month) do nothing
  returning id into lock_id;

  if lock_id is not null then
    insert into public.audit_log (
      table_name, record_id, employee_id, organization_id, operation, old_data, new_data, changed_by
    )
    values (
      'period_locks', lock_id, null, org, 'INSERT', null,
      jsonb_build_object('monat', to_char(first_day, 'YYYY-MM')),
      auth.uid()
    );
  end if;
end;
$$;

create or replace function public.unlock_month(p_month date, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  org uuid := public.current_organization_id();
  first_day date := date_trunc('month', p_month)::date;
  removed public.period_locks;
begin
  if org is null or not public.is_owner() then
    raise exception 'Einen abgeschlossenen Monat öffnet nur der Inhaber wieder.'
      using errcode = 'insufficient_privilege';
  end if;

  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Bitte begründen, warum der Monat wieder geöffnet wird (mindestens 10 Zeichen).'
      using errcode = 'check_violation';
  end if;

  delete from public.period_locks
  where organization_id = org and month = first_day
  returning * into removed;

  if removed.id is null then
    return;
  end if;

  insert into public.audit_log (
    table_name, record_id, employee_id, organization_id, operation, old_data, new_data, changed_by
  )
  values (
    'period_locks', removed.id, null, org, 'DELETE',
    jsonb_build_object(
      'monat', to_char(first_day, 'YYYY-MM'),
      'abgeschlossen_von', removed.locked_by,
      'abgeschlossen_am', removed.locked_at
    ),
    jsonb_build_object('begruendung', left(btrim(p_reason), 1000)),
    auth.uid()
  );
end;
$$;

revoke execute on function public.lock_month(date) from public, anon;
revoke execute on function public.unlock_month(date, text) from public, anon;
grant execute on function public.lock_month(date) to authenticated;
grant execute on function public.unlock_month(date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Unveränderliches Änderungsprotokoll
-- ---------------------------------------------------------------------------

-- Greift anders als RLS auch für service_role. Zwei Ausnahmen, beide nur für
-- den Betreiber erreichbar:
--   * purge_employee nach Ablauf der Aufbewahrungsfrist (app.purge),
--   * Folgen gelöschter Personen und Unternehmen über die Fremdschlüssel:
--     der Verweis auf eine gelöschte Person wird leer, das Protokoll eines
--     gelöschten Unternehmens verschwindet mit ihm.
create or replace function public.protect_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_setting('app.purge', true) = 'on' then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    if old.employee_id is not null
       and new.employee_id is null
       and (to_jsonb(new) - 'employee_id') = (to_jsonb(old) - 'employee_id')
       and not exists (select 1 from public.profiles where id = old.employee_id) then
      return new;
    end if;
  elsif tg_op = 'DELETE' then
    if old.organization_id is not null
       and not exists (select 1 from public.organizations where id = old.organization_id) then
      return old;
    end if;
  end if;

  raise exception 'Das Änderungsprotokoll lässt sich weder ändern noch löschen.'
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_log_append_only
  before update or delete on audit_log
  for each row execute function public.protect_audit_log();

create trigger audit_log_no_truncate
  before truncate on audit_log
  for each statement execute function public.protect_audit_log();

-- Beendet alle Anmeldungen einer Person: nach dem Zurücksetzen des Passworts
-- und beim Deaktivieren. Supabase Auth bietet dafür keinen Admin-Aufruf, der
-- ohne das Token der Person auskommt. Bereits ausgestellte Zugriffstoken
-- laufen bis zu ihrem Ablauf weiter, lassen sich aber nicht mehr erneuern.
create or replace function public.end_sessions(p_user uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from auth.sessions where user_id = p_user;
$$;

revoke execute on function public.end_sessions(uuid) from public, anon, authenticated;
grant execute on function public.end_sessions(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Plausibilität der erfassten Zeiten
-- ---------------------------------------------------------------------------

create or replace function public.check_entry_plausibility()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  start_day date;
begin
  if auth.uid() is null then
    return new;
  end if;

  -- Nur prüfen, was sich ändert: eine reine Anmerkung an einem alten
  -- Eintrag soll nicht an einer neuen Regel scheitern.
  if tg_op = 'UPDATE'
     and new.started_at is not distinct from old.started_at
     and new.ended_at is not distinct from old.ended_at
     and new.work_date is not distinct from old.work_date then
    return new;
  end if;

  -- Fünf Minuten Spielraum für abweichende Uhren. Gearbeitet wird erst, dann
  -- aufgezeichnet — wer die Zukunft einträgt, zeichnet nicht auf, er plant.
  if new.started_at > now() + interval '5 minutes'
     or new.ended_at > now() + interval '5 minutes' then
    raise exception 'Zeiten in der Zukunft lassen sich nicht erfassen.'
      using errcode = 'check_violation';
  end if;

  -- Der Arbeitstag darf vom Kalendertag des Beginns um höchstens einen Tag
  -- abweichen (Nachtschicht). Mehr wäre ein Verschieben in einen anderen
  -- Zeitraum, etwa an einem Monatsabschluss vorbei.
  start_day := (new.started_at at time zone 'Europe/Vienna')::date;
  if abs(new.work_date - start_day) > 1 then
    raise exception 'Der Arbeitstag passt nicht zum Beginn des Abschnitts.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger time_entries_plausibility
  before insert or update on time_entries
  for each row execute function public.check_entry_plausibility();

-- ---------------------------------------------------------------------------
-- 4. Längengrenzen
-- ---------------------------------------------------------------------------

-- NOT VALID: gilt für jede neue und geänderte Zeile, ohne dass ein
-- bestehender Altbestand die Migration scheitern lässt.
alter table time_entries
  add constraint time_entries_note_length check (char_length(note) <= 2000) not valid;
alter table absences
  add constraint absences_note_length check (char_length(note) <= 2000) not valid;
alter table employment_contracts
  add constraint employment_contracts_note_length check (char_length(note) <= 2000) not valid,
  add constraint employment_contracts_agreement_length
    check (char_length(collective_agreement) <= 200) not valid;
alter table profiles
  add constraint profiles_display_name_length
    check (char_length(btrim(display_name)) between 1 and 200) not valid,
  add constraint profiles_personnel_number_length
    check (char_length(personnel_number) <= 50) not valid;
alter table organizations
  add constraint organizations_name_length check (char_length(name) between 1 and 200) not valid;
alter table contract_types
  add constraint contract_types_label_length check (char_length(label) between 1 and 100) not valid,
  add constraint contract_types_description_length
    check (char_length(description) <= 1000) not valid;
-- Die Datenschutzinformation ist der längste Text; 100 kB reichen für jede.
alter table settings
  add constraint settings_value_size check (octet_length(value::text) <= 100000) not valid;

-- ---------------------------------------------------------------------------
-- 5. Keine Rechte für anon
-- ---------------------------------------------------------------------------

-- Supabase vergibt auf `public` Standardrechte an anon, je nach
-- Projektgeneration auf Tabellen, Sequenzen und Funktionen. Ohne Anmeldung
-- gibt es in dieser Anwendung nichts zu sehen — weder heute noch auf einer
-- Tabelle, die eine künftige Migration anlegt.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;

alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;

-- Triggerfunktionen ruft niemand direkt auf.
revoke execute on function
  public.enforce_period_lock(),
  public.protect_audit_log(),
  public.check_entry_plausibility()
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Abfragezeit und ungenutzte Schnittstellen
-- ---------------------------------------------------------------------------

-- Eine teure Abfrage bricht ab, statt die Datenbank für alle anderen zu
-- blockieren. Supabase setzt diese Werte meist schon; hier stehen sie
-- verbindlich.
do $$
begin
  alter role authenticated set statement_timeout = '8s';
  alter role anon set statement_timeout = '3s';
exception when others then
  raise notice 'statement_timeout: nicht änderbar (%).', sqlerrm;
end;
$$;

-- Die Anwendung spricht ausschließlich REST. Eine GraphQL-Schnittstelle, die
-- niemand braucht, verrät per Introspection nur das Schema.
do $$
begin
  drop extension if exists pg_graphql;
exception when others then
  raise notice 'pg_graphql: nicht entfernbar (%), bitte im Dashboard unter Database → Extensions abschalten.', sqlerrm;
end;
$$;
