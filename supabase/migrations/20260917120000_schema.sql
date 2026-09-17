-- Zeiterfassung Österreich — Grundschema
--
-- Zwei Entscheidungen prägen dieses Schema:
--
--   1. Verträge sind versioniert. Eine Person wechselt von Vollzeit auf
--      Teilzeit, ein Lehrling wird volljährig — jede Auswertung muss den
--      Vertrag heranziehen, der am jeweiligen Tag galt. Deshalb steht das
--      Stundenausmaß nicht am Mitarbeiter, sondern an einem Zeitraum.
--
--   2. Arbeitszeit wird in Segmenten erfasst, nicht als Von-bis pro Tag.
--      Nur so lassen sich geteilte Pausen und Unterbrechungen abbilden, und
--      nur daraus lässt sich die Teilungsregel des § 11 AZG prüfen.

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- Aufzählungen
-- ---------------------------------------------------------------------------

create type app_role as enum ('employee', 'admin');

create type austrian_state as enum ('W', 'NO', 'OO', 'S', 'ST', 'K', 'T', 'V', 'B');

-- Grundtyp einer Vertragsart. Er entscheidet, welches Regelwerk greift.
-- Die Bezeichnung selbst ist frei (Tabelle contract_types), damit der Admin
-- eigene Arten anlegen kann, ohne dass eine Migration nötig wird.
create type contract_category as enum (
  'vollzeit',
  'teilzeit',
  'geringfuegig',
  'lehrling',
  'freier_dienstnehmer',
  'leitend',
  'praktikum'
);

create type segment_kind as enum ('work', 'break', 'travel', 'oncall');

create type entry_source as enum ('stamped', 'manual');

create type absence_kind as enum (
  'urlaub',
  'krankenstand',
  'pflegefreistellung',
  'zeitausgleich',
  'persoenlicher_feiertag',
  'sonderurlaub',
  'dienstfreistellung',
  'unbezahlt'
);

-- ---------------------------------------------------------------------------
-- Personen
-- ---------------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role app_role not null default 'employee',
  display_name text not null,
  personnel_number text,
  -- Steuert, ob am jeweiligen Tag das KJBG oder das AZG gilt. Bewusst als
  -- Datum und nicht als Kennzeichen, damit der Wechsel am 18. Geburtstag von
  -- selbst geschieht.
  birth_date date,
  hired_on date not null,
  left_on date,
  state austrian_state not null default 'W',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_left_after_hired check (left_on is null or left_on >= hired_on)
);

create unique index profiles_personnel_number_key
  on profiles (personnel_number)
  where personnel_number is not null;

comment on column profiles.birth_date is
  'Leitet das anwendbare Regelwerk ab: unter 18 gilt das KJBG, danach das AZG.';

-- ---------------------------------------------------------------------------
-- Vertragsarten und Verträge
-- ---------------------------------------------------------------------------

create table contract_types (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  category contract_category not null,
  description text,
  sort_order integer not null default 100,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table contract_types is
  'Frei erweiterbare Vertragsarten. Die category bestimmt, welches Regelwerk greift.';

create table employment_contracts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles (id) on delete cascade,
  contract_type_id uuid not null references contract_types (id),

  valid_from date not null,
  valid_to date, -- null = laufend

  -- Vereinbartes Wochenausmaß dieser Person.
  weekly_hours numeric(5, 2) not null,
  -- Kollektivvertragliche Normalarbeitszeit des Betriebs, meist 38,5 oder 40.
  -- Trennt Mehrarbeit (§ 19d AZG) von Überstunde (§ 10 AZG) und ist deshalb
  -- nicht dasselbe wie weekly_hours.
  collective_weekly_hours numeric(5, 2) not null default 40,
  collective_agreement text,

  -- Tagessoll je Wochentag in Minuten, Montag bis Sonntag.
  daily_target_minutes integer[] not null default '{462,462,462,462,462,0,0}',

  -- Gleitzeit nach § 4b AZG
  flex_enabled boolean not null default false,
  flex_period_months integer not null default 1,
  flex_period_anchor date,
  -- § 4b Abs 4 AZG: die tägliche Normalarbeitszeit darf nur dann 12 statt 10
  -- Stunden betragen, wenn die Vereinbarung ganztägigen Verbrauch von
  -- Zeitguthaben zulässt und ihn im Zusammenhang mit der Wochenruhe nicht
  -- ausschließt. Ohne dieses Kennzeichen ist die elfte Stunde Überstunde.
  flex_allows_full_day_compensation boolean not null default false,
  flex_frame_start time not null default '06:00',
  flex_frame_end time not null default '20:00',
  flex_max_carry_credit_minutes integer not null default 2400,
  flex_max_carry_debit_minutes integer not null default 600,

  all_in boolean not null default false,
  vacation_days_per_year numeric(4, 1) not null default 25,

  -- § 1 Abs 2 Z 8 AZG — leitende Angestellte sind vom AZG ausgenommen.
  exempt_from_azg boolean not null default false,
  night_work boolean not null default false,
  shift_work boolean not null default false,

  monthly_gross_cents integer,
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint contracts_valid_range check (valid_to is null or valid_to >= valid_from),
  constraint contracts_weekly_hours_positive check (weekly_hours > 0 and weekly_hours <= 60),
  constraint contracts_daily_target_length check (array_length(daily_target_minutes, 1) = 7),
  constraint contracts_flex_anchor_present check (not flex_enabled or flex_period_anchor is not null),
  constraint contracts_flex_period_positive check (flex_period_months between 1 and 12)
);

-- Zwei gleichzeitig gültige Verträge für dieselbe Person wären nicht auflösbar:
-- welche Wochenstunden gelten dann am Dienstag? Die Datenbank verhindert das,
-- statt sich auf die Anwendung zu verlassen.
alter table employment_contracts
  add constraint employment_contracts_no_overlap
  exclude using gist (
    employee_id with =,
    daterange(valid_from, valid_to, '[]') with &&
  );

create index employment_contracts_employee_idx
  on employment_contracts (employee_id, valid_from desc);

-- ---------------------------------------------------------------------------
-- Erfasste Zeiten
-- ---------------------------------------------------------------------------

create table time_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles (id) on delete cascade,

  -- Der Kalendertag, dem das Segment zugerechnet wird. Bei Nachtschichten kann
  -- er vom Kalendertag des Beginns abweichen, deshalb eine eigene Spalte.
  work_date date not null,
  started_at timestamptz not null,
  -- null, solange gestempelt wird und noch nicht ausgestempelt ist.
  ended_at timestamptz,

  kind segment_kind not null default 'work',
  source entry_source not null default 'stamped',
  note text,

  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),

  constraint time_entries_end_after_start check (ended_at is null or ended_at > started_at)
);

create index time_entries_employee_date_idx on time_entries (employee_id, work_date);

-- Es darf immer nur ein laufendes Segment je Person geben, sonst zählt die
-- Stempeluhr doppelt.
create unique index time_entries_single_open_per_employee
  on time_entries (employee_id)
  where ended_at is null;

create table absences (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles (id) on delete cascade,
  absence_date date not null,
  kind absence_kind not null,
  half_day boolean not null default false,
  note text,
  -- § 7a Abs 2 ARG: der persönliche Feiertag ist drei Monate im Voraus
  -- schriftlich bekanntzugeben. Hier steht, wann das geschehen ist.
  announced_on date,

  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),

  unique (employee_id, absence_date, kind)
);

create index absences_employee_date_idx on absences (employee_id, absence_date);

-- ---------------------------------------------------------------------------
-- Änderungsprotokoll
-- ---------------------------------------------------------------------------

-- Ohne Freigabe-Workflow trägt dieses Protokoll die Prüfungsfestigkeit allein.
-- Es wird von einem Trigger geschrieben, nicht von der Anwendung: ein Trigger
-- lässt sich vom Client nicht umgehen, und genau darauf kommt es an.
create table audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id uuid not null,
  employee_id uuid references profiles (id) on delete set null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create index audit_log_employee_idx on audit_log (employee_id, changed_at desc);
create index audit_log_record_idx on audit_log (table_name, record_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- Einstellungen
-- ---------------------------------------------------------------------------

-- Werte, die sich ändern, ohne dass sich das Gesetz ändert: die
-- Geringfügigkeitsgrenze wird jährlich festgesetzt, die Zuschlagssätze kann
-- ein Kollektivvertrag anheben.
create table settings (
  key text not null,
  valid_year integer not null,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  primary key (key, valid_year)
);

insert into settings (key, valid_year, value, description) values
  ('geringfuegigkeitsgrenze_cents', 2024, '51828', 'Monatliche Geringfügigkeitsgrenze nach § 5 Abs 2 ASVG'),
  ('geringfuegigkeitsgrenze_cents', 2025, '55110', 'Monatliche Geringfügigkeitsgrenze nach § 5 Abs 2 ASVG'),
  ('geringfuegigkeitsgrenze_cents', 2026, '55110', 'Monatliche Geringfügigkeitsgrenze nach § 5 Abs 2 ASVG — 2026 unverändert'),
  ('surcharge_rates', 2026, '{"mehrarbeit": 0.25, "ueberstunde": 0.5}', 'Zuschlagssätze nach § 19d und § 10 AZG; ein KV kann höhere vorsehen'),
  ('retention_months', 2026, '24', 'Aufbewahrungsfrist der Aufzeichnungen; § 26 AZG verlangt mindestens 12 Monate, bei Lenkern 24');
