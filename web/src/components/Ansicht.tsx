import { NavLink } from 'react-router';

/**
 * Umschalter zwischen Tages- und Monatsansicht.
 *
 * Steht auf der Seite und nicht in der Kopfleiste: Heute und Monat sind zwei
 * Blickwinkel auf dieselben Zeiten, keine eigenen Bereiche der Anwendung. Die
 * Kopfleiste führt nur zu „Meine Zeiten“, hier wählt man den Zeitraum.
 */
export function Ansicht() {
  return (
    <nav className="segmented" aria-label="Ansicht">
      <NavLink to="/" end viewTransition>
        Heute
      </NavLink>
      <NavLink to="/monat" viewTransition>Monat</NavLink>
    </nav>
  );
}
