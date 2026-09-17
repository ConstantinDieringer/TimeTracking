/**
 * Auswahl des anwendbaren Regelwerks.
 *
 * Welches Gesetz gilt, hängt vom Tag ab, nicht vom Mitarbeiter: das Alter
 * entscheidet zwischen KJBG und AZG, der am jeweiligen Tag gültige Vertrag
 * über die Ausnahmen. Diese Datei trifft die Auswahl an einer einzigen Stelle,
 * damit keine Ansicht sie versehentlich anders trifft.
 */

import {
  checkBreak,
  checkDailyMaximum,
  checkDailyRest,
  checkNightWork,
  checkSeventeenWeekAverage,
  checkSpan,
  checkWeeklyMaximum,
} from './azg.js';
import { checkHolidayRest, checkWeeklyRest } from './arg.js';
import { checkFlexCarry, checkFlexDailyLimit, checkFlexFrame } from './gleitzeit.js';
import {
  checkMinorBreak,
  checkMinorDailyMaximum,
  checkMinorNightBan,
  checkMinorNightRest,
  checkMinorOvertimeBan,
  checkMinorWeekendRest,
  checkMinorWeeklyMaximum,
} from './kjbg.js';
import { addDays, weekdayOf } from './time.js';
import { isMinorOn, type DayWork } from './work.js';
import type { Contract, Employee, IsoDate, Minutes, RuleResult } from './types.js';

/** Welches Regelwerk an diesem Tag für diese Person gilt. */
export type Regime = 'azg' | 'kjbg' | 'ausgenommen';

export function regimeFor(employee: Employee, contract: Contract, date: IsoDate): Regime {
  if (isMinorOn(employee, date)) return 'kjbg';
  if (contract.exemptFromAzg) return 'ausgenommen';
  if (contract.category === 'leitend') return 'ausgenommen';
  // Freie Dienstnehmer sind keine Arbeitnehmer im Sinne des AZG; die Zeiten
  // werden erfasst, die Arbeitszeitgrenzen gelten für sie aber nicht.
  if (contract.category === 'freier_dienstnehmer') return 'ausgenommen';
  return 'azg';
}

export interface DayEvaluation {
  date: IsoDate;
  regime: Regime;
  results: RuleResult[];
  /** Nur die Befunde, die tatsächlich etwas zu melden haben. */
  findings: RuleResult[];
  worstSeverity: RuleResult['severity'];
}

export interface DayEvaluationInput {
  employee: Employee;
  contract: Contract;
  day: DayWork;
  /** Der vorhergehende Tag, für die Ruhezeit. */
  previousDay: DayWork | null;
  /** Aktueller Gleitzeitsaldo, für die Übertragsprüfung. */
  flexBalanceMinutes?: Minutes;
}

export function evaluateDay(input: DayEvaluationInput): DayEvaluation {
  const { employee, contract, day, previousDay } = input;
  const regime = regimeFor(employee, contract, day.date);
  const results: RuleResult[] = [];

  if (regime === 'ausgenommen') {
    return {
      date: day.date,
      regime,
      results: [],
      findings: [],
      worstSeverity: 'ok',
    };
  }

  if (regime === 'kjbg') {
    results.push(checkMinorDailyMaximum(day));
    results.push(checkMinorBreak(day));
    push(results, checkMinorNightBan(day));
    push(results, checkMinorNightRest(previousDay, day));
  } else {
    results.push(checkDailyMaximum(day));
    results.push(checkBreak(day));
    push(results, checkDailyRest(previousDay, day));
    push(results, checkNightWork(day, contract));
    push(results, checkSpan(day));
    push(results, checkFlexDailyLimit(day, contract));
    push(results, checkFlexFrame(day, contract));
    if (input.flexBalanceMinutes !== undefined) {
      push(results, checkFlexCarry(input.flexBalanceMinutes, contract, day.date));
    }
  }

  push(results, checkHolidayRest(day));

  const findings = results.filter((result) => result.severity !== 'ok');
  return {
    date: day.date,
    regime,
    results,
    findings,
    worstSeverity: worstOf(results),
  };
}

export interface WeekEvaluationInput {
  employee: Employee;
  contract: Contract;
  /** Montag bis Sonntag, sieben Einträge. */
  days: readonly DayWork[];
  /**
   * Für die Wochenruhe wird über die Wochengrenze hinaus geschaut — Freitag der
   * Vorwoche bis Dienstag der Folgewoche.
   */
  surroundingDays?: readonly DayWork[];
  /**
   * Wochensummen in zeitlicher Reihenfolge bis einschließlich dieser Woche,
   * für den Durchschnitt über 17 Wochen.
   */
  weeklyHistoryMinutes?: readonly Minutes[];
}

export interface WeekEvaluation {
  weekStart: IsoDate;
  regime: Regime;
  results: RuleResult[];
  findings: RuleResult[];
  worstSeverity: RuleResult['severity'];
  totalMinutes: Minutes;
}

export function evaluateWeek(input: WeekEvaluationInput): WeekEvaluation {
  const { employee, contract, days } = input;
  const weekStart = days[0]?.date ?? '';
  const regime = regimeFor(employee, contract, weekStart);
  const totalMinutes = days.reduce((sum, day) => sum + day.workMinutes, 0);

  if (regime === 'ausgenommen') {
    return { weekStart, regime, results: [], findings: [], worstSeverity: 'ok', totalMinutes };
  }

  const results: RuleResult[] = [];

  if (regime === 'kjbg') {
    results.push(checkMinorWeeklyMaximum(days, weekStart));
    results.push(checkMinorWeekendRest(days, weekStart));
    push(results, checkMinorOvertimeBan(totalMinutes, weekStart));
  } else {
    results.push(checkWeeklyMaximum(days, weekStart));
    if (input.weeklyHistoryMinutes) {
      results.push(checkSeventeenWeekAverage(input.weeklyHistoryMinutes, weekStart));
    }
    const sunday = days.find((day) => weekdayOf(day.date) === 7)?.date ?? addDays(weekStart, 6);
    results.push(checkWeeklyRest(input.surroundingDays ?? days, sunday));
  }

  const findings = results.filter((result) => result.severity !== 'ok');
  return {
    weekStart,
    regime,
    results,
    findings,
    worstSeverity: worstOf(results),
    totalMinutes,
  };
}

function push(target: RuleResult[], result: RuleResult | null): void {
  if (result) target.push(result);
}

const SEVERITY_ORDER: Record<RuleResult['severity'], number> = {
  ok: 0,
  hinweis: 1,
  verstoss: 2,
};

export function worstOf(results: readonly RuleResult[]): RuleResult['severity'] {
  let worst: RuleResult['severity'] = 'ok';
  for (const result of results) {
    if (SEVERITY_ORDER[result.severity] > SEVERITY_ORDER[worst]) worst = result.severity;
  }
  return worst;
}
