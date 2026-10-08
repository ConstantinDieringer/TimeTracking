/**
 * Prüfung der Ausgabe.
 *
 * Der PDF-Export läuft im Browser, ist aber reine Rechnung auf Daten — und
 * damit auch in Node prüfbar. Das ist die verlässlichere Kontrolle als ein
 * Klick auf den Knopf: sie deckt ab, was beim Schreiben schiefgeht, und läuft
 * bei jeder Änderung mit.
 */

import {
  aggregateDay,
  accountForDay,
  atLocalTime,
  emptyDay,
  evaluateDay,
  holidayInfoOn,
  parseHm,
  type Contract,
  type Employee,
  type IsoDate,
  type TimeSegment,
} from '@zeiterfassung/legal';
import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { buildDayCsv, cell } from './csv';
import { buildMonthJournal, fitText } from './pdf';
import { forPdf } from './text';
import type { Timesheet, TimesheetDay } from '../lib/timesheet';

const employee: Employee = {
  id: 'e1',
  displayName: 'Anna Berger',
  personnelNumber: 'P-014',
  birthDate: '1990-05-12',
  hiredOn: '2020-01-01',
  leftOn: null,
  state: 'W',
};

const contract: Contract = {
  validFrom: '2020-01-01',
  validTo: null,
  category: 'vollzeit',
  typeLabel: 'Vollzeit',
  weeklyHours: 38.5,
  collectiveWeeklyHours: 38.5,
  collectiveAgreement: 'Handel',
  dailyTargetMinutes: { 1: 462, 2: 462, 3: 462, 4: 462, 5: 462, 6: 0, 7: 0 },
  flexTime: null,
  allIn: false,
  vacationDaysPerYear: 25,
  exemptFromAzg: false,
  nightWork: false,
  shiftWork: false,
};

function segment(date: IsoDate, from: string, to: string, kind: TimeSegment['kind'] = 'work'): TimeSegment {
  return {
    date,
    start: atLocalTime(date, parseHm(from)).toISOString(),
    end: atLocalTime(date, parseHm(to)).toISOString(),
    kind,
    source: 'stamped',
  };
}

function buildDay(date: IsoDate, segments: TimeSegment[]): TimesheetDay {
  const work = segments.length > 0 ? aggregateDay(date, segments) : emptyDay(date);
  return {
    date,
    work,
    contract,
    account: accountForDay({ day: work, contract }),
    evaluation: evaluateDay({ employee, contract, day: work, previousDay: null }),
    absence: null,
    holidays: holidayInfoOn(date, employee.state),
  };
}

const days: TimesheetDay[] = [
  buildDay('2026-10-26', []), // Nationalfeiertag
  buildDay('2026-10-27', [
    segment('2026-10-27', '08:12', '12:30'),
    segment('2026-10-27', '12:30', '13:00', 'break'),
    segment('2026-10-27', '13:00', '17:04'),
  ]),
  // Ein Verstoß, damit der Abschnitt „Beanstandungen" mitgezeichnet wird.
  buildDay('2026-10-28', [segment('2026-10-28', '08:00', '14:30')]),
];

const timesheet: Timesheet = {
  days,
  byDate: new Map(days.map((day) => [day.date, day])),
  weeks: [],
  weeklyTotals: [],
};

describe('Zeichenaufbereitung', () => {
  it('ersetzt Zeichen, die WinAnsi nicht kennt', () => {
    // Das echte Minuszeichen steht in jedem negativen Saldo und ist der Grund,
    // warum es diese Aufbereitung überhaupt gibt.
    expect(forPdf('−1:12')).toBe('-1:12');
    expect(forPdf('Ø 44:12')).toBe('Durchschnitt  44:12');
  });

  it('lässt deutsche Zeichen unangetastet', () => {
    expect(forPdf('Mariä Empfängnis, § 26 AZG, Verstoß · 8:22')).toBe(
      'Mariä Empfängnis, § 26 AZG, Verstoß · 8:22',
    );
  });

  it('ersetzt alles Übrige, statt den Export abbrechen zu lassen', () => {
    expect(forPdf('Arbeit 🕐 heute')).toContain('?');
  });

});

describe('Beschneiden auf Spaltenbreite', () => {
  // Die Spalten des Journals sind schmal; was nicht passt, muss gekürzt
  // werden, statt in die Nachbarspalte zu laufen.
  it('kürzt nach tatsächlicher Textbreite', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);

    expect(fitText(font, 'kurz', 8, 100)).toBe('kurz');

    const eng = fitText(font, 'Rufbereitschaft', 8, 40);
    expect(eng).toMatch(/\.\.\.$/);
    expect(font.widthOfTextAtSize(eng, 8)).toBeLessThanOrEqual(40);

    // Breite Zeichen werden früher abgeschnitten als schmale — genau das
    // bekommt eine Kürzung nach Zeichenzahl nicht hin.
    expect(fitText(font, 'MMMMMMMMMM', 8, 40).length).toBeLessThan(
      fitText(font, 'iiiiiiiiii', 8, 40).length,
    );
  });

  it('gibt nichts aus, wenn nicht einmal die Auslassungspunkte passen', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    expect(fitText(font, 'Nationalfeiertag', 8, 2)).toBe('');
  });
});

// Grosszügiger Timeout: der erste Aufruf löst den dynamischen Import von
// pdf-lib aus, den Vitest erst übersetzen muss. Danach liegt jeder Lauf bei
// rund 120 ms.
describe('PDF-Monatsjournal', { timeout: 30_000 }, () => {
  it('erzeugt ein gültiges PDF', async () => {
    const bytes = await buildMonthJournal({
      employee,
      personnelNumber: 'P-014',
      contractLabel: 'Vollzeit',
      weeklyHours: 38.5,
      collectiveAgreement: 'Handel',
      flexEnabled: false,
      openingBalanceMinutes: 0,
      closingBalanceMinutes: 120,
      month: '2026-10',
      days,
      timesheet,
    });

    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(bytes.byteLength).toBeGreaterThan(2000);
  });

  it('kommt auch mit Gleitzeit und negativem Saldo zurecht', async () => {
    // Der Saldo wird mit echtem Minuszeichen formatiert — ohne Aufbereitung
    // bricht pdf-lib hier ab, weil WinAnsi das Zeichen nicht kennt.
    const bytes = await buildMonthJournal({
      employee,
      contractLabel: 'Vollzeit',
      weeklyHours: 38.5,
      flexEnabled: true,
      openingBalanceMinutes: -75,
      closingBalanceMinutes: -195,
      month: '2026-10',
      days,
      timesheet,
    });
    expect(bytes.byteLength).toBeGreaterThan(2000);
  });

  it('kommt mit einem leeren Monat zurecht', async () => {
    const leer: Timesheet = { days: [], byDate: new Map(), weeks: [], weeklyTotals: [] };
    const bytes = await buildMonthJournal({
      employee,
      contractLabel: 'Vollzeit',
      weeklyHours: 38.5,
      flexEnabled: false,
      openingBalanceMinutes: 0,
      closingBalanceMinutes: 0,
      month: '2026-11',
      days: [],
      timesheet: leer,
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  });
});

describe('CSV für die Lohnverrechnung', () => {
  const csv = buildDayCsv(days);
  const lines = csv.split('\r\n');

  it('trennt mit Semikolon und schreibt eine Kopfzeile', () => {
    expect(lines[0]).toContain('Datum;Wochentag;Beginn;Ende');
    expect(lines).toHaveLength(days.length + 1);
  });

  it('gibt Zeiten als Dezimalstunden mit Komma aus', () => {
    // 08:12–12:30 und 13:00–17:04 sind 8:22, also 8,37 Stunden.
    expect(lines[2]).toContain('8,37');
    expect(lines[2]).toContain('27.10.2026;Di;08:12;17:04');
  });

  it('weist den Feiertag aus', () => {
    expect(lines[1]).toContain('Nationalfeiertag');
  });

  it('nennt die Befunde samt Fundstelle', () => {
    expect(lines[3]).toContain('§ 11 Abs 1 AZG');
  });

  it('schützt Felder, die das Trennzeichen enthalten', () => {
    // Befundtexte enthalten Semikolons und dürfen die Spalten nicht sprengen.
    const befund = lines[3]!.split(';');
    expect(befund).toHaveLength(13);
  });
});

describe('CSV ist gegen Formel-Injection geschützt', () => {
  it('entschärft Text, den Excel als Formel läse', () => {
    for (const payload of ['=HYPERLINK("https://evil.example")', '+1+1', '-2+3', '@SUM(A1)', '\t=1', ' =1', '＝1']) {
      expect(cell(payload).replace(/^"/, ''), payload).toMatch(/^'/);
    }
  });

  it('lässt gewöhnlichen Text und negative Zahlen unverändert', () => {
    expect(cell('Nachgetragen')).toBe('Nachgetragen');
    expect(cell(-1.5)).toBe('-1,5');
  });

  it('hält Trennzeichen und Anführungszeichen in einer Zelle', () => {
    expect(cell('a;b')).toBe('"a;b"');
    expect(cell('=a;"b"')).toBe(`"'=a;""b"""`);
  });
});
