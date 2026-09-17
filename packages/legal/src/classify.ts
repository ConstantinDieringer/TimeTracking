/**
 * Zuordnung der geleisteten Zeit: Normalarbeitszeit, Mehrarbeit, Überstunde.
 *
 * Das ist die fehleranfälligste Rechnung im ganzen Paket, weil zwei
 * verschiedene Bezugsgrößen zusammenspielen:
 *
 *   - Die **vereinbarte** Arbeitszeit dieser Person (bei Teilzeit etwa 20 h).
 *   - Die **kollektivvertragliche** Normalarbeitszeit des Betriebs (38,5 oder 40 h).
 *
 * Zeit über der vereinbarten, aber unter der kollektivvertraglichen ist
 * **Mehrarbeit** nach § 19d AZG mit 25 %. Erst darüber beginnt die
 * **Überstunde** nach § 10 AZG mit 50 %. Wer beides gleichsetzt, zahlt
 * Teilzeitkräften entweder zu viel oder zu wenig.
 *
 * Unabhängig davon entsteht eine Überstunde auch dann, wenn an einem einzelnen
 * Tag die tägliche Normalarbeitszeit überschritten wird — selbst wenn die
 * Woche insgesamt darunter bleibt.
 */

import { NORMAL_DAILY_MINUTES } from './azg.js';
import { flexDailyNormalLimit } from './gleitzeit.js';
import { DEFAULT_SURCHARGE_RATES, type SurchargeRates } from './settings.js';
import { weekdayOf } from './time.js';
import type { DayWork } from './work.js';
import type { Contract, Minutes, Weekday } from './types.js';

/** § 4 AZG — bei anderer Verteilung sind bis zu zehn Stunden Normalarbeitszeit möglich. */
const MAX_DISTRIBUTED_DAILY_NORMAL: Minutes = 10 * 60;

export interface DayClassification {
  date: string;
  workedMinutes: Minutes;
  /** Obergrenze der täglichen Normalarbeitszeit für diesen Tag. */
  dailyNormalLimit: Minutes;
  /** Zeit innerhalb der täglichen Normalarbeitszeit. */
  withinDailyNormal: Minutes;
  /** Zeit über der täglichen Normalarbeitszeit — jedenfalls Überstunde. */
  dailyOvertime: Minutes;
}

export interface WeekClassification {
  normalMinutes: Minutes;
  /** § 19d AZG — nur bei Teilzeit möglich. */
  mehrarbeitMinutes: Minutes;
  /** § 10 AZG. */
  ueberstundenMinutes: Minutes;
  /** Zuschlag als Zeitwert, für Zeitausgleich: Mehrarbeit × 25 %. */
  mehrarbeitSurchargeMinutes: Minutes;
  /** Zuschlag als Zeitwert: Überstunden × 50 %, also Ausgleich 1 : 1,5. */
  ueberstundenSurchargeMinutes: Minutes;
  /**
   * Bei Gleitzeit entfällt der Mehrarbeitszuschlag innerhalb der Periode, weil
   * die Mehrleistung durch Gleiten wieder abgebaut wird (§ 19d Abs 3b Z 1 AZG).
   */
  mehrarbeitSurchargeWaived: boolean;
  /** Bei All-in sind Überstunden pauschal abgegolten — erfasst werden sie trotzdem. */
  coveredByAllIn: boolean;
  days: DayClassification[];
  totalMinutes: Minutes;
}

/**
 * Die tägliche Normalarbeitszeit für diesen Vertrag an diesem Wochentag.
 *
 * Ohne Gleitzeit sind es acht Stunden, bei abweichender Verteilung — etwa
 * einer Viertagewoche — bis zu zehn. Mit Gleitzeit entscheidet § 4b Abs 4.
 */
export function dailyNormalLimitFor(contract: Contract, date: string): Minutes {
  if (contract.flexTime) return flexDailyNormalLimit(contract.flexTime);
  const target = contract.dailyTargetMinutes[weekdayOf(date)] ?? 0;
  return Math.min(MAX_DISTRIBUTED_DAILY_NORMAL, Math.max(NORMAL_DAILY_MINUTES, target));
}

/**
 * Die gängigen kollektivvertraglichen Normalarbeitszeiten in Österreich.
 *
 * Nicht der vereinbarten Arbeitszeit einer Person zu verwechseln: dieser Wert
 * gehört dem Betrieb und trennt Mehrarbeit (§ 19d AZG, 25 %) von Überstunde
 * (§ 10 AZG, 50 %). Gibt es keinen Kollektivvertrag, gelten die 40 Stunden
 * des § 3 AZG.
 */
export const COMMON_COLLECTIVE_WEEKLY_HOURS = [38.5, 40] as const;

/**
 * Verteilt eine Wochenarbeitszeit gleichmäßig auf Montag bis Freitag.
 *
 * Nur ein Vorschlag für den Regelfall der Fünftagewoche — eine abweichende
 * Verteilung nach § 4 AZG bleibt jederzeit von Hand einstellbar. Ein Rest aus
 * der Division wird auf die ersten Tage verteilt, damit die Summe exakt der
 * Wochenarbeitszeit entspricht und nicht durch Rundung daneben liegt.
 */
export function defaultDailyTargets(weeklyHours: number): Record<Weekday, Minutes> {
  const total = Math.round(weeklyHours * 60);
  const base = Math.floor(total / 5);
  const remainder = total - base * 5;

  const targets = [1, 2, 3, 4, 5].map((_, index) => base + (index < remainder ? 1 : 0));

  return {
    1: targets[0]!,
    2: targets[1]!,
    3: targets[2]!,
    4: targets[3]!,
    5: targets[4]!,
    6: 0,
    7: 0,
  };
}

export function classifyDay(day: DayWork, contract: Contract): DayClassification {
  const dailyNormalLimit = dailyNormalLimitFor(contract, day.date);
  const dailyOvertime = Math.max(0, day.workMinutes - dailyNormalLimit);
  return {
    date: day.date,
    workedMinutes: day.workMinutes,
    dailyNormalLimit,
    withinDailyNormal: day.workMinutes - dailyOvertime,
    dailyOvertime,
  };
}

/**
 * Zuordnung für eine Kalenderwoche.
 *
 * `days` sind Montag bis Sonntag. Zuerst wird tageweise abgeschichtet, was
 * schon durch Überschreiten der Tagesgrenze Überstunde ist; der Rest wird
 * anschließend gegen die Wochengrenzen gehalten.
 */
export function classifyWeek(
  days: readonly DayWork[],
  contract: Contract,
  rates: SurchargeRates = DEFAULT_SURCHARGE_RATES,
): WeekClassification {
  const classified = days.map((day) => classifyDay(day, contract));

  const dailyOvertime = classified.reduce((sum, day) => sum + day.dailyOvertime, 0);
  const withinDailyNormal = classified.reduce((sum, day) => sum + day.withinDailyNormal, 0);

  const agreedWeekly = Math.round(contract.weeklyHours * 60);
  const collectiveWeekly = Math.round(contract.collectiveWeeklyHours * 60);
  // Bei Vollzeit fallen beide Grenzen zusammen, dann bleibt für Mehrarbeit
  // von vornherein kein Raum.
  const mehrarbeitRoom = Math.max(0, collectiveWeekly - agreedWeekly);

  const normalMinutes = Math.min(withinDailyNormal, agreedWeekly);
  const aboveAgreed = Math.max(0, withinDailyNormal - agreedWeekly);
  const mehrarbeitMinutes = Math.min(aboveAgreed, mehrarbeitRoom);
  const weeklyOvertime = aboveAgreed - mehrarbeitMinutes;
  const ueberstundenMinutes = dailyOvertime + weeklyOvertime;

  // § 19d Abs 3b Z 1 AZG: bei Gleitzeit fällt innerhalb der Gleitzeitperiode
  // kein Mehrarbeitszuschlag an, weil das Guthaben wieder abgebaut wird.
  const mehrarbeitSurchargeWaived = contract.flexTime !== null;

  return {
    normalMinutes,
    mehrarbeitMinutes,
    ueberstundenMinutes,
    mehrarbeitSurchargeMinutes: mehrarbeitSurchargeWaived
      ? 0
      : Math.round(mehrarbeitMinutes * rates.mehrarbeit),
    ueberstundenSurchargeMinutes: Math.round(ueberstundenMinutes * rates.ueberstunde),
    mehrarbeitSurchargeWaived,
    coveredByAllIn: contract.allIn,
    days: classified,
    totalMinutes: withinDailyNormal + dailyOvertime,
  };
}

/** Summiert mehrere Wochen zu einer Auswertung. */
export function sumClassifications(weeks: readonly WeekClassification[]): {
  normalMinutes: Minutes;
  mehrarbeitMinutes: Minutes;
  ueberstundenMinutes: Minutes;
  mehrarbeitSurchargeMinutes: Minutes;
  ueberstundenSurchargeMinutes: Minutes;
  totalMinutes: Minutes;
} {
  return weeks.reduce(
    (sum, week) => ({
      normalMinutes: sum.normalMinutes + week.normalMinutes,
      mehrarbeitMinutes: sum.mehrarbeitMinutes + week.mehrarbeitMinutes,
      ueberstundenMinutes: sum.ueberstundenMinutes + week.ueberstundenMinutes,
      mehrarbeitSurchargeMinutes: sum.mehrarbeitSurchargeMinutes + week.mehrarbeitSurchargeMinutes,
      ueberstundenSurchargeMinutes:
        sum.ueberstundenSurchargeMinutes + week.ueberstundenSurchargeMinutes,
      totalMinutes: sum.totalMinutes + week.totalMinutes,
    }),
    {
      normalMinutes: 0,
      mehrarbeitMinutes: 0,
      ueberstundenMinutes: 0,
      mehrarbeitSurchargeMinutes: 0,
      ueberstundenSurchargeMinutes: 0,
      totalMinutes: 0,
    },
  );
}
