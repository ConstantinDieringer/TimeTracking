import { useEffect } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router';
import { Loading } from './components/Loading';
import { LogoMark } from './components/LogoMark';
import { useSession } from './lib/session';
import { Login } from './pages/Login';
import { Heute } from './pages/Heute';
import { Woche } from './pages/Woche';
import { Monat } from './pages/Monat';
import { Auswertung } from './pages/Auswertung';
import { Admin } from './pages/Admin';
import { AdminEinstellungen } from './pages/AdminEinstellungen';
import { AdminMitarbeiter } from './pages/AdminMitarbeiter';
import { Datenschutz } from './pages/Datenschutz';

export function App() {
  const { session, profile, loading, isAdmin, signOut } = useSession();
  const location = useLocation();

  // Auf dem Telefon ist die Navigation eine wischbare Leiste. Der aktive
  // Punkt soll darin immer sichtbar sein, nicht halb abgeschnitten am Rand.
  useEffect(() => {
    document
      .querySelector('.nav [aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [location.pathname, loading]);

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
        <h1>Keinem Unternehmen zugeordnet</h1>
        <p className="muted">
          Dieser Zugang gehört noch zu keinem Unternehmen. Sobald Sie die Verwaltung Ihres
          Unternehmens hinzufügt, steht Ihnen die Zeiterfassung hier zur Verfügung.
        </p>
        <button className="button" type="button" onClick={signOut}>
          Abmelden
        </button>
      </main>
    );
  }

  if (!profile.active) {
    return (
      <main className="page">
        <h1>Zugang deaktiviert</h1>
        <p className="muted">
          Dieser Zugang ist nicht mehr aktiv. Die Personalverwaltung kann ihn wieder freischalten.
        </p>
        <button className="button" type="button" onClick={signOut}>
          Abmelden
        </button>
      </main>
    );
  }

  return (
    <div className="app">
      <a className="skip-link" href="#inhalt">
        Zum Inhalt springen
      </a>
      <header className="masthead">
        <div className="masthead__inner">
          <Link className="masthead__title" to="/">
            <LogoMark />
            Zeiterfassung
          </Link>
          <nav className="nav" aria-label="Hauptnavigation">
            <NavLink to="/">Heute</NavLink>
            <NavLink to="/woche">Woche</NavLink>
            <NavLink to="/monat">Monat</NavLink>
            <NavLink to="/auswertung">Auswertung</NavLink>
            {isAdmin && <NavLink to="/admin">Verwaltung</NavLink>}
          </nav>
          <div className="masthead__account">
            <span className="avatar" aria-hidden="true">
              {initials(profile.display_name)}
            </span>
            <span className="masthead__user" title={profile.display_name}>
              {profile.display_name}
            </span>
            <button className="button button--quiet" type="button" onClick={signOut}>
              Abmelden
            </button>
          </div>
        </div>
      </header>

      <div id="inhalt" className="app__content">
        <Routes>
          <Route path="/" element={<Heute />} />
          <Route path="/woche" element={<Woche />} />
          <Route path="/woche/:date" element={<Woche />} />
          <Route path="/monat" element={<Monat />} />
          <Route path="/monat/:month" element={<Monat />} />
          <Route path="/auswertung" element={<Auswertung />} />
          <Route path="/datenschutz" element={<Datenschutz />} />
          {isAdmin && <Route path="/admin" element={<Admin />} />}
          {isAdmin && <Route path="/admin/einstellungen" element={<AdminEinstellungen />} />}
          {isAdmin && <Route path="/admin/:employeeId" element={<AdminMitarbeiter />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      <footer className="footer">
        <div className="footer__inner">
          <Link to="/datenschutz">Datenschutz</Link>
          <span>Aufzeichnung nach § 26 AZG · Daten in der EU</span>
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
