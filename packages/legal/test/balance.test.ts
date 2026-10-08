import { describe, expect, it } from 'vitest';
import {
  accountForDay,
  annualVacationDays,
  balanceForPeriod,
  checkGeringfuegigkeit,
  checkPersonalHoliday,
  consumedVacationDays,
  vacationAccount,
  vacationYearFor,
  type VacationYearMode,
} from '../src/balance.js';
import { day, erwachsene, free, teilzeit20, vollzeit } from './fixtures.js';
import type { Absence } from '../src/types.js';

const urlaub = (date: string, halfDay = false): Absence => ({ date, kind: 'urlaub', halfDay });

describe('Tagessoll und Tagessaldo', () => {
  it('rechnet Mehrarbeit gegen das Tagessoll', () => {
    // Vollzeit 38,5 h, also 7:42 Tagessoll. Gearbeitet 8:30.
    const konto = accountForDay({
      day: day('2026-09-14', ['08:00', '12:00'], ['12:30', '17:00']),
      contract: vollzeit,
    });
    expect(konto.targetMinutes).toBe(462);
    expect(konto.workedMinutes).toBe(510);
    expect(konto.balanceMinutes).toBe(48);
  });

  it('führt einen freien Samstag ohne Soll und ohne Saldo', () => {
    const konto = accountForDay({ day: free('2026-09-19'), contract: vollzeit });
    expect(konto.targetMinutes).toBe(0);
    expect(konto.balanceMinutes).toBe(0);
  });

  it('schreibt Arbeit am Wochenende voll gut', () => {
    const konto = accountForDay({ day: day('2026-09-19', ['09:00', '13:00']), contract: vollzeit });
    expect(konto.balanceMinutes).toBe(4 * 60);
  });
});

describe('Künftige Tage', () => {
  // Ein Freitag nächster Woche ist keine Fehlzeit, nur weil dort noch nichts
  // erfasst ist. Ohne diese Unterscheidung stünde Anfang des Monats ein Saldo
  // von minus einem Monatssoll da.
  it('tragen ihr Sollzeit, aber keinen Saldo', () => {
    const konto = accountForDay({
      day: free('2026-09-25'),
      contract: vollzeit,
      today: '2026-09-17',
    });
    expect(konto.future).toBe(true);
    expect(konto.targetMinutes).toBe(462);
    expect(konto.balanceMinutes).toBe(0);
  });

  it('zählen ab dem heutigen Tag wieder mit', () => {
    const heute = accountForDay({
      day: free('2026-09-17'),
      contract: vollzeit,
      today: '2026-09-17',
    });
    expect(heute.future).toBe(false);
    expect(heute.balanceMinutes).toBe(-462);
  });

  it('bleiben in der Vergangenheit eine Fehlzeit', () => {
    const gestern = accountForDay({
      day: free('2026-09-16'),
      contract: vollzeit,
      today: '2026-09-17',
    });
    expect(gestern.balanceMinutes).toBe(-462);
  });

  it('zählen mit, sobald etwas erfasst ist', () => {
    // Wer Freitag im Voraus einträgt, soll das Ergebnis auch sehen.
    const konto = accountForDay({
      day: day('2026-09-25', ['08:00', '12:00'], ['12:30', '15:00']),
      contract: vollzeit,
      today: '2026-09-17',
    });
    expect(konto.future).toBe(false);
    expect(konto.balanceMinutes).toBe(390 - 462);
  });

  it('gelten ohne Stichtag als vergangen', () => {
    // Ohne `today` verhält sich die Rechnung wie bisher — wichtig für
    // Auswertungen abgeschlossener Zeiträume.
    expect(accountForDay({ day: free('2030-01-02'), contract: vollzeit }).future).toBe(false);
  });
});

describe('§ 9 ARG — Feiertagsentgelt', () => {
  it('gleicht den Ausfall an einem Feiertag aus', () => {
    // Nationalfeiertag 2026 fällt auf einen Montag.
    const konto = accountForDay({ day: free('2026-10-26'), contract: vollzeit });
    expect(konto.holiday?.name).toBe('Nationalfeiertag');
    expect(konto.targetMinutes).toBe(462);
    expect(konto.creditedMinutes).toBe(462);
    expect(konto.balanceMinutes).toBe(0);
  });

  it('gibt Arbeit am Feiertag zusätzlich zum Feiertagsentgelt', () => {
    // § 9 Abs 5 ARG: das Entgelt für die Arbeit kommt obendrauf, das
    // Feiertagsentgelt bleibt bestehen. Vier Stunden Arbeit ergeben daher
    // vier Stunden Plus, nicht ein ausgeglichenes Konto.
    const konto = accountForDay({ day: day('2026-10-26', ['09:00', '13:00']), contract: vollzeit });
    expect(konto.creditedMinutes).toBe(462);
    expect(konto.holidayWorkMinutes).toBe(4 * 60);
    expect(konto.balanceMinutes).toBe(4 * 60);
  });

  it('behandelt den Karfreitag wie einen gewöhnlichen Arbeitstag', () => {
    const konto = accountForDay({
      day: day('2026-04-03', ['08:00', '12:00'], ['12:30', '16:12']),
      contract: vollzeit,
    });
    expect(konto.holiday).toBeNull();
    expect(konto.creditedMinutes).toBe(0);
    expect(konto.balanceMinutes).toBe(0);
  });

  it('behandelt einen Landesfeiertag wie einen gewöhnlichen Arbeitstag', () => {
    // Leopold, 15. November 2026 — ein Sonntag, daher ohnehin kein Soll.
    // Entscheidend ist, dass kein Feiertagsentgelt gutgeschrieben wird.
    const konto = accountForDay({ day: free('2026-11-15'), contract: vollzeit });
    expect(konto.holiday).toBeNull();
    expect(konto.creditedMinutes).toBe(0);
  });
});

describe('Abwesenheiten', () => {
  it('schreibt bezahlten Urlaub in Höhe des Tagessolls gut', () => {
    const konto = accountForDay({
      day: free('2026-09-16'),
      contract: vollzeit,
      absence: urlaub('2026-09-16'),
    });
    expect(konto.creditedMinutes).toBe(462);
    expect(konto.balanceMinutes).toBe(0);
  });

  it('schreibt einen halben Urlaubstag zur Hälfte gut', () => {
    const konto = accountForDay({
      day: day('2026-09-16', ['08:00', '11:51']),
      contract: vollzeit,
      absence: urlaub('2026-09-16', true),
    });
    expect(konto.creditedMinutes).toBe(231);
    expect(konto.balanceMinutes).toBe(0);
  });

  it('hebt bei unbezahlter Freistellung das Soll auf, statt eine Schuld zu erzeugen', () => {
    const konto = accountForDay({
      day: free('2026-09-16'),
      contract: vollzeit,
      absence: { date: '2026-09-16', kind: 'unbezahlt', halfDay: false },
    });
    expect(konto.targetMinutes).toBe(0);
    expect(konto.creditedMinutes).toBe(0);
    expect(konto.balanceMinutes).toBe(0);
  });

  it('schreibt Krankenstand voll gut', () => {
    const konto = accountForDay({
      day: free('2026-09-16'),
      contract: teilzeit20,
      absence: { date: '2026-09-16', kind: 'krankenstand', halfDay: false },
    });
    expect(konto.creditedMinutes).toBe(240);
    expect(konto.balanceMinutes).toBe(0);
  });
});

describe('Zeitraumsaldo', () => {
  it('summiert die Tage und trägt den Anfangsbestand fort', () => {
    const konten = [
      accountForDay({ day: day('2026-09-14', ['08:00', '12:00'], ['12:30', '17:00']), contract: vollzeit }),
      accountForDay({ day: day('2026-09-15', ['08:00', '12:00'], ['12:30', '17:00']), contract: vollzeit }),
      accountForDay({ day: day('2026-09-16', ['08:00', '12:00'], ['12:30', '16:12']), contract: vollzeit }),
    ];
    const saldo = balanceForPeriod(konten, 12 * 60 + 45);
    expect(saldo.balanceMinutes).toBe(96); // 2 × 48 Minuten
    expect(saldo.closingBalanceMinutes).toBe(12 * 60 + 45 + 96);
    expect(saldo.from).toBe('2026-09-14');
    expect(saldo.to).toBe('2026-09-16');
  });
});

describe('§ 2 UrlG — Urlaubskonto', () => {
  const konto = (
    employee: typeof erwachsene,
    asOf: string,
    mode: VacationYearMode = 'arbeitsjahr',
    consumedDays = 0,
    carriedOverDays = 0,
  ) => vacationAccount({ employee, contract: vollzeit, asOf, mode, consumedDays, carriedOverDays });

  it('gewährt 25 Arbeitstage', () => {
    expect(annualVacationDays(erwachsene, vollzeit, '2026-01-01')).toBe(25);
  });

  it('gewährt nach 25 vollendeten Dienstjahren 30 Arbeitstage', () => {
    const langgedient = { ...erwachsene, hiredOn: '1998-03-01' };
    expect(annualVacationDays(langgedient, vollzeit, '2026-03-01')).toBe(30);
    // Ein Tag vor dem 25. Jahrestag sind es noch 25.
    const fast = { ...erwachsene, hiredOn: '2001-03-02' };
    expect(annualVacationDays(fast, vollzeit, '2026-03-01')).toBe(25);
  });

  it('übernimmt einen höheren vertraglichen Anspruch', () => {
    expect(
      annualVacationDays(erwachsene, { ...vollzeit, vacationDaysPerYear: 30 }, '2026-01-01'),
    ).toBe(30);
  });

  it('legt das Urlaubsjahr gesetzlich auf das Arbeitsjahr', () => {
    const neu = { ...erwachsene, hiredOn: '2024-07-15' };
    expect(vacationYearFor(neu.hiredOn, '2026-03-10', 'arbeitsjahr')).toEqual({
      start: '2025-07-15',
      end: '2026-07-14',
    });
    expect(vacationYearFor(neu.hiredOn, '2026-03-10', 'kalenderjahr')).toEqual({
      start: '2026-01-01',
      end: '2026-12-31',
    });
  });

  it('rechnet den vollen Anspruch ab dem zweiten Arbeitsjahr', () => {
    const k = konto(erwachsene, '2026-09-01', 'arbeitsjahr', 8);
    expect(k.aliquot).toBe(false);
    expect(k.accruing).toBe(false);
    expect(k.entitlementDays).toBe(25);
    expect(k.remainingDays).toBe(17);
  });

  it('lässt den Anspruch in den ersten sechs Monaten anteilig wachsen', () => {
    // Eintritt 1. Juli: am ersten Tag praktisch nichts, nach drei Monaten ein
    // Viertel, nach sechs Monaten alles.
    const neu = { ...erwachsene, hiredOn: '2026-07-01' };

    const ersterTag = konto(neu, '2026-07-01');
    expect(ersterTag.accruing).toBe(true);
    expect(ersterTag.entitlementDays).toBeLessThan(0.1);
    expect(ersterTag.fullFrom).toBe('2027-01-01');

    const dreiMonate = konto(neu, '2026-09-30');
    expect(dreiMonate.entitlementDays).toBeCloseTo(6.3, 1);

    const sechsMonate = konto(neu, '2027-01-01');
    expect(sechsMonate.accruing).toBe(false);
    expect(sechsMonate.entitlementDays).toBe(25);
    expect(sechsMonate.periodStart).toBe('2026-07-01');
    expect(sechsMonate.periodEnd).toBe('2027-06-30');
  });

  it('gewährt beim Kalenderjahr im Eintrittsjahr nur den Anteil', () => {
    const neu = { ...erwachsene, hiredOn: '2026-07-01' };
    // Am Jahresende: ein halbes Jahr beschäftigt, also rund die Hälfte.
    const k = konto(neu, '2026-12-31', 'kalenderjahr');
    expect(k.aliquot).toBe(true);
    expect(k.entitlementDays).toBeGreaterThan(12);
    expect(k.entitlementDays).toBeLessThan(13);
    // Im Folgejahr voll.
    expect(konto(neu, '2027-02-01', 'kalenderjahr').entitlementDays).toBe(25);
  });

  it('kürzt im Urlaubsjahr des Austritts anteilig', () => {
    const scheidend = { ...erwachsene, hiredOn: '2020-01-01', leftOn: '2026-03-31' };
    const k = konto(scheidend, '2026-03-31');
    expect(k.aliquot).toBe(true);
    expect(k.entitlementDays).toBeCloseTo(6.2, 1);
  });

  it('rechnet den Resturlaub des Vorjahres hinzu', () => {
    expect(konto(erwachsene, '2026-09-01', 'arbeitsjahr', 5, 3).remainingDays).toBe(23);
  });

  it('zählt nur die Abwesenheiten, die Urlaub verbrauchen', () => {
    const abwesenheiten: Absence[] = [
      { date: '2026-07-01', kind: 'urlaub', halfDay: false },
      { date: '2026-07-02', kind: 'urlaub', halfDay: true },
      { date: '2026-07-03', kind: 'krankenstand', halfDay: false },
      { date: '2026-07-06', kind: 'zeitausgleich', halfDay: false },
      { date: '2026-11-02', kind: 'persoenlicher_feiertag', halfDay: false },
    ];
    expect(consumedVacationDays(abwesenheiten)).toBe(2.5);
  });
});

describe('§ 7a ARG — persönlicher Feiertag', () => {
  it('lässt einen pro Kalenderjahr zu', () => {
    const abwesenheiten: Absence[] = [
      { date: '2026-04-03', kind: 'persoenlicher_feiertag', halfDay: false },
    ];
    expect(checkPersonalHoliday(abwesenheiten, 2026, '2026-01-02', '2026-04-03')).toBeNull();
  });

  it('beanstandet den zweiten im selben Jahr', () => {
    const abwesenheiten: Absence[] = [
      { date: '2026-04-03', kind: 'persoenlicher_feiertag', halfDay: false },
      { date: '2026-10-30', kind: 'persoenlicher_feiertag', halfDay: false },
    ];
    const result = checkPersonalHoliday(abwesenheiten, 2026, null, '2026-10-30')!;
    expect(result.severity).toBe('verstoss');
    expect(result.reference).toBe('§ 7a Abs 1 ARG');
  });

  it('weist auf die Dreimonatsfrist hin', () => {
    const abwesenheiten: Absence[] = [
      { date: '2026-04-03', kind: 'persoenlicher_feiertag', halfDay: false },
    ];
    const result = checkPersonalHoliday(abwesenheiten, 2026, '2026-03-15', '2026-04-03')!;
    expect(result.severity).toBe('hinweis');
    expect(result.message).toContain('drei Monate');
  });
});

describe('§ 5 ASVG — Geringfügigkeitsgrenze', () => {
  const geringfuegig = { ...teilzeit20, category: 'geringfuegig' as const, weeklyHours: 8 };

  it('schweigt bei anderen Vertragsarten', () => {
    expect(checkGeringfuegigkeit({ ...vollzeit, monthlyGrossCents: 400000 }, '2026-09-01')).toBeNull();
  });

  it('schweigt deutlich unter der Grenze', () => {
    expect(checkGeringfuegigkeit({ ...geringfuegig, monthlyGrossCents: 40000 }, '2026-09-01')).toBeNull();
  });

  it('warnt knapp unter der Grenze', () => {
    const result = checkGeringfuegigkeit({ ...geringfuegig, monthlyGrossCents: 54000 }, '2026-09-01')!;
    expect(result.severity).toBe('hinweis');
    expect(result.message).toContain('551,10 €');
  });

  it('beanstandet die Überschreitung', () => {
    // Die Grenze liegt 2026 unverändert bei 551,10 € im Monat.
    const result = checkGeringfuegigkeit({ ...geringfuegig, monthlyGrossCents: 56000 }, '2026-09-01')!;
    expect(result.severity).toBe('verstoss');
    expect(result.limit).toBe(55110);
    expect(result.message).toContain('voll versicherungspflichtig');
  });

  it('fällt für ein ungepflegtes Jahr auf den letzten bekannten Wert zurück und sagt es', () => {
    const result = checkGeringfuegigkeit({ ...geringfuegig, monthlyGrossCents: 90000 }, '2029-09-01')!;
    expect(result.severity).toBe('verstoss');
    expect(result.message).toContain('noch kein Wert hinterlegt');
  });
});
