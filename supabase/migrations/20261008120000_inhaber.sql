-- Inhaber und sichere Kontozuordnung
--
-- Zwei Lücken werden geschlossen:
--
--   1. handle_new_user übernahm Rolle und Unternehmen aus raw_user_meta_data.
--      Diese Daten setzt der Benutzer bei der Registrierung selbst
--      (`signUp({ options: { data } })`). Bei offener Registrierung hätte sich
--      jeder zum Administrator eines beliebigen Unternehmens machen können.
--      Ab jetzt kommen Rolle, Unternehmen und Eintrittsdatum ausschließlich aus
--      raw_app_meta_data, das nur mit dem service_role-Schlüssel setzbar ist.
--      Ein Konto ohne diese Angaben gehört zu keinem Unternehmen und sieht
--      nichts.
--
--   2. Jeder Administrator konnte jeden anderen herabstufen oder
--      deaktivieren — eine Firma konnte sich vollständig aussperren. Jedes
--      Unternehmen hat jetzt genau einen Inhaber. Er ist immer aktiver
--      Administrator seines Unternehmens; das erzwingt die Datenbank, nicht die
--      Oberfläche. Nur er selbst kann die Inhaberschaft weitergeben.
--
-- Bewusst gibt es weiterhin keine Rolle, die über Unternehmen hinwegsieht.

-- ---------------------------------------------------------------------------
-- Registrierung: nichts aus Client-Daten übernehmen
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
    -- Der Name ist das Einzige, was der Benutzer selbst mitbringen darf: er
    -- verleiht keine Rechte.
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)),
    coalesce((new.raw_app_meta_data ->> 'hired_on')::date, current_date),
    coalesce((new.raw_app_meta_data ->> 'role')::app_role, 'employee'),
    (new.raw_app_meta_data ->> 'organization_id')::uuid
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Inhaber
-- ---------------------------------------------------------------------------

-- on delete restrict: solange jemand Inhaber ist, lässt sich sein Profil (und
-- damit sein Auth-Benutzer) nicht löschen.
alter table organizations
  add column owner_id uuid references profiles (id) on delete restrict;

comment on column organizations.owner_id is
  'Der Inhaber: immer aktiver Administrator dieses Unternehmens, nur von ihm selbst übertragbar.';

-- Bestehende Unternehmen bekommen den dienstältesten aktiven Administrator.
update organizations o
set owner_id = (
  select p.id
  from profiles p
  where p.organization_id = o.id and p.role = 'admin' and p.active
  order by p.created_at, p.id
  limit 1
)
where owner_id is null;

do $$
begin
  if exists (select 1 from organizations where owner_id is null) then
    raise exception 'Mindestens ein Unternehmen hat keinen aktiven Administrator, der Inhaber werden könnte.';
  end if;
end;
$$;

alter table organizations alter column owner_id set not null;

create unique index organizations_owner_idx on organizations (owner_id);

-- Eine Seite der Regel: wer als Inhaber eingetragen wird, muss aktiver
-- Administrator genau dieses Unternehmens sein. Aufgeschoben bis zum Ende der
-- Transaktion, weil beim Anlegen eines Unternehmens das Profil erst nach der
-- Firma zugeordnet werden kann.
create or replace function public.check_organization_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.profiles
    where id = new.owner_id
      and organization_id = new.id
      and role = 'admin'
      and active
  ) then
    raise exception 'Der Inhaber muss aktiver Administrator dieses Unternehmens sein.'
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create constraint trigger organizations_owner_check
  after insert or update of owner_id on organizations
  deferrable initially deferred
  for each row execute function public.check_organization_owner();

-- Die andere Seite: am Profil des Inhabers lässt sich nichts ändern, was ihn
-- als Inhaber ungültig machte. Greift auch für service_role und damit für die
-- Edge Function — Trigger gelten anders als RLS für jeden.
create or replace function public.protect_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Bezogen auf das bisherige Unternehmen: beim Anlegen einer Firma ist der
  -- Inhaber schon eingetragen, sein Profil aber noch ohne Unternehmen — diese
  -- erste Zuordnung muss durchgehen.
  if exists (
    select 1 from public.organizations
    where owner_id = old.id and id = old.organization_id
  ) then
    if new.role is distinct from 'admin' then
      raise exception 'Der Inhaber bleibt Administrator. Erst die Inhaberschaft übertragen.'
        using errcode = 'insufficient_privilege';
    end if;
    if not new.active then
      raise exception 'Der Inhaber kann nicht deaktiviert werden. Erst die Inhaberschaft übertragen.'
        using errcode = 'insufficient_privilege';
    end if;
    if new.organization_id is distinct from old.organization_id then
      raise exception 'Der Inhaber kann sein Unternehmen nicht verlassen.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_owner
  before update on profiles
  for each row execute function public.protect_owner();

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organizations o
    join public.profiles p on p.id = o.owner_id and p.organization_id = o.id
    where o.owner_id = auth.uid()
      and p.active
  );
$$;

comment on function public.is_owner() is
  'Ist der angemeldete Benutzer Inhaber seines Unternehmens?';

-- Der einzige Weg, die Inhaberschaft zu ändern. Der bisherige Inhaber bleibt
-- Administrator; herabstufen kann ihn danach jeder Administrator wie jeden
-- anderen.
create or replace function public.transfer_ownership(p_new_owner uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  org uuid := public.current_organization_id();
begin
  if org is null or not public.is_owner() then
    raise exception 'Nur der Inhaber kann die Inhaberschaft übertragen.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_new_owner = auth.uid() then
    return;
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_new_owner and organization_id = org and active
  ) then
    raise exception 'Die Inhaberschaft lässt sich nur an einen aktiven Benutzer des eigenen Unternehmens übertragen.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.profiles set role = 'admin' where id = p_new_owner;
  update public.organizations set owner_id = p_new_owner where id = org;
end;
$$;

revoke execute on function public.transfer_ownership(uuid) from public, anon;
grant execute on function public.transfer_ownership(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Unternehmen anlegen: jetzt mit Inhaber in einem Schritt
-- ---------------------------------------------------------------------------

-- Läuft beim Betreiber im SQL-Editor; später ruft sie der Zahlungs-Webhook
-- auf. Der Benutzer muss bereits existieren und darf noch keinem Unternehmen
-- angehören.
drop function if exists public.create_organization(text);

create or replace function public.create_organization(
  p_name text,
  p_owner_email text,
  p_owner_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp, auth
as $$
declare
  owner uuid;
  owner_org uuid;
  new_org uuid;
begin
  select id into owner from auth.users where email = lower(p_owner_email);
  if owner is null then
    raise exception 'Kein Benutzer mit der E-Mail-Adresse %', p_owner_email;
  end if;

  select organization_id into owner_org from public.profiles where id = owner;
  if owner_org is not null then
    raise exception 'Der Benutzer % gehört bereits zu einem Unternehmen.', p_owner_email;
  end if;

  insert into public.organizations (name, owner_id)
  values (p_name, owner)
  returning id into new_org;

  update public.profiles
  set organization_id = new_org,
      role = 'admin',
      active = true,
      display_name = coalesce(p_owner_display_name, display_name)
  where id = owner;

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

-- Ohne `public` bliebe die Funktion über die Standardrechte von PostgreSQL
-- für jeden ausführbar, auch nach dem Entzug für anon und authenticated.
revoke execute on function public.create_organization(text, text, text) from public, anon, authenticated;

-- Ordnet einen bestehenden Benutzer einem Unternehmen zu. Verschiebt aber
-- niemanden mehr stillschweigend aus einem anderen Unternehmen heraus.
create or replace function public.assign_to_organization(
  p_email text,
  p_organization uuid,
  p_role app_role default 'employee',
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp, auth
as $$
declare
  target uuid;
  current_org uuid;
begin
  select id into target from auth.users where email = lower(p_email);
  if target is null then
    raise exception 'Kein Benutzer mit der E-Mail-Adresse %', p_email;
  end if;

  if not exists (select 1 from public.organizations where id = p_organization) then
    raise exception 'Kein Unternehmen mit der Kennung %', p_organization;
  end if;

  select organization_id into current_org from public.profiles where id = target;
  if current_org is not null and current_org <> p_organization then
    raise exception 'Der Benutzer % gehört bereits zu einem anderen Unternehmen.', p_email;
  end if;

  update public.profiles
  set organization_id = p_organization,
      role = p_role,
      display_name = coalesce(p_display_name, display_name)
  where id = target;

  return target;
end;
$$;

revoke execute on function public.assign_to_organization(text, uuid, app_role, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Administratoren dürfen Profile ändern, aber nicht löschen
-- ---------------------------------------------------------------------------

-- Bisher galt profiles_admin_all für alle Operationen, also auch DELETE. Ein
-- gelöschtes Profil nähme über `on delete cascade` sämtliche Zeiten mit, die
-- nach § 26 AZG aufzubewahren sind. Ausgeschieden wird durch Deaktivieren.
-- Angelegt werden Profile nur vom Trigger handle_new_user.
drop policy if exists profiles_admin_all on profiles;

create policy profiles_admin_update
  on profiles for update
  to authenticated
  using (public.is_admin() and organization_id = public.current_organization_id())
  with check (public.is_admin() and organization_id = public.current_organization_id());
