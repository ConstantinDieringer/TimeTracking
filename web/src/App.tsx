import { NavLink, Navigate, Route, Routes } from 'react-router';
import { useSession } from './lib/session';
import { Login } from './pages/Login';
import { Heute } from './pages/Heute';
import { Woche } from './pages/Woche';
import { Monat } from './pages/Monat';
import { Auswertung } from './pages/Auswertung';
import { Admin } from './pages/Admin';
import { AdminEinstellungen } from './pages/AdminEinstellungen';
import { AdminMitarbeiter } from './pages/AdminMitarbeiter';

export function App() {
  const { session, profile, loading, isAdmin, signOut } = useSession();

  if (loading) {
    return (
      <main className="page">
        <p className="muted">Wird geladen …</p>
      </main>
    );
  }

  if (!session || !profile) return <Login />;

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
      <header className="masthead">
        <div className="masthead__inner">
          <span className="masthead__title">Zeiterfassung</span>
          <nav className="nav">
            <NavLink to="/">Heute</NavLink>
            <NavLink to="/woche">Woche</NavLink>
            <NavLink to="/monat">Monat</NavLink>
            <NavLink to="/auswertung">Auswertung</NavLink>
            {isAdmin && <NavLink to="/admin">Verwaltung</NavLink>}
          </nav>
          <span className="masthead__user">{profile.display_name}</span>
          <button className="button button--quiet" type="button" onClick={signOut}>
            Abmelden
          </button>
        </div>
      </header>

      <Routes>
        <Route path="/" element={<Heute />} />
        <Route path="/woche" element={<Woche />} />
        <Route path="/woche/:date" element={<Woche />} />
        <Route path="/monat" element={<Monat />} />
        <Route path="/monat/:month" element={<Monat />} />
        <Route path="/auswertung" element={<Auswertung />} />
        {isAdmin && <Route path="/admin" element={<Admin />} />}
        {isAdmin && <Route path="/admin/einstellungen" element={<AdminEinstellungen />} />}
        {isAdmin && <Route path="/admin/:employeeId" element={<AdminMitarbeiter />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
