import { describe, expect, it } from 'vitest';
import {
  easterSunday,
  holidayInfoOn,
  isStatutoryHoliday,
  observances,
  statutoryHolidayOn,
  statutoryHolidays,
  statutoryHolidaysInRange,
} from '../src/holidays.js';

describe('Osterberechnung', () => {
  // Gegen die amtlichen Osterdaten. Ostern zieht vier der 13 Feiertage nach
  // sich, ein Fehler hier verschiebt gleich ein Drittel des Jahres.
  const bekannteOstersonntage: Record<number, string> = {
    2024: '2024-03-31',
    2025: '2025-04-20',
    2026: '2026-04-05',
    2027: '2027-03-28',
    2028: '2028-04-16',
    2029: '2029-04-01',
    2030: '2030-04-21',
  };

  for (const [jahr, datum] of Object.entries(bekannteOstersonntage)) {
    it(`trifft Ostern ${jahr}`, () => {
      expect(easterSunday(Number(jahr))).toBe(datum);
    });
  }
});

describe('Gesetzliche Feiertage nach § 7 ARG', () => {
  it('kennt genau dreizehn Feiertage pro Jahr', () => {
    for (let jahr = 2024; jahr <= 2030; jahr += 1) {
      expect(statutoryHolidays(jahr)).toHaveLength(13);
    }
  });

  it('liefert sie chronologisch', () => {
    const daten = statutoryHolidays(2026).map((f) => f.date);
    expect([...daten].sort()).toEqual(daten);
  });

  it('stimmt für 2026 vollständig mit der amtlichen Liste überein', () => {
    expect(statutoryHolidays(2026)).toEqual([
      { date: '2026-01-01', name: 'Neujahr', statutory: true },
      { date: '2026-01-06', name: 'Heilige Drei Könige', statutory: true },
      { date: '2026-04-06', name: 'Ostermontag', statutory: true },
      { date: '2026-05-01', name: 'Staatsfeiertag', statutory: true },
      { date: '2026-05-14', name: 'Christi Himmelfahrt', statutory: true },
      { date: '2026-05-25', name: 'Pfingstmontag', statutory: true },
      { date: '2026-06-04', name: 'Fronleichnam', statutory: true },
      { date: '2026-08-15', name: 'Mariä Himmelfahrt', statutory: true },
      { date: '2026-10-26', name: 'Nationalfeiertag', statutory: true },
      { date: '2026-11-01', name: 'Allerheiligen', statutory: true },
      { date: '2026-12-08', name: 'Mariä Empfängnis', statutory: true },
      { date: '2026-12-25', name: 'Christtag', statutory: true },
      { date: '2026-12-26', name: 'Stefanitag', statutory: true },
    ]);
  });

  it('setzt die beweglichen Feiertage auch in anderen Jahren richtig', () => {
    const feiertage2025 = new Map(statutoryHolidays(2025).map((f) => [f.name, f.date]));
    expect(feiertage2025.get('Ostermontag')).toBe('2025-04-21');
    expect(feiertage2025.get('Christi Himmelfahrt')).toBe('2025-05-29');
    expect(feiertage2025.get('Pfingstmontag')).toBe('2025-06-09');
    expect(feiertage2025.get('Fronleichnam')).toBe('2025-06-19');

    const feiertage2027 = new Map(statutoryHolidays(2027).map((f) => [f.name, f.date]));
    expect(feiertage2027.get('Ostermontag')).toBe('2027-03-29');
    expect(feiertage2027.get('Christi Himmelfahrt')).toBe('2027-05-06');
    expect(feiertage2027.get('Pfingstmontag')).toBe('2027-05-17');
    expect(feiertage2027.get('Fronleichnam')).toBe('2027-05-27');
  });

  it('erkennt einen Feiertag am Datum', () => {
    expect(statutoryHolidayOn('2026-10-26')?.name).toBe('Nationalfeiertag');
    expect(statutoryHolidayOn('2026-10-27')).toBeNull();
  });

  it('grenzt den Zeitraum an beiden Enden richtig ab', () => {
    const imMai = statutoryHolidaysInRange('2026-05-01', '2026-05-31').map((f) => f.name);
    expect(imMai).toEqual(['Staatsfeiertag', 'Christi Himmelfahrt', 'Pfingstmontag']);

    const ueberDenJahreswechsel = statutoryHolidaysInRange('2026-12-24', '2027-01-07').map((f) => f.date);
    expect(ueberDenJahreswechsel).toEqual([
      '2026-12-25',
      '2026-12-26',
      '2027-01-01',
      '2027-01-06',
    ]);
  });
});

describe('Karfreitag', () => {
  // Seit 2019 abgeschafft. Wer ihn als Feiertag führt, schreibt Mitarbeitern
  // einen Entgeltanspruch gut, den es nicht gibt.
  it('ist kein gesetzlicher Feiertag', () => {
    expect(isStatutoryHoliday('2026-04-03')).toBe(false);
    expect(statutoryHolidayOn('2026-04-03')).toBeNull();
    expect(statutoryHolidays(2026).some((f) => f.name === 'Karfreitag')).toBe(false);
  });

  it('wird trotzdem angezeigt, mit Hinweis auf den persönlichen Feiertag', () => {
    const eintraege = holidayInfoOn('2026-04-03');
    expect(eintraege).toHaveLength(1);
    expect(eintraege[0]!.name).toBe('Karfreitag');
    expect(eintraege[0]!.statutory).toBe(false);
    expect(eintraege[0]!.note).toContain('§ 7a ARG');
  });

  it('liegt zwei Tage vor Ostersonntag', () => {
    const karfreitage = [2024, 2025, 2026, 2027].map(
      (jahr) => observances(jahr).find((f) => f.name === 'Karfreitag')!.date,
    );
    expect(karfreitage).toEqual(['2024-03-29', '2025-04-18', '2026-04-03', '2027-03-26']);
  });
});

describe('Landesfeiertage', () => {
  it('begründen keinen Anspruch auf Feiertagsentgelt', () => {
    // Leopold, 15. November — in Wien und Niederösterreich begangen,
    // aber kein Feiertag im Sinne des § 7 ARG.
    expect(isStatutoryHoliday('2026-11-15')).toBe(false);
    expect(statutoryHolidayOn('2026-11-15')).toBeNull();
  });

  it('erscheinen nur im passenden Bundesland', () => {
    const inWien = holidayInfoOn('2026-11-15', 'W');
    expect(inWien.map((f) => f.name)).toEqual(['Hl. Leopold']);
    expect(inWien[0]!.note).toContain('kein gesetzlicher Feiertag');

    expect(holidayInfoOn('2026-11-15', 'ST')).toEqual([]);
    expect(holidayInfoOn('2026-05-04', 'OO').map((f) => f.name)).toEqual(['Hl. Florian']);
    expect(holidayInfoOn('2026-05-04', 'W')).toEqual([]);
    expect(holidayInfoOn('2026-09-24', 'S').map((f) => f.name)).toEqual(['Hl. Rupert']);
    expect(holidayInfoOn('2026-11-11', 'B').map((f) => f.name)).toEqual(['Hl. Martin']);
    expect(holidayInfoOn('2026-03-19', 'T').map((f) => f.name)).toEqual(['Hl. Josef']);
    expect(holidayInfoOn('2026-03-19', 'NO')).toEqual([]);
  });
});
