import { describe, expect, it } from 'vitest';
import {
  COMMON_COLLECTIVE_WEEKLY_HOURS,
  classifyWeek,
  dailyNormalLimitFor,
  defaultDailyTargets,
} from '../src/classify.js';
import { day, free, gleitzeitMitGanztag, gleitzeitOhneGanztag, teilzeit20, vollzeit } from './fixtures.js';
import type { DayWork } from '../src/work.js';

/** Fünf gleiche Tage, Samstag und Sonntag frei. */
function woche(...blocks: Array<[string, string]>): DayWork[] {
  return [
    day('2026-09-14', ...blocks),
    day('2026-09-15', ...blocks),
    day('2026-09-16', ...blocks),
    day('2026-09-17', ...blocks),
    day('2026-09-18', ...blocks),
    free('2026-09-19'),
    free('2026-09-20'),
  ];
}

describe('§ 19d AZG — Mehrarbeit bei Teilzeit', () => {
  // Der Kern der Unterscheidung: Stunden über den vereinbarten 20, aber unter
  // der kollektivvertraglichen Normalarbeitszeit von 38,5 sind Mehrarbeit mit
  // 25 % — keine Überstunden mit 50 %.
  it('macht aus vier Zusatzstunden Mehrarbeit, nicht Überstunden', () => {
    const tage = [
      day('2026-09-14', ['08:00', '12:48']), // 4:48
      day('2026-09-15', ['08:00', '12:48']),
      day('2026-09-16', ['08:00', '12:48']),
      day('2026-09-17', ['08:00', '12:48']),
      day('2026-09-18', ['08:00', '12:48']),
      free('2026-09-19'),
      free('2026-09-20'),
    ];
    const result = classifyWeek(tage, teilzeit20);
    expect(result.totalMinutes).toBe(24 * 60);
    expect(result.normalMinutes).toBe(20 * 60);
    expect(result.mehrarbeitMinutes).toBe(4 * 60);
    expect(result.ueberstundenMinutes).toBe(0);
    expect(result.mehrarbeitSurchargeMinutes).toBe(60); // 25 % von 4 h
  });

  it('beginnt die Überstunde erst über der kollektivvertraglichen Grenze', () => {
    // 42 Stunden bei 20 vereinbarten und 38,5 kollektivvertraglichen:
    // 18,5 h Mehrarbeit, 3,5 h Überstunde.
    const tage = woche(['07:00', '12:00'], ['12:30', '16:00']); // 8:30 pro Tag
    const result = classifyWeek(tage, teilzeit20);
    expect(result.totalMinutes).toBe(42 * 60 + 30);
    expect(result.normalMinutes).toBe(20 * 60);
    expect(result.mehrarbeitMinutes).toBe(18 * 60 + 30);
    expect(result.ueberstundenMinutes).toBe(4 * 60);
    expect(result.mehrarbeitSurchargeMinutes).toBe(Math.round(18.5 * 60 * 0.25));
    expect(result.ueberstundenSurchargeMinutes).toBe(2 * 60);
  });

  it('kennt bei Vollzeit gar keine Mehrarbeit', () => {
    // Vereinbarte und kollektivvertragliche Arbeitszeit fallen zusammen,
    // also bleibt für Mehrarbeit kein Raum.
    const tage = woche(['08:00', '12:00'], ['12:30', '17:00']); // 8:30
    const result = classifyWeek(tage, vollzeit);
    expect(result.mehrarbeitMinutes).toBe(0);
    expect(result.ueberstundenMinutes).toBe(42 * 60 + 30 - 38 * 60 - 30);
  });
});

describe('§ 10 AZG — Überstunde durch Überschreiten der Tagesgrenze', () => {
  it('entsteht auch dann, wenn die Woche unter der Normalarbeitszeit bleibt', () => {
    // Montag zwölf Stunden, Dienstag bis Donnerstag je acht, Freitag frei:
    // 36 Stunden in der Woche — unter 38,5 — und trotzdem vier Überstunden.
    const tage = [
      day('2026-09-14', ['06:00', '12:00'], ['12:30', '18:30']), // 12:00
      day('2026-09-15', ['08:00', '12:00'], ['12:30', '16:30']), // 8:00
      day('2026-09-16', ['08:00', '12:00'], ['12:30', '16:30']),
      day('2026-09-17', ['08:00', '12:00'], ['12:30', '16:30']),
      free('2026-09-18'),
      free('2026-09-19'),
      free('2026-09-20'),
    ];
    const result = classifyWeek(tage, vollzeit);
    expect(result.totalMinutes).toBe(36 * 60);
    expect(result.ueberstundenMinutes).toBe(4 * 60);
    expect(result.ueberstundenSurchargeMinutes).toBe(2 * 60);
  });
});

describe('Vorschlag für die Wochenverteilung', () => {
  it('teilt die gängigen Wochenarbeitszeiten glatt auf fünf Tage', () => {
    expect(defaultDailyTargets(38.5)).toEqual({ 1: 462, 2: 462, 3: 462, 4: 462, 5: 462, 6: 0, 7: 0 });
    expect(defaultDailyTargets(40)).toEqual({ 1: 480, 2: 480, 3: 480, 4: 480, 5: 480, 6: 0, 7: 0 });
    expect(defaultDailyTargets(20)).toEqual({ 1: 240, 2: 240, 3: 240, 4: 240, 5: 240, 6: 0, 7: 0 });
  });

  it('verteilt einen Rest, statt ihn wegzurunden', () => {
    // 38,6 h sind 2316 Minuten; fünf gleiche Tage gingen sich nicht aus.
    const targets = defaultDailyTargets(38.6);
    const sum = Object.values(targets).reduce((total, value) => total + value, 0);
    expect(sum).toBe(2316);
    expect(targets[1]).toBe(464);
    expect(targets[5]).toBe(463);
  });

  it('lässt das Wochenende frei', () => {
    const targets = defaultDailyTargets(40);
    expect(targets[6]).toBe(0);
    expect(targets[7]).toBe(0);
  });

  it('kennt die beiden gängigen Normalarbeitszeiten', () => {
    expect(COMMON_COLLECTIVE_WEEKLY_HOURS).toEqual([38.5, 40]);
  });
});

describe('Tägliche Normalarbeitszeit', () => {
  it('sind ohne Gleitzeit acht Stunden', () => {
    expect(dailyNormalLimitFor(vollzeit, '2026-09-14')).toBe(8 * 60);
  });

  it('folgt bei abweichender Verteilung dem Tagessoll, höchstens zehn Stunden', () => {
    const viertagewoche = {
      ...vollzeit,
      dailyTargetMinutes: { 1: 600, 2: 600, 3: 600, 4: 600, 5: 0, 6: 0, 7: 0 } as const,
    };
    expect(dailyNormalLimitFor(viertagewoche, '2026-09-14')).toBe(10 * 60);
    expect(dailyNormalLimitFor(viertagewoche, '2026-09-18')).toBe(8 * 60);
  });

  it('richtet sich bei Gleitzeit nach § 4b Abs 4', () => {
    expect(dailyNormalLimitFor(gleitzeitOhneGanztag, '2026-09-14')).toBe(10 * 60);
    expect(dailyNormalLimitFor(gleitzeitMitGanztag, '2026-09-14')).toBe(12 * 60);
  });
});

describe('Gleitzeit und Zuordnung', () => {
  // Der in der Praxis teure Fall: ohne ganztägige Verbrauchsmöglichkeit ist die
  // elfte Stunde keine Normalarbeitszeit, sondern eine Überstunde.
  it('macht die elfte Stunde ohne ganztägigen Verbrauch zur Überstunde', () => {
    const tage = [
      day('2026-09-14', ['07:00', '12:00'], ['12:30', '18:30']), // 11:00
      free('2026-09-15'),
      free('2026-09-16'),
      free('2026-09-17'),
      free('2026-09-18'),
      free('2026-09-19'),
      free('2026-09-20'),
    ];
    expect(classifyWeek(tage, gleitzeitOhneGanztag).ueberstundenMinutes).toBe(60);
  });

  it('lässt dieselben elf Stunden mit ganztägigem Verbrauch als Normalarbeitszeit stehen', () => {
    const tage = [
      day('2026-09-14', ['07:00', '12:00'], ['12:30', '18:30']),
      free('2026-09-15'),
      free('2026-09-16'),
      free('2026-09-17'),
      free('2026-09-18'),
      free('2026-09-19'),
      free('2026-09-20'),
    ];
    expect(classifyWeek(tage, gleitzeitMitGanztag).ueberstundenMinutes).toBe(0);
  });

  it('setzt den Mehrarbeitszuschlag bei Gleitzeit aus', () => {
    // § 19d Abs 3b Z 1 AZG: innerhalb der Gleitzeitperiode wird die
    // Mehrleistung durch Gleiten abgebaut, ein Zuschlag fällt nicht an.
    const teilzeitGleitzeit = { ...teilzeit20, flexTime: gleitzeitOhneGanztag.flexTime };
    const tage = [
      day('2026-09-14', ['08:00', '12:48']),
      day('2026-09-15', ['08:00', '12:48']),
      day('2026-09-16', ['08:00', '12:48']),
      day('2026-09-17', ['08:00', '12:48']),
      day('2026-09-18', ['08:00', '12:48']),
      free('2026-09-19'),
      free('2026-09-20'),
    ];
    const result = classifyWeek(tage, teilzeitGleitzeit);
    expect(result.mehrarbeitMinutes).toBe(4 * 60);
    expect(result.mehrarbeitSurchargeWaived).toBe(true);
    expect(result.mehrarbeitSurchargeMinutes).toBe(0);
  });
});

describe('Konfigurierbare Zuschlagssätze', () => {
  it('übernimmt abweichende Sätze aus dem Kollektivvertrag', () => {
    const tage = woche(['08:00', '12:00'], ['12:30', '17:00']); // 8:30, also 42:30
    const result = classifyWeek(tage, vollzeit, { mehrarbeit: 0.25, ueberstunde: 1.0 });
    expect(result.ueberstundenMinutes).toBe(4 * 60);
    expect(result.ueberstundenSurchargeMinutes).toBe(4 * 60);
  });
});
