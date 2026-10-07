-- Mandantenfähigkeit
--
-- Bisher ging das Schema von einem einzigen Unternehmen aus. Row Level
-- Security trennte Mitarbeiter von Mitarbeiter, aber nicht Unternehmen von
-- Unternehmen: zwei Kunden in derselben Datenbank hätten einander gesehen.
--
-- Entschieden wurde die einfachste tragfähige Variante:
--   * Ein Mensch gehört zu genau einem Unternehmen (organization_id am Profil).
--   * Unternehmen entstehen nur auf Einladung, angelegt vom Betreiber.
--   * Der Betreiber hat keinen Zugriff auf Kundendaten — es gibt bewusst
--     keine Rolle, die über Mandantengrenzen hinwegsieht.
--
-- Die Mandantenspalte wird auf jeder Tabelle mitgeführt statt über den
-- Mitarbeiter hergeleitet. Das ist Redundanz mit Absicht: eine Policy, die
-- `organization_id = ...` prüft, ist offensichtlich richtig, während eine mit
-- verschachtelter Unterabfrage bei jeder Änderung neu durchdacht werden muss.
-- Ein Trigger hält die Spalte konsistent.

-- ---------------------------------------------------------------------------
-- Unternehmen
-- ---------------------------------------------------------------------------

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Firmenbuchnummer und UID sind optional; gebraucht werden sie erst, wenn
  -- Exporte oder Rechnungen den Betrieb ausweisen sollen.
  company_register_number text,
  vat_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table organizations is
  'Ein Kunde. Alle übrigen Tabellen sind über organization_id daran gebunden.';

create trigger organizations_touch
  before update on organizations
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Zugehörigkeit
-- ---------------------------------------------------------------------------

-- Bewusst nullable: der Trigger `handle_new_user` legt das Profil an, sobald
-- ein Auth-Benutzer entsteht, und kennt die Zuordnung zu diesem Zeitpunkt
-- nicht immer. Ein Profil ohne Unternehmen sieht durch RLS nichts — der
-- sichere Zwischenzustand.
alter table profiles
  add column organization_id uuid references organizations (id) on delete restrict;

comment on column profiles.organization_id is
  'Das Unternehmen dieser Person. NULL heißt: noch nicht zugeordnet, sieht nichts.';

alter table contract_types
  add column organization_id uuid references organizations (id) on delete cascade;

alter table employment_contracts
  add column organization_id uuid references organizations (id) on delete cascade;

alter table time_entries
  add column organization_id uuid references organizations (id) on delete cascade;

alter table absences
  add column organization_id uuid references organizations (id) on delete cascade;

alter table audit_log
  add column organization_id uuid references organizations (id) on delete cascade;

-- settings führt zwei Arten von Werten: gesetzliche, die für ganz Österreich
-- gelten (Geringfügigkeitsgrenze, Zuschlagssätze), und betriebliche
-- (contract_defaults). Erstere bleiben ohne Unternehmen — NULL heißt hier
-- „gilt für alle" und ist nur vom Betreiber änderbar.
alter table settings
  add column organization_id uuid references organizations (id) on delete cascade;

comment on column settings.organization_id is
  'NULL = gesetzlicher Wert, gilt für alle Mandanten und ist nicht vom Kunden änderbar.';

-- ---------------------------------------------------------------------------
-- Eindeutigkeit je Unternehmen statt global
-- ---------------------------------------------------------------------------

-- Zwei Firmen dürfen beide eine Personalnummer P-001 vergeben.
drop index if exists profiles_personnel_number_key;
create unique index profiles_personnel_number_per_org
  on profiles (organization_id, personnel_number)
  where personnel_number is not null;

-- Dasselbe für Vertragsarten: „Vollzeit" existiert bei jedem Kunden einmal.
alter table contract_types drop constraint if exists contract_types_label_key;
create unique index contract_types_label_per_org
  on contract_types (organization_id, label);

-- settings: gesetzliche Werte global eindeutig, betriebliche je Unternehmen.
alter table settings drop constraint settings_pkey;
alter table settings add column id bigint generated always as identity primary key;

create unique index settings_global_key
  on settings (key, valid_year)
  where organization_id is null;

create unique index settings_org_key
  on settings (organization_id, key, valid_year)
  where organization_id is not null;

-- Der Betriebsstandard ist keine gesetzliche Größe. Die global angelegte
-- Zeile aus der Vormigration entfällt; jedes Unternehmen bekommt eine eigene.
delete from settings where key = 'contract_defaults' and organization_id is null;

create index profiles_organization_idx on profiles (organization_id);
create index time_entries_org_date_idx on time_entries (organization_id, work_date);
create index absences_org_date_idx on absences (organization_id, absence_date);

-- ---------------------------------------------------------------------------
-- Das Unternehmen des angemeldeten Benutzers
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER aus demselben Grund wie bei is_admin(): die Policies auf
-- profiles würden sonst profiles lesen, um die Zugehörigkeit zu bestimmen,
-- und in eine Rekursion laufen.
create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select organization_id from public.profiles where id = auth.uid();
$$;

comment on function public.current_organization_id() is
  'Das Unternehmen des angemeldeten Benutzers, ohne RLS-Rekursion auf profiles.';

-- is_admin() bleibt inhaltlich gleich, wird aber ausdrücklich an das
-- Unternehmen gebunden: Administrator ist man immer nur im eigenen Betrieb.
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
      and organization_id is not null
  );
$$;

-- ---------------------------------------------------------------------------
-- Mandantenspalte automatisch setzen und gegen Verschieben sichern
-- ---------------------------------------------------------------------------

create or replace function public.set_organization_from_employee()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  employee_org uuid;
begin
  select organization_id into employee_org
  from public.profiles
  where id = new.employee_id;

  if employee_org is null then
    raise exception 'Der Mitarbeiter ist keinem Unternehmen zugeordnet.'
      using errcode = 'check_violation';
  end if;

  -- Immer aus dem Mitarbeiter ableiten, nie aus der Eingabe übernehmen. Sonst
  -- ließe sich ein Datensatz durch Setzen der Spalte in ein fremdes
  -- Unternehmen schieben.
  new.organization_id := employee_org;
  return new;
end;
$$;

create trigger employment_contracts_set_org
  before insert or update on employment_contracts
  for each row execute function public.set_organization_from_employee();

create trigger time_entries_set_org
  before insert or update on time_entries
  for each row execute function public.set_organization_from_employee();

create trigger absences_set_org
  before insert or update on absences
  for each row execute function public.set_organization_from_employee();

-- Das Änderungsprotokoll erbt die Zugehörigkeit vom betroffenen Datensatz.
create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  affected_employee uuid;
  affected_org uuid;
begin
  affected_employee := coalesce(
    (to_jsonb(coalesce(new, old)) ->> 'employee_id')::uuid,
    (to_jsonb(coalesce(new, old)) ->> 'id')::uuid
  );

  affected_org := (to_jsonb(coalesce(new, old)) ->> 'organization_id')::uuid;
  if affected_org is null and affected_employee is not null then
    select organization_id into affected_org from public.profiles where id = affected_employee;
  end if;

  insert into public.audit_log (
    table_name, record_id, employee_id, organization_id,
    operation, old_data, new_data, changed_by
  )
  values (
    tg_table_name,
    coalesce(new.id, old.id),
    affected_employee,
    affected_org,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid()
  );

  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- Anlegen eines Unternehmens
-- ---------------------------------------------------------------------------

-- Läuft beim Betreiber im SQL-Editor, nicht in der Anwendung: Unternehmen
-- entstehen nur auf Einladung. Legt zugleich die Vertragsarten und den
-- Betriebsstandard an, damit ein neuer Kunde nicht vor leeren Listen sitzt.
create or replace function public.create_organization(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_org uuid;
begin
  insert into public.organizations (name) values (p_name) returning id into new_org;

  insert into public.contract_types (organization_id, label, category, description, sort_order)
  values
    (new_org, 'Vollzeit', 'vollzeit', 'Volles kollektivvertragliches Ausmaß', 10),
    (new_org, 'Teilzeit', 'teilzeit', 'Vereinbartes Ausmaß unter der Normalarbeitszeit', 20),
    (new_org, 'Geringfügig', 'geringfuegig', 'Entgelt unter der Geringfügigkeitsgrenze', 30),
    (new_org, 'Lehrling', 'lehrling', 'Lehrverhältnis; unter 18 gilt das KJBG', 40),
    (new_org, 'Freier Dienstvertrag', 'freier_dienstnehmer', 'Kein Arbeitnehmer im Sinne des AZG', 50),
    (new_org, 'Leitende:r Angestellte:r', 'leitend', 'Vom AZG ausgenommen nach § 1 Abs 2 Z 8', 60),
    (new_org, 'Praktikum', 'praktikum', 'Ferial- oder Pflichtpraktikum', 70);

  -- Ohne Vorgabewerte für Bundesland und ganztägigen Verbrauch: beides muss
  -- der Kunde bewusst festlegen.
  insert into public.settings (organization_id, key, valid_year, value, description)
  values (
    new_org, 'contract_defaults', 0,
    jsonb_build_object(
      'collective_weekly_hours', 38.5,
      'collective_agreement', '',
      'state', null,
      'vacation_days_per_year', 25,
      'flex_enabled', false,
      'flex_period_months', 1,
      'flex_allows_full_day_compensation', null,
      'flex_frame_start', '06:00',
      'flex_frame_end', '20:00',
      'flex_max_carry_credit_minutes', 2400,
      'flex_max_carry_debit_minutes', 600
    ),
    'Vorbelegung für neu angelegte Verträge.'
  );

  return new_org;
end;
$$;

revoke execute on function public.create_organization(text) from authenticated, anon;

-- Ordnet einen bereits angelegten Auth-Benutzer einem Unternehmen zu.
-- Ebenfalls nur für den Betreiber: so entsteht der erste Administrator eines
-- neuen Kunden, für den es ja noch keinen Administrator gibt, der ihn anlegen
-- könnte.
create or replace function public.assign_to_organization(
  p_email text,
  p_organization uuid,
  p_role app_role default 'admin',
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp, auth
as $$
declare
  target uuid;
begin
  select id into target from auth.users where email = lower(p_email);
  if target is null then
    raise exception 'Kein Benutzer mit der E-Mail-Adresse %', p_email;
  end if;

  if not exists (select 1 from public.organizations where id = p_organization) then
    raise exception 'Kein Unternehmen mit der Kennung %', p_organization;
  end if;

  update public.profiles
  set organization_id = p_organization,
      role = p_role,
      -- Ohne Namen bliebe der Teil vor dem @ stehen, den handle_new_user als
      -- Notbehelf gesetzt hat. Aus "chef@muster.at" wird sonst "chef".
      display_name = coalesce(p_display_name, display_name)
  where id = target;

  return target;
end;
$$;

revoke execute on function public.assign_to_organization(text, uuid, app_role, text) from authenticated, anon;

-- Der Betriebsstandard wird über eine Funktion geschrieben statt per upsert:
-- die Eindeutigkeit hängt an einem partiellen Index, den ein
-- Konflikt-Ziel im Client nicht ansprechen kann.
create or replace function public.save_contract_defaults(p_value jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  org uuid := public.current_organization_id();
begin
  if org is null or not public.is_admin() then
    raise exception 'Diese Aktion ist Administratoren vorbehalten.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.settings
  set value = p_value, updated_at = now()
  where organization_id = org and key = 'contract_defaults' and valid_year = 0;

  if not found then
    insert into public.settings (organization_id, key, valid_year, value, description)
    values (org, 'contract_defaults', 0, p_value, 'Vorbelegung für neu angelegte Verträge.');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profil beim Anlegen eines Benutzers — jetzt mit Unternehmen
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name, hired_on, role, organization_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data ->> 'hired_on')::date, current_date),
    coalesce((new.raw_user_meta_data ->> 'role')::app_role, 'employee'),
    (new.raw_user_meta_data ->> 'organization_id')::uuid
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Zugriffsschutz neu: alles zusätzlich am Unternehmen
-- ---------------------------------------------------------------------------

alter table organizations enable row level security;

-- Das eigene Unternehmen darf man sehen, aber nicht ändern; angelegt und
-- umbenannt wird es vom Betreiber.
create policy organizations_select_own
  on organizations for select
  to authenticated
  using (id = public.current_organization_id());

drop policy if exists profiles_select_own on profiles;
drop policy if exists profiles_update_own on profiles;
drop policy if exists profiles_admin_all on profiles;

create policy profiles_select_own
  on profiles for select
  to authenticated
  using (
    id = auth.uid()
    or (public.is_admin() and organization_id = public.current_organization_id())
  );

create policy profiles_update_own
  on profiles for update
  to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from profiles existing where existing.id = auth.uid())
    and birth_date is not distinct from (select birth_date from profiles existing where existing.id = auth.uid())
    and hired_on = (select hired_on from profiles existing where existing.id = auth.uid())
    -- Niemand verschiebt sich selbst in ein anderes Unternehmen.
    and organization_id is not distinct from (select organization_id from profiles existing where existing.id = auth.uid())
  );

create policy profiles_admin_all
  on profiles for all
  to authenticated
  using (public.is_admin() and organization_id = public.current_organization_id())
  with check (public.is_admin() and organization_id = public.current_organization_id());

drop policy if exists contract_types_select on contract_types;
drop policy if exists contract_types_admin_write on contract_types;

create policy contract_types_select
  on contract_types for select
  to authenticated
  using (organization_id = public.current_organization_id());

create policy contract_types_admin_write
  on contract_types for all
  to authenticated
  using (public.is_admin() and organization_id = public.current_organization_id())
  with check (public.is_admin() and organization_id = public.current_organization_id());

drop policy if exists contracts_select_own on employment_contracts;
drop policy if exists contracts_admin_write on employment_contracts;

create policy contracts_select_own
  on employment_contracts for select
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and (employee_id = auth.uid() or public.is_admin())
  );

create policy contracts_admin_write
  on employment_contracts for all
  to authenticated
  using (public.is_admin() and organization_id = public.current_organization_id())
  with check (public.is_admin() and organization_id = public.current_organization_id());

drop policy if exists time_entries_select_own on time_entries;
drop policy if exists time_entries_insert_own on time_entries;
drop policy if exists time_entries_update_own on time_entries;
drop policy if exists time_entries_delete_own on time_entries;

create policy time_entries_select_own
  on time_entries for select
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and (employee_id = auth.uid() or public.is_admin())
  );

-- Beim Anlegen steht organization_id noch nicht fest — der Trigger setzt sie
-- erst. Geprüft wird deshalb über den Mitarbeiter.
create policy time_entries_insert_own
  on time_entries for insert
  to authenticated
  with check (
    employee_id = auth.uid()
    or (
      public.is_admin()
      and (select organization_id from profiles p where p.id = employee_id)
          = public.current_organization_id()
    )
  );

create policy time_entries_update_own
  on time_entries for update
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and (employee_id = auth.uid() or public.is_admin())
  )
  with check (
    organization_id = public.current_organization_id()
    and (employee_id = auth.uid() or public.is_admin())
  );

create policy time_entries_delete_own
  on time_entries for delete
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and (employee_id = auth.uid() or public.is_admin())
  );

drop policy if exists absences_select_own on absences;
drop policy if exists absences_insert_own on absences;
drop policy if exists absences_update_own on absences;
drop policy if exists absences_delete_own on absences;

create policy absences_select_own
  on absences for select
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and (employee_id = auth.uid() or public.is_admin())
  );

create policy absences_insert_own
  on absences for insert
  to authenticated
  with check (
    employee_id = auth.uid()
    or (
      public.is_admin()
      and (select organization_id from profiles p where p.id = employee_id)
          = public.current_organization_id()
    )
  );

create policy absences_update_own
  on absences for update
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and (employee_id = auth.uid() or public.is_admin())
  )
  with check (
    organization_id = public.current_organization_id()
    and (employee_id = auth.uid() or public.is_admin())
  );

create policy absences_delete_own
  on absences for delete
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and (employee_id = auth.uid() or public.is_admin())
  );

drop policy if exists audit_log_select_own on audit_log;

create policy audit_log_select_own
  on audit_log for select
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and (employee_id = auth.uid() or public.is_admin())
  );

drop policy if exists settings_select on settings;
drop policy if exists settings_admin_write on settings;

-- Gesetzliche Werte (organization_id is null) darf jeder lesen, aber niemand
-- ändern — sie kommen vom Gesetzgeber, nicht vom Kunden.
create policy settings_select
  on settings for select
  to authenticated
  using (organization_id is null or organization_id = public.current_organization_id());

create policy settings_admin_write
  on settings for all
  to authenticated
  using (
    organization_id is not null
    and organization_id = public.current_organization_id()
    and public.is_admin()
  )
  with check (
    organization_id is not null
    and organization_id = public.current_organization_id()
    and public.is_admin()
  );
