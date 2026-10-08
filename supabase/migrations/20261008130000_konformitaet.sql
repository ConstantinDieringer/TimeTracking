-- Aufzeichnungs- und Datenschutzpflichten
--
--   1. Änderungsprotokoll auch für Stammdaten und Unternehmen. Das
--      Geburtsdatum entscheidet, ob KJBG oder AZG gilt, das Eintrittsdatum
--      bestimmt den Urlaubsanspruch, Rolle und Inhaberschaft bestimmen, wer
--      Aufzeichnungen ändern darf. Wer das ändert, muss so nachvollziehbar sein
--      wie eine Korrektur an den Zeiten selbst.
--
--   2. Speicherbegrenzung (Art. 5 Abs. 1 lit. e DSGVO): ausgeschiedene
--      Mitarbeiter lassen sich nach Ablauf der Aufbewahrungsfrist vollständig
--      löschen. Bewusst kein automatischer Lauf — Löschen ist endgültig und
--      geschieht nur auf ausdrücklichen Aufruf durch den Betreiber.
--
--   3. Datenschutzinformation (Art. 13 DSGVO): jedes Unternehmen hinterlegt
--      seinen Text, alle Mitarbeiter können ihn in der Anwendung lesen.

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
  affected_org uuid;
begin
  -- purge_employee löscht Aufzeichnungen nach Fristablauf. Dieses Löschen
  -- darf keine neuen Protokollzeilen mit genau den Daten erzeugen, die gerade
  -- entfernt werden sollen.
  if current_setting('app.purge', true) = 'on' then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'organizations' then
    affected_employee := null;
    affected_org := coalesce(new.id, old.id);
  else
    affected_employee := coalesce(
      (to_jsonb(coalesce(new, old)) ->> 'employee_id')::uuid,
      (to_jsonb(coalesce(new, old)) ->> 'id')::uuid
    );
    affected_org := (to_jsonb(coalesce(new, old)) ->> 'organization_id')::uuid;
    if affected_org is null and affected_employee is not null then
      select organization_id into affected_org from public.profiles where id = affected_employee;
    end if;
  end if;

  -- Nach dem Löschen eines Profils gibt es den Verweis nicht mehr; die Zeile
  -- bleibt trotzdem, nur ohne Fremdschlüssel.
  if tg_op = 'DELETE'
     and affected_employee is not null
     and not exists (select 1 from public.profiles where id = affected_employee) then
    affected_employee := null;
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

create trigger profiles_audit
  after insert or update or delete on profiles
  for each row execute function public.write_audit_log();

create trigger organizations_audit
  after insert or update or delete on organizations
  for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------------
-- Aufbewahrungsfrist und Löschung
-- ---------------------------------------------------------------------------

-- Die alte Angabe „§ 26 AZG verlangt mindestens 12 Monate, bei Lenkern 24“
-- war nicht belegt und wurde nirgends verwendet. Ersetzt durch eine Frist ab
-- dem Austritt.
delete from settings where key = 'retention_months' and organization_id is null;

-- Sieben Jahre ab Ende des Austrittsjahres ist die vorsichtige Wahl:
-- Arbeitszeitaufzeichnungen sind Grundlage der Lohnverrechnung (Überstunden,
-- Zuschläge), und für Lohnunterlagen gilt die siebenjährige Frist des § 132
-- BAO; arbeitsrechtliche Ansprüche verjähren nach § 1486 ABGB zwar schon nach
-- drei Jahren, aber die längere Frist geht vor. Der Wert ist mit der
-- Steuerberatung abzustimmen und hier änderbar — aber nur vom Betreiber.
insert into settings (organization_id, key, valid_year, value, description)
values (
  null, 'retention_years_after_exit', 0, '7',
  'Aufbewahrung nach Ende des Austrittsjahres in Jahren; danach darf purge_employee löschen.'
);

-- Wer ist zur Löschung fällig? Nur zur Ansicht, löscht nichts.
create or replace function public.retention_overview()
returns table (
  organization_name text,
  employee_id uuid,
  display_name text,
  left_on date,
  deletable_from date,
  due boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with frist as (
    select (value #>> '{}')::int as years
    from public.settings
    where organization_id is null and key = 'retention_years_after_exit' and valid_year = 0
  )
  select
    o.name,
    p.id,
    p.display_name,
    p.left_on,
    make_date(extract(year from p.left_on)::int + frist.years + 1, 1, 1),
    current_date >= make_date(extract(year from p.left_on)::int + frist.years + 1, 1, 1)
  from public.profiles p
  join public.organizations o on o.id = p.organization_id
  cross join frist
  where not p.active and p.left_on is not null
  order by 5, o.name, p.display_name;
$$;

-- Löscht eine ausgeschiedene Person mit allen Aufzeichnungen und ihrem
-- Zugang. Nur nach Fristablauf, nur für Deaktivierte mit Austrittsdatum, nie
-- den Inhaber. Zurück bleibt eine Protokollzeile ohne personenbezogene Daten.
create or replace function public.purge_employee(p_employee uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp, auth
as $$
declare
  target record;
begin
  select o.organization_id, o.left_on, o.deletable_from, o.due
  into target
  from (
    select p.organization_id, r.left_on, r.deletable_from, r.due
    from public.retention_overview() r
    join public.profiles p on p.id = r.employee_id
    where r.employee_id = p_employee
  ) o;

  if not found then
    raise exception 'Die Person ist nicht deaktiviert oder hat kein Austrittsdatum.';
  end if;

  if not target.due then
    raise exception 'Die Aufbewahrungsfrist läuft erst am % ab.', target.deletable_from;
  end if;

  if exists (select 1 from public.organizations where owner_id = p_employee) then
    raise exception 'Der Inhaber eines Unternehmens kann nicht gelöscht werden.';
  end if;

  perform set_config('app.purge', 'on', true);

  delete from public.time_entries where employee_id = p_employee;
  delete from public.absences where employee_id = p_employee;
  delete from public.employment_contracts where employee_id = p_employee;
  delete from public.audit_log where employee_id = p_employee or record_id = p_employee;
  -- Kaskadiert auf das Profil.
  delete from auth.users where id = p_employee;

  perform set_config('app.purge', 'off', true);

  insert into public.audit_log (
    table_name, record_id, employee_id, organization_id, operation, old_data, new_data, changed_by
  )
  values (
    'profiles', p_employee, null, target.organization_id, 'DELETE', null,
    jsonb_build_object('grund', 'Aufbewahrungsfrist abgelaufen', 'geloescht_am', current_date),
    auth.uid()
  );
end;
$$;

-- Nur der Betreiber (SQL-Editor) und serverseitige Jobs mit service_role.
revoke execute on function public.retention_overview() from public, anon, authenticated;
revoke execute on function public.purge_employee(uuid) from public, anon, authenticated;
grant execute on function public.retention_overview() to service_role;
grant execute on function public.purge_employee(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Datenschutzinformation
-- ---------------------------------------------------------------------------

-- Gespeichert wie der Betriebsstandard in settings, Schlüssel
-- `privacy_notice`, Wert ein JSON-String. Lesen dürfen alle im Unternehmen
-- (Policy settings_select), schreiben nur Administratoren über diese Funktion.
create or replace function public.save_privacy_notice(p_text text)
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
  set value = to_jsonb(p_text), updated_at = now()
  where organization_id = org and key = 'privacy_notice' and valid_year = 0;

  if not found then
    insert into public.settings (organization_id, key, valid_year, value, description)
    values (org, 'privacy_notice', 0, to_jsonb(p_text), 'Datenschutzinformation nach Art. 13 DSGVO.');
  end if;
end;
$$;

revoke execute on function public.save_privacy_notice(text) from public, anon;
grant execute on function public.save_privacy_notice(text) to authenticated;
