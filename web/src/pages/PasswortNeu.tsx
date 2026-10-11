import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Loading } from '../components/Loading';
import { LogoMark } from '../components/LogoMark';
import { Sprachwahl } from '../components/Sprachwahl';
import { useI18n } from '../lib/i18n';
import { supabase } from '../lib/supabase';
import { PasswordToggle } from './Login';

/**
 * Neues Passwort festlegen, nach dem Klick auf den Link in der E-Mail
 * „Passwort zurücksetzen“.
 *
 * Der Link bringt einen Einmal-Code mit. Je nach E-Mail-Vorlage ist es ein
 * `code` (PKCE: funktioniert nur im Browser, in dem der Link angefordert
 * wurde) oder ein `token_hash` (funktioniert überall). Beides wird hier gegen
 * eine Anmeldung getauscht, die nur zum Setzen des Passworts dient.
 */
export function PasswortNeu() {
  const { t } = useI18n();
  const [phase, setPhase] = useState<'pruefen' | 'eingabe' | 'ungueltig' | 'fertig'>('pruefen');
  const started = useRef(false);

  useEffect(() => {
    // Der Code gilt genau einmal; im StrictMode liefe der Effekt sonst doppelt.
    if (started.current) return;
    started.current = true;

    void (async () => {
      const query = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const code = query.get('code');
      const tokenHash = query.get('token_hash');

      let ok = false;
      if (query.get('error') || hash.get('error')) {
        ok = false;
      } else if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
        ok = !error;
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        ok = !error;
      } else {
        const { data } = await supabase.auth.getSession();
        ok = Boolean(data.session);
      }

      // Den Code aus der Adresszeile nehmen: er soll weder im Verlauf noch in
      // einem Lesezeichen stehen.
      window.history.replaceState(null, '', '/passwort-neu');
      setPhase(ok ? 'eingabe' : 'ungueltig');
    })();
  }, []);

  return (
    <main className="login">
      <div className="login__card">
        <div className="login__language">
          <Sprachwahl />
        </div>
        <h1 className="login__title">
          <LogoMark size={40} />
          {t('Neues Passwort', 'New password')}
        </h1>

        {phase === 'pruefen' && <Loading />}

        {phase === 'ungueltig' && (
          <div className="login__form">
            <p className="error-text" role="alert">
              {t(
                'Der Link ist abgelaufen, wurde schon verwendet oder in einem anderen Browser geöffnet als dem, in dem er angefordert wurde. Bitte einen neuen Link anfordern.',
                'The link has expired, has already been used, or was opened in a different browser from the one it was requested in. Please request a new link.',
              )}
            </p>
            <a className="button button--primary button--large login__submit" href="/">
              {t('Zur Anmeldung', 'Go to sign in')}
            </a>
          </div>
        )}

        {phase === 'eingabe' && <Eingabe onDone={() => setPhase('fertig')} />}

        {phase === 'fertig' && (
          <div className="login__form">
            <p className="login__notice" role="status">
              {t(
                'Das neue Passwort gilt ab sofort. Anmeldungen auf anderen Geräten wurden beendet.',
                'Your new password is active. Sessions on other devices have been signed out.',
              )}
            </p>
            <a className="button button--primary button--large login__submit" href="/">
              {t('Weiter zur Zeiterfassung', 'Continue to time tracking')}
            </a>
          </div>
        )}
      </div>
    </main>
  );
}

function Eingabe({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [shown, setShown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    // Dieselben Regeln wie in Supabase eingestellt: 12 Zeichen, Buchstaben und Ziffern.
    if (password.length < 12 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      setError(
        t(
          'Das Passwort braucht mindestens 12 Zeichen mit Buchstaben und Ziffern.',
          'The password needs at least 12 characters including letters and digits.',
        ),
      );
      return;
    }
    if (password !== repeat) {
      setError(t('Die beiden Eingaben stimmen nicht überein.', 'The two entries do not match.'));
      return;
    }

    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setBusy(false);
      setError(
        updateError.code === 'same_password'
          ? t('Das neue Passwort muss sich vom alten unterscheiden.', 'The new password must differ from the old one.')
          : updateError.code === 'weak_password'
            ? t(
                'Dieses Passwort ist zu schwach oder in bekannten Datenlecks aufgetaucht. Bitte ein anderes wählen.',
                'This password is too weak or has appeared in known data breaches. Please choose another one.',
              )
            : t('Das Passwort konnte nicht gespeichert werden. Bitte einen neuen Link anfordern.', 'The password could not be saved. Please request a new link.'),
      );
      return;
    }

    // Wer das Passwort zurücksetzt, hat oft einen Grund: andere Anmeldungen
    // beenden, damit ein altes, womöglich bekanntes Passwort nichts mehr nützt.
    await supabase.auth.signOut({ scope: 'others' });
    setBusy(false);
    onDone();
  }

  return (
    <form className="login__form" onSubmit={handleSubmit}>
      <p className="login__hint">
        {t(
          'Mindestens 12 Zeichen, mit Buchstaben und Ziffern. Lieber lang als kompliziert.',
          'At least 12 characters, with letters and digits. Long beats complicated.',
        )}
      </p>
      <div className="login__field">
        <label htmlFor="new-password">{t('Neues Passwort', 'New password')}</label>
        <div className="password-field">
          <input
            id="new-password"
            type={shown ? 'text' : 'password'}
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={72}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <PasswordToggle shown={shown} onToggle={() => setShown((value) => !value)} controls="new-password" t={t} />
        </div>
      </div>
      <div className="login__field">
        <label htmlFor="repeat-password">{t('Wiederholen', 'Repeat')}</label>
        <input
          id="repeat-password"
          type={shown ? 'text' : 'password'}
          autoComplete="new-password"
          required
          value={repeat}
          onChange={(event) => setRepeat(event.target.value)}
        />
      </div>

      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}

      <button className="button button--primary button--large login__submit" type="submit" disabled={busy}>
        {busy ? t('Wird gespeichert …', 'Saving …') : t('Passwort speichern', 'Save password')}
      </button>
    </form>
  );
}
