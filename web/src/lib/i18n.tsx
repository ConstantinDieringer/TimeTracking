/**
 * Sprache der Oberfläche: Deutsch oder Englisch.
 *
 * Bewusst ohne Übersetzungsbibliothek und ohne Schlüsselkataloge: jeder Text
 * steht an seiner Stelle im Code als Paar, `t('Speichern', 'Save')`. So fehlt
 * nie eine Übersetzung, ohne dass es beim Lesen des Codes auffällt, und es
 * gibt keine weitere Abhängigkeit, die jemand kompromittieren könnte.
 *
 * Die Rechtsbegriffe bleiben österreichisch: § 26 AZG heißt auch auf Englisch
 * so, und Fundstellen werden nicht übersetzt.
 *
 * Gespeichert wird die Wahl im Browser und — sobald jemand angemeldet ist —
 * im Konto (`user_metadata.locale`). Von dort liest Supabase sie für die
 * Sprache der E-Mails, und auf einem anderen Gerät gilt dieselbe Wahl.
 */

import type { Locale } from '@zeiterfassung/legal';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type { Locale };

const STORAGE_KEY = 'zeiterfassung.locale';

export interface I18n {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** Der Text in der gewählten Sprache. */
  t: (de: string, en: string) => string;
  /** Für `toLocaleString` und `Intl`: Zahlen, Datum und Uhrzeit. */
  intlLocale: 'de-AT' | 'en-GB';
  /** Hat jemand in diesem Browser selbst gewählt, statt die Vorgabe zu nehmen? */
  chosen: boolean;
  adoptLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<I18n | null>(null);

export function isLocale(value: unknown): value is Locale {
  return value === 'de' || value === 'en';
}

function storedLocale(): Locale | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isLocale(stored) ? stored : null;
  } catch {
    // Privates Fenster oder gesperrter Speicher: dann gilt die Browsersprache.
    return null;
  }
}

function initialLocale(): Locale {
  const stored = storedLocale();
  if (stored) return stored;
  // Ein österreichisches Werkzeug: Deutsch, außer der Browser spricht
  // ausdrücklich eine andere Sprache.
  return typeof navigator !== 'undefined' && !navigator.language.toLowerCase().startsWith('de')
    ? 'en'
    : 'de';
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [chosen, setChosen] = useState(() => storedLocale() !== null);

  useEffect(() => {
    document.documentElement.lang = locale === 'en' ? 'en' : 'de-AT';
  }, [locale]);

  // Gespeichert wird nur eine ausdrückliche Wahl. Die bloße Vorgabe aus der
  // Browsersprache soll eine Einstellung im Konto nicht überstimmen.
  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    setChosen(true);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ohne Speicher gilt die Wahl nur bis zum Neuladen.
    }
  }, []);

  /** Übernimmt die Sprache aus dem Konto, ohne sie als eigene Wahl zu zählen. */
  const adoptLocale = useCallback((next: Locale) => setLocaleState(next), []);

  const value = useMemo<I18n>(
    () => ({
      locale,
      setLocale,
      t: (de, en) => (locale === 'en' ? en : de),
      intlLocale: locale === 'en' ? 'en-GB' : 'de-AT',
      chosen,
      adoptLocale,
    }),
    [locale, setLocale, chosen, adoptLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useI18n muss innerhalb von LocaleProvider stehen.');
  return value;
}

/** Ein Text aus dem Rechtspaket, der beide Fassungen mitbringt. */
export function localized(
  item: { message: string; messageEn: string },
  locale: Locale,
): string {
  return locale === 'en' ? item.messageEn : item.message;
}
