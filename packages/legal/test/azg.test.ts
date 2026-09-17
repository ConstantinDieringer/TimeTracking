import { describe, expect, it } from 'vitest';
import {
  checkBreak,
  checkDailyMaximum,
  checkDailyRest,
  checkSeventeenWeekAverage,
  checkWeeklyMaximum,
} from '../src/azg.js';
import { day, free } from './fixtures.js';

describe('§ 9 AZG — Höchstarbeitszeit', () => {
  it('lässt zwölf Stunden zu', () => {
    const result = checkDailyMaximum(day('2026-09-14', ['06:00', '12:00'], ['12:30', '18:30']));
    expect(result.severity).toBe('ok');
    expect(result.actual).toBe(12 * 60);
  });

  it('beanstandet die dreizehnte Stunde', () => {
    const result = checkDailyMaximum(day('2026-09-14', ['06:00', '12:00'], ['12:30', '19:00']));
    expect(result.severity).toBe('verstoss');
    expect(result.actual).toBe(12 * 60 + 30);
    expect(result.reference).toBe('§ 9 Abs 1 AZG');
    expect(result.message).toContain('12:30');
  });

  it('beanstandet die 61. Wochenstunde', () => {
    const woche = [
      day('2026-09-14', ['06:00', '12:00'], ['12:30', '19:00']), // 12:30
      day('2026-09-15', ['06:00', '12:00'], ['12:30', '19:00']), // 12:30
      day('2026-09-16', ['06:00', '12:00'], ['12:30', '19:00']), // 12:30
      day('2026-09-17', ['06:00', '12:00'], ['12:30', '19:00']), // 12:30
      day('2026-09-18', ['06:00', '12:00'], ['12:30', '19:00']), // 12:30
      free('2026-09-19'),
      free('2026-09-20'),
    ];
    const result = checkWeeklyMaximum(woche, '2026-09-14');
    expect(result.actual).toBe(62 * 60 + 30);
    expect(result.severity).toBe('verstoss');
  });
});

describe('§ 11 AZG — Ruhepause', () => {
  it('verlangt bei genau sechs Stunden noch keine Pause', () => {
    expect(checkBreak(day('2026-09-14', ['08:00', '14:00'])).severity).toBe('ok');
  });

  it('beanstandet sechseinhalb Stunden ohne Pause', () => {
    const result = checkBreak(day('2026-09-14', ['08:00', '14:30']));
    expect(result.severity).toBe('verstoss');
    expect(result.reference).toBe('§ 11 Abs 1 AZG');
    expect(result.message).toContain('Keine Ruhepause');
  });

  it('beanstandet eine zu kurze Pause', () => {
    const result = checkBreak(day('2026-09-14', ['08:00', '12:00'], ['12:20', '17:00']));
    expect(result.severity).toBe('verstoss');
    expect(result.actual).toBe(20);
  });

  it('akzeptiert die Teilung in zwei Pausen zu je 15 Minuten', () => {
    const result = checkBreak(
      day('2026-09-14', ['08:00', '10:00'], ['10:15', '13:00'], ['13:15', '17:00']),
    );
    expect(result.severity).toBe('ok');
    expect(result.actual).toBe(30);
  });

  it('akzeptiert die Teilung in drei Pausen zu je 10 Minuten', () => {
    const result = checkBreak(
      day(
        '2026-09-14',
        ['08:00', '10:00'],
        ['10:10', '12:00'],
        ['12:10', '14:00'],
        ['14:10', '17:00'],
      ),
    );
    expect(result.severity).toBe('ok');
  });

  it('beanstandet eine unzulässige Teilung, auch wenn die Summe stimmt', () => {
    // 20 + 12 Minuten ergeben 32 Minuten — mehr als vorgeschrieben, aber
    // weder eine Pause zu 30 noch zwei zu 15 noch drei zu 10 Minuten.
    const result = checkBreak(
      day('2026-09-14', ['08:00', '10:00'], ['10:20', '12:00'], ['12:12', '17:00']),
    );
    expect(result.severity).toBe('verstoss');
    expect(result.code).toBe('azg.ruhepause_teilung');
  });

  it('wertet eine nicht erfasste Lücke als Pause', () => {
    // Wer von 12:00 bis 13:00 nichts erfasst, hat pausiert — auch ohne Klick.
    const result = checkBreak(day('2026-09-14', ['08:00', '12:00'], ['13:00', '17:00']));
    expect(result.severity).toBe('ok');
    expect(result.actual).toBe(60);
  });
});

describe('§ 12 AZG — tägliche Ruhezeit', () => {
  it('beanstandet acht Stunden zwischen Feierabend und Arbeitsbeginn', () => {
    const gestern = day('2026-09-14', ['13:00', '22:00']);
    const heute = day('2026-09-15', ['06:00', '12:00']);
    const result = checkDailyRest(gestern, heute)!;
    expect(result.severity).toBe('verstoss');
    expect(result.actual).toBe(8 * 60);
    expect(result.message).toContain('22:00');
  });

  it('lässt genau elf Stunden zu', () => {
    const gestern = day('2026-09-14', ['13:00', '21:00']);
    const heute = day('2026-09-15', ['08:00', '12:00']);
    expect(checkDailyRest(gestern, heute)!.severity).toBe('ok');
  });

  // Der Fall, an dem eine Zeiterfassung ohne echte Zeitzonenrechnung scheitert:
  // die Uhrzeitdifferenz beträgt beide Male elf Stunden, die tatsächlich
  // verstrichene Zeit aber nicht.
  it('erkennt die verkürzte Nacht beim Beginn der Sommerzeit als Verstoß', () => {
    const gestern = day('2026-03-28', ['14:00', '22:00']);
    const heute = day('2026-03-29', ['09:00', '13:00']);
    const result = checkDailyRest(gestern, heute)!;
    expect(result.actual).toBe(10 * 60);
    expect(result.severity).toBe('verstoss');
  });

  it('erkennt die verlängerte Nacht beim Ende der Sommerzeit als zulässig', () => {
    const gestern = day('2026-10-24', ['14:00', '22:00']);
    const heute = day('2026-10-25', ['09:00', '13:00']);
    const result = checkDailyRest(gestern, heute)!;
    expect(result.actual).toBe(12 * 60);
    expect(result.severity).toBe('ok');
  });

  it('schweigt, wenn an einem der beiden Tage nicht gearbeitet wurde', () => {
    expect(checkDailyRest(free('2026-09-14'), day('2026-09-15', ['08:00', '12:00']))).toBeNull();
    expect(checkDailyRest(day('2026-09-14', ['08:00', '12:00']), free('2026-09-15'))).toBeNull();
    expect(checkDailyRest(null, day('2026-09-15', ['08:00', '12:00']))).toBeNull();
  });
});

describe('§ 9 Abs 4 AZG — Durchschnitt über 17 Wochen', () => {
  const wochen = (anzahl: number, stunden: number) => Array.from({ length: anzahl }, () => stunden * 60);

  it('meldet einen unauffälligen Schnitt als in Ordnung', () => {
    const result = checkSeventeenWeekAverage(wochen(17, 44), '2026-09-14');
    expect(result.severity).toBe('ok');
    expect(result.actual).toBe(44 * 60);
  });

  it('wertet genau 48 Stunden als zulässig, aber meldet sie', () => {
    // Die Grenze ist nicht überschritten, also kein Verstoß — aber es ist
    // kein Zustand, den man unbemerkt lassen sollte.
    const result = checkSeventeenWeekAverage(wochen(17, 48), '2026-09-14');
    expect(result.severity).toBe('hinweis');
    expect(result.actual).toBe(48 * 60);
  });

  it('beanstandet den Schnitt knapp darüber', () => {
    // Einzelne 60-Stunden-Wochen sind zulässig, der Schnitt darüber nicht.
    const werte = [...wochen(16, 48), 49 * 60 + 42];
    const result = checkSeventeenWeekAverage(werte, '2026-09-14');
    expect(result.severity).toBe('verstoss');
    expect(result.reference).toBe('§ 9 Abs 4 AZG');
  });

  it('warnt schon ab 46 Stunden, bevor die Grenze fällt', () => {
    const result = checkSeventeenWeekAverage(wochen(17, 46), '2026-09-14');
    expect(result.severity).toBe('hinweis');
    expect(result.message).toContain('rückt näher');
  });

  it('betrachtet nur die letzten 17 Wochen', () => {
    // Drei extreme Wochen, die aus dem Fenster gelaufen sind, zählen nicht mehr.
    const werte = [...wochen(3, 60), ...wochen(17, 40)];
    expect(checkSeventeenWeekAverage(werte, '2026-09-14').severity).toBe('ok');
  });

  it('rechnet auch mit weniger als 17 Wochen Historie', () => {
    const result = checkSeventeenWeekAverage(wochen(4, 52), '2026-09-14');
    expect(result.severity).toBe('verstoss');
    expect(result.message).toContain('4 von 17 Wochen');
  });
});
