import {
  addMonths,
  ageOn,
  endOfMonth,
  formatDateShort,
  localDateOf,
  monthName,
  parseIsoDate,
  startOfMonth,
  STATE_LABEL,
  type AustrianState,
  type Contract,
} from '@zeiterfassung/legal';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Export } from '../components/Export';
import { Findings } from '../components/Findings';
import { Loading } from '../components/Loading';
import { Duration } from '../components/Num';
import { Pager } from '../components/Pager';
import { VertragsForm } from '../components/VertragsForm';
import { Zugang } from '../components/Zugang';
import { contractOn } from '../lib/mapping';
import { useAuditLog, useContracts, useEmployee, useTimesheet } from '../lib/queries';
import { supabase, type Tables } from '../lib/supabase';
import { collectFindings } from '../lib/timesheet';

export function AdminMitarbeiter() {
  const params = useParams();
  const employeeId = params.employeeId!;
  const client = useQueryClient();

  const today = localDateOf(new Date());
  const [month, setMonth] = useState(startOfMonth(today).slice(0, 7));
  const [editingContract, setEditingContract] = useState<Contract | null | 'neu'>(null);

  const from = startOfMonth(`${month}-01`);
  const to = endOfMonth(`${month}-01`);
  const { year, month: monthNumber } = parseIsoDate(from);

  const employee = useEmployee(employeeId);
  const contracts = useContracts(employeeId);
  const audit = useAuditLog(employeeId, 60);
  const { timesheet } = useTimesheet({ employeeId, from, to });

  const monthDays = timesheet?.days.filter((day) => day.date >= from && day.date <= to) ?? [];
  const findings = timesheet ? collectFindings({ ...timesheet, days: monthDays }) : [];
  const current = contracts.data ? contractOn(contracts.data, today) : null;

  const worked = monthDays.reduce((sum, day) => sum + day.work.workMinutes, 0);
  const target = monthDays.reduce((sum, day) => sum + (day.account?.targetMinutes ?? 0), 0);
  const balance = monthDays.reduce((sum, day) => sum + (day.account?.balanceMinutes ?? 0), 0);

  const age =
    employee.data?.birthDate !== null && employee.data?.birthDate !== undefined
      ? ageOn(employee.data.birthDate, today)
      : null;

  // Der generierte Update-Typ statt eines losen Records: so fällt ein
  // Tippfehler im Spaltennamen beim Übersetzen auf und nicht erst zur Laufzeit.
  async function patchProfile(patch: Tables['profiles']['Update']) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', employeeId);
    if (!error) {
      void client.invalidateQueries({ queryKey: ['employee', employeeId] });
      void client.invalidateQueries({ queryKey: ['overview'] });
    }
  }

  if (!employee.data) {
    return (
      <main className="page">
        <Loading />
      </main>
    );
  }

  return (
    <main className="page">
      <div className="page__head">
        <div>
          <Link className="meta" to="/admin">
            ← Verwaltung
          </Link>
          <h1>{employee.data.displayName}</h1>
          <p className="page__subtitle">
            {current ? `${current.typeLabel} · ${current.weeklyHours.toLocaleString('de-AT')} h/Woche` : 'Kein gültiger Vertrag'}
            {age !== null && ` · ${age} Jahre`}
            {age !== null && age < 18 && ' · KJBG'}
          </p>
        </div>
        <div className="row">
          <span className="meta">
            {monthName(monthNumber)} {year}
          </span>
          <Pager
            unit="Monat"
            currentLabel="Dieser Monat"
            isCurrent={month === startOfMonth(today).slice(0, 7)}
            onPrevious={() => setMonth(addMonths(`${month}-01`, -1).slice(0, 7))}
            onCurrent={() => setMonth(startOfMonth(today).slice(0, 7))}
            onNext={() => setMonth(addMonths(`${month}-01`, 1).slice(0, 7))}
          />
        </div>
      </div>

      <section className="section">
        <div className="section__head">
          <h2>Stammdaten</h2>
        </div>
        <div className="form-grid">
          <div>
            <label htmlFor="s-name">Name</label>
            <input
              id="s-name"
              defaultValue={employee.data.displayName}
              onBlur={(event) => void patchProfile({ display_name: event.target.value })}
            />
          </div>
          <div>
            <label htmlFor="s-nr">Personalnummer</label>
            <input
              id="s-nr"
              defaultValue={employee.data.personnelNumber ?? ''}
              onBlur={(event) =>
                void patchProfile({ personnel_number: event.target.value || null })
              }
            />
          </div>
          <div>
            <label htmlFor="s-geburt">Geburtsdatum</label>
            <input
              id="s-geburt"
              type="date"
              defaultValue={employee.data.birthDate ?? ''}
              onBlur={(event) => void patchProfile({ birth_date: event.target.value || null })}
            />
          </div>
          <div>
            <label htmlFor="s-eintritt">Eintritt</label>
            <input
              id="s-eintritt"
              type="date"
              defaultValue={employee.data.hiredOn}
              onBlur={(event) => void patchProfile({ hired_on: event.target.value })}
            />
          </div>
          <div>
            <label htmlFor="s-austritt">Austritt</label>
            <input
              id="s-austritt"
              type="date"
              defaultValue={employee.data.leftOn ?? ''}
              onBlur={(event) => void patchProfile({ left_on: event.target.value || null })}
            />
          </div>
          <div>
            <label htmlFor="s-land">Bundesland</label>
            <select
              id="s-land"
              defaultValue={employee.data.state}
              onChange={(event) =>
                void patchProfile({ state: event.target.value as AustrianState })
              }
            >
              {(Object.entries(STATE_LABEL) as Array<[AustrianState, string]>).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </div>
        </div>
        <p className="muted editor__note">
          Das Geburtsdatum ist kein Beiwerk: es entscheidet tagesgenau, ob das KJBG oder das AZG
          gilt. Fehlt es, wird die Person wie eine erwachsene behandelt. Das Bundesland steuert nur
          die Anzeige der Landesfeiertage — einen Entgeltanspruch begründen diese nicht.
        </p>
      </section>

      <Zugang employeeId={employeeId} displayName={employee.data.displayName} />

      <section className="section">
        <div className="section__head">
          <h2>Verträge</h2>
          <button
            className="button"
            type="button"
            onClick={() => setEditingContract(editingContract === 'neu' ? null : 'neu')}
          >
            {editingContract === 'neu' ? 'Abbrechen' : 'Vertrag hinzufügen'}
          </button>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Gültig ab</th>
                <th>Gültig bis</th>
                <th>Art</th>
                <th className="num">h/Woche</th>
                <th className="num">KV-Norm</th>
                <th className="grow">Besonderheiten</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(contracts.data ?? []).map((contract) => (
                <tr key={contract.id}>
                  <td className="num">{formatDateShort(contract.validFrom)}</td>
                  <td className="num num--muted">
                    {contract.validTo ? formatDateShort(contract.validTo) : 'laufend'}
                  </td>
                  <td>{contract.typeLabel}</td>
                  <td className="num">{contract.weeklyHours.toLocaleString('de-AT')}</td>
                  <td className="num num--muted">
                    {contract.collectiveWeeklyHours.toLocaleString('de-AT')}
                  </td>
                  <td>
                    {contract.flexTime && (
                      <span className="tag">
                        Gleitzeit · {contract.flexTime.allowsFullDayCompensation ? '12 h' : '10 h'}
                      </span>
                    )}
                    {contract.allIn && <span className="tag">All-in</span>}
                    {contract.exemptFromAzg && (
                      <span className="tag tag--muted">AZG-Ausnahme</span>
                    )}
                    {contract.nightWork && <span className="tag tag--muted">Nachtarbeit</span>}
                  </td>
                  <td>
                    <button
                      className="button button--quiet"
                      type="button"
                      onClick={() =>
                        setEditingContract(editingContract === contract ? null : contract)
                      }
                    >
                      Bearbeiten
                    </button>
                  </td>
                </tr>
              ))}
              {(contracts.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="empty">
                    Noch kein Vertrag hinterlegt. Ohne Vertrag gibt es kein Tagessoll und keine
                    Regelprüfung.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {editingContract !== null && (
          <VertragsForm
            employeeId={employeeId}
            contract={editingContract === 'neu' ? null : editingContract}
            onDone={() => setEditingContract(null)}
            onCancel={() => setEditingContract(null)}
          />
        )}
      </section>

      <section className="section">
        <div className="section__head">
          <h2>
            {monthName(monthNumber)} {year}
          </h2>
        </div>
        <dl className="figures">
          <div>
            <dt className="meta">Gearbeitet</dt>
            <dd>
              <Duration minutes={worked} zeroAs="0:00" />
            </dd>
          </div>
          <div>
            <dt className="meta">Sollzeit</dt>
            <dd>
              <Duration minutes={target} muted zeroAs="0:00" />
            </dd>
          </div>
          <div>
            <dt className="meta">Saldo</dt>
            <dd>
              <Duration minutes={balance} sign />
            </dd>
          </div>
          <div>
            <dt className="meta">Verstöße</dt>
            <dd className="num">
              {findings.filter((finding) => finding.severity === 'verstoss').length}
            </dd>
          </div>
        </dl>
        <Findings findings={findings} showDate emptyText="Keine Beanstandungen in diesem Monat." />
      </section>

      <section className="section">
        <div className="section__head">
          <h2>Ausgabe</h2>
        </div>
        {timesheet && (
          <Export
            employee={employee.data}
            personnelNumber={employee.data.personnelNumber}
            contract={contractOn(contracts.data ?? [], from)}
            month={month}
            days={monthDays}
            timesheet={timesheet}
          />
        )}
      </section>

      <section className="section">
        <div className="section__head">
          <h2>Änderungsprotokoll</h2>
          <span className="meta">Letzte {audit.data?.length ?? 0} Einträge</span>
        </div>
        <p className="muted">
          Wird von einem Datenbank-Trigger geschrieben und lässt sich weder ändern noch löschen —
          auch nicht aus der Verwaltung heraus. Erfasst Zeiten, Abwesenheiten, Verträge und
          Stammdaten einschließlich Rolle und Deaktivierung.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Zeitpunkt</th>
                <th>Tabelle</th>
                <th>Vorgang</th>
                <th className="grow">Änderung</th>
              </tr>
            </thead>
            <tbody>
              {(audit.data ?? []).map((entry) => (
                <tr key={entry.id}>
                  <td className="num num--muted">
                    {new Date(entry.changed_at).toLocaleString('de-AT')}
                  </td>
                  <td>{TABLE_LABEL[entry.table_name] ?? entry.table_name}</td>
                  <td>{OPERATION_LABEL[entry.operation] ?? entry.operation}</td>
                  <td className="muted grow">{describeChange(entry.old_data, entry.new_data)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

const TABLE_LABEL: Record<string, string> = {
  time_entries: 'Zeiterfassung',
  absences: 'Abwesenheit',
  employment_contracts: 'Vertrag',
  profiles: 'Stammdaten',
};

const OPERATION_LABEL: Record<string, string> = {
  INSERT: 'Angelegt',
  UPDATE: 'Geändert',
  DELETE: 'Gelöscht',
};

/** Nennt die Felder, die sich geändert haben — die vollen JSON-Objekte helfen niemandem. */
function describeChange(oldData: unknown, newData: unknown): string {
  const before = (oldData ?? {}) as Record<string, unknown>;
  const after = (newData ?? {}) as Record<string, unknown>;

  if (!oldData) return 'neu angelegt';
  if (!newData) return 'entfernt';

  const ignored = new Set(['updated_at', 'updated_by', 'created_at', 'created_by']);
  const changed = Object.keys({ ...before, ...after })
    .filter((key) => !ignored.has(key))
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => `${FIELD_LABEL[key] ?? key}: ${format(before[key])} → ${format(after[key])}`);

  return changed.length > 0 ? changed.join(', ') : 'ohne inhaltliche Änderung';
}

const FIELD_LABEL: Record<string, string> = {
  started_at: 'Beginn',
  ended_at: 'Ende',
  work_date: 'Datum',
  kind: 'Art',
  note: 'Anmerkung',
  source: 'Quelle',
  half_day: 'Halbtägig',
  weekly_hours: 'Wochenstunden',
  valid_from: 'Gültig ab',
  valid_to: 'Gültig bis',
  display_name: 'Name',
  personnel_number: 'Personalnummer',
  birth_date: 'Geburtsdatum',
  hired_on: 'Eintritt',
  left_on: 'Austritt',
  state: 'Bundesland',
  role: 'Rolle',
  active: 'Aktiv',
  organization_id: 'Unternehmen',
};

function format(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Date(value).toLocaleString('de-AT');
  }
  return String(value);
}
