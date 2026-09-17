/**
 * Monatsjournal als PDF — die Fassung, die bei einer Prüfung vorgelegt wird.
 *
 * § 26 Abs 1 AZG verlangt Aufzeichnungen über Beginn, Ende und Dauer der
 * Arbeitszeit sowie über die Ruhepausen. Deshalb steht hier jeder einzelne
 * Abschnitt und nicht bloß eine Tagessumme: ein Tag mit zwei Arbeitsblöcken
 * hat zwei Anfänge und zwei Enden, und genau die sind aufzuzeichnen.
 *
 * Bei Gleitzeit kommt nach § 26 Abs 5 AZG der Saldo dazu; er steht in der
 * Zusammenfassung am Ende.
 */

import {
  describeAbsence,
  formatClock,
  formatDateShort,
  formatDuration,
  localMinutesOfDay,
  minutesBetween,
  monthName,
  parseIsoDate,
  weekdayShort,
  type Employee,
  type Minutes,
} from '@zeiterfassung/legal';
import type { PDFDocument, PDFFont, PDFPage, RGB } from 'pdf-lib';
import type { Timesheet, TimesheetDay } from '../lib/timesheet';
import { forPdf } from './text';

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 42;
/**
 * Abstand zwischen zwei Spalten. Ohne ihn stößt ein rechtsbündiger Wert
 * unmittelbar an den linksbündigen der Nachbarspalte, und aus „12:30" und
 * „Arbeitszeit" wird „12:30Arbeitszeit".
 */
const GUTTER = 7;

/**
 * pdf-lib wiegt rund 400 kB und wird nur gebraucht, wenn jemand tatsächlich
 * exportiert. Der dynamische Import hält es aus dem Startbündel heraus — die
 * Farben werden deshalb erst erzeugt, wenn die Bibliothek geladen ist.
 */
interface Palette {
  ink: RGB;
  muted: RGB;
  hairline: RGB;
  violation: RGB;
}

interface Column {
  key: string;
  label: string;
  width: number;
  align?: 'right';
}

/** Die Summe der Breiten ist die Satzbreite: 595,28 − 2 × 42 = 511,28. */
const COLUMNS: Column[] = [
  { key: 'tag', label: 'Tag', width: 24 },
  { key: 'datum', label: 'Datum', width: 56 },
  { key: 'von', label: 'Beginn', width: 44, align: 'right' },
  { key: 'bis', label: 'Ende', width: 44, align: 'right' },
  { key: 'art', label: 'Art', width: 68 },
  { key: 'dauer', label: 'Dauer', width: 42, align: 'right' },
  { key: 'ist', label: 'Arbeitszeit', width: 52, align: 'right' },
  { key: 'soll', label: 'Soll', width: 42, align: 'right' },
  { key: 'saldo', label: 'Saldo', width: 46, align: 'right' },
  { key: 'anmerkung', label: 'Anmerkung', width: 93 },
];

const SEGMENT_LABEL: Record<string, string> = {
  work: 'Arbeitszeit',
  break: 'Ruhepause',
  travel: 'Reisezeit',
  oncall: 'Rufbereitschaft',
};

export interface MonthJournalInput {
  employee: Employee;
  personnelNumber?: string | null;
  contractLabel: string;
  weeklyHours: number;
  collectiveAgreement?: string | null;
  flexEnabled: boolean;
  openingBalanceMinutes: Minutes;
  /** Saldo am Monatsende, einschließlich Übertrag. */
  closingBalanceMinutes: Minutes;
  month: string; // YYYY-MM
  days: TimesheetDay[];
  timesheet: Timesheet;
}

interface Layout {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  regular: PDFFont;
  bold: PDFFont;
  input: MonthJournalInput;
  palette: Palette;
}

export async function buildMonthJournal(input: MonthJournalInput): Promise<Uint8Array> {
  const { PDFDocument: Doc, StandardFonts, rgb } = await import('pdf-lib');

  const doc = await Doc.create();
  doc.setTitle(`Arbeitszeitaufzeichnung ${input.employee.displayName} ${input.month}`);
  doc.setSubject('Aufzeichnung nach § 26 AZG');
  doc.setCreator('Zeiterfassung');

  // Helvetica statt IBM Plex: @fontsource liefert nur WOFF und WOFF2, und
  // pdf-lib kann daraus nichts einbetten. WinAnsi deckt den deutschen
  // Zeichenvorrat vollständig ab, Umlaute und Paragrafenzeichen inbegriffen.
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const layout: Layout = {
    doc,
    page: doc.addPage([A4.width, A4.height]),
    y: 0,
    regular,
    bold,
    input,
    palette: {
      ink: rgb(0.1, 0.1, 0.094),
      muted: rgb(0.43, 0.42, 0.39),
      hairline: rgb(0.89, 0.88, 0.85),
      violation: rgb(0.61, 0.17, 0.14),
    },
  };

  drawHeader(layout, true);
  drawTableHead(layout);

  for (const day of input.days) {
    drawDay(layout, day);
  }

  drawSummary(layout);
  stampFooters(layout);

  return doc.save();
}

// --- Zeichnen ---------------------------------------------------------------

interface TextOptions {
  size?: number;
  font?: PDFFont;
  color?: RGB;
  align?: 'right';
  /** Spaltenbreite. Wird gesetzt, dann wird der Text darauf beschnitten. */
  width?: number;
  /** Abstand zur Nachbarspalte, der von der Breite abgezogen wird. */
  gutter?: number;
}

/**
 * Beschneidet nach tatsächlicher Textbreite, nicht nach einer geschätzten
 * Zeichenzahl. Eine Schätzung geht bei „Rufbereitschaft" und „Mariä
 * Empfängnis" unterschiedlich weit daneben.
 */
export function fitText(font: PDFFont, value: string, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;

  const ellipsis = '...';
  let trimmed = value;
  while (
    trimmed.length > 0 &&
    font.widthOfTextAtSize(trimmed + ellipsis, size) > maxWidth
  ) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed.length > 0 ? trimmed + ellipsis : '';
}

function text(layout: Layout, value: string, x: number, y: number, options: TextOptions = {}): void {
  const size = options.size ?? 8.5;
  const font = options.font ?? layout.regular;
  const gutter = options.gutter ?? 0;

  let clean = forPdf(value);
  if (options.width !== undefined) {
    clean = fitText(font, clean, size, options.width - gutter);
  }
  if (clean === '') return;

  const drawX =
    options.align === 'right' && options.width !== undefined
      ? x + options.width - gutter - font.widthOfTextAtSize(clean, size)
      : x;

  layout.page.drawText(clean, {
    x: drawX,
    y,
    size,
    font,
    color: options.color ?? layout.palette.ink,
  });
}

function line(layout: Layout, y: number, color?: RGB, thickness = 0.5): void {
  layout.page.drawLine({
    start: { x: MARGIN, y },
    end: { x: A4.width - MARGIN, y },
    thickness,
    color: color ?? layout.palette.hairline,
  });
}

function drawHeader(layout: Layout, first: boolean): void {
  const { input, palette } = layout;
  const { year, month } = parseIsoDate(`${input.month}-01`);
  layout.y = A4.height - MARGIN;

  text(layout, 'ARBEITSZEITAUFZEICHNUNG', MARGIN, layout.y, {
    size: 7.5,
    font: layout.bold,
    color: palette.muted,
  });
  layout.y -= 16;

  text(layout, input.employee.displayName, MARGIN, layout.y, { size: 14, font: layout.bold });
  text(layout, `${monthName(month)} ${year}`, MARGIN, layout.y, {
    size: 14,
    align: 'right',
    width: A4.width - 2 * MARGIN,
  });
  layout.y -= 14;

  const details = [
    input.personnelNumber ? `Personalnummer ${input.personnelNumber}` : null,
    input.contractLabel,
    `${input.weeklyHours.toLocaleString('de-AT')} h/Woche`,
    input.collectiveAgreement ? `KV ${input.collectiveAgreement}` : null,
    input.flexEnabled ? 'Gleitzeit' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  text(layout, details, MARGIN, layout.y, { size: 8, color: palette.muted });

  if (first) {
    text(layout, 'Aufzeichnung gemäß § 26 AZG', MARGIN, layout.y, {
      size: 8,
      color: palette.muted,
      align: 'right',
      width: A4.width - 2 * MARGIN,
    });
  }

  layout.y -= 14;
  line(layout, layout.y, palette.ink, 0.8);
  layout.y -= 14;
}

function drawTableHead(layout: Layout): void {
  let x = MARGIN;
  for (const column of COLUMNS) {
    text(layout, column.label.toUpperCase(), x, layout.y, {
      size: 6.5,
      color: layout.palette.muted,
      align: column.align,
      width: column.width,
      gutter: GUTTER,
    });
    x += column.width;
  }
  layout.y -= 6;
  line(layout, layout.y);
  layout.y -= 12;
}

function ensureSpace(layout: Layout, needed: number): void {
  if (layout.y - needed > MARGIN + 30) return;
  layout.page = layout.doc.addPage([A4.width, A4.height]);
  drawHeader(layout, false);
  drawTableHead(layout);
}

function drawDay(layout: Layout, day: TimesheetDay): void {
  const intervals = day.work.intervals;
  ensureSpace(layout, Math.max(1, intervals.length) * 12 + 6);

  const holiday = day.holidays.find((entry) => entry.statutory);
  const isViolation = day.evaluation?.worstSeverity === 'verstoss';
  const anmerkung = [
    holiday?.name,
    day.absence ? describeAbsence(day.absence) : null,
    isViolation ? 'Verstoß' : null,
  ]
    .filter(Boolean)
    .join(', ');

  if (intervals.length === 0) {
    drawRow(
      layout,
      {
        tag: weekdayShort(day.date),
        datum: formatDateShort(day.date),
        von: '',
        bis: '',
        art: '',
        dauer: '',
        ist: day.work.workMinutes > 0 ? formatDuration(day.work.workMinutes) : '-',
        soll: formatDuration(day.account?.targetMinutes ?? 0),
        saldo: formatDuration(day.account?.balanceMinutes ?? 0, { sign: true }),
        anmerkung,
      },
      isViolation,
    );
  } else {
    intervals.forEach((interval, index) => {
      const first = index === 0;
      drawRow(
        layout,
        {
          tag: first ? weekdayShort(day.date) : '',
          datum: first ? formatDateShort(day.date) : '',
          von: formatClock(localMinutesOfDay(interval.start)),
          bis: formatClock(localMinutesOfDay(interval.end)),
          art: SEGMENT_LABEL[interval.kind] ?? interval.kind,
          dauer: formatDuration(minutesBetween(interval.start, interval.end)),
          ist: first ? formatDuration(day.work.workMinutes) : '',
          soll: first ? formatDuration(day.account?.targetMinutes ?? 0) : '',
          saldo: first ? formatDuration(day.account?.balanceMinutes ?? 0, { sign: true }) : '',
          anmerkung: first ? anmerkung : '',
        },
        isViolation && first,
      );
    });
  }

  layout.y -= 2;
  line(layout, layout.y + 6);
}

function drawRow(layout: Layout, values: Record<string, string>, highlight = false): void {
  let x = MARGIN;
  for (const column of COLUMNS) {
    const value = values[column.key] ?? '';
    text(layout, value, x, layout.y, {
      size: 8,
      color:
        highlight && column.key === 'anmerkung' ? layout.palette.violation : layout.palette.ink,
      align: column.align,
      width: column.width,
      gutter: GUTTER,
    });
    x += column.width;
  }
  layout.y -= 12;
}

function drawSummary(layout: Layout): void {
  const { input, palette } = layout;
  ensureSpace(layout, 140);
  layout.y -= 10;

  const worked = input.days.reduce((sum, day) => sum + day.work.workMinutes, 0);
  const target = input.days.reduce((sum, day) => sum + (day.account?.targetMinutes ?? 0), 0);
  const breaks = input.days.reduce((sum, day) => sum + day.work.breakMinutes, 0);
  const balance = input.days.reduce((sum, day) => sum + (day.account?.balanceMinutes ?? 0), 0);
  const holidayWork = input.days.reduce(
    (sum, day) => sum + (day.account?.holidayWorkMinutes ?? 0),
    0,
  );

  const classification = input.timesheet.weeks.reduce(
    (sum, week) => ({
      mehrarbeit: sum.mehrarbeit + (week.classification?.mehrarbeitMinutes ?? 0),
      ueberstunden: sum.ueberstunden + (week.classification?.ueberstundenMinutes ?? 0),
    }),
    { mehrarbeit: 0, ueberstunden: 0 },
  );

  text(layout, 'ZUSAMMENFASSUNG', MARGIN, layout.y, {
    size: 7.5,
    font: layout.bold,
    color: palette.muted,
  });
  layout.y -= 6;
  line(layout, layout.y, palette.ink, 0.8);
  layout.y -= 14;

  const entries: Array<[string, string]> = [
    ['Arbeitszeit gesamt', `${formatDuration(worked)} h`],
    ['Ruhepausen gesamt', `${formatDuration(breaks)} h`],
    ['Sollzeit', `${formatDuration(target)} h`],
    ['Saldo des Monats', `${formatDuration(balance, { sign: true })} h`],
    ['Mehrarbeit (§ 19d AZG)', `${formatDuration(classification.mehrarbeit)} h`],
    ['Überstunden (§ 10 AZG)', `${formatDuration(classification.ueberstunden)} h`],
  ];

  if (holidayWork > 0) {
    entries.push(['Arbeit an Feiertagen (§ 9 Abs 5 ARG)', `${formatDuration(holidayWork)} h`]);
  }

  if (input.flexEnabled) {
    // § 26 Abs 5 AZG: bei Gleitzeit ist auch der Saldo aufzuzeichnen.
    entries.push([
      'Gleitzeitsaldo Monatsbeginn',
      `${formatDuration(input.openingBalanceMinutes, { sign: true })} h`,
    ]);
    entries.push([
      'Gleitzeitsaldo Monatsende',
      `${formatDuration(input.closingBalanceMinutes, { sign: true })} h`,
    ]);
  }

  for (const [label, value] of entries) {
    text(layout, label, MARGIN, layout.y, { size: 8.5 });
    text(layout, value, MARGIN, layout.y, {
      size: 8.5,
      font: layout.bold,
      align: 'right',
      width: 300,
    });
    layout.y -= 13;
  }

  const violations = input.days.flatMap((day) =>
    (day.evaluation?.findings ?? []).filter((finding) => finding.severity === 'verstoss'),
  );

  if (violations.length === 0) return;

  layout.y -= 8;
  ensureSpace(layout, violations.length * 12 + 30);
  text(layout, 'BEANSTANDUNGEN', MARGIN, layout.y, {
    size: 7.5,
    font: layout.bold,
    color: palette.muted,
  });
  layout.y -= 6;
  line(layout, layout.y, palette.ink, 0.8);
  layout.y -= 14;

  for (const finding of violations) {
    ensureSpace(layout, 14);
    text(layout, finding.date ? formatDateShort(finding.date) : '', MARGIN, layout.y, {
      size: 8,
      color: palette.muted,
    });
    text(layout, finding.reference, MARGIN + 55, layout.y, {
      size: 8,
      color: palette.muted,
      width: 70,
    });
    text(layout, finding.message, MARGIN + 125, layout.y, {
      size: 8,
      color: palette.violation,
      width: A4.width - 2 * MARGIN - 125,
    });
    layout.y -= 12;
  }
}

function stampFooters(layout: Layout): void {
  const pages = layout.doc.getPages();
  const created = formatDateShort(new Date().toISOString().slice(0, 10));

  pages.forEach((page, index) => {
    const note = forPdf(
      `Erstellt am ${created} · Aufzeichnungen sind nach § 26 Abs 1 AZG mindestens ein Jahr aufzubewahren, bei Lenkern 24 Monate.`,
    );
    page.drawText(note, {
      x: MARGIN,
      y: MARGIN - 12,
      size: 6.5,
      font: layout.regular,
      color: layout.palette.muted,
    });

    const pageLabel = forPdf(`Seite ${index + 1} von ${pages.length}`);
    page.drawText(pageLabel, {
      x: A4.width - MARGIN - layout.regular.widthOfTextAtSize(pageLabel, 6.5),
      y: MARGIN - 12,
      size: 6.5,
      font: layout.regular,
      color: layout.palette.muted,
    });
  });
}

/** Löst den Download im Browser aus. */
export function downloadPdf(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  triggerDownload(blob, filename);
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
