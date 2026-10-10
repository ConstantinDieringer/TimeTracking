/**
 * Verdichtung der erfassten Segmente zu einem Arbeitstag.
 *
 * Alle Regelprüfungen arbeiten auf dem Ergebnis dieser Datei, nicht auf den
 * rohen Segmenten. Das hält die Gesetzesmodule frei von Aufbereitungslogik.
 */

import { atLocalTime, localDateOf, localMinutesOfDay, minutesBetween, parseIsoDate } from './time.js';
import type { Employee, IsoDate, Minutes, SegmentKind, TimeSegment } from './types.js';

/** Nachtarbeit im Sinne des § 12a AZG liegt zwischen 22:00 und 05:00. */
export const NIGHT_WINDOW_START: Minutes = 22 * 60;
export const NIGHT_WINDOW_END: Minutes = 5 * 60;

export interface Interval {
  /** Die Kennung des zugrunde liegenden Segments, sofern es gespeichert ist. */
  id?: string;
  start: Date;
  end: Date;
  kind: SegmentKind;
  source: TimeSegment['source'];
}

export interface DayWork {
  date: IsoDate;
  /** Arbeitszeit im Sinne des AZG, ohne Ruhepausen. */
  workMinutes: Minutes;
  /** Alles, was tatsächlich Unterbrechung war: erfasste Pausen und Lücken. */
  breakMinutes: Minutes;
  /** Nur die ausdrücklich als Pause erfassten Minuten — so verlangt es § 26 AZG. */
  trackedBreakMinutes: Minutes;
  travelMinutes: Minutes;
  onCallMinutes: Minutes;
  /** Nachtarbeit zwischen 22:00 und 05:00. */
  nightMinutes: Minutes;
  /** Erster Arbeitsbeginn und letztes Arbeitsende des Tages. */
  firstStart: Date | null;
  lastEnd: Date | null;
  /** Von Arbeitsbeginn bis Arbeitsende, einschließlich aller Pausen. */
  spanMinutes: Minutes;
  /** Die einzelnen Unterbrechungen, für die Teilungsregel des § 11 AZG. */
  breakPieces: Minutes[];
  /** Unterbrechungen, die nicht als Pause erfasst, sondern nur Lücken sind. */
  untrackedGapMinutes: Minutes;
  /** Es läuft noch ein Segment ohne Ende — der Tag ist nicht abgeschlossen. */
  open: boolean;
  intervals: Interval[];
}

export interface SegmentProblem {
  code: 'ende_vor_beginn' | 'ueberlappung' | 'ohne_ende';
  message: string;
  messageEn: string;
  segment: TimeSegment;
}

/**
 * Prüft die Rohdaten, bevor irgendetwas gerechnet wird. Überlappende Segmente
 * würden Arbeitszeit doppelt zählen und damit jede spätere Grenze verfälschen.
 */
export function validateSegments(segments: readonly TimeSegment[]): SegmentProblem[] {
  const problems: SegmentProblem[] = [];
  const closed: Array<{ segment: TimeSegment; start: number; end: number }> = [];

  for (const segment of segments) {
    if (segment.end === null) {
      problems.push({
        code: 'ohne_ende',
        message: 'Das Segment hat kein Ende — es wurde vermutlich nicht ausgestempelt.',
        messageEn: 'The segment has no end — probably nobody clocked out.',
        segment,
      });
      continue;
    }
    const start = new Date(segment.start).getTime();
    const end = new Date(segment.end).getTime();
    if (end <= start) {
      problems.push({
        code: 'ende_vor_beginn',
        message: 'Das Ende liegt vor dem Beginn oder gleichauf.',
        messageEn: 'The end is before or equal to the start.',
        segment,
      });
      continue;
    }
    closed.push({ segment, start, end });
  }

  closed.sort((a, b) => a.start - b.start);
  for (let i = 1; i < closed.length; i += 1) {
    const previous = closed[i - 1]!;
    const current = closed[i]!;
    if (current.start < previous.end) {
      problems.push({
        code: 'ueberlappung',
        message: 'Das Segment überschneidet sich mit dem vorhergehenden.',
        messageEn: 'The segment overlaps with the previous one.',
        segment: current.segment,
      });
    }
  }

  return problems;
}

/** Minuten, die dieses Intervall im Nachtfenster 22:00–05:00 liegt. */
export function nightMinutesOf(start: Date, end: Date): Minutes {
  let minutes = 0;
  // Minutenweise auszuwerten wäre zu langsam; stattdessen tageweise die
  // beiden Nachtabschnitte schneiden.
  const firstDay = localDateOf(start);
  const lastDay = localDateOf(new Date(end.getTime() - 1));

  for (
    let day = firstDay;
    day <= lastDay;
    day = nextDay(day)
  ) {
    // 00:00–05:00 dieses Tages
    minutes += overlap(start, end, atLocalTime(day, 0), atLocalTime(day, NIGHT_WINDOW_END));
    // 22:00–24:00 dieses Tages
    minutes += overlap(start, end, atLocalTime(day, NIGHT_WINDOW_START), atLocalTime(day, 24 * 60));
  }
  return minutes;
}

function nextDay(date: IsoDate): IsoDate {
  const { year, month, day } = parseIsoDate(date);
  const value = new Date(Date.UTC(year, month - 1, day + 1));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(
    value.getUTCDate(),
  ).padStart(2, '0')}`;
}

function overlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): Minutes {
  const start = Math.max(aStart.getTime(), bStart.getTime());
  const end = Math.min(aEnd.getTime(), bEnd.getTime());
  return end > start ? Math.round((end - start) / 60_000) : 0;
}

const COUNTS_AS_WORK: Record<SegmentKind, boolean> = {
  work: true,
  break: false,
  // Reisezeit wird getrennt geführt: ob sie Arbeitszeit ist, richtet sich nach
  // dem Kollektivvertrag. Sie fließt deshalb nicht automatisch in die Grenzen ein.
  travel: false,
  oncall: false,
};

/**
 * Verdichtet die Segmente eines Tages.
 *
 * `now` wird nur gebraucht, solange noch gestempelt wird: ein Segment ohne Ende
 * zählt bis zu diesem Zeitpunkt, damit die laufende Dauer in der Oberfläche
 * mitwächst und Warnungen schon während des Tages greifen.
 */
export function aggregateDay(
  date: IsoDate,
  segments: readonly TimeSegment[],
  now: Date = new Date(),
): DayWork {
  const intervals: Interval[] = [];
  let open = false;

  for (const segment of segments) {
    const start = new Date(segment.start);
    const end = segment.end === null ? now : new Date(segment.end);
    if (segment.end === null) open = true;
    if (end.getTime() <= start.getTime()) continue;
    intervals.push({ id: segment.id, start, end, kind: segment.kind, source: segment.source });
  }

  intervals.sort((a, b) => a.start.getTime() - b.start.getTime());

  let workMinutes = 0;
  let trackedBreakMinutes = 0;
  let travelMinutes = 0;
  let onCallMinutes = 0;
  let nightMinutes = 0;

  for (const interval of intervals) {
    const duration = minutesBetween(interval.start, interval.end);
    switch (interval.kind) {
      case 'work':
        workMinutes += duration;
        nightMinutes += nightMinutesOf(interval.start, interval.end);
        break;
      case 'break':
        trackedBreakMinutes += duration;
        break;
      case 'travel':
        travelMinutes += duration;
        break;
      case 'oncall':
        onCallMinutes += duration;
        break;
    }
  }

  const workIntervals = intervals.filter((interval) => COUNTS_AS_WORK[interval.kind]);
  const firstStart = workIntervals[0]?.start ?? null;
  const lastEnd = workIntervals.length > 0 ? workIntervals[workIntervals.length - 1]!.end : null;
  const spanMinutes = firstStart && lastEnd ? minutesBetween(firstStart, lastEnd) : 0;

  // Die Teilungsregel des § 11 AZG bemisst sich an den einzelnen
  // Unterbrechungen. Eine Lücke zwischen zwei Arbeitssegmenten ist faktisch
  // eine Pause, auch wenn sie niemand als solche erfasst hat — sonst würde ein
  // Tag ohne erfasste Pause fälschlich als Verstoß gelten.
  const breakPieces: Minutes[] = [];
  let untrackedGapMinutes = 0;

  for (let i = 1; i < workIntervals.length; i += 1) {
    const gapStart = workIntervals[i - 1]!.end;
    const gapEnd = workIntervals[i]!.start;
    const gap = minutesBetween(gapStart, gapEnd);
    if (gap <= 0) continue;

    const trackedInGap = intervals
      .filter((interval) => interval.kind === 'break')
      .reduce((sum, interval) => sum + overlap(gapStart, gapEnd, interval.start, interval.end), 0);

    breakPieces.push(gap);
    untrackedGapMinutes += Math.max(0, gap - trackedInGap);
  }

  return {
    date,
    workMinutes,
    breakMinutes: breakPieces.reduce((sum, piece) => sum + piece, 0),
    trackedBreakMinutes,
    travelMinutes,
    onCallMinutes,
    nightMinutes,
    firstStart,
    lastEnd,
    spanMinutes,
    breakPieces,
    untrackedGapMinutes,
    open,
    intervals,
  };
}

/** Ein Tag ohne jede Erfassung. */
export function emptyDay(date: IsoDate): DayWork {
  return {
    date,
    workMinutes: 0,
    breakMinutes: 0,
    trackedBreakMinutes: 0,
    travelMinutes: 0,
    onCallMinutes: 0,
    nightMinutes: 0,
    firstStart: null,
    lastEnd: null,
    spanMinutes: 0,
    breakPieces: [],
    untrackedGapMinutes: 0,
    open: false,
    intervals: [],
  };
}

/** Uhrzeit des Arbeitsbeginns in Minuten seit Mitternacht, oder `null`. */
export function startMinuteOf(day: DayWork): Minutes | null {
  return day.firstStart ? localMinutesOfDay(day.firstStart) : null;
}

/** Uhrzeit des Arbeitsendes in Minuten seit Mitternacht, oder `null`. */
export function endMinuteOf(day: DayWork): Minutes | null {
  return day.lastEnd ? localMinutesOfDay(day.lastEnd) : null;
}

/**
 * Vollendetes Lebensalter an einem Stichtag.
 *
 * Entscheidet, ob am jeweiligen Tag das KJBG oder das AZG greift. Bewusst aus
 * dem Geburtsdatum abgeleitet statt aus einem Häkchen — sonst bliebe ein
 * Lehrling nach dem 18. Geburtstag weiter unter dem strengeren Regime oder,
 * schlimmer, ein Minderjähriger unter dem laxeren.
 */
export function ageOn(birthDate: IsoDate, date: IsoDate): number {
  const birth = parseIsoDate(birthDate);
  const reference = parseIsoDate(date);
  let age = reference.year - birth.year;
  const hadBirthday =
    reference.month > birth.month ||
    (reference.month === birth.month && reference.day >= birth.day);
  if (!hadBirthday) age -= 1;
  return age;
}

/** Gilt für diese Person an diesem Tag das KJBG? */
export function isMinorOn(employee: Employee, date: IsoDate): boolean {
  if (!employee.birthDate) return false;
  return ageOn(employee.birthDate, date) < 18;
}
