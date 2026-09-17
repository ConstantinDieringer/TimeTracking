import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  atLocalTime,
  daysBetween,
  eachDay,
  endOfMonth,
  formatClock,
  formatDateLong,
  formatDuration,
  isoWeek,
  localDateOf,
  localMinutesOfDay,
  localTimeOf,
  minutesBetween,
  parseHm,
  startOfIsoWeek,
  toDecimalHours,
  weekdayOf,
} from '../src/time.js';

describe('Kalenderarithmetik', () => {
  it('zählt über Monats- und Jahresgrenzen', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('kennt Schaltjahre', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(endOfMonth('2024-02-10')).toBe('2024-02-29');
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
  });

  it('begrenzt beim Monatswechsel auf den letzten gültigen Tag', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
  });

  it('überspringt keinen Tag über die Zeitumstellung', () => {
    // Die Sommerzeit beginnt am 29. März 2026. Kalendarisch ändert das nichts.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(eachDay('2026-03-28', '2026-03-30')).toEqual([
      '2026-03-28',
      '2026-03-29',
      '2026-03-30',
    ]);
  });

  it('bestimmt Wochentag und Wochenbeginn nach ISO 8601', () => {
    expect(weekdayOf('2026-09-17')).toBe(4); // Donnerstag
    expect(weekdayOf('2026-09-20')).toBe(7); // Sonntag, nicht 0
    expect(startOfIsoWeek('2026-09-17')).toBe('2026-09-14');
    expect(startOfIsoWeek('2026-09-20')).toBe('2026-09-14');
  });

  it('zählt Kalenderwochen nach der Donnerstagsregel', () => {
    // KW 1 ist die Woche mit dem ersten Donnerstag des Jahres. 2026 fällt der
    // 1. Jänner auf einen Donnerstag, die Woche beginnt also schon im Vorjahr.
    expect(isoWeek('2026-01-01')).toEqual({ year: 2026, week: 1 });
    expect(isoWeek('2025-12-29')).toEqual({ year: 2026, week: 1 });
    expect(isoWeek('2026-09-17')).toEqual({ year: 2026, week: 38 });
  });
});

describe('Zeitpunkte in Europe/Vienna', () => {
  it('rechnet Ortszeit und Zeitpunkt verlustfrei ineinander', () => {
    const instant = atLocalTime('2026-09-17', parseHm('08:30'));
    expect(localDateOf(instant)).toBe('2026-09-17');
    expect(localTimeOf(instant)).toBe('08:30');
    expect(localMinutesOfDay(instant)).toBe(510);
  });

  it('bildet Schichten über Mitternacht ab', () => {
    // 25:00 bedeutet: 01:00 des Folgetags.
    const instant = atLocalTime('2026-03-02', 25 * 60);
    expect(localDateOf(instant)).toBe('2026-03-03');
    expect(localTimeOf(instant)).toBe('01:00');
  });

  it('misst die tatsächlich verstrichene Zeit, nicht die Differenz der Ziffernblätter', () => {
    const start = atLocalTime('2026-09-17', parseHm('08:12'));
    const end = atLocalTime('2026-09-17', parseHm('17:04'));
    expect(minutesBetween(start, end)).toBe(532); // 8:52
  });

  // Der eigentliche Grund, warum diese Schicht existiert: an den beiden
  // Umstellungstagen weicht die verstrichene Zeit von der Uhrzeitdifferenz ab.
  // Eine Ruhezeit, die naiv aus Stunden gerechnet wird, fällt hier durch.
  it('verkürzt die Nacht beim Beginn der Sommerzeit', () => {
    const feierabend = atLocalTime('2026-03-28', parseHm('22:00'));
    const arbeitsbeginn = atLocalTime('2026-03-29', parseHm('09:00'));
    expect(minutesBetween(feierabend, arbeitsbeginn)).toBe(10 * 60);
  });

  it('verlängert die Nacht beim Ende der Sommerzeit', () => {
    const feierabend = atLocalTime('2026-10-24', parseHm('22:00'));
    const arbeitsbeginn = atLocalTime('2026-10-25', parseHm('09:00'));
    expect(minutesBetween(feierabend, arbeitsbeginn)).toBe(12 * 60);
  });

  it('weist unsinnige Uhrzeiten zurück', () => {
    expect(() => parseHm('24:00')).toThrow();
    expect(() => parseHm('08:60')).toThrow();
    expect(() => parseHm('halb neun')).toThrow();
  });
});

describe('Darstellung', () => {
  it('schreibt Uhrzeiten zweistellig', () => {
    expect(formatClock(510)).toBe('08:30');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(1439)).toBe('23:59');
  });

  it('schreibt Dauern ohne führende Null, Salden mit Vorzeichen', () => {
    expect(formatDuration(532)).toBe('8:52');
    expect(formatDuration(22, { sign: true })).toBe('+0:22');
    expect(formatDuration(-75)).toBe('−1:15');
    expect(formatDuration(0, { sign: true })).toBe('+0:00');
  });

  it('liefert Dezimalstunden für die Lohnverrechnung', () => {
    expect(toDecimalHours(532)).toBe(8.87);
    expect(toDecimalHours(30)).toBe(0.5);
  });

  it('schreibt Datumsangaben österreichisch', () => {
    expect(formatDateLong('2026-01-15')).toBe('Donnerstag, 15. Jänner 2026');
  });
});
