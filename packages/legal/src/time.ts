/**
 * Zeitbasis.
 *
 * Zwei Dinge werden hier sauber getrennt, weil ihre Vermischung die häufigste
 * Fehlerquelle in Zeiterfassungen ist:
 *
 *   - **Kalendertag** (`IsoDate`, `YYYY-MM-DD`) ist reine Kalenderarithmetik.
 *     Der 30. März hat einen Nachfolger, egal was die Uhr macht. Gerechnet
 *     wird deshalb in UTC, damit keine Zeitzone hineinfunkt.
 *
 *   - **Zeitpunkt** (`Date`) ist ein Punkt auf der Zeitachse. Die Differenz
 *     zweier Zeitpunkte ist die tatsächlich verstrichene Zeit — und nur so
 *     kommt bei der Ruhezeit über die Zeitumstellung das Richtige heraus:
 *     22:00 bis 09:00 sind im Oktober 12 Stunden, im März 10.
 *
 * Der Übergang zwischen beiden läuft ausschließlich über `atLocalTime` und
 * `localDateOf` / `localTimeOf`, die Europe/Vienna berücksichtigen.
 */

import { TZDate } from '@date-fns/tz';
import { TIMEZONE, type IsoDate, type Locale, type Minutes, type Weekday } from './types.js';

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const HM_PATTERN = /^(\d{1,2}):(\d{2})$/;

export interface DateParts {
  year: number;
  month: number; // 1–12
  day: number;
}

export function parseIsoDate(date: IsoDate): DateParts {
  const match = ISO_DATE_PATTERN.exec(date);
  if (!match) throw new RangeError(`Kein gültiges Datum im Format YYYY-MM-DD: ${date}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function formatIsoDate(parts: DateParts): IsoDate {
  const mm = String(parts.month).padStart(2, '0');
  const dd = String(parts.day).padStart(2, '0');
  return `${parts.year}-${mm}-${dd}`;
}

/** Minuten seit Mitternacht aus `HH:MM`. */
export function parseHm(time: string): Minutes {
  const match = HM_PATTERN.exec(time);
  if (!match) throw new RangeError(`Keine gültige Uhrzeit im Format HH:MM: ${time}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new RangeError(`Uhrzeit außerhalb des Tages: ${time}`);
  return hours * 60 + minutes;
}

// ---------------------------------------------------------------------------
// Kalenderarithmetik — bewusst in UTC, damit keine Sommerzeit hineinspielt
// ---------------------------------------------------------------------------

function toUtcMidnight(date: IsoDate): Date {
  const { year, month, day } = parseIsoDate(date);
  return new Date(Date.UTC(year, month - 1, day));
}

function fromUtcMidnight(value: Date): IsoDate {
  return formatIsoDate({
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  });
}

export function addDays(date: IsoDate, amount: number): IsoDate {
  const value = toUtcMidnight(date);
  value.setUTCDate(value.getUTCDate() + amount);
  return fromUtcMidnight(value);
}

export function addMonths(date: IsoDate, amount: number): IsoDate {
  const { year, month, day } = parseIsoDate(date);
  const target = new Date(Date.UTC(year, month - 1 + amount, 1));
  // Auf den letzten Tag des Zielmonats begrenzen: 31. Jänner + 1 Monat = 28. Februar.
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return formatIsoDate({
    year: target.getUTCFullYear(),
    month: target.getUTCMonth() + 1,
    day: Math.min(day, lastDay),
  });
}

/** Ganze Kalendertage von `from` bis `to`; negativ, wenn `to` früher liegt. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const ms = toUtcMidnight(to).getTime() - toUtcMidnight(from).getTime();
  return Math.round(ms / 86_400_000);
}

export function compareDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minDate(a: IsoDate, b: IsoDate): IsoDate {
  return a <= b ? a : b;
}

export function maxDate(a: IsoDate, b: IsoDate): IsoDate {
  return a >= b ? a : b;
}

/** Alle Tage von `from` bis `to`, beide einschließlich. */
export function eachDay(from: IsoDate, to: IsoDate): IsoDate[] {
  const days: IsoDate[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}

/** Montag = 1 … Sonntag = 7, nach ISO 8601. */
export function weekdayOf(date: IsoDate): Weekday {
  const day = toUtcMidnight(date).getUTCDay();
  return (day === 0 ? 7 : day) as Weekday;
}

export function isWeekend(date: IsoDate): boolean {
  const day = weekdayOf(date);
  return day === 6 || day === 7;
}

/** Montag der Kalenderwoche, in der `date` liegt. */
export function startOfIsoWeek(date: IsoDate): IsoDate {
  return addDays(date, 1 - weekdayOf(date));
}

export function endOfIsoWeek(date: IsoDate): IsoDate {
  return addDays(startOfIsoWeek(date), 6);
}

/** Kalenderwoche nach ISO 8601 — die Woche mit dem ersten Donnerstag des Jahres ist KW 1. */
export function isoWeek(date: IsoDate): { year: number; week: number } {
  const thursday = addDays(startOfIsoWeek(date), 3);
  const { year } = parseIsoDate(thursday);
  const firstThursday = addDays(startOfIsoWeek(`${year}-01-04`), 3);
  const week = Math.round(daysBetween(firstThursday, thursday) / 7) + 1;
  return { year, week };
}

export function startOfMonth(date: IsoDate): IsoDate {
  const { year, month } = parseIsoDate(date);
  return formatIsoDate({ year, month, day: 1 });
}

export function endOfMonth(date: IsoDate): IsoDate {
  const { year, month } = parseIsoDate(date);
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return formatIsoDate({ year, month, day });
}

// ---------------------------------------------------------------------------
// Übergang Kalendertag ↔ Zeitpunkt
// ---------------------------------------------------------------------------

/**
 * Der Zeitpunkt, an dem in Wien an `date` die Uhr `time` zeigt.
 *
 * `minutesAfterMidnight` darf über 1440 hinausgehen — so wird eine Schicht
 * abgebildet, die über Mitternacht läuft: `atLocalTime('2026-03-02', 1500)`
 * ist der 3. März, 01:00 Uhr.
 */
export function atLocalTime(date: IsoDate, minutesAfterMidnight: Minutes): Date {
  const dayOffset = Math.floor(minutesAfterMidnight / 1440);
  const within = minutesAfterMidnight - dayOffset * 1440;
  const { year, month, day } = parseIsoDate(dayOffset === 0 ? date : addDays(date, dayOffset));
  const hours = Math.floor(within / 60);
  const minutes = within % 60;
  return new Date(
    TZDate.tz(TIMEZONE, year, month - 1, day, hours, minutes, 0, 0).getTime(),
  );
}

/** Der Kalendertag, an dem dieser Zeitpunkt in Wien liegt. */
export function localDateOf(instant: Date): IsoDate {
  const zoned = new TZDate(instant, TIMEZONE);
  return formatIsoDate({
    year: zoned.getFullYear(),
    month: zoned.getMonth() + 1,
    day: zoned.getDate(),
  });
}

/** Minuten seit Mitternacht, die die Uhr in Wien zu diesem Zeitpunkt zeigt. */
export function localMinutesOfDay(instant: Date): Minutes {
  const zoned = new TZDate(instant, TIMEZONE);
  return zoned.getHours() * 60 + zoned.getMinutes();
}

/** Uhrzeit in Wien als `HH:MM`. */
export function localTimeOf(instant: Date): string {
  return formatClock(localMinutesOfDay(instant));
}

/**
 * Tatsächlich verstrichene Minuten zwischen zwei Zeitpunkten.
 *
 * Weil beide Werte absolute Zeitpunkte sind, ist das Ergebnis über die
 * Zeitumstellung hinweg automatisch richtig — genau dafür läuft der Weg in
 * die Wiener Ortszeit ausschließlich über `atLocalTime`.
 */
export function minutesBetween(from: Date, to: Date): Minutes {
  return Math.round((to.getTime() - from.getTime()) / 60_000);
}

// ---------------------------------------------------------------------------
// Darstellung
// ---------------------------------------------------------------------------

/** Minuten seit Mitternacht als `HH:MM`, für Uhrzeiten. */
export function formatClock(minutes: Minutes): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hh = String(Math.floor(normalized / 60)).padStart(2, '0');
  const mm = String(normalized % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Dauer als `H:MM`, etwa `8:22`. Mit `sign` wird das Vorzeichen immer
 * geschrieben — so liest sich ein Saldo als `+12:45` oder `−3:10`.
 */
export function formatDuration(minutes: Minutes, options: { sign?: boolean } = {}): string {
  const negative = minutes < 0;
  const absolute = Math.abs(Math.round(minutes));
  const hh = Math.floor(absolute / 60);
  const mm = String(absolute % 60).padStart(2, '0');
  const prefix = negative ? '−' : options.sign ? '+' : '';
  return `${prefix}${hh}:${mm}`;
}

/** Dezimalstunden, gerundet auf zwei Stellen — für CSV und Lohnverrechnung. */
export function toDecimalHours(minutes: Minutes): number {
  return Math.round((minutes / 60) * 100) / 100;
}

const WEEKDAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;
const WEEKDAY_LONG = [
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag',
] as const;
const MONTH_LONG = [
  'Jänner',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
] as const;

const WEEKDAY_SHORT_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const WEEKDAY_LONG_EN = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;
const MONTH_LONG_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function weekdayShort(date: IsoDate, locale: Locale = 'de'): string {
  return (locale === 'en' ? WEEKDAY_SHORT_EN : WEEKDAY_SHORT)[weekdayOf(date) - 1]!;
}

export function weekdayLong(date: IsoDate, locale: Locale = 'de'): string {
  return (locale === 'en' ? WEEKDAY_LONG_EN : WEEKDAY_LONG)[weekdayOf(date) - 1]!;
}

export function monthName(month: number, locale: Locale = 'de'): string {
  return (locale === 'en' ? MONTH_LONG_EN : MONTH_LONG)[month - 1]!;
}

/** `14.09.2026`, englisch `14/09/2026` (Tag zuerst, wie in Europa üblich). */
export function formatDateShort(date: IsoDate, locale: Locale = 'de'): string {
  const { year, month, day } = parseIsoDate(date);
  const separator = locale === 'en' ? '/' : '.';
  return [String(day).padStart(2, '0'), String(month).padStart(2, '0'), year].join(separator);
}

/** `Montag, 14. September 2026`, englisch `Monday, 14 September 2026` */
export function formatDateLong(date: IsoDate, locale: Locale = 'de'): string {
  const { year, month, day } = parseIsoDate(date);
  return locale === 'en'
    ? `${weekdayLong(date, 'en')}, ${day} ${monthName(month, 'en')} ${year}`
    : `${weekdayLong(date)}, ${day}. ${monthName(month)} ${year}`;
}
