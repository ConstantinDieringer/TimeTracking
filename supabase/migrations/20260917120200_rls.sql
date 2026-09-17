-- Row Level Security
--
-- Die Zugriffstrennung liegt in der Datenbank, nicht im Frontend. Das ist der
-- Grund, warum diese Anwendung ohne eigenen Server auskommt: ein Mitarbeiter
-- kann auch mit manipuliertem Client keine fremden Zeiten lesen, weil Postgres
-- die Zeilen gar nicht erst herausgibt.
--
-- Auf jeder Tabelle aktiviert, ohne Ausnahme. Eine Tabelle ohne Policy ist
-- damit vollständig gesperrt — der sichere Ausgangszustand.

alter table profiles enable row level security;
alter table contract_types enable row level security;
alter table employment_contracts enable row level security;
alter table time_entries enable row level security;
alter table absences enable row level security;
alter table audit_log enable row level security;
alter table settings enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create policy profiles_select_own
  on profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

-- Mitarbeiter dürfen ihren Namen pflegen, aber nicht ihre Rolle oder ihr
-- Geburtsdatum: beides steuert, welche Regeln für sie gelten.
create policy profiles_update_own
  on profiles for update
  to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from profiles existing where existing.id = auth.uid())
    and birth_date is not distinct from (select birth_date from profiles existing where existing.id = auth.uid())
    and hired_on = (select hired_on from profiles existing where existing.id = auth.uid())
  );

create policy profiles_admin_all
  on profiles for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- contract_types — für alle lesbar, damit Bezeichnungen angezeigt werden können
-- ---------------------------------------------------------------------------

create policy contract_types_select
  on contract_types for select
  to authenticated
  using (true);

create policy contract_types_admin_write
  on contract_types for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- employment_contracts
-- ---------------------------------------------------------------------------

-- Lesen ja — der eigene Vertrag bestimmt das Tagessoll und muss nachvollziehbar
-- sein. Schreiben ausschließlich durch den Admin.
create policy contracts_select_own
  on employment_contracts for select
  to authenticated
  using (employee_id = auth.uid() or public.is_admin());

create policy contracts_admin_write
  on employment_contracts for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- time_entries
-- ---------------------------------------------------------------------------

create policy time_entries_select_own
  on time_entries for select
  to authenticated
  using (employee_id = auth.uid() or public.is_admin());

create policy time_entries_insert_own
  on time_entries for insert
  to authenticated
  with check (employee_id = auth.uid() or public.is_admin());

create policy time_entries_update_own
  on time_entries for update
  to authenticated
  using (employee_id = auth.uid() or public.is_admin())
  with check (employee_id = auth.uid() or public.is_admin());

create policy time_entries_delete_own
  on time_entries for delete
  to authenticated
  using (employee_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- absences
-- ---------------------------------------------------------------------------

create policy absences_select_own
  on absences for select
  to authenticated
  using (employee_id = auth.uid() or public.is_admin());

create policy absences_insert_own
  on absences for insert
  to authenticated
  with check (employee_id = auth.uid() or public.is_admin());

create policy absences_update_own
  on absences for update
  to authenticated
  using (employee_id = auth.uid() or public.is_admin())
  with check (employee_id = auth.uid() or public.is_admin());

create policy absences_delete_own
  on absences for delete
  to authenticated
  using (employee_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- audit_log
-- ---------------------------------------------------------------------------

-- Lesen darf jeder seine eigene Historie — § 26 Abs 8 AZG gibt Mitarbeitern
-- Anspruch auf ihre Aufzeichnungen, und dazu gehört, wer sie geändert hat.
create policy audit_log_select_own
  on audit_log for select
  to authenticated
  using (employee_id = auth.uid() or public.is_admin());

-- Bewusst keine Policy für insert, update oder delete. Geschrieben wird
-- ausschließlich durch den Trigger, der als SECURITY DEFINER läuft und RLS
-- damit umgeht. Selbst ein Admin kann das Protokoll nicht nachträglich
-- bereinigen — ein Protokoll, das sich ändern lässt, ist keines.

-- ---------------------------------------------------------------------------
-- settings
-- ---------------------------------------------------------------------------

create policy settings_select
  on settings for select
  to authenticated
  using (true);

create policy settings_admin_write
  on settings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
