import { useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { LogoMark } from '../components/LogoMark';
import { Sprachwahl } from '../components/Sprachwahl';
import { useI18n } from '../lib/i18n';
import { supabase } from '../lib/supabase';

export function Login() {
  const { t } = useI18n();
  const [mode, setMode] = useState<'anmelden' | 'vergessen'>('anmelden');
  const [email, setEmail] = useState('');

  return (
    <main className="login">
      <div className="login__card">
        <div className="login__language">
          <Sprachwahl />
        </div>
        <h1 className="login__title">
          <LogoMark size={40} />
          Zeiterfassung
        </h1>
        {mode === 'anmelden' ? (
          <AnmeldenForm email={email} setEmail={setEmail} onForgot={() => setMode('vergessen')} t={t} />
        ) : (
          <VergessenForm email={email} setEmail={setEmail} onBack={() => setMode('anmelden')} t={t} />
        )}
      </div>
    </main>
  );
}

type Translate = (de: string, en: string) => string;

function AnmeldenForm({
  email,
  setEmail,
  onForgot,
  t,
}: {
  email: string;
  setEmail: (email: string) => void;
  onForgot: () => void;
  t: Translate;
}) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      // Nur in der Entwicklung: der genaue Grund, den die Maske verschweigt.
      if (import.meta.env.DEV) console.error('Anmeldung fehlgeschlagen', signInError.status, signInError.code, signInError.message);
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
    <form className="login__form" onSubmit={handleSubmit}>
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
        <div className="password-field">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((shown) => !shown)} controls="password" t={t} />
        </div>
      </div>

      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}

      <button className="button button--primary button--large login__submit" type="submit" disabled={busy}>
        {busy ? t('Wird geprüft …', 'Checking …') : t('Anmelden', 'Sign in')}
      </button>

      <button className="link-button login__switch" type="button" onClick={onForgot}>
        {t('Passwort vergessen?', 'Forgot your password?')}
      </button>
    </form>
  );
}

function VergessenForm({
  email,
  setEmail,
  onBack,
  t,
}: {
  email: string;
  setEmail: (email: string) => void;
  onBack: () => void;
  t: Translate;
}) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/passwort-neu`,
    });
    setBusy(false);

    if (resetError?.status === 429) {
      setError(
        t(
          'Gerade wurde schon eine E-Mail angefordert. Bitte eine Minute warten und erneut versuchen.',
          'An email was requested just now. Please wait a minute and try again.',
        ),
      );
      return;
    }
    if (resetError && import.meta.env.DEV) console.error('Zurücksetzen fehlgeschlagen', resetError);

    // Dieselbe Antwort, ob es die Adresse gibt oder nicht — sonst ließe sich
    // hier ausprobieren, wer einen Zugang hat. Supabase schickt die E-Mail nur,
    // wenn ein Konto existiert.
    setSent(true);
  }

  if (sent) {
    return (
      <div className="login__form">
        <p className="login__notice" role="status">
          <Icon name="check" />
          <span>
            {t(
              'Wenn zu dieser Adresse ein Zugang besteht, ist eine E-Mail mit einem Link zum Festlegen eines neuen Passworts unterwegs. Der Link gilt eine Stunde. Bitte auch den Spam-Ordner prüfen.',
              'If an account exists for this address, an email with a link to set a new password is on its way. The link is valid for one hour. Please also check your spam folder.',
            )}
          </span>
        </p>
        <button className="button button--large login__submit" type="button" onClick={onBack}>
          {t('Zurück zur Anmeldung', 'Back to sign in')}
        </button>
      </div>
    );
  }

  return (
    <form className="login__form" onSubmit={handleSubmit}>
      <p className="login__hint">
        {t(
          'Geben Sie die E-Mail-Adresse Ihres Zugangs an. Sie bekommen einen Link, mit dem Sie ein neues Passwort festlegen.',
          'Enter the email address of your account. You will receive a link to set a new password.',
        )}
      </p>

      <div className="login__field">
        <label htmlFor="reset-email">{t('E-Mail', 'Email')}</label>
        <input
          id="reset-email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}

      <button className="button button--primary button--large login__submit" type="submit" disabled={busy}>
        {busy ? t('Wird gesendet …', 'Sending …') : t('Link zusenden', 'Send link')}
      </button>

      <button className="link-button login__switch" type="button" onClick={onBack}>
        {t('Zurück zur Anmeldung', 'Back to sign in')}
      </button>
    </form>
  );
}

export function PasswordToggle({
  shown,
  onToggle,
  controls,
  t,
}: {
  shown: boolean;
  onToggle: () => void;
  controls: string;
  t: Translate;
}) {
  const label = shown ? t('Passwort verbergen', 'Hide password') : t('Passwort anzeigen', 'Show password');
  return (
    <button
      type="button"
      className="password-field__toggle"
      onClick={onToggle}
      aria-pressed={shown}
      aria-controls={controls}
      aria-label={label}
      title={label}
    >
      <Icon name={shown ? 'eyeOff' : 'eye'} />
    </button>
  );
}
