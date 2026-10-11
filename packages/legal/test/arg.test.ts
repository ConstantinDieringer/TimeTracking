import { describe, expect, it } from 'vitest';
import { checkHolidayRest, checkWeeklyRest, substituteRestClaim } from '../src/arg.js';
import type { DayWork } from '../src/work.js';
import { day, free } from './fixtures.js';

/**
 * Für die Wochenruhe muss über die Wochengrenze hinaus geschaut werden.
 * Der Sonntag ist jeweils der 20. September 2026.
 */
const sonntag = '2026-09-20';

function umgebung(overrides: Record<string, DayWork> = {}): DayWork[] {
  const standard: Record<string, DayWork> = {
    '2026-09-18': day('2026-09-18', ['08:00', '12:00'], ['12:30', '17:00']), // Freitag
    '2026-09-19': free('2026-09-19'), // Samstag
    '2026-09-20': free('2026-09-20'), // Sonntag
    '2026-09-21': day('2026-09-21', ['08:00', '12:00'], ['12:30', '17:00']), // Montag
    '2026-09-22': day('2026-09-22', ['08:00', '12:00'], ['12:30', '17:00']), // Dienstag
  };
  return Object.values({ ...standard, ...overrides });
}

describe('§ 3 ARG — wöchentliche Ruhezeit', () => {
  it('ist mit einem freien Wochenende zufrieden', () => {
    // Freitag 17:00 bis Montag 08:00 sind 63 Stunden.
    const result = checkWeeklyRest(umgebung(), sonntag);
    expect(result.severity).toBe('ok');
    expect(result.actual).toBe(63 * 60);
  });

  it('beanstandet Sonntagsarbeit', () => {
    const result = checkWeeklyRest(
      umgebung({ '2026-09-20': day('2026-09-20', ['09:00', '13:00']) }),
      sonntag,
    );
    expect(result.code).toBe('arg.sonntagsarbeit');
    expect(result.severity).toBe('verstoss');
    expect(result.message).toContain('Ersatzruhe');
  });

  it('beanstandet eine Ruhezeit unter 36 Stunden', () => {
    // Samstag bis 20:00, Montag ab 06:00 — dazwischen 34 Stunden.
    const result = checkWeeklyRest(
      umgebung({
        '2026-09-19': day('2026-09-19', ['12:00', '20:00']),
        '2026-09-21': day('2026-09-21', ['06:00', '12:00'], ['12:30', '15:00']),
      }),
      sonntag,
    );
    expect(result.code).toBe('arg.wochenruhe');
    expect(result.actual).toBe(34 * 60);
    expect(result.severity).toBe('verstoss');
  });

  it('meldet einen zu späten Beginn der Wochenendruhe, auch wenn sie lang genug ist', () => {
    // Samstag bis 16:00, Montag ab 08:00 — 40 Stunden, aber der Beginn liegt
    // nach der in § 3 Abs 2 ARG vorgesehenen Grenze von Samstag 13:00.
    const result = checkWeeklyRest(
      umgebung({ '2026-09-19': day('2026-09-19', ['09:00', '16:00']) }),
      sonntag,
    );
    expect(result.code).toBe('arg.wochenendruhe_beginn');
    expect(result.severity).toBe('hinweis');
    expect(result.message).toContain('Samstag');
  });

  it('lässt eine Ruhezeit zu, die schon Freitagabend beginnt', () => {
    const result = checkWeeklyRest(
      umgebung({ '2026-09-19': free('2026-09-19') }),
      sonntag,
    );
    expect(result.severity).toBe('ok');
  });
});

describe('§ 7 ARG — Feiertagsruhe', () => {
  it('meldet Arbeit am Nationalfeiertag', () => {
    const result = checkHolidayRest(day('2026-10-26', ['09:00', '13:00']))!;
    expect(result.severity).toBe('hinweis');
    expect(result.message).toContain('Nationalfeiertag');
    expect(result.reference).toContain('§ 9 Abs 5 ARG');
  });

  it('schweigt an einem Feiertag ohne Arbeit', () => {
    expect(checkHolidayRest(free('2026-10-26'))).toBeNull();
  });

  it('schweigt am Karfreitag — er ist kein Feiertag', () => {
    expect(checkHolidayRest(day('2026-04-03', ['08:00', '12:00'], ['12:30', '17:00']))).toBeNull();
  });

  it('schweigt an einem Landesfeiertag', () => {
    // Leopold, 15. November 2026 — kein Feiertag nach § 7 ARG.
    expect(checkHolidayRest(day('2026-11-15', ['09:00', '13:00']))).toBeNull();
  });
});

describe('§ 6 ARG — Ersatzruhe', () => {
  it('summiert Arbeit an Sonntagen und Feiertagen', () => {
    const tage = [
      day('2026-10-24', ['08:00', '12:00']), // Samstag, zählt nicht
      day('2026-10-25', ['09:00', '13:00']), // Sonntag, 4 h
      day('2026-10-26', ['09:00', '12:00']), // Nationalfeiertag, 3 h
      day('2026-10-27', ['08:00', '12:00'], ['12:30', '17:00']), // Dienstag, zählt nicht
    ];
    expect(substituteRestClaim(tage)).toBe(7 * 60);
  });

  it('bleibt bei null, wenn nur werktags gearbeitet wurde', () => {
    expect(substituteRestClaim(umgebung())).toBe(0);
  });
});
