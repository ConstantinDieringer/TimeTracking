/**
 * Arbeitszeitgesetz (AZG).
 *
 * Jede Regel ist eine eigene Funktion und liefert einen `RuleResult` mit
 * Fundstelle. Die Oberfläche zeigt die Fundstelle mit an — eine Warnung, die
 * ihre Grundlage nennt, lässt sich nachprüfen; eine ohne wirkt wie Willkür.
 */

import { formatClock, formatDuration, minutesBetween } from './time.js';
import { endMinuteOf, startMinuteOf, type DayWork } from './work.js';
import type { Contract, IsoDate, Minutes, RuleResult } from './types.js';

// --- Grenzwerte ------------------------------------------------------------

/** § 9 Abs 1 AZG: Tagesarbeitszeit einschließlich Überstunden. */
export const MAX_DAILY_MINUTES: Minutes = 12 * 60;
/** § 9 Abs 1 AZG: Wochenarbeitszeit einschließlich Überstunden. */
export const MAX_WEEKLY_MINUTES: Minutes = 60 * 60;
/** § 9 Abs 4 AZG: Durchschnitt über den Durchrechnungszeitraum. */
export const MAX_AVERAGE_WEEKLY_MINUTES: Minutes = 48 * 60;
/** Länge des Durchrechnungszeitraums für den Wochendurchschnitt. */
export const AVERAGE_WINDOW_WEEKS = 17;
/** § 11 Abs 1 AZG: ab dieser Arbeitszeit ist eine Ruhepause zu gewähren. */
export const BREAK_REQUIRED_AFTER: Minutes = 6 * 60;
/** § 11 Abs 1 AZG: Mindestdauer der Ruhepause. */
export const MIN_BREAK_MINUTES: Minutes = 30;
/** § 12 Abs 1 AZG: ununterbrochene tägliche Ruhezeit. */
export const MIN_DAILY_REST_MINUTES: Minutes = 11 * 60;
/** § 3 Abs 1 AZG: gesetzliche Normalarbeitszeit, sofern der KV nichts Kürzeres vorsieht. */
export const NORMAL_DAILY_MINUTES: Minutes = 8 * 60;
export const NORMAL_WEEKLY_MINUTES: Minutes = 40 * 60;

/** Ab diesem Wochendurchschnitt wird gewarnt, bevor die Grenze fällt. */
const AVERAGE_WARN_MINUTES: Minutes = 46 * 60;

// --- Tagesregeln -----------------------------------------------------------

/** § 9 Abs 1 AZG — die Tagesarbeitszeit darf 12 Stunden nicht überschreiten. */
export function checkDailyMaximum(day: DayWork): RuleResult {
  const over = day.workMinutes > MAX_DAILY_MINUTES;
  return {
    code: 'azg.tageshoechstarbeitszeit',
    severity: over ? 'verstoss' : 'ok',
    reference: '§ 9 Abs 1 AZG',
    date: day.date,
    actual: day.workMinutes,
    limit: MAX_DAILY_MINUTES,
    message: over
      ? `Tagesarbeitszeit ${formatDuration(day.workMinutes)} h — über der Höchstgrenze von 12 Stunden.`
      : `Tagesarbeitszeit ${formatDuration(day.workMinutes)} h.`,
    messageEn: over
      ? `Daily working time ${formatDuration(day.workMinutes)} h — above the maximum of 12 hours.`
      : `Daily working time ${formatDuration(day.workMinutes)} h.`,
  };
}

/**
 * § 11 Abs 1 AZG — bei mehr als sechs Stunden Arbeitszeit ist eine Ruhepause
 * von mindestens 30 Minuten zu gewähren. Sie darf in zwei Pausen zu je
 * mindestens 15 oder drei zu je mindestens 10 Minuten geteilt werden.
 *
 * Geprüft wird gegen die tatsächlichen Unterbrechungen, nicht nur gegen
 * ausdrücklich erfasste Pausen: wer zwischen zwei Arbeitsblöcken eine Stunde
 * Lücke hat, hat pausiert, auch wenn er nichts angeklickt hat.
 */
export function checkBreak(day: DayWork): RuleResult {
  if (day.workMinutes <= BREAK_REQUIRED_AFTER) {
    return {
      code: 'azg.ruhepause',
      severity: 'ok',
      reference: '§ 11 Abs 1 AZG',
      date: day.date,
      actual: day.breakMinutes,
      limit: 0,
      message: `Arbeitszeit ${formatDuration(day.workMinutes)} h — keine Ruhepause vorgeschrieben.`,
      messageEn: `Working time ${formatDuration(day.workMinutes)} h — no rest break required.`,
    };
  }

  const total = day.breakMinutes;
  const pieces = day.breakPieces;
  const hasSingleFull = pieces.some((piece) => piece >= MIN_BREAK_MINUTES);
  const hasTwoOfFifteen = pieces.filter((piece) => piece >= 15).length >= 2;
  const hasThreeOfTen = pieces.filter((piece) => piece >= 10).length >= 3;
  const splitIsValid = hasSingleFull || hasTwoOfFifteen || hasThreeOfTen;

  if (total < MIN_BREAK_MINUTES) {
    return {
      code: 'azg.ruhepause',
      severity: 'verstoss',
      reference: '§ 11 Abs 1 AZG',
      date: day.date,
      actual: total,
      limit: MIN_BREAK_MINUTES,
      message:
        total === 0
          ? `Keine Ruhepause bei ${formatDuration(day.workMinutes)} h Arbeitszeit — ab mehr als 6 Stunden sind 30 Minuten vorgeschrieben.`
          : `Ruhepause nur ${total} Minuten bei ${formatDuration(day.workMinutes)} h Arbeitszeit — vorgeschrieben sind 30 Minuten.`,
      messageEn:
        total === 0
          ? `No rest break with ${formatDuration(day.workMinutes)} h of work — more than 6 hours require 30 minutes.`
          : `Rest break of only ${total} minutes with ${formatDuration(day.workMinutes)} h of work — 30 minutes are required.`,
    };
  }

  if (!splitIsValid) {
    return {
      code: 'azg.ruhepause_teilung',
      severity: 'verstoss',
      reference: '§ 11 Abs 1 AZG',
      date: day.date,
      actual: total,
      limit: MIN_BREAK_MINUTES,
      message: `Die Pausen summieren sich auf ${total} Minuten, sind aber unzulässig geteilt — erlaubt sind eine Pause von 30, zwei von je 15 oder drei von je 10 Minuten.`,
      messageEn: `The breaks add up to ${total} minutes but are split in a way the law does not allow — permitted are one break of 30, two of 15 or three of 10 minutes each.`,
    };
  }

  return {
    code: 'azg.ruhepause',
    severity: 'ok',
    reference: '§ 11 Abs 1 AZG',
    date: day.date,
    actual: total,
    limit: MIN_BREAK_MINUTES,
    message: `Ruhepause ${total} Minuten bei ${formatDuration(day.workMinutes)} h Arbeitszeit.`,
    messageEn: `Rest break of ${total} minutes with ${formatDuration(day.workMinutes)} h of work.`,
  };
}

/**
 * § 12 Abs 1 AZG — nach Ende der Tagesarbeitszeit ist eine ununterbrochene
 * Ruhezeit von mindestens elf Stunden zu gewähren.
 *
 * Gemessen wird zwischen zwei Zeitpunkten, nicht zwischen zwei Uhrzeiten. An
 * den Umstellungstagen ist das der Unterschied zwischen richtig und falsch.
 */
export function checkDailyRest(previousDay: DayWork | null, day: DayWork): RuleResult | null {
  const previousEnd = previousDay?.lastEnd;
  const currentStart = day.firstStart;
  if (!previousEnd || !currentStart) return null;

  const rest = minutesBetween(previousEnd, currentStart);
  if (rest <= 0) return null;

  const short = rest < MIN_DAILY_REST_MINUTES;
  return {
    code: 'azg.ruhezeit',
    severity: short ? 'verstoss' : 'ok',
    reference: '§ 12 Abs 1 AZG',
    date: day.date,
    actual: rest,
    limit: MIN_DAILY_REST_MINUTES,
    message: short
      ? `Ruhezeit ${formatDuration(rest)} h seit ${formatClock(endMinuteOf(previousDay)!)} — unter den vorgeschriebenen 11 Stunden.`
      : `Ruhezeit ${formatDuration(rest)} h.`,
    messageEn: short
      ? `Rest period of ${formatDuration(rest)} h since ${formatClock(endMinuteOf(previousDay)!)} — below the required 11 hours.`
      : `Rest period of ${formatDuration(rest)} h.`,
  };
}

/**
 * § 12a AZG — Nachtarbeit liegt vor, wenn regelmäßig mindestens drei Stunden
 * zwischen 22:00 und 05:00 gearbeitet wird. Hier als Hinweis, weil daran
 * weitere Ansprüche hängen, die außerhalb dieses Tools geregelt werden.
 */
export function checkNightWork(day: DayWork, contract: Contract): RuleResult | null {
  if (day.nightMinutes < 3 * 60) return null;
  if (contract.nightWork) return null;
  return {
    code: 'azg.nachtarbeit',
    severity: 'hinweis',
    reference: '§ 12a AZG',
    date: day.date,
    actual: day.nightMinutes,
    limit: 3 * 60,
    message: `${formatDuration(day.nightMinutes)} h zwischen 22:00 und 05:00 — im Vertrag ist keine Nachtarbeit vorgesehen.`,
    messageEn: `${formatDuration(day.nightMinutes)} h between 22:00 and 05:00 — the contract does not provide for night work.`,
  };
}

/**
 * Hinweis, wenn der Arbeitsbeginn auffällig nahe an der Ruhezeitgrenze liegt.
 * Kein eigener Paragraf, sondern eine praktische Vorwarnung.
 */
export function checkSpan(day: DayWork): RuleResult | null {
  const start = startMinuteOf(day);
  const end = endMinuteOf(day);
  if (start === null || end === null) return null;
  if (day.spanMinutes <= 13 * 60) return null;
  return {
    code: 'azg.anwesenheitsspanne',
    severity: 'hinweis',
    reference: '§ 12 Abs 1 AZG',
    date: day.date,
    actual: day.spanMinutes,
    limit: 13 * 60,
    message: `Von ${formatClock(start)} bis ${formatClock(end)} sind ${formatDuration(day.spanMinutes)} h — bei einem Arbeitsbeginn wie gestern bliebe die Ruhezeit knapp.`,
    messageEn: `${formatClock(start)} to ${formatClock(end)} is ${formatDuration(day.spanMinutes)} h — starting at the same time tomorrow would leave little rest.`,
  };
}

// --- Wochenregeln ----------------------------------------------------------

/** § 9 Abs 1 AZG — die Wochenarbeitszeit darf 60 Stunden nicht überschreiten. */
export function checkWeeklyMaximum(days: readonly DayWork[], weekStart: IsoDate): RuleResult {
  const total = days.reduce((sum, day) => sum + day.workMinutes, 0);
  const over = total > MAX_WEEKLY_MINUTES;
  return {
    code: 'azg.wochenhoechstarbeitszeit',
    severity: over ? 'verstoss' : 'ok',
    reference: '§ 9 Abs 1 AZG',
    date: weekStart,
    actual: total,
    limit: MAX_WEEKLY_MINUTES,
    message: over
      ? `Wochenarbeitszeit ${formatDuration(total)} h — über der Höchstgrenze von 60 Stunden.`
      : `Wochenarbeitszeit ${formatDuration(total)} h.`,
    messageEn: over
      ? `Weekly working time ${formatDuration(total)} h — above the maximum of 60 hours.`
      : `Weekly working time ${formatDuration(total)} h.`,
  };
}

/**
 * § 9 Abs 4 AZG — innerhalb eines Durchrechnungszeitraums von 17 Wochen darf
 * die durchschnittliche Wochenarbeitszeit 48 Stunden nicht überschreiten.
 *
 * Das ist die Regel, die in der Praxis am ehesten übersehen wird: einzelne
 * 60-Stunden-Wochen sind zulässig, der Schnitt darüber aber nicht. Sie wird
 * deshalb rollierend geprüft und dauerhaft angezeigt, nicht erst am Ende.
 *
 * `weeklyMinutes` sind die Wochensummen in zeitlicher Reihenfolge; die letzte
 * ist die aktuelle Woche.
 */
export function checkSeventeenWeekAverage(
  weeklyMinutes: readonly Minutes[],
  weekStart: IsoDate,
): RuleResult {
  const window = weeklyMinutes.slice(-AVERAGE_WINDOW_WEEKS);
  const weeks = window.length;
  const average = weeks === 0 ? 0 : window.reduce((sum, value) => sum + value, 0) / weeks;

  const severity: RuleResult['severity'] =
    average > MAX_AVERAGE_WEEKLY_MINUTES
      ? 'verstoss'
      : average >= AVERAGE_WARN_MINUTES
        ? 'hinweis'
        : 'ok';

  const zeitraum = weeks < AVERAGE_WINDOW_WEEKS
    ? `${weeks} von 17 Wochen`
    : '17 Wochen';
  const period = weeks < AVERAGE_WINDOW_WEEKS ? `${weeks} of 17 weeks` : '17 weeks';

  return {
    code: 'azg.durchrechnung',
    severity,
    reference: '§ 9 Abs 4 AZG',
    date: weekStart,
    actual: Math.round(average),
    limit: MAX_AVERAGE_WEEKLY_MINUTES,
    message:
      severity === 'verstoss'
        ? `Ø ${formatDuration(average)} h über ${zeitraum} — der Durchschnitt darf 48 Stunden nicht überschreiten.`
        : severity === 'hinweis'
          ? `Ø ${formatDuration(average)} h über ${zeitraum} — die Grenze von 48 Stunden rückt näher.`
          : `Ø ${formatDuration(average)} h über ${zeitraum}.`,
    messageEn:
      severity === 'verstoss'
        ? `Average ${formatDuration(average)} h over ${period} — must not exceed 48 hours.`
        : severity === 'hinweis'
          ? `Average ${formatDuration(average)} h over ${period} — approaching the 48-hour limit.`
          : `Average ${formatDuration(average)} h over ${period}.`,
  };
}
