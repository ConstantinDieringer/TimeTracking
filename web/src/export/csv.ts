/**
 * CSV für die Lohnverrechnung.
 *
 * Semikolon als Trennzeichen und Komma als Dezimalzeichen — so öffnet Excel
 * in einer deutschsprachigen Installation die Datei ohne Importdialog. Die
 * Zeiten stehen zusätzlich als Dezimalstunden, weil damit gerechnet wird.
 *
 * Ein BOM am Anfang sorgt dafür, dass Excel die Umlaute als UTF-8 erkennt;
 * ohne es steht dort „Mariä Empfängnis" falsch.
 */

import {
  describeAbsence,
  formatClock,
  formatDateShort,
  localMinutesOfDay,
  statutoryHolidayOn,
  toDecimalHours,
  weekdayShort,
} from '@zeiterfassung/legal';
import type { TimesheetDay } from '../lib/timesheet';
import { triggerDownload } from './pdf';

const SEPARATOR = ';';

const HEADERS = [
  'Datum',
  'Wochentag',
  'Beginn',
  'Ende',
  'Pause_Minuten',
  'Arbeitszeit_Std',
  'Sollzeit_Std',
  'Saldo_Std',
  'Feiertag',
  'Abwesenheit',
  'Feiertagsarbeit_Std',
  'Quelle',
  'Befunde',
];

/**
 * Zeichen, mit denen Excel und LibreOffice eine Zelle als Formel lesen —
 * auch in der vollbreiten Schreibweise. Eine Zelle `=HYPERLINK(...)` aus
 * einer Anmerkung würde beim Öffnen der Datei ausgeführt (CSV-Injection).
 */
const FORMULA_START = /^[=+\-@\t\r＝＋－＠]/;

export function cell(value: string | number): string {
  // Zahlen bleiben Zahlen: ein negativer Saldo soll in Excel rechenbar sein.
  if (typeof value === 'number') return String(value).replace('.', ',');
  // Text, der wie eine Formel beginnt, bekommt ein Apostroph davor — dann
  // zeigt das Tabellenprogramm ihn als Text an, statt ihn auszuführen.
  const text = FORMULA_START.test(value.trimStart()) ? `'${value}` : value;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildDayCsv(days: readonly TimesheetDay[]): string {
  const lines = [HEADERS.join(SEPARATOR)];

  for (const day of days) {
    const holiday = statutoryHolidayOn(day.date);
    const findings = (day.evaluation?.findings ?? [])
      .map((finding) => `${finding.reference}: ${finding.message}`)
      .join(' | ');

    const sources = new Set(day.work.intervals.map((interval) => interval.source));
    const source =
      sources.size === 0
        ? ''
        : sources.size > 1
          ? 'gemischt'
          : sources.has('stamped')
            ? 'gestempelt'
            : 'nachgetragen';

    lines.push(
      [
        cell(formatDateShort(day.date)),
        cell(weekdayShort(day.date)),
        cell(day.work.firstStart ? formatClock(localMinutesOfDay(day.work.firstStart)) : ''),
        cell(day.work.lastEnd ? formatClock(localMinutesOfDay(day.work.lastEnd)) : ''),
        cell(day.work.breakMinutes),
        cell(toDecimalHours(day.work.workMinutes)),
        cell(toDecimalHours(day.account?.targetMinutes ?? 0)),
        cell(toDecimalHours(day.account?.balanceMinutes ?? 0)),
        cell(holiday?.name ?? ''),
        cell(day.absence ? describeAbsence(day.absence) : ''),
        cell(toDecimalHours(day.account?.holidayWorkMinutes ?? 0)),
        cell(source),
        cell(findings),
      ].join(SEPARATOR),
    );
  }

  return lines.join('\r\n');
}

export function downloadCsv(content: string, filename: string): void {
  // ﻿ ist das BOM — ohne das liest Excel die Datei als Windows-1252.
  const blob = new Blob([`﻿${content}`], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, filename);
}
