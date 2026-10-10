import { useI18n, type Locale } from '../lib/i18n';

const OPTIONS: Array<{ value: Locale; short: string; label: string }> = [
  { value: 'de', short: 'DE', label: 'Deutsch' },
  { value: 'en', short: 'EN', label: 'English' },
];

/**
 * Umschalter Deutsch/Englisch. Die Sprachnamen stehen in ihrer eigenen
 * Sprache — wer kein Deutsch liest, findet „English“ auch auf der deutschen
 * Oberfläche.
 */
export function Sprachwahl() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="language-switch" role="group" aria-label={t('Sprache', 'Language')}>
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          lang={option.value}
          title={option.label}
          aria-label={option.label}
          aria-pressed={locale === option.value}
          onClick={() => setLocale(option.value)}
        >
          {option.short}
        </button>
      ))}
    </div>
  );
}
