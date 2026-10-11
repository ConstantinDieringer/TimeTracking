-- Dienstverträge als PDF
--
-- Die Verwaltung legt den unterschriebenen Dienstvertrag (oder Dienstzettel,
-- Nachtrag) als PDF ab, die Person selbst kann ihn jederzeit ansehen. Was das
-- rechtlich verlangt und wie es hier umgesetzt ist:
--
--   * Zugriff nur, wer ihn braucht (Art. 5 Abs. 1 lit. f, Art. 32 DSGVO): die
--     Verwaltung des eigenen Unternehmens und die Person selbst. Sonst
--     niemand, auch nicht andere Mitarbeiter. Die Datei liegt in einem
--     privaten Bucket; ausgeliefert wird nur über eine angemeldete Abfrage.
--
--   * Nachvollziehbarkeit: Ablegen, erstes Abrufen durch die Person und
--     Löschen landen im unveränderlichen Änderungsprotokoll.
--
--   * Nachweis der Bereitstellung (§ 2 AVRAG): Ein Dienstzettel darf
--     elektronisch übergeben werden, wenn die Person ihn abrufen, speichern
--     und ausdrucken kann. Wann sie ihn zum ersten Mal geöffnet hat, steht in
--     `first_viewed_at`.
--
--   * Unverfälschtheit: Ein Dokument wird nie überschrieben. Änderungen sind
--     ein neues Dokument (Nachtrag), das alte bleibt. Der SHA-256-Prüfwert
--     macht eine nachträglich ausgetauschte Datei erkennbar.
--
--   * Speicherbegrenzung (Art. 5 Abs. 1 lit. e DSGVO): Die Dokumente folgen
--     der Aufbewahrungsfrist der übrigen Personaldaten (retention_overview,
--     purge_employee).
--
-- Ablage im Bucket unter <unternehmen>/<person>/<zufällige id>.pdf. Der
-- Dateiname steht nur in der Tabelle, nicht im Pfad.

-- ---------------------------------------------------------------------------
-- Tabelle
-- ---------------------------------------------------------------------------

create table contract_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  employee_id uuid not null references profiles (id) on delete cascade,
  kind text not null default 'dienstvertrag'
    check (kind in ('dienstvertrag', 'dienstzettel', 'nachtrag')),
  valid_from date,
  file_name text not null check (length(file_name) between 1 and 200),
  storage_path text not null unique,
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by uuid references profiles (id) on delete set null default auth.uid(),
  uploaded_at timestamptz not null default now(),
  first_viewed_at timestamptz
);

comment on table contract_documents is
  'Dienstverträge, Dienstzettel und Nachträge als PDF. Die Datei liegt im privaten Bucket dienstvertraege.';
comment on column contract_documents.first_viewed_at is
  'Erstes Öffnen durch die Person selbst — Nachweis der elektronischen Bereitstellung (§ 2 AVRAG).';

create index contract_documents_employee on contract_documents (employee_id, uploaded_at desc);

-- Unternehmen immer aus der Person ableiten, nie aus der Eingabe.
create trigger contract_documents_set_org
  before insert or update on contract_documents
  for each row execute function public.set_organization_from_employee();

-- Der Pfad muss zum Unternehmen und zur Person passen. Sonst ließe sich eine
-- Zeile auf die Datei eines anderen zeigen lassen.
create or replace function public.check_contract_document_path()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.storage_path !~ ('^' || new.organization_id || '/' || new.employee_id || '/[0-9a-f-]{36}\.pdf$') then
    raise exception 'Der Ablageort passt nicht zu Unternehmen und Person.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Der Name sorgt dafür, dass die Prüfung nach contract_documents_set_org läuft.
create trigger contract_documents_zcheck_path
  before insert or update on contract_documents
  for each row execute function public.check_contract_document_path();

create trigger contract_documents_audit
  after insert or update or delete on contract_documents
  for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------------
-- Zugriff
-- ---------------------------------------------------------------------------

alter table contract_documents enable row level security;

create policy contract_documents_select
  on contract_documents for select
  to authenticated
  using (
    employee_id = auth.uid()
    or (public.is_admin() and organization_id = public.current_organization_id())
  );

create policy contract_documents_admin_insert
  on contract_documents for insert
  to authenticated
  with check (public.is_admin() and organization_id = public.current_organization_id());

create policy contract_documents_admin_delete
  on contract_documents for delete
  to authenticated
  using (public.is_admin() and organization_id = public.current_organization_id());

-- Keine Update-Policy: abgelegte Dokumente bleiben, wie sie sind.

grant select, insert, delete on contract_documents to authenticated;
grant select, insert, update, delete on contract_documents to service_role;

-- Die Person bestätigt durch Öffnen den Erhalt. Nur das erste Mal zählt.
create or replace function public.mark_contract_document_viewed(p_document uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.contract_documents
  set first_viewed_at = now()
  where id = p_document
    and employee_id = auth.uid()
    and first_viewed_at is null;
$$;

revoke execute on function public.mark_contract_document_viewed(uuid) from public, anon;
grant execute on function public.mark_contract_document_viewed(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Ablage
-- ---------------------------------------------------------------------------

-- Privat, nur PDF, höchstens 10 MB. Das Limit greift beim Hochladen auf dem
-- Server, nicht erst in der Oberfläche.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dienstvertraege', 'dienstvertraege', false, 10485760, array['application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy dienstvertraege_select
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'dienstvertraege'
    and (storage.foldername(name))[1] = public.current_organization_id()::text
    and (public.is_admin() or (storage.foldername(name))[2] = auth.uid()::text)
  );

create policy dienstvertraege_admin_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'dienstvertraege'
    and public.is_admin()
    and (storage.foldername(name))[1] = public.current_organization_id()::text
    and exists (
      select 1 from public.profiles p
      where p.id::text = (storage.foldername(name))[2]
        and p.organization_id = public.current_organization_id()
    )
  );

create policy dienstvertraege_admin_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'dienstvertraege'
    and public.is_admin()
    and (storage.foldername(name))[1] = public.current_organization_id()::text
  );

-- Kein Update: eine abgelegte Datei wird nicht ersetzt.

-- ---------------------------------------------------------------------------
-- Löschung nach Fristablauf
-- ---------------------------------------------------------------------------

-- Wie bisher, mit einer Bedingung mehr: Dateien im Bucket lassen sich per SQL
-- nicht löschen (Supabase verlangt dafür die Storage-API). Bevor eine Person
-- gelöscht wird, müssen ihre Dienstverträge deshalb über die Verwaltung oder
-- das Dashboard entfernt sein — sonst blieben Dateien ohne Besitzer zurück.
create or replace function public.purge_employee(p_employee uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp, auth
as $$
declare
  target record;
  remaining integer;
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

  select count(*) into remaining
  from storage.objects
  where bucket_id = 'dienstvertraege'
    and name like target.organization_id || '/' || p_employee || '/%';

  if remaining > 0 then
    raise exception 'Zuerst die % Dienstvertrag-Datei(en) dieser Person in der Verwaltung löschen.', remaining;
  end if;

  perform set_config('app.purge', 'on', true);

  delete from public.time_entries where employee_id = p_employee;
  delete from public.absences where employee_id = p_employee;
  delete from public.employment_contracts where employee_id = p_employee;
  delete from public.contract_documents where employee_id = p_employee;
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

revoke execute on function public.purge_employee(uuid) from public, anon, authenticated;
grant execute on function public.purge_employee(uuid) to service_role;
