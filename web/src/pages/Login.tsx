import { formatClock, formatDateLong, localDateOf, localMinutesOfDay } from '@zeiterfassung/legal';
import { useEffect, useState, type FormEvent } from 'react';
import { LogoMark } from '../components/LogoMark';
import { Sprachwahl } from '../components/Sprachwahl';
import { useI18n } from '../lib/i18n';
import { supabase } from '../lib/supabase';

export function Login() {
  const { t, locale } = useI18n();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      // Bewusst ohne Unterscheidung, ob die Adresse existiert: sonst ließe
      // sich über die Anmeldemaske herausfinden, wer hier beschäftigt ist.
      // Nur die Sperre nach zu vielen Versuchen wird genannt — sie gilt für
      // jede Adresse gleich und verrät daher nichts.
      setError(
        signInError.status === 429
          ? t(
              'Zu viele Anmeldeversuche. Bitte in einigen Minuten erneut versuchen.',
              'Too many sign-in attempts. Please try again in a few minutes.',
            )
          : t('E-Mail-Adresse oder Passwort stimmen nicht.', 'Email address or password is incorrect.'),
      );
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="login__form" onSubmit={handleSubmit}>
        <div className="login__language">
          <Sprachwahl />
        </div>
        <h1 className="login__title">
          <LogoMark size={40} />
          Zeiterfassung
        </h1>
        <p className="login__hint">
          {t(
            'Zugänge legt die Personalverwaltung an. Bei Problemen dort melden.',
            'Accounts are created by your HR administration. Please contact them if you have problems.',
          )}
        </p>

        <div className="login__field">
          <label htmlFor="email">{t('E-Mail', 'Email')}</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="login__field">
          <label htmlFor="password">{t('Passwort', 'Password')}</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}

        <button
          className="button button--primary button--large login__submit"
          type="submit"
          disabled={busy}
        >
          {busy ? t('Wird geprüft …', 'Checking …') : t('Anmelden', 'Sign in')}
        </button>

        <p className="login__help">
          {t(
            'Passwort vergessen? Die Personalverwaltung setzt es zurück.',
            'Forgot your password? Your HR administration can reset it.',
          )}
        </p>
      </form>

      {/* Die rechte Fläche blieb leer und wirkte unfertig. Jetzt steht dort,
          was man vor der Anmeldung wissen will — Datum, Uhrzeit, und was mit
          den eigenen Daten geschieht. Keine Werbung, keine Illustration. */}
      <aside className="login__aside" aria-label={t('Hinweise', 'Notes')}>
        <p className="login__date">{formatDateLong(localDateOf(now), locale)}</p>
        <p className="login__clock">{formatClock(localMinutesOfDay(now))}</p>
        <dl className="login__facts">
          <div>
            <dt>{t('Aufzeichnung', 'Records')}</dt>
            <dd>
              {t(
                'Arbeitszeiten und Pausen nach § 26 AZG, mit laufender Prüfung der Höchstgrenzen.',
                'Working hours and breaks under § 26 AZG, continuously checked against the legal limits.',
              )}
            </dd>
          </div>
          <div>
            <dt>{t('Ihre Daten', 'Your data')}</dt>
            <dd>
              {t(
                'Sie sehen nur Ihre eigenen Zeiten, die Verwaltung nur die ihres Unternehmens. Gespeichert wird in der EU.',
                'You only see your own hours; administrators only see those of their company. Data is stored in the EU.',
              )}
            </dd>
          </div>
          <div>
            <dt>{t('Nachvollziehbar', 'Traceable')}</dt>
            <dd>
              {t(
                'Jede Korrektur wird mit Zeitpunkt und Person protokolliert.',
                'Every correction is logged with time and person.',
              )}
            </dd>
          </div>
        </dl>
      </aside>
    </main>
  );
}
