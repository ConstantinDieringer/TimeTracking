import { useEffect } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router';
import { Icon } from './components/Icon';
import { Loading } from './components/Loading';
import { LogoMark } from './components/LogoMark';
import { Sprachwahl } from './components/Sprachwahl';
import { useI18n } from './lib/i18n';
import { useSession } from './lib/session';
import { Login } from './pages/Login';
import { Heute } from './pages/Heute';
import { Monat } from './pages/Monat';
import { Auswertung } from './pages/Auswertung';
import { Admin } from './pages/Admin';
import { AdminEinstellungen } from './pages/AdminEinstellungen';
import { AdminMitarbeiter } from './pages/AdminMitarbeiter';
import { Datenschutz } from './pages/Datenschutz';
import { MeinVertrag } from './pages/MeinVertrag';
import { PasswortNeu } from './pages/PasswortNeu';

export function App() {
  const { session, profile, loading, isAdmin, signOut } = useSession();
  const { t } = useI18n();
  const location = useLocation();
  const isTimes = location.pathname === '/' || location.pathname.startsWith('/monat');

  // Auf dem Telefon ist die Navigation eine wischbare Leiste. Der aktive
  // Punkt soll darin immer sichtbar sein, nicht halb abgeschnitten am Rand.
  useEffect(() => {
    document
      .querySelector('.nav [aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [location.pathname, loading]);

  // Der Link aus der E-Mail „Passwort zurücksetzen“ führt hierher — mit oder
  // ohne bestehende Anmeldung, deshalb vor allen anderen Weichen.
  // Landet der Link auf der Startseite, weil die Zieladresse in Supabase
  // (noch) nicht freigegeben ist, erkennt man ihn am Code in der Adresse.
  const authLink =
    /(^|&)type=(invite|recovery)(&|$)/.test(location.hash.slice(1)) ||
    new URLSearchParams(location.search).has('code') ||
    new URLSearchParams(location.search).has('token_hash');
  if (location.pathname === '/passwort-neu' || authLink) return <PasswortNeu />;

  if (loading) {
    return (
      <main className="page">
        <Loading />
      </main>
    );
  }

  if (!session || !profile) return <Login />;

  // Ein Konto ohne Unternehmen ist kein Fehler, sondern der Normalzustand nach
  // der Registrierung: zugeordnet wird erst über eine Einladung oder beim
  // Anlegen eines Unternehmens.
  if (!profile.organization_id) {
    return (
      <main className="page">
        <h1>{t('Keinem Unternehmen zugeordnet', 'Not assigned to a company')}</h1>
        <p className="muted">
          {t(
            'Dieser Zugang gehört noch zu keinem Unternehmen. Sobald Sie die Verwaltung Ihres Unternehmens hinzufügt, steht Ihnen die Zeiterfassung hier zur Verfügung.',
            'This account does not belong to a company yet. As soon as your company’s administration adds you, time tracking will be available here.',
          )}
        </p>
        <div className="row">
          <button className="button" type="button" onClick={signOut}>
            {t('Abmelden', 'Sign out')}
          </button>
          <Sprachwahl />
        </div>
      </main>
    );
  }

  if (!profile.active) {
    return (
      <main className="page">
        <h1>{t('Zugang deaktiviert', 'Account deactivated')}</h1>
        <p className="muted">
          {t(
            'Dieser Zugang ist nicht mehr aktiv. Die Personalverwaltung kann ihn wieder freischalten.',
            'This account is no longer active. Your HR administration can reactivate it.',
          )}
        </p>
        <div className="row">
          <button className="button" type="button" onClick={signOut}>
            {t('Abmelden', 'Sign out')}
          </button>
          <Sprachwahl />
        </div>
      </main>
    );
  }

  return (
    <div className="app">
      <a className="skip-link" href="#inhalt">
        {t('Zum Inhalt springen', 'Skip to content')}
      </a>
      <header className="masthead">
        <div className="masthead__inner">
          <Link className="masthead__title" to="/" viewTransition>
            <LogoMark />
            Zeiterfassung
          </Link>
          <nav className="nav" aria-label={t('Hauptnavigation', 'Main navigation')}>
            {/* Ein Punkt für Tages- und Monatsansicht; zwischen beiden schaltet
                der Umschalter auf der Seite. */}
            <Link to="/" aria-current={isTimes ? 'page' : undefined} viewTransition>
              <Icon name="clock" />
              {t('Meine Zeiten', 'My time')}
            </Link>
            <NavLink to="/auswertung" viewTransition>
              <Icon name="chart" />
              {t('Auswertung', 'Reports')}
            </NavLink>
            <NavLink to="/vertrag" viewTransition>
              <Icon name="file" />
              {t('Vertrag', 'Contract')}
            </NavLink>
            {isAdmin && (
              <NavLink to="/admin" viewTransition>
                <Icon name="users" />
                {t('Verwaltung', 'Administration')}
              </NavLink>
            )}
          </nav>
          <div className="masthead__account">
            <Sprachwahl />
            <span className="avatar" aria-hidden="true">
              {initials(profile.display_name)}
            </span>
            <span className="masthead__user" title={profile.display_name}>
              {profile.display_name}
            </span>
            <button
              className="button button--quiet"
              type="button"
              onClick={signOut}
              title={t('Abmelden', 'Sign out')}
            >
              <Icon name="logout" />
              <span className="masthead__logout-label">{t('Abmelden', 'Sign out')}</span>
            </button>
          </div>
        </div>
      </header>

      <div id="inhalt" className="app__content">
        <Routes>
          <Route path="/" element={<Heute />} />
          {/* Die Wochenansicht gibt es nicht mehr; alte Lesezeichen landen im Monat. */}
          <Route path="/woche/*" element={<Navigate to="/monat" replace />} />
          <Route path="/monat" element={<Monat />} />
          <Route path="/monat/:month" element={<Monat />} />
          <Route path="/auswertung" element={<Auswertung />} />
          <Route path="/datenschutz" element={<Datenschutz />} />
          <Route path="/vertrag" element={<MeinVertrag />} />
          {isAdmin && <Route path="/admin" element={<Admin />} />}
          {isAdmin && <Route path="/admin/einstellungen" element={<AdminEinstellungen />} />}
          {isAdmin && <Route path="/admin/:employeeId" element={<AdminMitarbeiter />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      <footer className="footer">
        <div className="footer__inner">
          <Link className="footer__link" to="/datenschutz">
            <Icon name="shield" size={16} />
            {t('Datenschutz', 'Privacy')}
          </Link>
          <span>
            {t(
              'Arbeitszeitaufzeichnung · Daten in der EU',
              'Working-time records · Data stored in the EU',
            )}
          </span>
        </div>
      </footer>
    </div>
  );
}

/** „Marlene Hofer“ → „MH“ — für den Kreis neben dem Namen. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}
