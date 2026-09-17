/**
 * Zusammenführung: aus Rohzeilen wird ein bewerteter Zeitraum.
 *
 * Bewusst ohne React — das ist reine Rechnung und lässt sich so auch für den
 * PDF-Export verwenden, ohne dass eine Komponente im Weg steht.
 */

import {
  aggregateDay,
  accountForDay,
  addDays,
  classifyWeek,
  eachDay,
  emptyDay,
  evaluateDay,
  evaluateWeek,
  holidayInfoOn,
  isoWeek,
  localDateOf,
  startOfIsoWeek,
  type Absence,
  type Contract,
  type DayAccount,
  type DayEvaluation,
  type DayWork,
  type Employee,
  type Holiday,
  type IsoDate,
  type Minutes,
  type RuleResult,
  type TimeSegment,
  type WeekClassification,
  type WeekEvaluation,
} from '@zeiterfassung/legal';
import { contractOn } from './mapping';

export interface TimesheetDay {
  date: IsoDate;
  work: DayWork;
  contract: Contract | null;
  account: DayAccount | null;
  evaluation: DayEvaluation | null;
  absence: Absence | null;
  /** Gesetzlicher Feiertag und, falls das Bundesland passt, Landesfeiertag. */
  holidays: Holiday[];
}

export interface TimesheetWeek {
  weekStart: IsoDate;
  year: number;
  week: number;
  days: TimesheetDay[];
  totalMinutes: Minutes;
  targetMinutes: Minutes;
  balanceMinutes: Minutes;
  classification: WeekClassification | null;
  evaluation: WeekEvaluation | null;
}

export interface BuildTimesheetInput {
  employee: Employee;
  contracts: readonly Contract[];
  segments: readonly TimeSegment[];
  absences: readonly Absence[];
  /** Erster geladener Tag. Sollte einen Tag vor dem angezeigten liegen,
   *  damit die Ruhezeit des ersten Tages messbar ist. */
  from: IsoDate;
  to: IsoDate;
  now?: Date;
}

export interface Timesheet {
  days: TimesheetDay[];
  byDate: Map<IsoDate, TimesheetDay>;
  weeks: TimesheetWeek[];
  /** Wochensummen in zeitlicher Reihenfolge, für den 17-Wochen-Durchschnitt. */
  weeklyTotals: Minutes[];
}

export function buildTimesheet(input: BuildTimesheetInput): Timesheet {
  const { employee, contracts, segments, absences, from, to } = input;
  const now = input.now ?? new Date();
  const today = localDateOf(now);

  const segmentsByDate = new Map<IsoDate, TimeSegment[]>();
  for (const segment of segments) {
    const list = segmentsByDate.get(segment.date);
    if (list) list.push(segment);
    else segmentsByDate.set(segment.date, [segment]);
  }

  const absenceByDate = new Map<IsoDate, Absence>();
  for (const absence of absences) absenceByDate.set(absence.date, absence);

  const days: TimesheetDay[] = [];
  let previousWork: DayWork | null = null;

  for (const date of eachDay(from, to)) {
    const daySegments = segmentsByDate.get(date);
    const work = daySegments ? aggregateDay(date, daySegments, now) : emptyDay(date);
    const contract = contractOn(contracts, date);
    const absence = absenceByDate.get(date) ?? null;

    const account = contract ? accountForDay({ day: work, contract, absence, today }) : null;
    const evaluation = contract
      ? evaluateDay({ employee, contract, day: work, previousDay: previousWork })
      : null;

    days.push({
      date,
      work,
      contract,
      account,
      evaluation,
      absence,
      holidays: holidayInfoOn(date, employee.state),
    });

    // Nur Tage mit Arbeit setzen die Ruhezeit zurück; ein freier Tag dazwischen
    // verlängert sie, statt sie zu unterbrechen.
    if (work.lastEnd) previousWork = work;
  }

  const byDate = new Map(days.map((day) => [day.date, day]));
  const weeks = groupIntoWeeks(days, employee, byDate);

  return {
    days,
    byDate,
    weeks,
    weeklyTotals: weeks.map((week) => week.totalMinutes),
  };
}

function groupIntoWeeks(
  days: readonly TimesheetDay[],
  employee: Employee,
  byDate: Map<IsoDate, TimesheetDay>,
): TimesheetWeek[] {
  const buckets = new Map<IsoDate, TimesheetDay[]>();
  for (const day of days) {
    const start = startOfIsoWeek(day.date);
    const bucket = buckets.get(start);
    if (bucket) bucket.push(day);
    else buckets.set(start, [day]);
  }

  const weekStarts = [...buckets.keys()].sort();
  const weeks: TimesheetWeek[] = [];
  const history: Minutes[] = [];

  for (const weekStart of weekStarts) {
    const weekDays = buckets.get(weekStart)!;
    const totalMinutes = weekDays.reduce((sum, day) => sum + day.work.workMinutes, 0);
    const targetMinutes = weekDays.reduce((sum, day) => sum + (day.account?.targetMinutes ?? 0), 0);
    const balanceMinutes = weekDays.reduce((sum, day) => sum + (day.account?.balanceMinutes ?? 0), 0);

    history.push(totalMinutes);

    // Für die Wochenbewertung zählt der Vertrag, der in dieser Woche galt.
    const contract = weekDays.find((day) => day.contract)?.contract ?? null;
    const workDays = weekDays.map((day) => day.work);

    // Die Wochenruhe reicht über die Wochengrenze: Freitag der Woche bis
    // Dienstag der Folgewoche. Was davon nicht geladen ist, fehlt schlicht —
    // die Prüfung bleibt dann konservativ.
    const surrounding: DayWork[] = [];
    for (let offset = 4; offset <= 8; offset += 1) {
      const date = addDays(weekStart, offset);
      const found = byDate.get(date);
      if (found) surrounding.push(found.work);
    }

    const { year, week } = isoWeek(weekStart);

    weeks.push({
      weekStart,
      year,
      week,
      days: weekDays,
      totalMinutes,
      targetMinutes,
      balanceMinutes,
      classification: contract ? classifyWeek(workDays, contract) : null,
      evaluation: contract
        ? evaluateWeek({
            employee,
            contract,
            days: workDays,
            surroundingDays: surrounding.length > 0 ? surrounding : workDays,
            weeklyHistoryMinutes: [...history],
          })
        : null,
    });
  }

  return weeks;
}

/** Alle Befunde eines Zeitraums, Verstöße zuerst. */
export function collectFindings(timesheet: Timesheet): RuleResult[] {
  const findings: RuleResult[] = [];
  for (const day of timesheet.days) findings.push(...(day.evaluation?.findings ?? []));
  for (const week of timesheet.weeks) findings.push(...(week.evaluation?.findings ?? []));

  const rank = (result: RuleResult) => (result.severity === 'verstoss' ? 0 : 1);
  return findings.sort((a, b) => rank(a) - rank(b) || (a.date ?? '').localeCompare(b.date ?? ''));
}

export function sumBalance(days: readonly TimesheetDay[]): Minutes {
  return days.reduce((sum, day) => sum + (day.account?.balanceMinutes ?? 0), 0);
}
