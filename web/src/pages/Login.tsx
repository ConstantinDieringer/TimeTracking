import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

export function Login() {
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

        <button className="button button--primary login__submit" type="submit" disabled={busy}>
          {busy ? 'Wird geprüft …' : 'Anmelden'}
        </button>
      </form>
    </main>
  );
}
