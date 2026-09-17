-- Betriebsstandard für neue Verträge.
--
-- Damit muss die Verwaltung die immer gleichen Werte — Normalarbeitszeit,
-- Kollektivvertrag, Gleitzeitparameter — nicht bei jedem neuen Mitarbeiter
-- erneut eintragen. Sie sind Vorgabe, nicht Zwang: jeder Vertrag kann davon
-- abweichen.
--
-- Zur Jahresspalte: `settings` ist nach (key, valid_year) geschlüsselt, weil
-- Werte wie die Geringfügigkeitsgrenze jährlich festgesetzt werden. Der
-- Betriebsstandard gilt jahresunabhängig; dafür steht hier das Jahr 0.

comment on column settings.valid_year is
  'Gültigkeitsjahr des Werts. 0 bedeutet: gilt jahresunabhängig.';

insert into settings (key, valid_year, value, description)
values (
  'contract_defaults',
  0,
  jsonb_build_object(
    -- Grunddaten
    'collective_weekly_hours', 38.5,
    'collective_agreement', '',
    -- Kein Vorgabewert: das Bundesland des Betriebs kann niemand raten, und
    -- ein stillschweigendes „Wien" wäre für acht von neun Betrieben falsch.
    'state', null,
    'vacation_days_per_year', 25,

    -- Gleitzeit nach § 4b AZG. `flex_allows_full_day_compensation` steht
    -- bewusst auf null statt auf false: die Verwaltung soll die Frage
    -- bewusst beantworten, weil von ihr abhängt, ob die tägliche
    -- Normalarbeitszeit 10 oder 12 Stunden beträgt.
    'flex_enabled', false,
    'flex_period_months', 1,
    'flex_allows_full_day_compensation', null,
    'flex_frame_start', '06:00',
    'flex_frame_end', '20:00',
    'flex_max_carry_credit_minutes', 2400,
    'flex_max_carry_debit_minutes', 600
  ),
  'Vorbelegung für neu angelegte Verträge. Jeder Vertrag kann davon abweichen.'
)
on conflict (key, valid_year) do nothing;
