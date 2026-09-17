import { describe, expect, it } from 'vitest';
import {
  accountForDay,
  annualVacationDays,
  balanceForPeriod,
  checkGeringfuegigkeit,
  checkPersonalHoliday,
  consumedVacationDays,
  vacationAccount,
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
  it('gewährt 25 Arbeitstage', () => {
    expect(annualVacationDays(erwachsene, vollzeit, 2026)).toBe(25);
  });

  it('gewährt nach 25 Dienstjahren 30 Arbeitstage', () => {
    const langgedient = { ...erwachsene, hiredOn: '1998-03-01' };
    expect(annualVacationDays(langgedient, vollzeit, 2026)).toBe(30);
  });

  it('übernimmt einen höheren vertraglichen Anspruch', () => {
    expect(annualVacationDays(erwachsene, { ...vollzeit, vacationDaysPerYear: 30 }, 2026)).toBe(30);
  });

  it('rechnet den vollen Anspruch bei ganzjähriger Beschäftigung', () => {
    const konto = vacationAccount(erwachsene, vollzeit, 2026, 8);
    expect(konto.aliquot).toBe(false);
    expect(konto.entitlementDays).toBe(25);
    expect(konto.remainingDays).toBe(17);
  });

  it('aliquotiert im Eintrittsjahr', () => {
    // Eintritt am 1. Juli: rund die Hälfte des Jahres.
    const neu = { ...erwachsene, hiredOn: '2026-07-01' };
    const konto = vacationAccount(neu, vollzeit, 2026, 0);
    expect(konto.aliquot).toBe(true);
    expect(konto.entitlementDays).toBeGreaterThan(12);
    expect(konto.entitlementDays).toBeLessThan(13);
  });

  it('aliquotiert im Austrittsjahr', () => {
    const scheidend = { ...erwachsene, leftOn: '2026-03-31' };
    const konto = vacationAccount(scheidend, vollzeit, 2026, 0);
    expect(konto.aliquot).toBe(true);
    expect(konto.entitlementDays).toBeCloseTo(6, 0);
  });

  it('rechnet den Resturlaub des Vorjahres hinzu', () => {
    const konto = vacationAccount(erwachsene, vollzeit, 2026, 5, 3);
    expect(konto.remainingDays).toBe(23);
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
