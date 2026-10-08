import {
  addMonths,
  formatDateShort,
  localDateOf,
  monthName,
  parseIsoDate,
  startOfMonth,
} from '@zeiterfassung/legal';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Loading } from '../components/Loading';
import { Duration } from '../components/Num';
import { NeuerZugang } from '../components/NeuerZugang';
import { Pager } from '../components/Pager';
import { useOverview } from '../lib/overview';
import { useSession } from '../lib/session';

export function Admin() {
  const { organization } = useSession();
  const navigate = useNavigate();
  const today = localDateOf(new Date());
  const [month, setMonth] = useState(startOfMonth(today).slice(0, 7));
  const [addingUser, setAddingUser] = useState(false);

  const overview = useOverview(true, month);
  const { year, month: monthNumber } = parseIsoDate(`${month}-01`);

  const rows = overview.data?.rows ?? [];
  const aktive = rows.filter((row) => row.active);
  const inaktive = rows.filter((row) => !row.active);
  const verstoesse = rows.reduce((sum, row) => sum + row.violations, 0);

  return (
    <main className="page">
      <div className="page__head">
        <div>
          <h1>Verwaltung</h1>
          <p className="page__subtitle">
            {aktive.length} {aktive.length === 1 ? 'aktiver Mitarbeiter' : 'aktive Mitarbeiter'} ·{' '}
            {verstoesse} {verstoesse === 1 ? 'Verstoß' : 'Verstöße'} im {monthName(monthNumber)}{' '}
            {year}
          </p>
        </div>
        <div className="row">
          <Link className="button" to="/admin/einstellungen">
            Betriebsstandard
          </Link>
          <button
            className="button button--primary"
            type="button"
            onClick={() => setAddingUser((value) => !value)}
          >
            {addingUser ? 'Abbrechen' : 'Mitarbeiter anlegen'}
          </button>
        </div>
      </div>

      {addingUser && (
        <NeuerZugang
          onDone={() => {
            setAddingUser(false);
            void overview.refetch();
          }}
        />
      )}

      {/* Der Zeitraum steuert nur die Tabelle darunter — deshalb steht er bei
          ihr und nicht zwischen den Seitenaktionen. */}
      <div className="toolbar">
        <h2>
          {monthName(monthNumber)} {year}
        </h2>
        <Pager
          unit="Monat"
          currentLabel="Dieser Monat"
          isCurrent={month === startOfMonth(today).slice(0, 7)}
          onPrevious={() => setMonth(addMonths(`${month}-01`, -1).slice(0, 7))}
          onCurrent={() => setMonth(startOfMonth(today).slice(0, 7))}
          onNext={() => setMonth(addMonths(`${month}-01`, 1).slice(0, 7))}
        />
      </div>

      {overview.isLoading && <Loading />}
      {overview.error instanceof Error && (
        <p className="error-text">{overview.error.message}</p>
      )}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Personalnr.</th>
              <th>Vertragsart</th>
              <th className="num">h/Woche</th>
              <th className="num">Ist</th>
              <th className="num">Soll</th>
              <th className="num">Saldo</th>
              <th className="grow">Befunde</th>
              <th>
                <span className="visually-hidden">Öffnen</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {aktive.map((row) => (
              // Die ganze Zeile führt zum Mitarbeiterblatt; der Link im Namen
              // bleibt für Tastatur und Bildschirmleser das eigentliche Ziel.
              <tr
                key={row.employee.id}
                className="is-clickable"
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('a, button')) return;
                  navigate(`/admin/${row.employee.id}`, { viewTransition: true });
                }}
              >
                <td>
                  <Link to={`/admin/${row.employee.id}`} viewTransition>
                    {row.employee.displayName}
                  </Link>
                  {row.employee.id === organization?.owner_id ? (
                    <span className="tag tag--muted">Inhaber</span>
                  ) : (
                    row.role === 'admin' && <span className="tag tag--muted">Verwaltung</span>
                  )}
                </td>
                <td className="num num--muted">{row.employee.personnelNumber ?? '—'}</td>
                <td>
                  {row.missingContract ? (
                    <span className="tag tag--verstoss">Kein gültiger Vertrag</span>
                  ) : (
                    row.contractLabel
                  )}
                </td>
                <td className="num">{row.weeklyHours?.toLocaleString('de-AT') ?? '—'}</td>
                <td>
                  <Duration minutes={row.workedMinutes} zeroAs="0:00" />
                </td>
                <td>
                  <Duration minutes={row.targetMinutes} muted zeroAs="0:00" />
                </td>
                <td>
                  <Duration minutes={row.balanceMinutes} sign />
                </td>
                <td>
                  {row.violations > 0 && (
                    <span className="tag tag--verstoss">
                      {row.violations} {row.violations === 1 ? 'Verstoß' : 'Verstöße'}
                    </span>
                  )}
                  {row.hints > 0 && (
                    <span className="tag tag--hinweis">
                      {row.hints} {row.hints === 1 ? 'Hinweis' : 'Hinweise'}
                    </span>
                  )}
                  {row.violations === 0 && row.hints === 0 && <span className="muted">—</span>}
                </td>
                <td>
                  <Link className="button button--quiet" to={`/admin/${row.employee.id}`}>
                    Öffnen
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {inaktive.length > 0 && (
        <section className="section">
          <div className="section__head">
            <h2>Deaktivierte Zugänge</h2>
          </div>
          <p className="muted">
            Deaktiviert statt gelöscht: die Aufzeichnungen sind nach § 26 AZG weiter aufzubewahren,
            und ein gelöschter Zugang nähme sie mit.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Eintritt</th>
                  <th>Austritt</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {inaktive.map((row) => (
                  <tr key={row.employee.id}>
                    <td>{row.employee.displayName}</td>
                    <td className="num num--muted">{formatDateShort(row.employee.hiredOn)}</td>
                    <td className="num num--muted">
                      {row.employee.leftOn ? formatDateShort(row.employee.leftOn) : '—'}
                    </td>
                    <td>
                      <Link className="button button--quiet" to={`/admin/${row.employee.id}`}>
                        Öffnen
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
