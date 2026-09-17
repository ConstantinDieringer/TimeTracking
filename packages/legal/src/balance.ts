/**
 * Zeitkonten: Soll gegen Ist, Gleitzeitsaldo, Urlaubskonto,
 * Geringfügigkeitsgrenze.
 *
 * Salden werden immer aus den erfassten Zeiten neu gerechnet und nie
 * gespeichert. Gespeicherte Salden gehen auseinander, sobald jemand einen alten
 * Tag korrigiert oder ein Vertrag rückwirkend geändert wird — und dann stimmt
 * weder das Konto noch die Erklärung, wie es zustande kam.
 */

import { statutoryHolidayOn, type Holiday } from './holidays.js';
import {
  geringfuegigkeitsgrenzeCents,
  hasGeringfuegigkeitsgrenze,
  VACATION_DAYS_AFTER_25_YEARS,
  VACATION_DAYS_STANDARD,
} from './settings.js';
import { daysBetween, formatDuration, maxDate, minDate, parseIsoDate, weekdayOf } from './time.js';
import type { DayWork } from './work.js';
import {
  ABSENCE_IS_PAID,
  ABSENCE_LABEL,
  ABSENCE_CONSUMES_VACATION,
  type Absence,
  type Contract,
  type Employee,
  type IsoDate,
  type Minutes,
  type RuleResult,
} from './types.js';

export interface DayAccount {
  date: IsoDate;
  /** Sollzeit laut Vertrag für diesen Wochentag. */
  targetMinutes: Minutes;
  /** Tatsächlich gearbeitet. */
  workedMinutes: Minutes;
  /** Gutgeschrieben aus Feiertag oder bezahlter Abwesenheit. */
  creditedMinutes: Minutes;
  /** `worked + credited − target`. */
  balanceMinutes: Minutes;
  holiday: Holiday | null;
  absence: Absence | null;
  /**
   * § 9 Abs 5 ARG — wer am Feiertag arbeitet, erhält das Entgelt für die
   * geleistete Arbeit **zusätzlich** zum Feiertagsentgelt. Getrennt
   * ausgewiesen, damit die Lohnverrechnung beides sieht.
   */
  holidayWorkMinutes: Minutes;
  /** Der Tag liegt in der Zukunft und trägt deshalb nichts zum Saldo bei. */
  future: boolean;
}

export interface DayAccountInput {
  day: DayWork;
  contract: Contract;
  absence?: Absence | null;
  /**
   * Der heutige Tag. Alles danach hat zwar ein Sollzeit — man kann damit
   * planen —, aber noch keinen Saldo: ein Freitag nächster Woche ist keine
   * Fehlzeit, nur weil dort noch nichts erfasst ist.
   */
  today?: IsoDate;
}

/**
 * Das Tagessoll aus dem Vertrag. An Feiertagen bleibt es bestehen — der
 * Anspruch auf Feiertagsentgelt setzt ja gerade voraus, dass der Tag sonst ein
 * Arbeitstag gewesen wäre.
 */
export function targetMinutesFor(contract: Contract, date: IsoDate): Minutes {
  return contract.dailyTargetMinutes[weekdayOf(date)] ?? 0;
}

export function accountForDay(input: DayAccountInput): DayAccount {
  const { day, contract } = input;
  const absence = input.absence ?? null;
  const holiday = statutoryHolidayOn(day.date);
  const target = targetMinutesFor(contract, day.date);
  // Ein künftiger Tag zählt nicht — außer es wurde bereits etwas erfasst.
  // Wer Freitag im Voraus einträgt, soll das auch im Saldo sehen; ein leerer
  // Freitag nächster Woche bleibt dagegen neutral.
  const future =
    input.today !== undefined && day.date > input.today && day.workMinutes === 0;

  // Unbezahlte Freistellung hebt die Arbeitspflicht auf: es entsteht weder ein
  // Guthaben noch eine Schuld, das Soll fällt weg.
  if (absence && !ABSENCE_IS_PAID[absence.kind]) {
    const reduced = absence.halfDay ? Math.round(target / 2) : 0;
    return {
      date: day.date,
      targetMinutes: reduced,
      workedMinutes: day.workMinutes,
      creditedMinutes: 0,
      balanceMinutes: future ? 0 : day.workMinutes - reduced,
      holiday,
      absence,
      holidayWorkMinutes: holiday ? day.workMinutes : 0,
      future,
    };
  }

  let credited = 0;
  if (absence) {
    credited = absence.halfDay ? Math.round(target / 2) : target;
  } else if (holiday) {
    // Feiertagsentgelt nach § 9 Abs 1 ARG: das Entgelt gebührt, als wäre
    // gearbeitet worden.
    credited = target;
  }

  return {
    date: day.date,
    targetMinutes: target,
    workedMinutes: day.workMinutes,
    creditedMinutes: credited,
    balanceMinutes: future ? 0 : day.workMinutes + credited - target,
    holiday,
    absence,
    holidayWorkMinutes: holiday ? day.workMinutes : 0,
    future,
  };
}

export interface PeriodBalance {
  from: IsoDate;
  to: IsoDate;
  targetMinutes: Minutes;
  workedMinutes: Minutes;
  creditedMinutes: Minutes;
  /** Saldo des Zeitraums, ohne Übertrag. */
  balanceMinutes: Minutes;
  /** Saldo einschließlich des mitgegebenen Anfangsbestands. */
  closingBalanceMinutes: Minutes;
  holidayWorkMinutes: Minutes;
  days: DayAccount[];
}

export function balanceForPeriod(
  accounts: readonly DayAccount[],
  openingBalanceMinutes: Minutes = 0,
): PeriodBalance {
  const totals = accounts.reduce(
    (sum, account) => ({
      target: sum.target + account.targetMinutes,
      worked: sum.worked + account.workedMinutes,
      credited: sum.credited + account.creditedMinutes,
      balance: sum.balance + account.balanceMinutes,
      holidayWork: sum.holidayWork + account.holidayWorkMinutes,
    }),
    { target: 0, worked: 0, credited: 0, balance: 0, holidayWork: 0 },
  );

  return {
    from: accounts[0]?.date ?? '',
    to: accounts[accounts.length - 1]?.date ?? '',
    targetMinutes: totals.target,
    workedMinutes: totals.worked,
    creditedMinutes: totals.credited,
    balanceMinutes: totals.balance,
    closingBalanceMinutes: openingBalanceMinutes + totals.balance,
    holidayWorkMinutes: totals.holidayWork,
    days: [...accounts],
  };
}

// ---------------------------------------------------------------------------
// Urlaubskonto
// ---------------------------------------------------------------------------

export interface VacationAccount {
  year: number;
  /** Voller Jahresanspruch laut Vertrag. */
  fullEntitlementDays: number;
  /** Anspruch für dieses Jahr, im Ein- oder Austrittsjahr aliquotiert. */
  entitlementDays: number;
  carriedOverDays: number;
  consumedDays: number;
  remainingDays: number;
  /** `true`, wenn wegen Ein- oder Austritt gekürzt wurde. */
  aliquot: boolean;
}

/**
 * § 2 Abs 1 UrlG — 25 Arbeitstage, nach Vollendung des 25. Dienstjahres 30.
 * Der Vertrag kann mehr vorsehen; dann gilt der höhere Wert.
 */
export function annualVacationDays(employee: Employee, contract: Contract, year: number): number {
  const serviceYears = year - parseIsoDate(employee.hiredOn).year;
  const statutory = serviceYears >= 25 ? VACATION_DAYS_AFTER_25_YEARS : VACATION_DAYS_STANDARD;
  return Math.max(statutory, contract.vacationDaysPerYear);
}

/**
 * § 2 Abs 2 UrlG — im Ein- und Austrittsjahr entsteht der Anspruch anteilig.
 * Gerechnet wird nach Kalendertagen des Beschäftigungsverhältnisses im Jahr.
 */
export function vacationAccount(
  employee: Employee,
  contract: Contract,
  year: number,
  consumedDays: number,
  carriedOverDays = 0,
): VacationAccount {
  const full = annualVacationDays(employee, contract, year);
  const yearStart: IsoDate = `${year}-01-01`;
  const yearEnd: IsoDate = `${year}-12-31`;

  const from = maxDate(yearStart, employee.hiredOn);
  const to = employee.leftOn ? minDate(yearEnd, employee.leftOn) : yearEnd;

  const daysInYear = daysBetween(yearStart, yearEnd) + 1;
  const daysEmployed = Math.max(0, daysBetween(from, to) + 1);
  const aliquot = daysEmployed < daysInYear;

  const entitlement = aliquot ? Math.round((full * daysEmployed) / daysInYear * 2) / 2 : full;

  return {
    year,
    fullEntitlementDays: full,
    entitlementDays: entitlement,
    carriedOverDays,
    consumedDays,
    remainingDays: entitlement + carriedOverDays - consumedDays,
    aliquot,
  };
}

/** Zählt die Abwesenheiten, die den Urlaubsanspruch verbrauchen. */
export function consumedVacationDays(absences: readonly Absence[]): number {
  return absences.reduce((sum, absence) => {
    if (!ABSENCE_CONSUMES_VACATION[absence.kind]) return sum;
    return sum + (absence.halfDay ? 0.5 : 1);
  }, 0);
}

/**
 * § 7a ARG — der persönliche Feiertag wird einmal im Kalenderjahr einseitig
 * bestimmt, ist drei Monate im Voraus schriftlich bekanntzugeben und verbraucht
 * einen Urlaubstag.
 */
export function checkPersonalHoliday(
  absences: readonly Absence[],
  year: number,
  announcedOn: IsoDate | null,
  date: IsoDate,
): RuleResult | null {
  const inYear = absences.filter(
    (absence) => absence.kind === 'persoenlicher_feiertag' && absence.date.startsWith(String(year)),
  );

  if (inYear.length > 1) {
    return {
      code: 'arg.persoenlicher_feiertag_anzahl',
      severity: 'verstoss',
      reference: '§ 7a Abs 1 ARG',
      date,
      actual: inYear.length,
      limit: 1,
      message: `${inYear.length} persönliche Feiertage in ${year} — zulässig ist einer pro Kalenderjahr.`,
    };
  }

  if (announcedOn === null) return null;

  const noticeDays = daysBetween(announcedOn, date);
  if (noticeDays < 90) {
    return {
      code: 'arg.persoenlicher_feiertag_frist',
      severity: 'hinweis',
      reference: '§ 7a Abs 2 ARG',
      date,
      actual: noticeDays,
      limit: 90,
      message: `Ankündigung ${noticeDays} Tage im Voraus — § 7a ARG verlangt drei Monate. Ohne Frist ist der Arbeitgeber nicht gebunden.`,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Geringfügigkeit
// ---------------------------------------------------------------------------

/**
 * Warnt, wenn ein geringfügiges Dienstverhältnis die monatliche
 * Geringfügigkeitsgrenze erreicht. Darüber tritt volle Versicherungspflicht
 * ein — das ist keine Arbeitszeitfrage, fällt aber hier zuerst auf.
 */
export function checkGeringfuegigkeit(contract: Contract, month: IsoDate): RuleResult | null {
  if (contract.category !== 'geringfuegig') return null;
  if (contract.monthlyGrossCents == null) return null;

  const { year } = parseIsoDate(month);
  const limit = geringfuegigkeitsgrenzeCents(year);
  const gross = contract.monthlyGrossCents;

  if (gross > limit) {
    return {
      code: 'asvg.geringfuegigkeitsgrenze',
      severity: 'verstoss',
      reference: '§ 5 Abs 2 ASVG',
      date: month,
      actual: gross,
      limit,
      message: `Monatsentgelt ${euro(gross)} über der Geringfügigkeitsgrenze von ${euro(
        limit,
      )} — das Dienstverhältnis ist voll versicherungspflichtig.${
        hasGeringfuegigkeitsgrenze(year) ? '' : ` Für ${year} ist noch kein Wert hinterlegt, verwendet wird der zuletzt bekannte.`
      }`,
    };
  }

  if (gross > limit * 0.95) {
    return {
      code: 'asvg.geringfuegigkeitsgrenze',
      severity: 'hinweis',
      reference: '§ 5 Abs 2 ASVG',
      date: month,
      actual: gross,
      limit,
      message: `Monatsentgelt ${euro(gross)} — die Geringfügigkeitsgrenze von ${euro(limit)} ist nahe.`,
    };
  }

  return null;
}

function euro(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

/** Kurzfassung eines Saldos für die Oberfläche, etwa `+12:45 h`. */
export function describeBalance(minutes: Minutes): string {
  return `${formatDuration(minutes, { sign: true })} h`;
}

/** Beschriftung einer Abwesenheit für Listen und Exporte. */
export function describeAbsence(absence: Absence): string {
  const label = ABSENCE_LABEL[absence.kind];
  return absence.halfDay ? `${label} (halbtägig)` : label;
}
