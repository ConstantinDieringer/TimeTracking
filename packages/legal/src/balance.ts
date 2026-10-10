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
import {
  addDays,
  addMonths,
  daysBetween,
  formatDuration,
  maxDate,
  minDate,
  parseIsoDate,
  weekdayOf,
} from './time.js';
import type { DayWork } from './work.js';
import {
  ABSENCE_IS_PAID,
  absenceLabel,
  ABSENCE_CONSUMES_VACATION,
  type Absence,
  type Contract,
  type Employee,
  type IsoDate,
  type Locale,
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
  /** Anspruch im laufenden Urlaubsjahr, so weit er bis zum Stichtag entstanden ist. */
  entitlementDays: number;
  carriedOverDays: number;
  consumedDays: number;
  remainingDays: number;
  /** `true`, wenn wegen Ein- oder Austritt im Urlaubsjahr gekürzt wurde. */
  aliquot: boolean;
  /** Erstes und letztes Datum des Urlaubsjahres. */
  periodStart: IsoDate;
  periodEnd: IsoDate;
  /**
   * `true` in den ersten sechs Monaten: der Anspruch wächst noch mit jedem
   * Tag (§ 2 Abs 2 UrlG). Ab `fullFrom` steht er in voller Höhe zu.
   */
  accruing: boolean;
  fullFrom: IsoDate | null;
}

/**
 * Was als Urlaubsjahr gilt.
 *
 * Gesetzlicher Regelfall ist das **Arbeitsjahr**: es beginnt mit dem Tag des
 * Eintritts und an jedem Jahrestag neu (§ 2 Abs 1 UrlG). Auf das
 * **Kalenderjahr** umstellen darf nur ein Kollektivvertrag oder eine
 * Betriebsvereinbarung (§ 2 Abs 4 UrlG) — deshalb ist das eine Einstellung
 * des Betriebs und kein stillschweigender Standard.
 */
export type VacationYearMode = 'arbeitsjahr' | 'kalenderjahr';

/** Volle Dienstjahre am Stichtag. */
export function completedServiceYears(hiredOn: IsoDate, date: IsoDate): number {
  const hired = parseIsoDate(hiredOn);
  const now = parseIsoDate(date);
  let years = now.year - hired.year;
  if (now.month < hired.month || (now.month === hired.month && now.day < hired.day)) years -= 1;
  return Math.max(0, years);
}

/** Das Urlaubsjahr, in das der Stichtag fällt. */
export function vacationYearFor(
  hiredOn: IsoDate,
  date: IsoDate,
  mode: VacationYearMode,
): { start: IsoDate; end: IsoDate } {
  if (mode === 'kalenderjahr') {
    const { year } = parseIsoDate(date);
    return { start: `${year}-01-01`, end: `${year}-12-31` };
  }
  // Über Monate statt Jahre addiert, damit ein Eintritt am 29. Februar in
  // Nicht-Schaltjahren sauber auf den 28. fällt.
  const years = date < hiredOn ? 0 : completedServiceYears(hiredOn, date);
  const start = addMonths(hiredOn, 12 * years);
  return { start, end: addDays(addMonths(hiredOn, 12 * (years + 1)), -1) };
}

/**
 * § 2 Abs 1 UrlG — 25 Arbeitstage, nach Vollendung des 25. Dienstjahres 30.
 * Maßgeblich sind die vollendeten Dienstjahre zu Beginn des Urlaubsjahres.
 * Der Vertrag kann mehr vorsehen; dann gilt der höhere Wert.
 */
export function annualVacationDays(
  employee: Employee,
  contract: Contract,
  periodStart: IsoDate,
): number {
  // Vordienstzeiten (§ 3 UrlG) verschieben nur die 25-Jahres-Grenze, nicht das
  // Urlaubsjahr selbst — das hängt weiter am tatsächlichen Eintritt.
  const creditedStart = addMonths(employee.hiredOn, -(employee.priorServiceMonths ?? 0));
  const statutory =
    completedServiceYears(creditedStart, periodStart) >= 25
      ? VACATION_DAYS_AFTER_25_YEARS
      : VACATION_DAYS_STANDARD;
  return Math.max(statutory, contract.vacationDaysPerYear);
}

/**
 * Das Urlaubskonto zum Stichtag.
 *
 * - **Erste sechs Monate** (§ 2 Abs 2 UrlG): der Anspruch entsteht im
 *   Verhältnis zur zurückgelegten Dienstzeit. Wer seit drei Monaten da ist,
 *   hat ein Viertel des Jahresanspruchs, nicht den ganzen.
 * - **Danach** steht der Anspruch für das Urlaubsjahr in voller Höhe zu, ab
 *   dem zweiten Arbeitsjahr gleich mit dessen Beginn.
 * - **Kalenderjahr als Urlaubsjahr:** im Eintrittsjahr anteilig nach den
 *   Tagen der Beschäftigung in diesem Jahr; in den ersten sechs Monaten
 *   zusätzlich nur, was bis zum Stichtag entstanden ist.
 * - **Austritt im Urlaubsjahr:** anteilig bis zum Austritt — das ist die
 *   Grundlage der Urlaubsersatzleistung nach § 10 UrlG.
 *
 * Auf zwei Nachkommastellen gerundet; was davon tatsächlich gewährt wird,
 * regeln Kollektivvertrag und Betrieb.
 */
export function vacationAccount(input: {
  employee: Employee;
  contract: Contract;
  asOf: IsoDate;
  mode: VacationYearMode;
  consumedDays: number;
  carriedOverDays?: number;
}): VacationAccount {
  const { employee, contract, asOf, mode, consumedDays, carriedOverDays = 0 } = input;
  const period = vacationYearFor(employee.hiredOn, asOf, mode);
  const full = annualVacationDays(employee, contract, period.start);
  const periodDays = daysBetween(period.start, period.end) + 1;

  const from = maxDate(period.start, employee.hiredOn);
  const to = employee.leftOn ? minDate(period.end, employee.leftOn) : period.end;
  const employedDays = Math.max(0, daysBetween(from, to) + 1);
  const aliquot = employedDays < periodDays;
  let entitlement = (full * employedDays) / periodDays;

  // § 2 Abs 2: in den ersten sechs Monaten nur, was bis heute entstanden ist.
  const fullFrom = addMonths(employee.hiredOn, 6);
  const accruing = asOf >= employee.hiredOn && asOf < fullFrom && from === employee.hiredOn;
  if (accruing) {
    const served = daysBetween(employee.hiredOn, minDate(asOf, to)) + 1;
    entitlement = Math.min(entitlement, (full * served) / periodDays);
  }

  const rounded = Math.round(entitlement * 100) / 100;

  return {
    year: parseIsoDate(period.start).year,
    fullEntitlementDays: full,
    entitlementDays: rounded,
    carriedOverDays,
    consumedDays,
    remainingDays: Math.round((rounded + carriedOverDays - consumedDays) * 100) / 100,
    aliquot,
    periodStart: period.start,
    periodEnd: period.end,
    accruing,
    fullFrom: accruing ? fullFrom : null,
  };
}

/** Ein Urlaubsjahr im Verlauf des Kontos. */
export interface VacationYearEntry {
  periodStart: IsoDate;
  periodEnd: IsoDate;
  /** Neu entstandener Anspruch in diesem Urlaubsjahr. */
  entitlementDays: number;
  /** In diesem Urlaubsjahr genommen, gleich aus welchem Jahr er stammte. */
  consumedDays: number;
  /** Zum Ende dieses Urlaubsjahres ungenutzt verjährt. */
  expiredDays: number;
}

export interface VacationLedger extends VacationAccount {
  /** Rest aus früheren Urlaubsjahren, der am Ende des laufenden verjährt. */
  expiringDays: number;
  /** In früheren Urlaubsjahren bereits verjährt. */
  expiredDays: number;
  /**
   * Urlaubsersatzleistung nach § 10 UrlG in Tagen, wenn das Dienstverhältnis
   * im laufenden Urlaubsjahr endet: anteiliger Anspruch des laufenden Jahres
   * plus offener Rest aus früheren, abzüglich Verbrauch. Negativ heißt: mehr
   * genommen als entstanden.
   */
  compensationDays: number | null;
  history: VacationYearEntry[];
}

/**
 * Das Urlaubskonto über alle Urlaubsjahre bis zum Stichtag.
 *
 * - **Übertrag:** nicht verbrauchter Urlaub geht ins nächste Urlaubsjahr mit.
 * - **Verjährung** (§ 4 Abs 5 UrlG): zwei Jahre nach Ende des Urlaubsjahres,
 *   in dem er entstanden ist. Ein Anspruch aus 2024 ist also bis Ende 2026
 *   zu verbrauchen.
 * - **Verbrauch** wird stets auf den ältesten offenen Anspruch angerechnet —
 *   so verjährt so wenig wie möglich.
 * - **Übernahme ins System:** ist ein offener Urlaub zu einem Stichtag
 *   hinterlegt, ersetzt er alles davor; er verjährt wie ein Anspruch aus dem
 *   Urlaubsjahr dieses Stichtags. Ohne Angabe beginnt das Konto mit dem
 *   Urlaubsjahr, in dem die Person ins System kam — frühere Jahre wären sonst
 *   ohne Verbrauch und erschienen als voller Rest.
 *
 * Ob Urlaub tatsächlich verjährt, hängt nach der Rechtsprechung auch davon
 * ab, ob der Arbeitgeber rechtzeitig auf den drohenden Verfall hingewiesen
 * hat. Die Anzeige ist deshalb ein Hinweis, keine Entscheidung.
 */
export function vacationLedger(input: {
  employee: Employee;
  contractAt: (date: IsoDate) => Contract | null;
  absences: readonly Absence[];
  asOf: IsoDate;
  mode: VacationYearMode;
}): VacationLedger | null {
  const { employee, contractAt, absences, asOf, mode } = input;
  const current = vacationYearFor(employee.hiredOn, asOf, mode);

  const opening = employee.vacationOpening ?? null;
  const since = opening?.date ?? maxDate(employee.hiredOn, employee.trackedSince ?? employee.hiredOn);
  const first = vacationYearFor(employee.hiredOn, maxDate(since, employee.hiredOn), mode);

  interface Pot {
    days: number;
    expiresAfter: IsoDate; // letztes Datum, an dem er noch verbraucht werden kann
  }
  const pots: Pot[] = [];
  const history: VacationYearEntry[] = [];
  const expiryFor = (periodEnd: IsoDate) => addDays(addMonths(addDays(periodEnd, 1), 24), -1);

  // Mit Übernahmestand zählt der Verbrauch erst ab dessen Stichtag (davor ist
  // er im Stand enthalten), sonst ab Beginn des ersten Urlaubsjahres.
  const countFrom = opening ? opening.date : first.start;
  const usable = absences
    .filter((absence) => ABSENCE_CONSUMES_VACATION[absence.kind])
    .filter((absence) => absence.date >= countFrom && absence.date <= asOf)
    .sort((a, b) => a.date.localeCompare(b.date));

  let expiredTotal = 0;
  let currentAccount: VacationAccount | null = null;
  let carriedIntoCurrent = 0;

  for (let period = first; period.start <= current.start; ) {
    const contract = contractAt(minDate(maxDate(period.start, since), asOf)) ?? contractAt(asOf);
    if (!contract) return null;

    const isCurrent = period.start === current.start;
    const account = vacationAccount({
      employee,
      contract,
      asOf: isCurrent ? asOf : period.end,
      mode,
      consumedDays: 0,
    });

    if (isCurrent) carriedIntoCurrent = pots.reduce((sum, pot) => sum + pot.days, 0);

    // Im Jahr der Übernahme ersetzt der hinterlegte Stand den Anspruch.
    const isOpeningYear = opening !== null && period.start === first.start;
    const entitlement = isOpeningYear ? opening.days : account.entitlementDays;
    pots.push({ days: entitlement, expiresAfter: expiryFor(period.end) });

    let consumed = 0;
    for (const absence of usable) {
      if (absence.date < period.start || absence.date > period.end) continue;
      let amount = absence.halfDay ? 0.5 : 1;
      consumed += amount;
      for (const pot of pots) {
        if (amount <= 0) break;
        if (pot.days <= 0 || pot.expiresAfter < absence.date) continue;
        const taken = Math.min(pot.days, amount);
        pot.days -= taken;
        amount -= taken;
      }
      // Mehr genommen als vorhanden: im jüngsten Topf ins Minus.
      if (amount > 0) pots[pots.length - 1]!.days -= amount;
    }

    // Verjährung zum Ende dieses Urlaubsjahres.
    let expired = 0;
    if (!isCurrent) {
      for (const pot of pots) {
        if (pot.expiresAfter <= period.end && pot.days > 0) {
          expired += pot.days;
          pot.days = 0;
        }
      }
      expiredTotal += expired;
    }

    history.push({
      periodStart: period.start,
      periodEnd: period.end,
      entitlementDays: round2(entitlement),
      consumedDays: consumed,
      expiredDays: round2(expired),
    });

    if (isCurrent) {
      currentAccount = { ...account, entitlementDays: round2(entitlement) };
      break;
    }
    period = vacationYearFor(employee.hiredOn, addDays(period.end, 1), mode);
  }

  if (!currentAccount) return null;

  const remaining = pots.reduce((sum, pot) => sum + pot.days, 0);
  const expiring = pots
    .filter((pot) => pot.expiresAfter <= current.end && pot.days > 0)
    .reduce((sum, pot) => sum + pot.days, 0);
  const consumedNow = history[history.length - 1]!.consumedDays;
  const endsThisYear =
    employee.leftOn !== null && employee.leftOn >= current.start && employee.leftOn <= current.end;

  return {
    ...currentAccount,
    carriedOverDays: round2(carriedIntoCurrent),
    consumedDays: consumedNow,
    remainingDays: round2(remaining),
    expiringDays: round2(expiring),
    expiredDays: round2(expiredTotal),
    compensationDays: endsThisYear ? round2(remaining) : null,
    history,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
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
      messageEn: `${inYear.length} personal holidays in ${year} — only one per calendar year is allowed.`,
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
      messageEn: `Announced ${noticeDays} days in advance — § 7a ARG requires three months. Without this notice the employer is not bound.`,
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
      messageEn: `Monthly pay ${euro(gross)} is above the marginal-employment threshold of ${euro(
        limit,
      )} — the employment is fully subject to social insurance.${
        hasGeringfuegigkeitsgrenze(year) ? '' : ` No value is stored for ${year} yet; the most recent one is used.`
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
      messageEn: `Monthly pay ${euro(gross)} — close to the marginal-employment threshold of ${euro(limit)}.`,
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
export function describeAbsence(absence: Absence, locale: Locale = 'de'): string {
  const label = absenceLabel(absence.kind, locale);
  if (!absence.halfDay) return label;
  return locale === 'en' ? `${label} (half day)` : `${label} (halbtägig)`;
}
