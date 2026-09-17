/**
 * Bausteine für die Tests. Bewusst knapp gehalten, damit in den Testfällen
 * selbst nur das steht, worum es dort geht.
 */

import { atLocalTime, parseHm } from '../src/time.js';
import { aggregateDay, type DayWork } from '../src/work.js';
import type { Contract, Employee, IsoDate, SegmentKind, TimeSegment } from '../src/types.js';

/** `['08:00', '12:00']` wird zu einem Arbeitssegment an diesem Tag. */
export function segment(
  date: IsoDate,
  from: string,
  to: string,
  kind: SegmentKind = 'work',
): TimeSegment {
  return {
    date,
    start: atLocalTime(date, parseHm(from)).toISOString(),
    end: atLocalTime(date, parseHm(to)).toISOString(),
    kind,
    source: 'manual',
  };
}

/**
 * Ein Arbeitstag aus abwechselnden Von-bis-Paaren.
 * `day('2026-09-14', ['08:00', '12:00'], ['12:30', '17:00'])` ergibt
 * 8:30 Arbeitszeit mit einer Pause von 30 Minuten.
 */
export function day(date: IsoDate, ...blocks: Array<[string, string]>): DayWork {
  return aggregateDay(
    date,
    blocks.map(([from, to]) => segment(date, from, to)),
  );
}

/** Ein Tag, an dem nicht gearbeitet wurde. */
export function free(date: IsoDate): DayWork {
  return aggregateDay(date, []);
}

export const vollzeit: Contract = {
  validFrom: '2020-01-01',
  validTo: null,
  category: 'vollzeit',
  typeLabel: 'Vollzeit',
  weeklyHours: 38.5,
  collectiveWeeklyHours: 38.5,
  dailyTargetMinutes: { 1: 462, 2: 462, 3: 462, 4: 462, 5: 462, 6: 0, 7: 0 },
  flexTime: null,
  allIn: false,
  vacationDaysPerYear: 25,
  exemptFromAzg: false,
  nightWork: false,
  shiftWork: false,
};

export const teilzeit20: Contract = {
  ...vollzeit,
  category: 'teilzeit',
  typeLabel: 'Teilzeit',
  weeklyHours: 20,
  collectiveWeeklyHours: 38.5,
  dailyTargetMinutes: { 1: 240, 2: 240, 3: 240, 4: 240, 5: 240, 6: 0, 7: 0 },
};

/** Gleitzeit ohne ganztägigen Verbrauch — die 12-Stunden-Grenze greift nicht. */
export const gleitzeitOhneGanztag: Contract = {
  ...vollzeit,
  flexTime: {
    periodMonths: 1,
    periodAnchor: '2026-01-01',
    allowsFullDayCompensation: false,
    frameStart: '06:00',
    frameEnd: '20:00',
    maxCarryCredit: 40 * 60,
    maxCarryDebit: 10 * 60,
  },
};

/** Gleitzeit mit ganztägigem Verbrauch — bis 12 Stunden Normalarbeitszeit. */
export const gleitzeitMitGanztag: Contract = {
  ...vollzeit,
  flexTime: {
    ...gleitzeitOhneGanztag.flexTime!,
    allowsFullDayCompensation: true,
  },
};

export const erwachsene: Employee = {
  id: 'e1',
  displayName: 'Anna Berger',
  birthDate: '1990-05-12',
  hiredOn: '2020-01-01',
  leftOn: null,
  state: 'W',
};

/** Wird am 17. September 2026 achtzehn. */
export const lehrling: Employee = {
  id: 'e2',
  displayName: 'Jonas Steiner',
  birthDate: '2008-09-17',
  hiredOn: '2024-09-01',
  leftOn: null,
  state: 'W',
};

export const lehrlingVertrag: Contract = {
  ...vollzeit,
  category: 'lehrling',
  typeLabel: 'Lehrling',
  weeklyHours: 40,
  collectiveWeeklyHours: 40,
  dailyTargetMinutes: { 1: 480, 2: 480, 3: 480, 4: 480, 5: 480, 6: 0, 7: 0 },
};
