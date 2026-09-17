/**
 * Werte, die sich ändern, ohne dass sich das Gesetz ändert.
 *
 * Sie stehen bewusst nicht als Konstanten im Regelcode: die
 * Geringfügigkeitsgrenze wird jährlich neu festgesetzt, und die Zuschlagssätze
 * kann ein Kollektivvertrag anheben. In der Datenbank liegt dazu die Tabelle
 * `settings`; hier stehen nur die Ausgangswerte.
 */

export interface SurchargeRates {
  /** § 19d Abs 3a AZG — Zuschlag für Mehrarbeit Teilzeitbeschäftigter. */
  mehrarbeit: number;
  /** § 10 Abs 1 AZG — Zuschlag für Überstunden. */
  ueberstunde: number;
}

export const DEFAULT_SURCHARGE_RATES: SurchargeRates = {
  mehrarbeit: 0.25,
  ueberstunde: 0.5,
};

/**
 * Monatliche Geringfügigkeitsgrenze in Cent, nach Jahren.
 *
 * 2026 wurde sie nicht angehoben und liegt unverändert bei 551,10 €.
 * Neue Jahre werden hier ergänzt; fehlt ein Jahr, gilt der jüngste bekannte
 * Wert, damit die Prüfung nicht stillschweigend ausfällt.
 */
export const GERINGFUEGIGKEITSGRENZE_CENTS: Record<number, number> = {
  2024: 51828,
  2025: 55110,
  2026: 55110,
};

export function geringfuegigkeitsgrenzeCents(year: number): number {
  const exact = GERINGFUEGIGKEITSGRENZE_CENTS[year];
  if (exact !== undefined) return exact;
  const known = Object.keys(GERINGFUEGIGKEITSGRENZE_CENTS)
    .map(Number)
    .sort((a, b) => a - b);
  const latest = known[known.length - 1]!;
  return GERINGFUEGIGKEITSGRENZE_CENTS[latest]!;
}

/** Ob der hinterlegte Wert für dieses Jahr tatsächlich gepflegt ist. */
export function hasGeringfuegigkeitsgrenze(year: number): boolean {
  return GERINGFUEGIGKEITSGRENZE_CENTS[year] !== undefined;
}

/** § 2 UrlG — Urlaubsanspruch in Arbeitstagen bei Fünftagewoche. */
export const VACATION_DAYS_STANDARD = 25;
/** § 2 Abs 1 UrlG — nach Vollendung des 25. Dienstjahres. */
export const VACATION_DAYS_AFTER_25_YEARS = 30;
