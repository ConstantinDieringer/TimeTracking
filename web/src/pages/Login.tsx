import { formatClock, formatDateLong, localDateOf, localMinutesOfDay } from '@zeiterfassung/legal';
import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

export function Login() {
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
      setError('E-Mail-Adresse oder Passwort stimmen nicht.');
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="login__form" onSubmit={handleSubmit}>
        <h1 className="login__title">Zeiterfassung</h1>
        <p className="login__hint">
          Zugänge legt die Personalverwaltung an. Bei Problemen dort melden.
        </p>

        <div className="login__field">
          <label htmlFor="email">E-Mail</label>
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
          <label htmlFor="password">Passwort</label>
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
          {busy ? 'Wird geprüft …' : 'Anmelden'}
        </button>

        <p className="login__help">
          Passwort vergessen? Die Personalverwaltung setzt es zurück.
        </p>
      </form>

      {/* Die rechte Fläche blieb leer und wirkte unfertig. Jetzt steht dort,
          was man vor der Anmeldung wissen will — Datum, Uhrzeit, und was mit
          den eigenen Daten geschieht. Keine Werbung, keine Illustration. */}
      <aside className="login__aside" aria-label="Hinweise">
        <p className="login__date">{formatDateLong(localDateOf(now))}</p>
        <p className="login__clock">{formatClock(localMinutesOfDay(now))}</p>
        <dl className="login__facts">
          <div>
            <dt>Aufzeichnung</dt>
            <dd>Arbeitszeiten und Pausen nach § 26 AZG, mit laufender Prüfung der Höchstgrenzen.</dd>
          </div>
          <div>
            <dt>Ihre Daten</dt>
            <dd>
              Sie sehen nur Ihre eigenen Zeiten, die Verwaltung nur die ihres Unternehmens.
              Gespeichert wird in der EU.
            </dd>
          </div>
          <div>
            <dt>Nachvollziehbar</dt>
            <dd>Jede Korrektur wird mit Zeitpunkt und Person protokolliert.</dd>
          </div>
        </dl>
      </aside>
    </main>
  );
}
