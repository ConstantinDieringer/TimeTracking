-- Funktionen und Trigger
--
-- Alles, was nicht umgehbar sein darf, steht hier: die Rollenprüfung, das
-- Änderungsprotokoll und die Konsistenzprüfung der Zeitsegmente.

-- ---------------------------------------------------------------------------
-- Rolle
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER ist hier kein Schönheitsfehler, sondern notwendig: würde
-- die Policy auf profiles selbst wieder profiles lesen, um die Rolle zu
-- bestimmen, liefe sie in eine unendliche Rekursion. Die Funktion umgeht RLS
-- gezielt für diese eine Abfrage.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and active
  );
$$;

comment on function public.is_admin() is
  'Prüft die Rolle des angemeldeten Benutzers ohne RLS-Rekursion auf profiles.';

create or replace function public.current_employee_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Zeitstempel fortschreiben
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if to_jsonb(new) ? 'updated_by' then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger profiles_touch
  before update on profiles
  for each row execute function public.touch_updated_at();

create trigger employment_contracts_touch
  before update on employment_contracts
  for each row execute function public.touch_updated_at();

create trigger time_entries_touch
  before update on time_entries
  for each row execute function public.touch_updated_at();

create trigger absences_touch
  before update on absences
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Änderungsprotokoll
-- ---------------------------------------------------------------------------

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  affected_employee uuid;
begin
  affected_employee := coalesce(
    (to_jsonb(coalesce(new, old)) ->> 'employee_id')::uuid,
    (to_jsonb(coalesce(new, old)) ->> 'id')::uuid
  );

  insert into public.audit_log (
    table_name, record_id, employee_id, operation, old_data, new_data, changed_by
  )
  values (
    tg_table_name,
    coalesce(new.id, old.id),
    affected_employee,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid()
  );

  return coalesce(new, old);
end;
$$;

comment on function public.write_audit_log() is
  'Schreibt jede Änderung an erfassten Zeiten mit. Als Trigger, damit kein Client daran vorbeikommt.';

create trigger time_entries_audit
  after insert or update or delete on time_entries
  for each row execute function public.write_audit_log();

create trigger absences_audit
  after insert or update or delete on absences
  for each row execute function public.write_audit_log();

create trigger employment_contracts_audit
  after insert or update or delete on employment_contracts
  for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------------
-- Konsistenz der Zeitsegmente
-- ---------------------------------------------------------------------------

-- Überlappende Segmente würden Arbeitszeit doppelt zählen und damit jede
-- Grenze verfälschen — die 12-Stunden-Grenze ebenso wie den Saldo. Der
-- Ausschluss über einen EXCLUDE-Constraint scheitert an den offenen Segmenten
-- (ended_at is null), deshalb ein Trigger.
create or replace function public.reject_overlapping_segments()
returns trigger
language plpgsql
as $$
declare
  conflict_count integer;
begin
  if new.ended_at is null then
    return new;
  end if;

  select count(*)
  into conflict_count
  from time_entries existing
  where existing.employee_id = new.employee_id
    and existing.id <> new.id
    and existing.ended_at is not null
    and tstzrange(existing.started_at, existing.ended_at, '[)')
        && tstzrange(new.started_at, new.ended_at, '[)');

  if conflict_count > 0 then
    raise exception 'Das Segment überschneidet sich mit einer bereits erfassten Zeit.'
      using errcode = 'check_violation',
            hint = 'Bestehende Erfassung anpassen oder löschen, statt sie zu überlagern.';
  end if;

  return new;
end;
$$;

create trigger time_entries_no_overlap
  before insert or update on time_entries
  for each row execute function public.reject_overlapping_segments();

-- ---------------------------------------------------------------------------
-- Profil beim Anlegen eines Benutzers erzeugen
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name, hired_on, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data ->> 'hired_on')::date, current_date),
    coalesce((new.raw_user_meta_data ->> 'role')::app_role, 'employee')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Der am Stichtag gültige Vertrag
-- ---------------------------------------------------------------------------

create or replace function public.contract_on(p_employee uuid, p_date date)
returns employment_contracts
language sql
stable
as $$
  select *
  from employment_contracts
  where employee_id = p_employee
    and valid_from <= p_date
    and (valid_to is null or valid_to >= p_date)
  limit 1;
$$;

comment on function public.contract_on(uuid, date) is
  'Der Vertrag, der an diesem Tag galt — nicht der aktuelle. Rückwirkende Auswertungen brauchen den historischen Stand.';
