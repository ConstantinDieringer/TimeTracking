/**
 * Gleitende Arbeitszeit, § 4b AZG.
 *
 * Der entscheidende Punkt, an dem in der Praxis am häufigsten falsch gerechnet
 * wird, steht in § 4b Abs 4: die tägliche Normalarbeitszeit darf bei Gleitzeit
 * zehn Stunden nicht überschreiten. **Zwölf** Stunden sind nur dann
 * Normalarbeitszeit, wenn die Gleitzeitvereinbarung
 *
 *   a) den ganztägigen Verbrauch von Zeitguthaben vorsieht und
 *   b) ihn im Zusammenhang mit einer wöchentlichen Ruhezeit nicht ausschließt.
 *
 * Fehlt auch nur eine der beiden Bedingungen, ist die elfte Stunde keine
 * Normalarbeitszeit mehr, sondern Überstunde mit 50 % Zuschlag. Das Tool
 * erfragt die Bedingung beim Anlegen der Vereinbarung und lässt die höhere
 * Grenze nur dann zu.
 */

import {
  addDays,
  addMonths,
  compareDates,
  daysBetween,
  formatClock,
  formatDateShort,
  formatDuration,
} from './time.js';
import { endMinuteOf, startMinuteOf, type DayWork } from './work.js';
import type { Contract, FlexTimeAgreement, IsoDate, Minutes, RuleResult } from './types.js';

/** § 4b Abs 4 AZG: Regelgrenze der täglichen Normalarbeitszeit bei Gleitzeit. */
export const FLEX_DAILY_NORMAL_MINUTES: Minutes = 10 * 60;
/** § 4b Abs 4 AZG: erhöhte Grenze, nur bei ganztägiger Verbrauchsmöglichkeit. */
export const FLEX_DAILY_EXTENDED_MINUTES: Minutes = 12 * 60;

/**
 * Die Obergrenze der täglichen Normalarbeitszeit für diesen Vertrag.
 *
 * Alles darüber ist Überstunde — auch dann, wenn die Person in Gleitzeit
 * arbeitet und der Saldo es rechnerisch hergäbe.
 */
export function flexDailyNormalLimit(agreement: FlexTimeAgreement | null): Minutes {
  if (!agreement) return FLEX_DAILY_NORMAL_MINUTES;
  return agreement.allowsFullDayCompensation
    ? FLEX_DAILY_EXTENDED_MINUTES
    : FLEX_DAILY_NORMAL_MINUTES;
}

export interface FlexPeriod {
  start: IsoDate;
  /** Letzter Tag der Periode, einschließlich. */
  end: IsoDate;
  index: number;
}

/** Die Gleitzeitperiode, in die dieser Tag fällt. */
export function flexPeriodFor(agreement: FlexTimeAgreement, date: IsoDate): FlexPeriod {
  const months = Math.max(1, Math.round(agreement.periodMonths));

  // Vom Anker aus in Periodenschritten vor- oder zurückgehen, bis der Tag
  // eingeschlossen ist. Bei üblichen Periodenlängen sind das wenige Schritte.
  let index = 0;
  let start = agreement.periodAnchor;

  if (compareDates(date, start) < 0) {
    while (compareDates(date, start) < 0) {
      index -= 1;
      start = addMonths(agreement.periodAnchor, index * months);
    }
  } else {
    let next = addMonths(agreement.periodAnchor, months);
    while (compareDates(date, next) >= 0) {
      index += 1;
      start = next;
      next = addMonths(agreement.periodAnchor, (index + 1) * months);
    }
  }

  const end = addDays(addMonths(agreement.periodAnchor, (index + 1) * months), -1);
  return { start, end, index };
}

/**
 * § 4b Abs 4 AZG — Obergrenze der täglichen Normalarbeitszeit.
 *
 * Meldet ausdrücklich, wenn die zehnte Stunde überschritten wird, ohne dass
 * die Vereinbarung die erhöhte Grenze trägt. Das ist kein Verstoß gegen die
 * Arbeitszeit — zwölf Stunden bleiben nach § 9 AZG zulässig —, wohl aber ein
 * Fehler in der Zuordnung, der Zuschläge kostet.
 */
export function checkFlexDailyLimit(day: DayWork, contract: Contract): RuleResult | null {
  const agreement = contract.flexTime;
  if (!agreement) return null;

  const limit = flexDailyNormalLimit(agreement);
  if (day.workMinutes <= limit) return null;

  if (!agreement.allowsFullDayCompensation) {
    return {
      code: 'gleitzeit.normalarbeitszeit',
      severity: 'hinweis',
      reference: '§ 4b Abs 4 AZG',
      date: day.date,
      actual: day.workMinutes,
      limit,
      message: `${formatDuration(
        day.workMinutes - limit,
      )} h über der zehnten Stunde — die Gleitzeitvereinbarung sieht keinen ganztägigen Verbrauch von Zeitguthaben vor, diese Zeit ist daher Überstunde mit 50 % Zuschlag und keine Normalarbeitszeit.`,
      messageEn: `${formatDuration(
        day.workMinutes - limit,
      )} h beyond the tenth hour — the flexitime agreement does not allow taking whole days off from the time credit, so this time is overtime with a 50 % premium, not normal working time.`,
    };
  }

  return {
    code: 'gleitzeit.normalarbeitszeit',
    severity: 'hinweis',
    reference: '§ 4b Abs 4 AZG',
    date: day.date,
    actual: day.workMinutes,
    limit,
    message: `${formatDuration(
      day.workMinutes - limit,
    )} h über der zwölften Stunde — darüber hinaus ist keine Normalarbeitszeit mehr möglich.`,
    messageEn: `${formatDuration(
      day.workMinutes - limit,
    )} h beyond the twelfth hour — no further normal working time is possible.`,
  };
}

/**
 * § 4b Abs 2 Z 2 AZG — der Gleitzeitrahmen begrenzt, wann gearbeitet werden
 * darf. Arbeit außerhalb ist keine Gleitzeit und daher gesondert zu vereinbaren.
 */
export function checkFlexFrame(day: DayWork, contract: Contract): RuleResult | null {
  const agreement = contract.flexTime;
  if (!agreement) return null;

  const start = startMinuteOf(day);
  const end = endMinuteOf(day);
  if (start === null || end === null) return null;

  const frameStart = toMinutes(agreement.frameStart);
  const frameEnd = toMinutes(agreement.frameEnd);

  const beforeFrame = start < frameStart;
  const afterFrame = end > frameEnd;
  if (!beforeFrame && !afterFrame) return null;

  const teile: string[] = [];
  if (beforeFrame) teile.push(`Beginn um ${formatClock(start)} vor ${agreement.frameStart}`);
  if (afterFrame) teile.push(`Ende um ${formatClock(end)} nach ${agreement.frameEnd}`);
  const parts: string[] = [];
  if (beforeFrame) parts.push(`Start at ${formatClock(start)} before ${agreement.frameStart}`);
  if (afterFrame) parts.push(`${beforeFrame ? 'end' : 'End'} at ${formatClock(end)} after ${agreement.frameEnd}`);

  return {
    code: 'gleitzeit.rahmen',
    severity: 'hinweis',
    reference: '§ 4b Abs 2 Z 2 AZG',
    date: day.date,
    actual: afterFrame ? end : start,
    limit: afterFrame ? frameEnd : frameStart,
    message: `${teile.join(', ')} — außerhalb des vereinbarten Gleitzeitrahmens.`,
    messageEn: `${parts.join(', ')} — outside the agreed flexitime frame.`,
  };
}

function toMinutes(hhmm: string): Minutes {
  const [hours, minutes] = hhmm.split(':').map(Number) as [number, number];
  return hours * 60 + minutes;
}

/**
 * § 4b Abs 2 Z 3 AZG — die Vereinbarung muss das Höchstausmaß der
 * Übertragungsmöglichkeit von Zeitguthaben und Zeitschulden festlegen.
 *
 * Geprüft wird laufend, nicht erst am Periodenende: ein Guthaben, das zwei
 * Wochen vor Periodenende bereits über der Grenze liegt, lässt sich noch
 * abbauen; am letzten Tag nicht mehr.
 */
export function checkFlexCarry(
  balanceMinutes: Minutes,
  contract: Contract,
  date: IsoDate,
): RuleResult | null {
  const agreement = contract.flexTime;
  if (!agreement) return null;

  const period = flexPeriodFor(agreement, date);
  const daysLeft = daysBetween(date, period.end);

  if (balanceMinutes > agreement.maxCarryCredit) {
    const ueber = balanceMinutes - agreement.maxCarryCredit;
    return {
      code: 'gleitzeit.uebertrag_guthaben',
      severity: daysLeft <= 14 ? 'verstoss' : 'hinweis',
      reference: '§ 4b Abs 2 Z 3 AZG',
      date,
      actual: balanceMinutes,
      limit: agreement.maxCarryCredit,
      message: `Zeitguthaben ${formatDuration(balanceMinutes, {
        sign: true,
      })} h — ${formatDuration(ueber)} h über der Übertragsgrenze. Die Periode endet am ${formatDateShort(
        period.end,
      )}, ${daysLeft === 0 ? 'heute' : `noch ${daysLeft} Tage`} zum Abbau.`,
      messageEn: `Time credit ${formatDuration(balanceMinutes, {
        sign: true,
      })} h — ${formatDuration(ueber)} h above the carry-over limit. The period ends on ${formatDateShort(
        period.end,
        'en',
      )}, ${daysLeft === 0 ? 'today' : `${daysLeft} days left`} to reduce it.`,
    };
  }

  if (balanceMinutes < -agreement.maxCarryDebit) {
    const unter = -balanceMinutes - agreement.maxCarryDebit;
    return {
      code: 'gleitzeit.uebertrag_schuld',
      severity: daysLeft <= 14 ? 'verstoss' : 'hinweis',
      reference: '§ 4b Abs 2 Z 3 AZG',
      date,
      actual: balanceMinutes,
      limit: -agreement.maxCarryDebit,
      message: `Zeitschuld ${formatDuration(balanceMinutes, {
        sign: true,
      })} h — ${formatDuration(unter)} h über der Übertragsgrenze. Die Periode endet am ${formatDateShort(
        period.end,
      )}.`,
      messageEn: `Time debit ${formatDuration(balanceMinutes, {
        sign: true,
      })} h — ${formatDuration(unter)} h beyond the carry-over limit. The period ends on ${formatDateShort(
        period.end,
        'en',
      )}.`,
    };
  }

  // Vorwarnung, solange sich noch etwas ausrichten lässt.
  const nearCredit = balanceMinutes > agreement.maxCarryCredit * 0.85;
  const nearDebit = balanceMinutes < -agreement.maxCarryDebit * 0.85;
  if ((nearCredit || nearDebit) && daysLeft <= 30) {
    return {
      code: 'gleitzeit.uebertrag_naehe',
      severity: 'hinweis',
      reference: '§ 4b Abs 2 Z 3 AZG',
      date,
      actual: balanceMinutes,
      limit: nearCredit ? agreement.maxCarryCredit : -agreement.maxCarryDebit,
      message: `Saldo ${formatDuration(balanceMinutes, {
        sign: true,
      })} h, Periodenende am ${formatDateShort(period.end)} — die Übertragsgrenze rückt näher.`,
      messageEn: `Balance ${formatDuration(balanceMinutes, {
        sign: true,
      })} h, period ends on ${formatDateShort(period.end, 'en')} — approaching the carry-over limit.`,
    };
  }

  return null;
}
