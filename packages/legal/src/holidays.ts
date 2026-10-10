/**
 * Feiertage nach § 7 ARG.
 *
 * Bewusst selbst gerechnet statt aus einem Paket bezogen: die beiden
 * österreichischen Feinheiten bekommen generische Feiertagsbibliotheken
 * regelmäßig falsch.
 *
 *   1. **Karfreitag ist seit 2019 kein Feiertag mehr.** Er wurde für
 *      Angehörige der evangelischen Kirchen A. B. und H. B., der
 *      altkatholischen Kirche und der Methodistenkirche abgeschafft.
 *      An seine Stelle trat der persönliche Feiertag nach § 7a ARG, der
 *      einen Urlaubstag verbraucht.
 *
 *   2. **Landesfeiertage sind keine gesetzlichen Feiertage.** Leopold,
 *      Rupert, Florian, Josef und Martin lösen weder Feiertagsruhe noch
 *      Feiertagsentgelt aus. Sie werden angezeigt, damit niemand sie
 *      versehentlich als frei einplant — mit ausdrücklichem Hinweis.
 */

import { addDays, formatIsoDate, parseIsoDate } from './time.js';
import type { AustrianState, IsoDate } from './types.js';

export interface Holiday {
  date: IsoDate;
  name: string;
  nameEn: string;
  /** `true` nur bei den 13 Feiertagen des § 7 ARG. */
  statutory: boolean;
  /** Bei Landesfeiertagen: in welchen Bundesländern sie begangen werden. */
  states?: AustrianState[];
  /** Erläuterung, die in der Oberfläche mitläuft. */
  note?: string;
  noteEn?: string;
}

/**
 * Ostersonntag nach dem anonymen gregorianischen Algorithmus (Meeus/Jones/Butcher).
 * Gültig für den gesamten gregorianischen Kalender.
 */
export function easterSunday(year: number): IsoDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = März, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return formatIsoDate({ year, month, day });
}

/** Die 13 gesetzlichen Feiertage eines Jahres nach § 7 ARG. */
export function statutoryHolidays(year: number): Holiday[] {
  const easter = easterSunday(year);

  const holidays: Holiday[] = [
    { date: formatIsoDate({ year, month: 1, day: 1 }), name: 'Neujahr', nameEn: "New Year's Day", statutory: true },
    { date: formatIsoDate({ year, month: 1, day: 6 }), name: 'Heilige Drei Könige', nameEn: "Epiphany", statutory: true },
    { date: addDays(easter, 1), name: 'Ostermontag', nameEn: "Easter Monday", statutory: true },
    { date: formatIsoDate({ year, month: 5, day: 1 }), name: 'Staatsfeiertag', nameEn: "Labour Day", statutory: true },
    { date: addDays(easter, 39), name: 'Christi Himmelfahrt', nameEn: "Ascension Day", statutory: true },
    { date: addDays(easter, 50), name: 'Pfingstmontag', nameEn: "Whit Monday", statutory: true },
    { date: addDays(easter, 60), name: 'Fronleichnam', nameEn: "Corpus Christi", statutory: true },
    { date: formatIsoDate({ year, month: 8, day: 15 }), name: 'Mariä Himmelfahrt', nameEn: "Assumption Day", statutory: true },
    { date: formatIsoDate({ year, month: 10, day: 26 }), name: 'Nationalfeiertag', nameEn: "National Day", statutory: true },
    { date: formatIsoDate({ year, month: 11, day: 1 }), name: 'Allerheiligen', nameEn: "All Saints' Day", statutory: true },
    { date: formatIsoDate({ year, month: 12, day: 8 }), name: 'Mariä Empfängnis', nameEn: "Immaculate Conception", statutory: true },
    { date: formatIsoDate({ year, month: 12, day: 25 }), name: 'Christtag', nameEn: "Christmas Day", statutory: true },
    { date: formatIsoDate({ year, month: 12, day: 26 }), name: 'Stefanitag', nameEn: "St. Stephen's Day", statutory: true },
  ];

  holidays.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return holidays;
}

/**
 * Tage, die vielerorts als Feiertag gelten, es rechtlich aber nicht sind.
 * Sie erzeugen keinen Anspruch auf Feiertagsruhe oder Feiertagsentgelt.
 */
export function observances(year: number): Holiday[] {
  const easter = easterSunday(year);

  return [
    {
      date: addDays(easter, -2),
      name: 'Karfreitag', nameEn: "Good Friday",
      statutory: false,
      note: 'Seit 2019 kein gesetzlicher Feiertag. An seine Stelle trat der persönliche Feiertag nach § 7a ARG.',
      noteEn: 'No longer a public holiday since 2019. It was replaced by the personal holiday under § 7a ARG.',
    },
    {
      date: formatIsoDate({ year, month: 3, day: 19 }),
      name: 'Hl. Josef', nameEn: "St. Joseph's Day",
      statutory: false,
      states: ['K', 'ST', 'T', 'V'],
      note: 'Landesfeiertag — kein gesetzlicher Feiertag nach § 7 ARG, kein Anspruch auf Feiertagsentgelt.',
      noteEn: 'Regional holiday — not a public holiday under § 7 ARG, no entitlement to holiday pay.',
    },
    {
      date: formatIsoDate({ year, month: 5, day: 4 }),
      name: 'Hl. Florian', nameEn: "St. Florian's Day",
      statutory: false,
      states: ['OO'],
      note: 'Landesfeiertag — kein gesetzlicher Feiertag nach § 7 ARG, kein Anspruch auf Feiertagsentgelt.',
      noteEn: 'Regional holiday — not a public holiday under § 7 ARG, no entitlement to holiday pay.',
    },
    {
      date: formatIsoDate({ year, month: 9, day: 24 }),
      name: 'Hl. Rupert', nameEn: "St. Rupert's Day",
      statutory: false,
      states: ['S'],
      note: 'Landesfeiertag — kein gesetzlicher Feiertag nach § 7 ARG, kein Anspruch auf Feiertagsentgelt.',
      noteEn: 'Regional holiday — not a public holiday under § 7 ARG, no entitlement to holiday pay.',
    },
    {
      date: formatIsoDate({ year, month: 11, day: 11 }),
      name: 'Hl. Martin', nameEn: "St. Martin's Day",
      statutory: false,
      states: ['B'],
      note: 'Landesfeiertag — kein gesetzlicher Feiertag nach § 7 ARG, kein Anspruch auf Feiertagsentgelt.',
      noteEn: 'Regional holiday — not a public holiday under § 7 ARG, no entitlement to holiday pay.',
    },
    {
      date: formatIsoDate({ year, month: 11, day: 15 }),
      name: 'Hl. Leopold', nameEn: "St. Leopold's Day",
      statutory: false,
      states: ['W', 'NO'],
      note: 'Landesfeiertag — kein gesetzlicher Feiertag nach § 7 ARG, kein Anspruch auf Feiertagsentgelt.',
      noteEn: 'Regional holiday — not a public holiday under § 7 ARG, no entitlement to holiday pay.',
    },
  ];
}

// Die Berechnung ist billig, wird aber pro Tag in der Monatsansicht aufgerufen.
const yearCache = new Map<number, Map<IsoDate, Holiday[]>>();

function indexForYear(year: number): Map<IsoDate, Holiday[]> {
  const cached = yearCache.get(year);
  if (cached) return cached;

  const index = new Map<IsoDate, Holiday[]>();
  for (const holiday of [...statutoryHolidays(year), ...observances(year)]) {
    const existing = index.get(holiday.date);
    if (existing) existing.push(holiday);
    else index.set(holiday.date, [holiday]);
  }
  yearCache.set(year, index);
  return index;
}

/**
 * Der gesetzliche Feiertag an diesem Tag, sonst `null`.
 * Landesfeiertage liefert diese Funktion bewusst nicht — sie begründen keinen
 * Anspruch und dürfen die Sollzeit nicht verändern.
 */
export function statutoryHolidayOn(date: IsoDate): Holiday | null {
  const { year } = parseIsoDate(date);
  const entries = indexForYear(year).get(date) ?? [];
  return entries.find((entry) => entry.statutory) ?? null;
}

export function isStatutoryHoliday(date: IsoDate): boolean {
  return statutoryHolidayOn(date) !== null;
}

/**
 * Alles, was an diesem Tag anzuzeigen ist: der gesetzliche Feiertag und,
 * sofern das Bundesland passt, der Landesfeiertag oder der Karfreitag.
 */
export function holidayInfoOn(date: IsoDate, state?: AustrianState): Holiday[] {
  const { year } = parseIsoDate(date);
  const entries = indexForYear(year).get(date) ?? [];
  return entries.filter(
    (entry) => entry.statutory || !entry.states || (state !== undefined && entry.states.includes(state)),
  );
}

/** Alle gesetzlichen Feiertage im Zeitraum, beide Grenzen einschließlich. */
export function statutoryHolidaysInRange(from: IsoDate, to: IsoDate): Holiday[] {
  const firstYear = parseIsoDate(from).year;
  const lastYear = parseIsoDate(to).year;
  const result: Holiday[] = [];
  for (let year = firstYear; year <= lastYear; year += 1) {
    for (const holiday of statutoryHolidays(year)) {
      if (holiday.date >= from && holiday.date <= to) result.push(holiday);
    }
  }
  return result;
}
