-- Stammdaten für das Urlaubskonto
--
--   prior_service_months   anrechenbare Vordienstzeiten nach § 3 UrlG in
--                          Monaten; zählen für die 30 Tage nach 25 Jahren mit.
--   vacation_opening_days  offener Urlaub, wenn jemand mitten im
--   vacation_opening_date  Dienstverhältnis ins System übernommen wird — sonst
--                          fehlte der Resturlaub aus der Zeit davor.
--
-- Alle drei sind Stammdaten der Verwaltung; Mitarbeiter dürfen sie nicht
-- selbst ändern. Die Policy für das eigene Profil wird deshalb um sie ergänzt.

alter table profiles
  add column prior_service_months integer not null default 0
    check (prior_service_months between 0 and 600),
  add column vacation_opening_days numeric(5, 2) not null default 0
    check (vacation_opening_days between -100 and 400),
  add column vacation_opening_date date;

comment on column profiles.prior_service_months is
  'Anrechenbare Vordienstzeiten nach § 3 UrlG in Monaten.';
comment on column profiles.vacation_opening_days is
  'Offener Urlaub in Arbeitstagen zum vacation_opening_date, einschließlich des laufenden Urlaubsjahres.';

drop policy if exists profiles_update_own on profiles;

create policy profiles_update_own
  on profiles for update
  to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    -- `profiles.` ist die neue Zeile, `p.` der gespeicherte Stand.
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
        and p.prior_service_months = profiles.prior_service_months
        and p.vacation_opening_days = profiles.vacation_opening_days
        and p.vacation_opening_date is not distinct from profiles.vacation_opening_date
    )
  );
