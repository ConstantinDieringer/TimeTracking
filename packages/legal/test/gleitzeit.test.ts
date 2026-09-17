import { describe, expect, it } from 'vitest';
import {
  checkFlexCarry,
  checkFlexDailyLimit,
  checkFlexFrame,
  flexDailyNormalLimit,
  flexPeriodFor,
} from '../src/gleitzeit.js';
import { day, gleitzeitMitGanztag, gleitzeitOhneGanztag, vollzeit } from './fixtures.js';

describe('§ 4b Abs 4 AZG — die Bedingung für die zwölfte Stunde', () => {
  // Der häufigste Rechenfehler in der Praxis: bei Gleitzeit wird die elfte
  // Stunde pauschal als Normalarbeitszeit verbucht. Zulässig ist das nur,
  // wenn die Vereinbarung ganztägigen Verbrauch von Zeitguthaben vorsieht.
  it('bleibt ohne ganztägige Verbrauchsmöglichkeit bei zehn Stunden', () => {
    expect(flexDailyNormalLimit(gleitzeitOhneGanztag.flexTime)).toBe(10 * 60);
  });

  it('erlaubt zwölf Stunden erst mit ganztägiger Verbrauchsmöglichkeit', () => {
    expect(flexDailyNormalLimit(gleitzeitMitGanztag.flexTime)).toBe(12 * 60);
  });

  it('macht die elfte Stunde ohne diese Bedingung zur Überstunde', () => {
    const elfStunden = day('2026-09-14', ['07:00', '12:00'], ['12:30', '18:30']);
    const result = checkFlexDailyLimit(elfStunden, gleitzeitOhneGanztag)!;
    expect(result.severity).toBe('hinweis');
    expect(result.limit).toBe(10 * 60);
    expect(result.message).toContain('50 % Zuschlag');
    expect(result.message).toContain('keine Normalarbeitszeit');
  });

  it('lässt dieselben elf Stunden mit der Bedingung unbeanstandet', () => {
    const elfStunden = day('2026-09-14', ['07:00', '12:00'], ['12:30', '18:30']);
    expect(checkFlexDailyLimit(elfStunden, gleitzeitMitGanztag)).toBeNull();
  });

  it('greift gar nicht ohne Gleitzeitvereinbarung', () => {
    const elfStunden = day('2026-09-14', ['07:00', '12:00'], ['12:30', '18:30']);
    expect(checkFlexDailyLimit(elfStunden, vollzeit)).toBeNull();
  });
});

describe('Gleitzeitperiode', () => {
  const monatlich = gleitzeitOhneGanztag.flexTime!;

  it('findet die laufende Monatsperiode', () => {
    expect(flexPeriodFor(monatlich, '2026-09-17')).toEqual({
      start: '2026-09-01',
      end: '2026-09-30',
      index: 8,
    });
  });

  it('trifft den ersten und letzten Tag der Periode', () => {
    expect(flexPeriodFor(monatlich, '2026-09-01').start).toBe('2026-09-01');
    expect(flexPeriodFor(monatlich, '2026-09-30').end).toBe('2026-09-30');
    expect(flexPeriodFor(monatlich, '2026-10-01').start).toBe('2026-10-01');
  });

  it('rechnet auch vor den Anker zurück', () => {
    expect(flexPeriodFor(monatlich, '2025-12-15')).toEqual({
      start: '2025-12-01',
      end: '2025-12-31',
      index: -1,
    });
  });

  it('kommt mit Quartalsperioden zurecht', () => {
    const quartal = { ...monatlich, periodMonths: 3 };
    expect(flexPeriodFor(quartal, '2026-09-17')).toEqual({
      start: '2026-07-01',
      end: '2026-09-30',
      index: 2,
    });
    expect(flexPeriodFor(quartal, '2026-10-01').start).toBe('2026-10-01');
  });
});

describe('§ 4b Abs 2 Z 2 AZG — Gleitzeitrahmen', () => {
  it('meldet Arbeit vor dem Rahmen', () => {
    const result = checkFlexFrame(day('2026-09-14', ['05:30', '12:00']), gleitzeitOhneGanztag)!;
    expect(result.severity).toBe('hinweis');
    expect(result.message).toContain('vor 06:00');
  });

  it('meldet Arbeit nach dem Rahmen', () => {
    const result = checkFlexFrame(
      day('2026-09-14', ['09:00', '13:00'], ['13:30', '21:00']),
      gleitzeitOhneGanztag,
    )!;
    expect(result.message).toContain('nach 20:00');
  });

  it('schweigt innerhalb des Rahmens', () => {
    expect(
      checkFlexFrame(day('2026-09-14', ['08:00', '12:00'], ['12:30', '17:00']), gleitzeitOhneGanztag),
    ).toBeNull();
  });
});

describe('§ 4b Abs 2 Z 3 AZG — Übertrag in die nächste Periode', () => {
  it('schweigt bei einem Saldo innerhalb der Grenzen', () => {
    expect(checkFlexCarry(20 * 60, gleitzeitOhneGanztag, '2026-09-05')).toBeNull();
  });

  it('warnt bei Überschreitung, solange sich noch etwas ausrichten lässt', () => {
    // Grenze 40 h, Saldo 45 h, Periodenende 30.09. — am 5. September bleiben
    // 25 Tage zum Abbau.
    const result = checkFlexCarry(45 * 60, gleitzeitOhneGanztag, '2026-09-05')!;
    expect(result.code).toBe('gleitzeit.uebertrag_guthaben');
    expect(result.severity).toBe('hinweis');
    expect(result.message).toContain('30.09.2026');
  });

  it('wird zum Verstoß, wenn die Periode fast vorbei ist', () => {
    const result = checkFlexCarry(45 * 60, gleitzeitOhneGanztag, '2026-09-25')!;
    expect(result.severity).toBe('verstoss');
  });

  it('kennt auch die Grenze für Zeitschulden', () => {
    const result = checkFlexCarry(-12 * 60, gleitzeitOhneGanztag, '2026-09-25')!;
    expect(result.code).toBe('gleitzeit.uebertrag_schuld');
    expect(result.severity).toBe('verstoss');
  });

  it('warnt vor dem Periodenende, wenn der Saldo der Grenze nahe kommt', () => {
    const result = checkFlexCarry(36 * 60, gleitzeitOhneGanztag, '2026-09-20')!;
    expect(result.code).toBe('gleitzeit.uebertrag_naehe');
    expect(result.severity).toBe('hinweis');
  });
});
