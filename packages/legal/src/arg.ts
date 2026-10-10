/**
 * Arbeitsruhegesetz (ARG) — Wochenendruhe, Wochenruhe, Feiertagsruhe,
 * Ersatzruhe.
 *
 * Anders als beim AZG reicht es hier nicht, Stunden zu summieren: die
 * wöchentliche Ruhezeit muss **ununterbrochen** sein und den Sonntag
 * einschließen. Geprüft wird deshalb auf der Zeitachse, über Tagesgrenzen
 * hinweg.
 */

import { statutoryHolidayOn } from './holidays.js';
import {
  addDays,
  atLocalTime,
  formatClock,
  formatDuration,
  localDateOf,
  localMinutesOfDay,
  minutesBetween,
  weekdayLong,
  weekdayOf,
} from './time.js';
import type { DayWork, Interval } from './work.js';
import type { IsoDate, Locale, Minutes, RuleResult } from './types.js';

/** § 3 Abs 1 ARG: ununterbrochene wöchentliche Ruhezeit. */
export const MIN_WEEKLY_REST_MINUTES: Minutes = 36 * 60;
/** § 3 Abs 2 ARG: spätester Beginn der Wochenendruhe. */
export const WEEKEND_REST_LATEST_START: Minutes = 13 * 60; // Samstag 13:00
/** § 7 Abs 1 ARG: ununterbrochene Feiertagsruhe. */
export const MIN_HOLIDAY_REST_MINUTES: Minutes = 24 * 60;

interface Gap {
  start: Date;
  end: Date;
  minutes: Minutes;
}

function workIntervals(days: readonly DayWork[]): Interval[] {
  return days
    .flatMap((day) => day.intervals)
    .filter((interval) => interval.kind === 'work')
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Die arbeitsfreien Lücken zwischen den Arbeitsintervallen im Fenster. */
function freeGaps(intervals: readonly Interval[], windowStart: Date, windowEnd: Date): Gap[] {
  const gaps: Gap[] = [];
  let cursor = windowStart;

  for (const interval of intervals) {
    if (interval.end <= windowStart) continue;
    if (interval.start >= windowEnd) break;
    if (interval.start > cursor) {
      gaps.push({ start: cursor, end: interval.start, minutes: minutesBetween(cursor, interval.start) });
    }
    if (interval.end > cursor) cursor = interval.end;
  }

  if (cursor < windowEnd) {
    gaps.push({ start: cursor, end: windowEnd, minutes: minutesBetween(cursor, windowEnd) });
  }

  return gaps;
}

function minutesWorkedBetween(intervals: readonly Interval[], from: Date, to: Date): Minutes {
  let total = 0;
  for (const interval of intervals) {
    const start = Math.max(interval.start.getTime(), from.getTime());
    const end = Math.min(interval.end.getTime(), to.getTime());
    if (end > start) total += Math.round((end - start) / 60_000);
  }
  return total;
}

/**
 * § 3 ARG — wöchentliche Ruhezeit von 36 Stunden, die den Sonntag einschließt.
 *
 * `days` muss den Zeitraum von Freitag bis einschließlich Dienstag der
 * Folgewoche abdecken, sonst lässt sich die Ruhezeit an ihren Rändern nicht
 * messen. Das Fenster ist bewusst großzügig: eine Ruhezeit, die Freitagabend
 * beginnt und Montagfrüh endet, ist genauso zulässig wie eine, die erst
 * Samstagmittag beginnt.
 */
export function checkWeeklyRest(days: readonly DayWork[], sunday: IsoDate): RuleResult {
  const intervals = workIntervals(days);
  const sundayStart = atLocalTime(sunday, 0);
  const sundayEnd = atLocalTime(sunday, 24 * 60);

  const sundayWork = minutesWorkedBetween(intervals, sundayStart, sundayEnd);
  if (sundayWork > 0) {
    return {
      code: 'arg.sonntagsarbeit',
      severity: 'verstoss',
      reference: '§ 3 Abs 1 ARG',
      date: sunday,
      actual: sundayWork,
      limit: 0,
      message: `${formatDuration(sundayWork)} h Arbeit am Sonntag — die wöchentliche Ruhezeit muss den Sonntag einschließen. Ausnahmen brauchen eine Grundlage nach §§ 10 ff ARG; es entsteht Anspruch auf Ersatzruhe nach § 6 ARG.`,
      messageEn: `${formatDuration(sundayWork)} h of work on Sunday — the weekly rest must include Sunday. Exceptions need a legal basis under §§ 10 ff ARG; compensatory rest is due under § 6 ARG.`,
    };
  }

  const windowStart = atLocalTime(addDays(sunday, -2), 0); // Freitag 00:00
  const windowEnd = atLocalTime(addDays(sunday, 2), 24 * 60); // Dienstag 24:00
  const gaps = freeGaps(intervals, windowStart, windowEnd);
  const containingSunday = gaps.filter((gap) => gap.start <= sundayStart && gap.end >= sundayEnd);

  if (containingSunday.length === 0) {
    return {
      code: 'arg.wochenruhe',
      severity: 'verstoss',
      reference: '§ 3 Abs 1 ARG',
      date: sunday,
      actual: 0,
      limit: MIN_WEEKLY_REST_MINUTES,
      message: 'Keine ununterbrochene Ruhezeit, die den Sonntag einschließt.',
      messageEn: 'No uninterrupted rest period that includes Sunday.',
    };
  }

  const longest = containingSunday.reduce((best, gap) => (gap.minutes > best.minutes ? gap : best));
  const short = longest.minutes < MIN_WEEKLY_REST_MINUTES;

  if (short) {
    return {
      code: 'arg.wochenruhe',
      severity: 'verstoss',
      reference: '§ 3 Abs 1 ARG',
      date: sunday,
      actual: longest.minutes,
      limit: MIN_WEEKLY_REST_MINUTES,
      message: `Wochenendruhe ${formatDuration(longest.minutes)} h, von ${formatClock(
        localMinutes(longest.start),
      )} am ${weekdayOfInstant(longest.start)} bis ${formatClock(
        localMinutes(longest.end),
      )} am ${weekdayOfInstant(longest.end)} — vorgeschrieben sind 36 Stunden.`,
      messageEn: `Weekend rest of ${formatDuration(longest.minutes)} h, from ${formatClock(
        localMinutes(longest.start),
      )} on ${weekdayOfInstant(longest.start, 'en')} to ${formatClock(
        localMinutes(longest.end),
      )} on ${weekdayOfInstant(longest.end, 'en')} — 36 hours are required.`,
    };
  }

  // § 3 Abs 2 ARG: die Wochenendruhe hat spätestens Samstag um 13:00 zu beginnen.
  const saturdayDeadline = atLocalTime(addDays(sunday, -1), WEEKEND_REST_LATEST_START);
  if (longest.start > saturdayDeadline) {
    return {
      code: 'arg.wochenendruhe_beginn',
      severity: 'hinweis',
      reference: '§ 3 Abs 2 ARG',
      date: sunday,
      actual: localMinutes(longest.start),
      limit: WEEKEND_REST_LATEST_START,
      message: `Die Wochenendruhe beginnt erst um ${formatClock(
        localMinutes(longest.start),
      )} — sie hat spätestens Samstag um 13:00 zu beginnen, sofern nicht eine Ausnahme nach § 12b ARG greift.`,
      messageEn: `The weekend rest only starts at ${formatClock(
        localMinutes(longest.start),
      )} — it must start by Saturday 13:00 at the latest, unless an exception under § 12b ARG applies.`,
    };
  }

  return {
    code: 'arg.wochenruhe',
    severity: 'ok',
    reference: '§ 3 Abs 1 ARG',
    date: sunday,
    actual: longest.minutes,
    limit: MIN_WEEKLY_REST_MINUTES,
    message: `Wochenendruhe ${formatDuration(longest.minutes)} h.`,
    messageEn: `Weekend rest of ${formatDuration(longest.minutes)} h.`,
  };
}

/**
 * § 7 ARG — an Feiertagen besteht Anspruch auf eine ununterbrochene Ruhezeit
 * von 24 Stunden, die zwischen 0 und 6 Uhr des Feiertags zu beginnen hat.
 *
 * Wer dennoch arbeitet, bekommt das Entgelt zusätzlich zum Feiertagsentgelt
 * (§ 9 Abs 5 ARG) — das rechnet `balance.ts`, hier steht nur der Befund.
 */
export function checkHolidayRest(day: DayWork): RuleResult | null {
  const holiday = statutoryHolidayOn(day.date);
  if (!holiday) return null;
  if (day.workMinutes === 0) return null;

  return {
    code: 'arg.feiertagsruhe',
    severity: 'hinweis',
    reference: '§ 7 ARG',
    date: day.date,
    actual: day.workMinutes,
    limit: 0,
    message: `${formatDuration(day.workMinutes)} h Arbeit am ${holiday.name} — das Entgelt gebührt zusätzlich zum Feiertagsentgelt (§ 9 Abs 5 ARG), und es entsteht Anspruch auf Ersatzruhe nach § 6 ARG.`,
    messageEn: `${formatDuration(day.workMinutes)} h of work on ${holiday.nameEn} — pay is due in addition to holiday pay (§ 9 Abs 5 ARG), and compensatory rest is due under § 6 ARG.`,
  };
}

/**
 * § 6 ARG — Ersatzruhe im Ausmaß jener Arbeitszeit, die in die Wochenend-,
 * Wochen- oder Feiertagsruhe gefallen ist. Sie ist in der folgenden
 * Arbeitswoche zu verbrauchen.
 *
 * Liefert die Minuten, die als offener Anspruch zu führen sind.
 */
export function substituteRestClaim(days: readonly DayWork[]): Minutes {
  let claim = 0;
  for (const day of days) {
    if (day.workMinutes === 0) continue;
    if (weekdayOf(day.date) === 7 || statutoryHolidayOn(day.date)) claim += day.workMinutes;
  }
  return claim;
}

// --- kleine Helfer für die Meldungstexte ----------------------------------

function localMinutes(instant: Date): Minutes {
  return localMinutesOfDay(instant);
}

function weekdayOfInstant(instant: Date, locale: Locale = 'de'): string {
  return weekdayLong(localDateOf(instant), locale);
}
