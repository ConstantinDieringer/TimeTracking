-- Testdaten für die lokale Entwicklung.
--
-- Bewusst **zwei** Unternehmen. Mit einem einzigen ließe sich nicht zeigen,
-- dass die Mandantentrennung greift — und genau das ist die Eigenschaft, auf
-- die es bei mehreren Kunden in einer Datenbank ankommt.
--
--   Honestas Capital GmbH  vier Personen, decken jeden Zweig der Rechtslogik ab
--   Musterbau GmbH         zwei Personen, dient als Gegenprobe
--
-- Passwort für alle: zeiterfassung

select public.create_organization('Honestas Capital GmbH');
select public.create_organization('Musterbau GmbH');

-- ---------------------------------------------------------------------------
-- Benutzer
-- ---------------------------------------------------------------------------

-- Die Token-Spalten müssen leere Zeichenketten enthalten, nicht NULL: GoTrue
-- liest sie als Go-Strings ein und quittiert NULL beim Anmelden mit
-- "Database error querying schema".
--
-- organization_id wandert über raw_user_meta_data in den Trigger
-- handle_new_user, der daraus das Profil anlegt.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
select
  '00000000-0000-0000-0000-000000000000',
  person.id,
  'authenticated', 'authenticated', person.email,
  crypt('zeiterfassung', gen_salt('bf')), now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  person.meta::jsonb
    || jsonb_build_object(
         'organization_id',
         (select id::text from organizations where name = person.firma)
       ),
  '', '', '', '', '', '', '', ''
from (values
  (
    '11111111-1111-1111-1111-111111111111'::uuid, 'admin@example.at', 'Honestas Capital GmbH',
    '{"display_name":"Marlene Hofer","role":"admin","hired_on":"2015-03-01"}'
  ),
  (
    '22222222-2222-2222-2222-222222222222'::uuid, 'anna@example.at', 'Honestas Capital GmbH',
    '{"display_name":"Anna Berger","hired_on":"2020-01-01"}'
  ),
  (
    '33333333-3333-3333-3333-333333333333'::uuid, 'sofia@example.at', 'Honestas Capital GmbH',
    '{"display_name":"Sofia Wagner","hired_on":"2023-07-01"}'
  ),
  (
    '44444444-4444-4444-4444-444444444444'::uuid, 'jonas@example.at', 'Honestas Capital GmbH',
    '{"display_name":"Jonas Steiner","hired_on":"2024-09-01"}'
  ),
  -- Zweites Unternehmen: dieselbe Personalnummer P-001 wie Marlene, um zu
  -- zeigen, dass Eindeutigkeit je Mandant gilt und nicht global.
  (
    '55555555-5555-5555-5555-555555555555'::uuid, 'chef@musterbau.at', 'Musterbau GmbH',
    '{"display_name":"Bernhard Gruber","role":"admin","hired_on":"2018-05-01"}'
  ),
  (
    '66666666-6666-6666-6666-666666666666'::uuid, 'lisa@musterbau.at', 'Musterbau GmbH',
    '{"display_name":"Lisa Mayr","hired_on":"2022-02-01"}'
  )
) as person (id, email, firma, meta);

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id, u.id::text, 'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  now(), now(), now()
from auth.users u
where u.email like '%@example.at' or u.email like '%@musterbau.at';

-- Stammdaten, die der Trigger nicht kennen kann.
update profiles set personnel_number = 'P-001', birth_date = '1982-11-04', state = 'W'
  where id = '11111111-1111-1111-1111-111111111111';
update profiles set personnel_number = 'P-014', birth_date = '1990-05-12', state = 'W'
  where id = '22222222-2222-2222-2222-222222222222';
update profiles set personnel_number = 'P-027', birth_date = '1995-02-20', state = 'NO'
  where id = '33333333-3333-3333-3333-333333333333';
-- Wird am 17. September 2026 achtzehn: bis zum Vortag gilt das KJBG.
update profiles set personnel_number = 'P-031', birth_date = '2008-09-17', state = 'W'
  where id = '44444444-4444-4444-4444-444444444444';

update profiles set personnel_number = 'P-001', birth_date = '1975-01-30', state = 'ST'
  where id = '55555555-5555-5555-5555-555555555555';
update profiles set personnel_number = 'P-002', birth_date = '1993-08-11', state = 'ST'
  where id = '66666666-6666-6666-6666-666666666666';

-- ---------------------------------------------------------------------------
-- Verträge
-- ---------------------------------------------------------------------------

-- Die Vertragsarten hat create_organization() je Unternehmen angelegt; hier
-- werden sie über Bezeichnung und Mandant herausgesucht.
create or replace function pg_temp.type_id(p_org text, p_label text)
returns uuid language sql stable as $$
  select ct.id
  from contract_types ct
  join organizations o on o.id = ct.organization_id
  where o.name = p_org and ct.label = p_label;
$$;

-- Marlene Hofer — leitende Angestellte, vom AZG ausgenommen.
insert into employment_contracts (
  employee_id, contract_type_id, valid_from, weekly_hours, collective_weekly_hours,
  collective_agreement, daily_target_minutes, all_in, exempt_from_azg, vacation_days_per_year
) values (
  '11111111-1111-1111-1111-111111111111',
  pg_temp.type_id('Honestas Capital GmbH', 'Leitende:r Angestellte:r'),
  '2015-03-01', 38.5, 38.5, 'Handel',
  '{462,462,462,462,462,0,0}', true, true, 25
);

-- Anna Berger — Vollzeit mit Gleitzeit, aber OHNE ganztägige
-- Verbrauchsmöglichkeit. Damit bleibt die tägliche Normalarbeitszeit bei zehn
-- Stunden; die elfte ist Überstunde.
insert into employment_contracts (
  employee_id, contract_type_id, valid_from, weekly_hours, collective_weekly_hours,
  collective_agreement, daily_target_minutes,
  flex_enabled, flex_period_months, flex_period_anchor, flex_allows_full_day_compensation,
  flex_frame_start, flex_frame_end, flex_max_carry_credit_minutes, flex_max_carry_debit_minutes,
  vacation_days_per_year
) values (
  '22222222-2222-2222-2222-222222222222',
  pg_temp.type_id('Honestas Capital GmbH', 'Vollzeit'),
  '2020-01-01', 38.5, 38.5, 'Handel',
  '{462,462,462,462,462,0,0}',
  true, 1, '2026-01-01', false,
  '06:00', '20:00', 2400, 600,
  25
);

-- Sofia Wagner — Teilzeit 20 Stunden. Stunden über 20 und unter 38,5 sind
-- Mehrarbeit mit 25 %, nicht Überstunden mit 50 %.
insert into employment_contracts (
  employee_id, contract_type_id, valid_from, weekly_hours, collective_weekly_hours,
  collective_agreement, daily_target_minutes, vacation_days_per_year
) values (
  '33333333-3333-3333-3333-333333333333',
  pg_temp.type_id('Honestas Capital GmbH', 'Teilzeit'),
  '2023-07-01', 20, 38.5, 'Handel',
  '{240,240,240,240,240,0,0}', 25
);

-- Jonas Steiner — Lehrling, 40 Stunden.
insert into employment_contracts (
  employee_id, contract_type_id, valid_from, weekly_hours, collective_weekly_hours,
  collective_agreement, daily_target_minutes, vacation_days_per_year
) values (
  '44444444-4444-4444-4444-444444444444',
  pg_temp.type_id('Honestas Capital GmbH', 'Lehrling'),
  '2024-09-01', 40, 40, 'Handel',
  '{480,480,480,480,480,0,0}', 25
);

-- Musterbau GmbH — anderer Kollektivvertrag, andere Normalarbeitszeit.
insert into employment_contracts (
  employee_id, contract_type_id, valid_from, weekly_hours, collective_weekly_hours,
  collective_agreement, daily_target_minutes, vacation_days_per_year
) values (
  '55555555-5555-5555-5555-555555555555',
  pg_temp.type_id('Musterbau GmbH', 'Vollzeit'),
  '2018-05-01', 40, 40, 'Bauindustrie',
  '{480,480,480,480,480,0,0}', 25
),
(
  '66666666-6666-6666-6666-666666666666',
  pg_temp.type_id('Musterbau GmbH', 'Vollzeit'),
  '2022-02-01', 40, 40, 'Bauindustrie',
  '{480,480,480,480,480,0,0}', 25
);

-- ---------------------------------------------------------------------------
-- Erfasste Zeiten — Kalenderwoche 38/2026, Montag 14. bis Freitag 18. September
-- ---------------------------------------------------------------------------

-- Anna Berger: unauffällige Woche mit einer Ausnahme am Dienstag.
insert into time_entries (employee_id, work_date, started_at, ended_at, kind, source, note) values
  ('22222222-2222-2222-2222-222222222222', '2026-09-14', '2026-09-14 08:12+02', '2026-09-14 12:30+02', 'work', 'stamped', null),
  ('22222222-2222-2222-2222-222222222222', '2026-09-14', '2026-09-14 12:30+02', '2026-09-14 13:00+02', 'break', 'stamped', null),
  ('22222222-2222-2222-2222-222222222222', '2026-09-14', '2026-09-14 13:00+02', '2026-09-14 17:04+02', 'work', 'stamped', null),
  -- Dienstag: elf Stunden. Ohne ganztägige Verbrauchsmöglichkeit ist die elfte
  -- Stunde Überstunde — die Oberfläche soll das melden.
  ('22222222-2222-2222-2222-222222222222', '2026-09-15', '2026-09-15 07:00+02', '2026-09-15 12:00+02', 'work', 'stamped', null),
  ('22222222-2222-2222-2222-222222222222', '2026-09-15', '2026-09-15 12:00+02', '2026-09-15 12:45+02', 'break', 'stamped', null),
  ('22222222-2222-2222-2222-222222222222', '2026-09-15', '2026-09-15 12:45+02', '2026-09-15 18:45+02', 'work', 'stamped', null),
  -- Mittwoch: Urlaub, siehe unten.
  ('22222222-2222-2222-2222-222222222222', '2026-09-17', '2026-09-17 08:30+02', '2026-09-17 12:15+02', 'work', 'stamped', null),
  ('22222222-2222-2222-2222-222222222222', '2026-09-17', '2026-09-17 12:15+02', '2026-09-17 12:45+02', 'break', 'stamped', null),
  ('22222222-2222-2222-2222-222222222222', '2026-09-17', '2026-09-17 12:45+02', '2026-09-17 16:58+02', 'work', 'stamped', null),
  -- Freitag: sechseinhalb Stunden ohne Pause — Verstoß gegen § 11 AZG.
  ('22222222-2222-2222-2222-222222222222', '2026-09-18', '2026-09-18 08:00+02', '2026-09-18 14:30+02', 'work', 'manual', 'Nachgetragen, Stempeln vergessen');

insert into absences (employee_id, absence_date, kind, half_day, note) values
  ('22222222-2222-2222-2222-222222222222', '2026-09-16', 'urlaub', false, null);

-- Sofia Wagner: Teilzeit mit Mehrarbeit. 24 Stunden bei vereinbarten 20.
insert into time_entries (employee_id, work_date, started_at, ended_at, kind, source) values
  ('33333333-3333-3333-3333-333333333333', '2026-09-14', '2026-09-14 08:00+02', '2026-09-14 12:48+02', 'work', 'stamped'),
  ('33333333-3333-3333-3333-333333333333', '2026-09-15', '2026-09-15 08:00+02', '2026-09-15 12:48+02', 'work', 'stamped'),
  ('33333333-3333-3333-3333-333333333333', '2026-09-16', '2026-09-16 08:00+02', '2026-09-16 12:48+02', 'work', 'stamped'),
  ('33333333-3333-3333-3333-333333333333', '2026-09-17', '2026-09-17 08:00+02', '2026-09-17 12:48+02', 'work', 'stamped'),
  ('33333333-3333-3333-3333-333333333333', '2026-09-18', '2026-09-18 08:00+02', '2026-09-18 12:48+02', 'work', 'stamped');

-- Jonas Steiner: am Montag und Dienstag noch siebzehn, ab Donnerstag achtzehn.
-- Der Dienstag endet um 20:30 und verstößt damit gegen das Nachtarbeitsverbot
-- des § 17 KJBG; derselbe Tag wäre für einen Erwachsenen unauffällig.
insert into time_entries (employee_id, work_date, started_at, ended_at, kind, source) values
  ('44444444-4444-4444-4444-444444444444', '2026-09-14', '2026-09-14 07:30+02', '2026-09-14 12:00+02', 'work', 'stamped'),
  ('44444444-4444-4444-4444-444444444444', '2026-09-14', '2026-09-14 12:00+02', '2026-09-14 12:30+02', 'break', 'stamped'),
  ('44444444-4444-4444-4444-444444444444', '2026-09-14', '2026-09-14 12:30+02', '2026-09-14 16:00+02', 'work', 'stamped'),
  ('44444444-4444-4444-4444-444444444444', '2026-09-15', '2026-09-15 12:00+02', '2026-09-15 16:00+02', 'work', 'stamped'),
  ('44444444-4444-4444-4444-444444444444', '2026-09-15', '2026-09-15 16:00+02', '2026-09-15 16:30+02', 'break', 'stamped'),
  ('44444444-4444-4444-4444-444444444444', '2026-09-15', '2026-09-15 16:30+02', '2026-09-15 20:30+02', 'work', 'stamped'),
  ('44444444-4444-4444-4444-444444444444', '2026-09-17', '2026-09-17 07:30+02', '2026-09-17 12:00+02', 'work', 'stamped'),
  ('44444444-4444-4444-4444-444444444444', '2026-09-17', '2026-09-17 12:00+02', '2026-09-17 12:30+02', 'break', 'stamped'),
  ('44444444-4444-4444-4444-444444444444', '2026-09-17', '2026-09-17 12:30+02', '2026-09-17 16:00+02', 'work', 'stamped'),
  ('44444444-4444-4444-4444-444444444444', '2026-09-18', '2026-09-18 07:30+02', '2026-09-18 12:00+02', 'work', 'stamped'),
  ('44444444-4444-4444-4444-444444444444', '2026-09-18', '2026-09-18 12:00+02', '2026-09-18 12:30+02', 'break', 'stamped'),
  ('44444444-4444-4444-4444-444444444444', '2026-09-18', '2026-09-18 12:30+02', '2026-09-18 16:00+02', 'work', 'stamped');

-- Musterbau GmbH: Zeiten, die aus dem anderen Unternehmen niemand sehen darf.
insert into time_entries (employee_id, work_date, started_at, ended_at, kind, source) values
  ('66666666-6666-6666-6666-666666666666', '2026-09-14', '2026-09-14 06:30+02', '2026-09-14 12:00+02', 'work', 'stamped'),
  ('66666666-6666-6666-6666-666666666666', '2026-09-14', '2026-09-14 12:00+02', '2026-09-14 12:30+02', 'break', 'stamped'),
  ('66666666-6666-6666-6666-666666666666', '2026-09-14', '2026-09-14 12:30+02', '2026-09-14 15:30+02', 'work', 'stamped'),
  ('66666666-6666-6666-6666-666666666666', '2026-09-15', '2026-09-15 06:30+02', '2026-09-15 12:00+02', 'work', 'stamped'),
  ('66666666-6666-6666-6666-666666666666', '2026-09-15', '2026-09-15 12:00+02', '2026-09-15 12:30+02', 'break', 'stamped'),
  ('66666666-6666-6666-6666-666666666666', '2026-09-15', '2026-09-15 12:30+02', '2026-09-15 15:30+02', 'work', 'stamped');
