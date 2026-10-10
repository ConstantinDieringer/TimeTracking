/**
 * Kinder- und Jugendlichen-Beschäftigungsgesetz (KJBG).
 *
 * Greift für alle unter 18, unabhängig davon, ob sie Lehrling sind. Das
 * Regelwerk ist strenger als das AZG und **ersetzt** es für diese Personen;
 * es wird nicht zusätzlich angewandt.
 *
 * Maßgeblich ist das Alter am jeweiligen Tag, abgeleitet aus dem Geburtsdatum.
 * Ein Lehrling, der am Dienstag 18 wird, arbeitet am Montag unter dem KJBG und
 * am Dienstag unter dem AZG.
 */

import { formatClock, formatDuration, minutesBetween, weekdayOf } from './time.js';
import { endMinuteOf, startMinuteOf, type DayWork } from './work.js';
import type { IsoDate, Minutes, RuleResult } from './types.js';

/** § 11 Abs 1 KJBG: Tagesarbeitszeit. */
export const MINOR_NORMAL_DAILY_MINUTES: Minutes = 8 * 60;
/**
 * § 11 Abs 2 KJBG: bei anderer Verteilung der Wochenarbeitszeit, etwa zur
 * Verlängerung der Wochenendruhe, sind bis zu 9 Stunden zulässig.
 */
export const MINOR_MAX_DAILY_MINUTES: Minutes = 9 * 60;
/** § 11 Abs 1 KJBG: Wochenarbeitszeit. */
export const MINOR_NORMAL_WEEKLY_MINUTES: Minutes = 40 * 60;
/** Obergrenze in einzelnen Wochen bei zulässiger Verteilung. */
export const MINOR_MAX_WEEKLY_MINUTES: Minutes = 45 * 60;
/** § 15 KJBG: Ruhepause spätestens nach dieser Arbeitszeit. */
export const MINOR_BREAK_REQUIRED_AFTER: Minutes = 6 * 60;
/** § 15 KJBG: Anspruch auf die Pause entsteht bereits nach viereinhalb Stunden. */
export const MINOR_BREAK_ENTITLEMENT_AFTER: Minutes = 4 * 60 + 30;
export const MINOR_MIN_BREAK_MINUTES: Minutes = 30;
/** § 16 KJBG: ununterbrochene Nachtruhe zwischen zwei Arbeitstagen. */
export const MINOR_MIN_NIGHT_REST_MINUTES: Minutes = 12 * 60;
/** § 17 KJBG: Nachtarbeitsverbot. */
export const MINOR_NIGHT_BAN_START: Minutes = 20 * 60; // 20:00
export const MINOR_NIGHT_BAN_END: Minutes = 6 * 60; // 06:00

/** § 11 KJBG — Tagesarbeitszeit von Jugendlichen. */
export function checkMinorDailyMaximum(day: DayWork): RuleResult {
  if (day.workMinutes > MINOR_MAX_DAILY_MINUTES) {
    return {
      code: 'kjbg.tagesarbeitszeit',
      severity: 'verstoss',
      reference: '§ 11 KJBG',
      date: day.date,
      actual: day.workMinutes,
      limit: MINOR_MAX_DAILY_MINUTES,
      message: `Tagesarbeitszeit ${formatDuration(day.workMinutes)} h — für Jugendliche unter 18 sind höchstens 9 Stunden zulässig, und das nur bei anderer Verteilung der Wochenarbeitszeit.`,
      messageEn: `Daily working time ${formatDuration(day.workMinutes)} h — young people under 18 may work at most 9 hours, and only if the weekly hours are distributed differently.`,
    };
  }

  if (day.workMinutes > MINOR_NORMAL_DAILY_MINUTES) {
    return {
      code: 'kjbg.tagesarbeitszeit',
      severity: 'hinweis',
      reference: '§ 11 Abs 2 KJBG',
      date: day.date,
      actual: day.workMinutes,
      limit: MINOR_NORMAL_DAILY_MINUTES,
      message: `Tagesarbeitszeit ${formatDuration(day.workMinutes)} h — über 8 Stunden nur zulässig, wenn die Wochenarbeitszeit anders verteilt ist, etwa zur Verlängerung der Wochenendruhe.`,
      messageEn: `Daily working time ${formatDuration(day.workMinutes)} h — more than 8 hours is only allowed if the weekly hours are distributed differently, e.g. to extend the weekend rest.`,
    };
  }

  return {
    code: 'kjbg.tagesarbeitszeit',
    severity: 'ok',
    reference: '§ 11 KJBG',
    date: day.date,
    actual: day.workMinutes,
    limit: MINOR_NORMAL_DAILY_MINUTES,
    message: `Tagesarbeitszeit ${formatDuration(day.workMinutes)} h.`,
    messageEn: `Daily working time ${formatDuration(day.workMinutes)} h.`,
  };
}

/** § 15 KJBG — Ruhepause von 30 Minuten, spätestens nach sechs Stunden. */
export function checkMinorBreak(day: DayWork): RuleResult {
  if (day.workMinutes <= MINOR_BREAK_ENTITLEMENT_AFTER) {
    return {
      code: 'kjbg.ruhepause',
      severity: 'ok',
      reference: '§ 15 KJBG',
      date: day.date,
      actual: day.breakMinutes,
      limit: 0,
      message: `Arbeitszeit ${formatDuration(day.workMinutes)} h — keine Ruhepause vorgeschrieben.`,
      messageEn: `Working time ${formatDuration(day.workMinutes)} h — no rest break required.`,
    };
  }

  const hasFullBreak = day.breakPieces.some((piece) => piece >= MINOR_MIN_BREAK_MINUTES);

  if (day.workMinutes > MINOR_BREAK_REQUIRED_AFTER && !hasFullBreak) {
    return {
      code: 'kjbg.ruhepause',
      severity: 'verstoss',
      reference: '§ 15 KJBG',
      date: day.date,
      actual: day.breakMinutes,
      limit: MINOR_MIN_BREAK_MINUTES,
      message: `Keine zusammenhängende Ruhepause von 30 Minuten bei ${formatDuration(
        day.workMinutes,
      )} h Arbeitszeit — für Jugendliche ist sie spätestens nach 6 Stunden zu gewähren und darf nicht geteilt werden.`,
      messageEn: `No continuous 30-minute rest break with ${formatDuration(
        day.workMinutes,
      )} h of work — young people must get it after 6 hours at the latest, and it may not be split.`,
    };
  }

  if (!hasFullBreak) {
    return {
      code: 'kjbg.ruhepause',
      severity: 'hinweis',
      reference: '§ 15 KJBG',
      date: day.date,
      actual: day.breakMinutes,
      limit: MINOR_MIN_BREAK_MINUTES,
      message: `Ab viereinhalb Stunden besteht Anspruch auf 30 Minuten Ruhepause — bisher sind ${day.breakMinutes} Minuten erfasst.`,
      messageEn: `From four and a half hours of work, a 30-minute rest break is due — so far ${day.breakMinutes} minutes are recorded.`,
    };
  }

  return {
    code: 'kjbg.ruhepause',
    severity: 'ok',
    reference: '§ 15 KJBG',
    date: day.date,
    actual: day.breakMinutes,
    limit: MINOR_MIN_BREAK_MINUTES,
    message: `Ruhepause ${day.breakMinutes} Minuten.`,
    messageEn: `Rest break of ${day.breakMinutes} minutes.`,
  };
}

/** § 17 KJBG — Nachtarbeitsverbot zwischen 20:00 und 06:00. */
export function checkMinorNightBan(day: DayWork): RuleResult | null {
  const start = startMinuteOf(day);
  const end = endMinuteOf(day);
  if (start === null || end === null) return null;

  const tooEarly = start < MINOR_NIGHT_BAN_END;
  const tooLate = end > MINOR_NIGHT_BAN_START;
  if (!tooEarly && !tooLate) return null;

  const teile: string[] = [];
  if (tooEarly) teile.push(`Beginn um ${formatClock(start)}`);
  if (tooLate) teile.push(`Ende um ${formatClock(end)}`);
  const parts: string[] = [];
  if (tooEarly) parts.push(`start at ${formatClock(start)}`);
  if (tooLate) parts.push(`end at ${formatClock(end)}`);

  return {
    code: 'kjbg.nachtarbeit',
    severity: 'verstoss',
    reference: '§ 17 KJBG',
    date: day.date,
    actual: tooLate ? end : start,
    limit: tooLate ? MINOR_NIGHT_BAN_START : MINOR_NIGHT_BAN_END,
    message: `${teile.join(', ')} — Jugendliche dürfen zwischen 20:00 und 06:00 nicht beschäftigt werden.`,
    messageEn: `${parts.join(', ').replace(/^./, (c) => c.toUpperCase())} — young people may not work between 20:00 and 06:00.`,
  };
}

/** § 16 KJBG — ununterbrochene Nachtruhe von zwölf Stunden. */
export function checkMinorNightRest(previousDay: DayWork | null, day: DayWork): RuleResult | null {
  const previousEnd = previousDay?.lastEnd;
  const currentStart = day.firstStart;
  if (!previousEnd || !currentStart) return null;

  const rest = minutesBetween(previousEnd, currentStart);
  if (rest <= 0) return null;

  const short = rest < MINOR_MIN_NIGHT_REST_MINUTES;
  return {
    code: 'kjbg.nachtruhe',
    severity: short ? 'verstoss' : 'ok',
    reference: '§ 16 KJBG',
    date: day.date,
    actual: rest,
    limit: MINOR_MIN_NIGHT_REST_MINUTES,
    message: short
      ? `Nachtruhe ${formatDuration(rest)} h — für Jugendliche sind 12 Stunden vorgeschrieben.`
      : `Nachtruhe ${formatDuration(rest)} h.`,
    messageEn: short
      ? `Night rest of ${formatDuration(rest)} h — young people require 12 hours.`
      : `Night rest of ${formatDuration(rest)} h.`,
  };
}

/** § 11 KJBG — Wochenarbeitszeit von Jugendlichen. */
export function checkMinorWeeklyMaximum(days: readonly DayWork[], weekStart: IsoDate): RuleResult {
  const total = days.reduce((sum, day) => sum + day.workMinutes, 0);

  if (total > MINOR_MAX_WEEKLY_MINUTES) {
    return {
      code: 'kjbg.wochenarbeitszeit',
      severity: 'verstoss',
      reference: '§ 11 KJBG',
      date: weekStart,
      actual: total,
      limit: MINOR_MAX_WEEKLY_MINUTES,
      message: `Wochenarbeitszeit ${formatDuration(total)} h — für Jugendliche sind höchstens 45 Stunden in einzelnen Wochen zulässig.`,
      messageEn: `Weekly working time ${formatDuration(total)} h — young people may work at most 45 hours in individual weeks.`,
    };
  }

  if (total > MINOR_NORMAL_WEEKLY_MINUTES) {
    return {
      code: 'kjbg.wochenarbeitszeit',
      severity: 'hinweis',
      reference: '§ 11 Abs 2 KJBG',
      date: weekStart,
      actual: total,
      limit: MINOR_NORMAL_WEEKLY_MINUTES,
      message: `Wochenarbeitszeit ${formatDuration(total)} h — über 40 Stunden nur bei zulässiger anderer Verteilung.`,
      messageEn: `Weekly working time ${formatDuration(total)} h — more than 40 hours only with a permitted different distribution.`,
    };
  }

  return {
    code: 'kjbg.wochenarbeitszeit',
    severity: 'ok',
    reference: '§ 11 KJBG',
    date: weekStart,
    actual: total,
    limit: MINOR_NORMAL_WEEKLY_MINUTES,
    message: `Wochenarbeitszeit ${formatDuration(total)} h.`,
    messageEn: `Weekly working time ${formatDuration(total)} h.`,
  };
}

/**
 * § 18 f KJBG — Jugendliche haben Anspruch auf zwei zusammenhängende freie
 * Tage, von denen einer der Sonntag sein muss.
 *
 * `days` muss die Woche von Montag bis Sonntag abdecken.
 */
export function checkMinorWeekendRest(days: readonly DayWork[], weekStart: IsoDate): RuleResult {
  const freeDays = days.filter((day) => day.workMinutes === 0).map((day) => day.date);

  const sunday = days.find((day) => weekdayOf(day.date) === 7);
  const sundayFree = sunday ? sunday.workMinutes === 0 : true;

  // Der Samstag ist der Regelfall für den zweiten freien Tag; zulässig ist aber
  // auch der Montag, solange die beiden Tage zusammenhängen.
  const saturday = days.find((day) => weekdayOf(day.date) === 6);
  const saturdayFree = saturday ? saturday.workMinutes === 0 : true;
  const hasPair = sundayFree && saturdayFree;

  if (!sundayFree) {
    return {
      code: 'kjbg.wochenfreizeit',
      severity: 'verstoss',
      reference: '§ 18 KJBG',
      date: sunday?.date ?? weekStart,
      actual: freeDays.length,
      limit: 2,
      message: 'Der Sonntag ist nicht frei — Jugendliche haben Anspruch auf zwei zusammenhängende freie Tage, darunter jedenfalls den Sonntag.',
      messageEn: 'Sunday is not free — young people are entitled to two consecutive days off, which must include Sunday.',
    };
  }

  if (!hasPair) {
    return {
      code: 'kjbg.wochenfreizeit',
      severity: 'verstoss',
      reference: '§ 19 KJBG',
      date: saturday?.date ?? weekStart,
      actual: freeDays.length,
      limit: 2,
      message: 'Nur der Sonntag ist frei — es fehlt der zweite, zusammenhängende freie Tag.',
      messageEn: 'Only Sunday is free — the second consecutive day off is missing.',
    };
  }

  return {
    code: 'kjbg.wochenfreizeit',
    severity: 'ok',
    reference: '§ 18 KJBG',
    date: weekStart,
    actual: freeDays.length,
    limit: 2,
    message: 'Zwei zusammenhängende freie Tage einschließlich Sonntag.',
    messageEn: 'Two consecutive days off including Sunday.',
  };
}

/**
 * § 20 KJBG — Jugendliche dürfen zu Überstunden grundsätzlich nicht
 * herangezogen werden. Der Befund zeigt an, wenn über der Normalarbeitszeit
 * gearbeitet wurde.
 */
export function checkMinorOvertimeBan(weeklyMinutes: Minutes, weekStart: IsoDate): RuleResult | null {
  if (weeklyMinutes <= MINOR_NORMAL_WEEKLY_MINUTES) return null;
  return {
    code: 'kjbg.ueberstundenverbot',
    severity: 'hinweis',
    reference: '§ 20 KJBG',
    date: weekStart,
    actual: weeklyMinutes,
    limit: MINOR_NORMAL_WEEKLY_MINUTES,
    message: `${formatDuration(
      weeklyMinutes - MINOR_NORMAL_WEEKLY_MINUTES,
    )} h über 40 Stunden — Jugendliche dürfen zu Überstunden nur in den engen Ausnahmen des § 20 KJBG herangezogen werden.`,
    messageEn: `${formatDuration(
      weeklyMinutes - MINOR_NORMAL_WEEKLY_MINUTES,
    )} h above 40 hours — young people may only be asked to work overtime within the narrow exceptions of § 20 KJBG.`,
  };
}
