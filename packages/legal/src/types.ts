/**
 * Gemeinsame Typen der Rechtslogik.
 *
 * Dieses Paket kennt weder Supabase noch React. Es bekommt einfache Werte
 * herein und gibt Befunde heraus. Dadurch bleibt es vollständig testbar, und
 * dieselbe Berechnung kann später auch serverseitig laufen.
 */

/** Kalendertag im Format `YYYY-MM-DD`, immer in Europe/Vienna gedacht. */
export type IsoDate = string;

/** Zeitpunkt als ISO-8601-Zeichenkette mit Zonenangabe. */
export type IsoDateTime = string;

/** Zeitspanne in Minuten. Alle Rechnungen laufen minutengenau. */
export type Minutes = number;

export const MINUTES_PER_HOUR = 60;

/** Die Zone, in der das gesamte Arbeitsrecht hier gilt. */
export const TIMEZONE = 'Europe/Vienna';

// ---------------------------------------------------------------------------
// Befunde
// ---------------------------------------------------------------------------

/**
 * `hinweis` heißt: rechtlich noch zulässig, aber es lohnt hinzusehen —
 * etwa ein Gleitzeitsaldo nahe der Übertragsgrenze.
 * `verstoss` heißt: die Grenze ist überschritten.
 */
export type Severity = 'ok' | 'hinweis' | 'verstoss';

export interface RuleResult {
  /** Stabiler Schlüssel, z. B. `azg.tageshoechstarbeitszeit`. */
  code: string;
  severity: Severity;
  /** Fundstelle im Gesetz, wird in der Oberfläche mit angezeigt. */
  reference: string;
  /** Klartext für die Anzeige, deutsch, ohne Ausrufezeichen. */
  message: string;
  /** Tag, auf den sich der Befund bezieht. Fehlt bei Wochen- oder Periodenregeln. */
  date?: IsoDate;
  /** Gemessener Wert und Grenzwert, für Anzeige und Tests. */
  actual?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Erfasste Zeiten
// ---------------------------------------------------------------------------

export type SegmentKind =
  /** Arbeitszeit im Sinne des AZG. */
  | 'work'
  /** Ruhepause nach § 11 AZG — zählt nicht als Arbeitszeit. */
  | 'break'
  /** Reisezeit. Ob sie Arbeitszeit ist, hängt vom KV ab; getrennt geführt. */
  | 'travel'
  /** Rufbereitschaft. Zählt hier nicht als Arbeitszeit. */
  | 'oncall';

export type EntrySource = 'stamped' | 'manual';

export interface TimeSegment {
  id?: string;
  /** Der Kalendertag, dem das Segment zugerechnet wird. */
  date: IsoDate;
  /** Beginn als Zeitpunkt mit Zone. */
  start: IsoDateTime;
  /** Ende. `null`, solange gestempelt wird und noch nicht ausgestempelt ist. */
  end: IsoDateTime | null;
  kind: SegmentKind;
  source: EntrySource;
  note?: string | null;
}

// ---------------------------------------------------------------------------
// Abwesenheiten
// ---------------------------------------------------------------------------

export type AbsenceKind =
  | 'urlaub'
  | 'krankenstand'
  | 'pflegefreistellung'
  | 'zeitausgleich'
  /** Persönlicher Feiertag nach § 7a ARG — verbraucht einen Urlaubstag. */
  | 'persoenlicher_feiertag'
  | 'sonderurlaub'
  | 'dienstfreistellung'
  | 'unbezahlt';

export interface Absence {
  id?: string;
  date: IsoDate;
  kind: AbsenceKind;
  /** `true` bei halbtägiger Abwesenheit. */
  halfDay: boolean;
  note?: string | null;
}

/** Welche Abwesenheiten den Urlaubsanspruch verbrauchen. */
export const ABSENCE_CONSUMES_VACATION: Record<AbsenceKind, boolean> = {
  urlaub: true,
  persoenlicher_feiertag: true,
  krankenstand: false,
  pflegefreistellung: false,
  zeitausgleich: false,
  sonderurlaub: false,
  dienstfreistellung: false,
  unbezahlt: false,
};

/** Welche Abwesenheiten bezahlt sind und damit das Tagessoll gutschreiben. */
export const ABSENCE_IS_PAID: Record<AbsenceKind, boolean> = {
  urlaub: true,
  persoenlicher_feiertag: true,
  krankenstand: true,
  pflegefreistellung: true,
  zeitausgleich: true,
  sonderurlaub: true,
  dienstfreistellung: true,
  unbezahlt: false,
};

export const ABSENCE_LABEL: Record<AbsenceKind, string> = {
  urlaub: 'Urlaub',
  krankenstand: 'Krankenstand',
  pflegefreistellung: 'Pflegefreistellung',
  zeitausgleich: 'Zeitausgleich',
  persoenlicher_feiertag: 'Persönlicher Feiertag',
  sonderurlaub: 'Sonderurlaub',
  dienstfreistellung: 'Dienstfreistellung',
  unbezahlt: 'Unbezahlt',
};

// ---------------------------------------------------------------------------
// Vertrag
// ---------------------------------------------------------------------------

/**
 * Die Vertragsart steuert, welches Regelwerk greift. Sie ist in der Datenbank
 * eine eigene Tabelle, damit der Admin weitere Arten anlegen kann; für die
 * Rechtslogik zählt aber nur, welchem dieser Grundtypen sie zugeordnet ist.
 */
export type ContractCategory =
  | 'vollzeit'
  | 'teilzeit'
  | 'geringfuegig'
  | 'lehrling'
  | 'freier_dienstnehmer'
  /** Leitende Angestellte, § 1 Abs 2 Z 8 AZG — vom AZG ausgenommen. */
  | 'leitend'
  | 'praktikum';

export const CONTRACT_CATEGORY_LABEL: Record<ContractCategory, string> = {
  vollzeit: 'Vollzeit',
  teilzeit: 'Teilzeit',
  geringfuegig: 'Geringfügig',
  lehrling: 'Lehrling',
  freier_dienstnehmer: 'Freier Dienstnehmer',
  leitend: 'Leitende:r Angestellte:r',
  praktikum: 'Praktikum',
};

/** Wochentage, Montag = 1 … Sonntag = 7 (ISO 8601). */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface FlexTimeAgreement {
  /** Länge der Gleitzeitperiode in Monaten. */
  periodMonths: number;
  /** Erster Tag der ersten Periode — daraus werden alle weiteren abgeleitet. */
  periodAnchor: IsoDate;
  /**
   * Die 12-Stunden-Grenze gilt nach § 4b Abs 4 AZG nur, wenn die Vereinbarung
   * ganztägigen Verbrauch von Zeitguthaben zulässt und ihn im Zusammenhang mit
   * der wöchentlichen Ruhezeit nicht ausschließt. Trifft beides zu, sind bis zu
   * 12 Stunden Normalarbeitszeit möglich, sonst bleibt es bei 10.
   */
  allowsFullDayCompensation: boolean;
  /** Gleitzeitrahmen: frühester Beginn und spätestes Ende, `HH:MM`. */
  frameStart: string;
  frameEnd: string;
  /** Obergrenzen für den Übertrag in die nächste Periode, in Minuten. */
  maxCarryCredit: Minutes;
  maxCarryDebit: Minutes;
}

export interface Contract {
  id?: string;
  validFrom: IsoDate;
  /** `null` = laufend. */
  validTo: IsoDate | null;
  category: ContractCategory;
  /** Bezeichnung der Vertragsart aus den Stammdaten, frei wählbar. */
  typeLabel: string;
  /** Vereinbarte Wochenstunden dieser Person. */
  weeklyHours: number;
  /**
   * Kollektivvertragliche Normalarbeitszeit des Betriebs, meist 38,5 oder 40.
   * Sie trennt Mehrarbeit von Überstunde und ist deshalb nicht dasselbe wie
   * `weeklyHours`.
   */
  collectiveWeeklyHours: number;
  collectiveAgreement?: string | null;
  /** Tagessoll je Wochentag in Minuten, Index 1–7. */
  dailyTargetMinutes: Record<Weekday, Minutes>;
  flexTime: FlexTimeAgreement | null;
  /** All-in-Vertrag: Überstunden sind pauschal abgegolten, werden aber erfasst. */
  allIn: boolean;
  /** Urlaubsanspruch in Arbeitstagen pro Jahr. */
  vacationDaysPerYear: number;
  /** Vom AZG ausgenommen (leitende Angestellte, § 1 Abs 2 Z 8). */
  exemptFromAzg: boolean;
  nightWork: boolean;
  shiftWork: boolean;
  /** Monatliches Bruttoentgelt in Cent — nur für die Geringfügigkeitsprüfung. */
  monthlyGrossCents?: number | null;
}

// ---------------------------------------------------------------------------
// Person
// ---------------------------------------------------------------------------

export interface Employee {
  id: string;
  displayName: string;
  personnelNumber?: string | null;
  /** Steuert, ob am jeweiligen Tag das KJBG statt des AZG greift. */
  birthDate: IsoDate | null;
  hiredOn: IsoDate;
  leftOn: IsoDate | null;
  /** Bundesland, nur für die Anzeige der Landesfeiertage. */
  state: AustrianState;
}

export type AustrianState =
  | 'W'   // Wien
  | 'NO'  // Niederösterreich
  | 'OO'  // Oberösterreich
  | 'S'   // Salzburg
  | 'ST'  // Steiermark
  | 'K'   // Kärnten
  | 'T'   // Tirol
  | 'V'   // Vorarlberg
  | 'B';  // Burgenland

export const STATE_LABEL: Record<AustrianState, string> = {
  W: 'Wien',
  NO: 'Niederösterreich',
  OO: 'Oberösterreich',
  S: 'Salzburg',
  ST: 'Steiermark',
  K: 'Kärnten',
  T: 'Tirol',
  V: 'Vorarlberg',
  B: 'Burgenland',
};
