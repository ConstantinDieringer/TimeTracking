/**
 * Lesbare Beschreibung eines Eintrags im Änderungsprotokoll.
 *
 * Die Datenbank speichert je Änderung den ganzen Datensatz vorher und nachher
 * als JSON. Hier wird daraus, was ein Mensch wissen will: welcher Tag oder
 * Vertrag betroffen ist, welche Felder sich geändert haben — mit Werten in
 * Wiener Ortszeit, deutschen Datumsangaben und Klartext statt interner
 * Kürzel.
 */

import {
  ABSENCE_LABEL,
  STATE_LABEL,
  formatDateShort,
  formatDuration,
  weekdayShort,
  type AbsenceKind,
  type AustrianState,
} from '@zeiterfassung/legal';
import type { AuditRow } from './supabase';

type Data = Record<string, unknown>;

export interface FieldChange {
  label: string;
  before: string;
  after: string;
}

export interface DescribedEntry {
  /** Bereich, etwa „Arbeitszeit“ oder „Vertrag“. */
  area: string;
  /** Vorgang in Worten, etwa „nachgetragen“ oder „geändert“. */
  action: string;
  /** Worum es geht, etwa „Arbeit am Mo 06.10.2026, 08:00–12:00“. */
  subject: string;
  /** Geänderte Felder; bei Anlegen und Löschen die wesentlichen Werte. */
  changes: FieldChange[];
}

export interface Lookups {
  /** Namen der Personen im Unternehmen, für „geändert von“ und Inhaberwechsel. */
  names: Map<string, string>;
  /** Vertragsarten nach Kennung. */
  contractTypes: Map<string, string>;
}

const TIMEZONE = 'Europe/Vienna';

const SEGMENT_LABEL: Record<string, string> = {
  work: 'Arbeit',
  break: 'Pause',
  travel: 'Reisezeit',
  oncall: 'Rufbereitschaft',
};

const SOURCE_LABEL: Record<string, string> = {
  stamped: 'gestempelt',
  manual: 'nachgetragen',
};

const ROLE_LABEL: Record<string, string> = {
  employee: 'Mitarbeiter',
  admin: 'Verwaltung',
};

const DOCUMENT_LABEL: Record<string, string> = {
  dienstvertrag: 'Dienstvertrag',
  dienstzettel: 'Dienstzettel',
  nachtrag: 'Nachtrag',
};

/** Vorgänge in Supabase Auth, die die Edge Function selbst protokolliert. */
const AUTH_ACTION_LABEL: Record<string, string> = {
  zugang_angelegt: 'Zugang mit Erstpasswort angelegt',
  einladung_verschickt: 'Einladung per E-Mail verschickt',
  passwort_gesetzt: 'Passwort von der Verwaltung neu gesetzt',
};

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** Feldname → Beschriftung und Darstellung des Werts. */
const FIELDS: Record<string, { label: string; format?: (value: unknown, lookups: Lookups) => string }> = {
  // Zeiten
  work_date: { label: 'Arbeitstag', format: date },
  started_at: { label: 'Beginn', format: timestamp },
  ended_at: { label: 'Ende', format: timestamp },
  kind: { label: 'Art', format: (value) => SEGMENT_LABEL[String(value)] ?? ABSENCE_LABEL[value as AbsenceKind] ?? DOCUMENT_LABEL[String(value)] ?? text(value) },
  source: { label: 'Erfassung', format: (value) => SOURCE_LABEL[String(value)] ?? text(value) },
  note: { label: 'Anmerkung', format: quoted },
  // Abwesenheiten
  absence_date: { label: 'Datum', format: date },
  half_day: { label: 'Halbtägig', format: yesNo },
  announced_on: { label: 'Angekündigt am', format: date },
  // Verträge
  contract_type_id: { label: 'Vertragsart', format: (value, lookups) => lookups.contractTypes.get(String(value)) ?? 'unbekannt' },
  valid_from: { label: 'Gültig ab', format: date },
  valid_to: { label: 'Gültig bis', format: (value) => (value ? date(value) : 'laufend') },
  weekly_hours: { label: 'Wochenstunden', format: hours },
  collective_weekly_hours: { label: 'Normalarbeitszeit laut KV', format: hours },
  collective_agreement: { label: 'Kollektivvertrag', format: text },
  daily_target_minutes: { label: 'Tagessoll', format: dailyTargets },
  vacation_days_per_year: { label: 'Urlaubsanspruch', format: (value) => `${number(value)} Tage` },
  monthly_gross_cents: { label: 'Bruttogehalt', format: euros },
  all_in: { label: 'All-in', format: yesNo },
  exempt_from_azg: { label: 'Vom AZG ausgenommen', format: yesNo },
  night_work: { label: 'Nachtarbeit', format: yesNo },
  shift_work: { label: 'Schichtarbeit', format: yesNo },
  flex_enabled: { label: 'Gleitzeit', format: yesNo },
  flex_period_months: { label: 'Gleitzeitperiode', format: (value) => `${number(value)} Monat(e)` },
  flex_period_anchor: { label: 'Beginn der Gleitzeitperiode', format: date },
  flex_allows_full_day_compensation: { label: 'Ganztägiger Zeitausgleich', format: yesNo },
  flex_frame_start: { label: 'Gleitzeitrahmen von', format: clock },
  flex_frame_end: { label: 'Gleitzeitrahmen bis', format: clock },
  flex_max_carry_credit_minutes: { label: 'Höchstes Zeitguthaben', format: minutes },
  flex_max_carry_debit_minutes: { label: 'Höchste Zeitschuld', format: minutes },
  // Stammdaten
  display_name: { label: 'Name', format: text },
  personnel_number: { label: 'Personalnummer', format: text },
  birth_date: { label: 'Geburtsdatum', format: date },
  hired_on: { label: 'Eintritt', format: date },
  left_on: { label: 'Austritt', format: date },
  state: { label: 'Bundesland', format: (value) => STATE_LABEL[value as AustrianState] ?? text(value) },
  role: { label: 'Rolle', format: (value) => ROLE_LABEL[String(value)] ?? text(value) },
  active: { label: 'Zugang', format: (value) => (value ? 'aktiv' : 'deaktiviert') },
  prior_service_months: { label: 'Vordienstzeiten', format: (value) => `${number(value)} Monate` },
  vacation_opening_days: { label: 'Offener Urlaub bei Übernahme', format: (value) => `${number(value)} Tage` },
  vacation_opening_date: { label: 'Übernahme-Stichtag', format: date },
  // Unternehmen
  name: { label: 'Firmenname', format: text },
  owner_id: { label: 'Inhaber', format: (value, lookups) => lookups.names.get(String(value)) ?? 'unbekannte Person' },
  company_register_number: { label: 'Firmenbuchnummer', format: text },
  vat_id: { label: 'UID', format: text },
  // Dienstverträge als PDF
  file_name: { label: 'Datei', format: quoted },
  size_bytes: { label: 'Größe', format: (value) => `${Math.max(1, Math.round(Number(value) / 1024))} KB` },
  first_viewed_at: { label: 'Von der Person geöffnet', format: (value) => (value ? timestampWithDate(value) : 'noch nicht') },
};

/** Technische Felder, die niemandem etwas sagen. */
const IGNORED = new Set([
  'id',
  'organization_id',
  'employee_id',
  'created_at',
  'created_by',
  'updated_at',
  'updated_by',
  'storage_path',
  'sha256',
  'uploaded_by',
  'uploaded_at',
]);

/** Was beim Anlegen oder Löschen eines Datensatzes genannt wird. */
const SUMMARY: Record<string, string[]> = {
  time_entries: ['source', 'note'],
  absences: ['half_day', 'note'],
  employment_contracts: ['contract_type_id', 'valid_from', 'valid_to', 'weekly_hours', 'collective_weekly_hours', 'vacation_days_per_year', 'flex_enabled'],
  profiles: ['display_name', 'role', 'hired_on'],
  contract_documents: ['file_name', 'size_bytes'],
  organizations: ['name'],
};

const AREA: Record<string, string> = {
  time_entries: 'Arbeitszeit',
  absences: 'Abwesenheit',
  employment_contracts: 'Vertrag',
  profiles: 'Stammdaten',
  organizations: 'Unternehmen',
  contract_documents: 'Dienstvertrag (PDF)',
  'auth.users': 'Zugang',
};

export function describeEntry(entry: AuditRow, lookups: Lookups): DescribedEntry {
  const before = (entry.old_data ?? null) as Data | null;
  const after = (entry.new_data ?? null) as Data | null;
  const area = AREA[entry.table_name] ?? entry.table_name;

  // Vorgänge in Supabase Auth: ein Stichwort statt eines Datensatzes.
  if (entry.table_name === 'auth.users' || typeof after?.aktion === 'string') {
    const aktion = String(after?.aktion ?? '');
    const changes: FieldChange[] = [];
    if (typeof after?.rolle === 'string') {
      changes.push({ label: 'Rolle', before: '', after: ROLE_LABEL[after.rolle] ?? after.rolle });
    }
    return { area, action: AUTH_ACTION_LABEL[aktion] ?? aktion, subject: '', changes };
  }

  // Löschung nach Ablauf der Aufbewahrungsfrist: nur der Vermerk bleibt.
  if (typeof after?.grund === 'string') {
    return { area, action: 'gelöscht', subject: after.grund, changes: [] };
  }

  const current = after ?? before ?? {};
  const subject = subjectOf(entry.table_name, current, before, after);

  if (entry.operation === 'INSERT' || entry.operation === 'DELETE') {
    const values = entry.operation === 'INSERT' ? after : before;
    const changes = (SUMMARY[entry.table_name] ?? [])
      .filter((key) => values && values[key] !== null && values[key] !== undefined && values[key] !== '')
      // „gestempelt“ oder „nachgetragen“ steht beim Anlegen schon im Vorgang.
      .filter((key) => !(entry.operation === 'INSERT' && key === 'source'))
      .map((key) => {
        const shown = formatField(key, values![key], lookups);
        return entry.operation === 'INSERT'
          ? { label: labelOf(key), before: '', after: shown }
          : { label: labelOf(key), before: shown, after: '' };
      });
    return { area, action: actionOf(entry.table_name, entry.operation, current), subject, changes };
  }

  const changes = Object.keys({ ...before, ...after })
    .filter((key) => !IGNORED.has(key))
    .filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]))
    .map((key) => ({
      label: labelOf(key),
      before: formatField(key, before?.[key], lookups),
      after: formatField(key, after?.[key], lookups),
    }));

  return { area, action: actionOf(entry.table_name, 'UPDATE', current, before, after), subject, changes };
}

/** Wer geändert hat — mit Hinweis, wenn es die Person selbst war. */
export function changedByLabel(changedBy: string | null, employeeId: string, names: Map<string, string>): string {
  if (!changedBy) return 'System';
  const name = names.get(changedBy) ?? 'Person außerhalb des Unternehmens';
  return changedBy === employeeId ? `${name} (selbst)` : name;
}

function actionOf(table: string, operation: string, current: Data, before?: Data | null, after?: Data | null): string {
  if (operation === 'INSERT') {
    if (table === 'time_entries') return current.source === 'stamped' ? 'gestempelt' : 'nachgetragen';
    if (table === 'contract_documents') return 'abgelegt';
    return 'angelegt';
  }
  if (operation === 'DELETE') return 'gelöscht';
  if (table === 'time_entries' && before?.ended_at == null && after?.ended_at != null && before?.source === 'stamped' && after?.source === 'stamped') {
    return 'ausgestempelt';
  }
  if (table === 'contract_documents' && before?.first_viewed_at == null && after?.first_viewed_at != null) {
    return 'von der Person geöffnet';
  }
  if (table === 'profiles' && before?.active !== after?.active) return after?.active ? 'reaktiviert' : 'deaktiviert';
  return 'geändert';
}

function subjectOf(table: string, current: Data, before: Data | null, after: Data | null): string {
  switch (table) {
    case 'time_entries': {
      const kind = SEGMENT_LABEL[String(current.kind)] ?? 'Eintrag';
      const day = typeof current.work_date === 'string' ? ` am ${weekdayShort(current.work_date)} ${date(current.work_date)}` : '';
      // Bei Änderungen der Stand vorher — darauf bezieht sich die Korrektur.
      const shown = before ?? after ?? current;
      const start = shown.started_at ? timestamp(shown.started_at) : '?';
      const end = shown.ended_at ? timestamp(shown.ended_at) : 'läuft';
      return `${kind}${day}, ${start}–${end}`;
    }
    case 'absences': {
      const kind = ABSENCE_LABEL[current.kind as AbsenceKind] ?? 'Abwesenheit';
      const day = typeof current.absence_date === 'string' ? ` am ${weekdayShort(current.absence_date)} ${date(current.absence_date)}` : '';
      return `${kind}${day}${current.half_day ? ' (halbtägig)' : ''}`;
    }
    case 'employment_contracts':
      return `Vertrag ab ${date(current.valid_from)}${current.valid_to ? ` bis ${date(current.valid_to)}` : ''}`;
    case 'contract_documents':
      return `${DOCUMENT_LABEL[String(current.kind)] ?? 'Dokument'} „${text(current.file_name)}“`;
    case 'profiles':
      return text(current.display_name);
    case 'organizations':
      return text(current.name);
    default:
      return '';
  }
}

function labelOf(key: string): string {
  return FIELDS[key]?.label ?? key;
}

function formatField(key: string, value: unknown, lookups: Lookups): string {
  if (value === null || value === undefined || value === '') return '—';
  const format = FIELDS[key]?.format;
  return format ? format(value, lookups) : text(value);
}

// --- Darstellung der Werte -------------------------------------------------

function text(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function quoted(value: unknown): string {
  const shown = text(value);
  return shown === '—' ? shown : `„${shown.length > 80 ? `${shown.slice(0, 80)} …` : shown}“`;
}

function date(value: unknown): string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDateShort(value) : text(value);
}

/** Uhrzeit in Wien, ohne Datum — das Datum steht schon beim Arbeitstag. */
function timestamp(value: unknown): string {
  if (typeof value !== 'string') return text(value);
  return new Date(value).toLocaleTimeString('de-AT', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit' });
}

function timestampWithDate(value: unknown): string {
  if (typeof value !== 'string') return text(value);
  return new Date(value).toLocaleString('de-AT', {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function clock(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 5) : text(value);
}

function yesNo(value: unknown): string {
  return value ? 'ja' : 'nein';
}

function number(value: unknown): string {
  return Number(value).toLocaleString('de-AT');
}

function hours(value: unknown): string {
  return `${number(value)} h`;
}

function minutes(value: unknown): string {
  return `${formatDuration(Number(value))} h`;
}

function euros(value: unknown): string {
  return (Number(value) / 100).toLocaleString('de-AT', { style: 'currency', currency: 'EUR' });
}

function dailyTargets(value: unknown): string {
  if (!Array.isArray(value)) return text(value);
  return value
    .map((target, index) => `${WEEKDAYS[index]} ${formatDuration(Number(target))}`)
    .join(', ');
}
