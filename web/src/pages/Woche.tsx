import {
  addDays,
  describeAbsence,
  endOfIsoWeek,
  formatClock,
  formatDateShort,
  isoWeek,
  isWeekend,
  localDateOf,
  localMinutesOfDay,
  startOfIsoWeek,
  weekdayShort,
  type IsoDate,
} from '@zeiterfassung/legal';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { DayEditor } from '../components/DayEditor';
import { Findings } from '../components/Findings';
import { Loading } from '../components/Loading';
import { Duration } from '../components/Num';
import { Pager } from '../components/Pager';
import { useTimesheet } from '../lib/queries';
import { useSession } from '../lib/session';

export function Woche() {
  const { session } = useSession();
  const employeeId = session?.user.id;
  const navigate = useNavigate();
  const params = useParams();

  const today = localDateOf(new Date());
  const anchor = (params.date as IsoDate | undefined) ?? today;
  const from = startOfIsoWeek(anchor);
  const to = endOfIsoWeek(anchor);
  const { year, week } = isoWeek(from);

  const [editing, setEditing] = useState<IsoDate | null>(null);
  const { timesheet, isLoading } = useTimesheet({ employeeId, from, to });

  const days = timesheet?.days.filter((day) => day.date >= from && day.date <= to) ?? [];
  const weekSummary = timesheet?.weeks.find((entry) => entry.weekStart === from) ?? null;
  const editingDay = editing ? (timesheet?.byDate.get(editing) ?? null) : null;

  return (
    <main className="page">
      <div className="page__head">
        <div>
          <h1>
            KW {week} · {year}
          </h1>
          <p className="page__subtitle">
            {formatDateShort(from)} bis {formatDateShort(to)}
          </p>
        </div>
        <Pager
          unit="Woche"
          currentLabel="Diese Woche"
          isCurrent={from === startOfIsoWeek(today)}
          onPrevious={() => navigate(`/woche/${addDays(from, -7)}`)}
          onCurrent={() => navigate('/woche')}
          onNext={() => navigate(`/woche/${addDays(from, 7)}`)}
        />
      </div>

      {isLoading && <Loading />}

      <div className="table-scroll">
        <table className="ledger">
          <thead>
            <tr>
              <th>Tag</th>
              <th>Datum</th>
              <th>Von</th>
              <th>Bis</th>
              <th className="num">Pause</th>
              <th className="num">Ist</th>
              <th className="num">Soll</th>
              <th className="num">Saldo</th>
              <th className="grow">Anmerkung</th>
              <th>
                <span className="visually-hidden">Bearbeiten</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => {
              const holiday = day.holidays.find((entry) => entry.statutory);
              const observance = day.holidays.find((entry) => !entry.statutory);
              const severity = day.evaluation?.worstSeverity ?? 'ok';

              const classes = [
                isWeekend(day.date) ? 'is-weekend' : '',
                holiday ? 'is-holiday' : '',
                day.date === today ? 'is-today' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <tr key={day.date} className={classes}>
                  <td>{weekdayShort(day.date)}</td>
                  <td className="num num--muted">{formatDateShort(day.date).slice(0, 6)}</td>
                  <td className="num">
                    {day.work.firstStart ? formatClock(localMinutesOfDay(day.work.firstStart)) : '—'}
                  </td>
                  <td className="num">
                    {day.work.open ? (
                      <span className="muted">läuft</span>
                    ) : day.work.lastEnd ? (
                      formatClock(localMinutesOfDay(day.work.lastEnd))
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <Duration minutes={day.work.breakMinutes} />
                  </td>
                  <td>
                    <Duration minutes={day.work.workMinutes} />
                  </td>
                  <td>
                    <Duration minutes={day.account?.targetMinutes ?? 0} muted />
                  </td>
                  <td>
                    <Duration minutes={day.account?.balanceMinutes ?? 0} sign />
                  </td>
                  <td className="ledger__note grow">
                    {holiday && <span className="tag tag--holiday">{holiday.name}</span>}
                    {day.absence && <span className="tag">{describeAbsence(day.absence)}</span>}
                    {observance && !holiday && (
                      <span className="tag tag--muted" title={observance.note}>
                        {observance.name}
                      </span>
                    )}
                    {severity !== 'ok' && (
                      <span className={`tag tag--${severity}`}>
                        {severity === 'verstoss' ? 'Verstoß' : 'Hinweis'}
                      </span>
                    )}
                  </td>
                  <td>
                    <button
                      className="button button--quiet"
                      type="button"
                      onClick={() => setEditing(editing === day.date ? null : day.date)}
                    >
                      {editing === day.date ? 'Fertig' : 'Bearbeiten'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}>Woche</td>
              <td>
                <Duration minutes={weekSummary?.totalMinutes ?? 0} />
              </td>
              <td>
                <Duration minutes={weekSummary?.targetMinutes ?? 0} muted />
              </td>
              <td>
                <Duration minutes={weekSummary?.balanceMinutes ?? 0} sign />
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      {editingDay && employeeId && (
        <DayEditor day={editingDay} employeeId={employeeId} onClose={() => setEditing(null)} />
      )}

      {weekSummary?.classification && (
        <section className="section">
          <div className="section__head">
            <h2>Zuordnung</h2>
            {weekSummary.classification.coveredByAllIn && (
              <span className="meta">All-in — Überstunden pauschal abgegolten</span>
            )}
          </div>
          <dl className="figures">
            <div>
              <dt className="meta">Normalarbeitszeit</dt>
              <dd>
                <Duration minutes={weekSummary.classification.normalMinutes} zeroAs="0:00" />
              </dd>
            </div>
            <div>
              <dt className="meta">Mehrarbeit · 25 %</dt>
              <dd>
                <Duration minutes={weekSummary.classification.mehrarbeitMinutes} zeroAs="0:00" />
              </dd>
            </div>
            <div>
              <dt className="meta">Überstunden · 50 %</dt>
              <dd>
                <Duration minutes={weekSummary.classification.ueberstundenMinutes} zeroAs="0:00" />
              </dd>
            </div>
            <div>
              <dt className="meta">Zuschlag als Zeit</dt>
              <dd>
                <Duration
                  minutes={
                    weekSummary.classification.mehrarbeitSurchargeMinutes +
                    weekSummary.classification.ueberstundenSurchargeMinutes
                  }
                  zeroAs="0:00"
                />
              </dd>
            </div>
          </dl>
          {weekSummary.classification.mehrarbeitSurchargeWaived &&
            weekSummary.classification.mehrarbeitMinutes > 0 && (
              <p className="muted figures__note">
                Bei Gleitzeit fällt innerhalb der Gleitzeitperiode kein Mehrarbeitszuschlag an
                (§ 19d Abs 3b Z 1 AZG) — die Mehrleistung wird durch Gleiten abgebaut.
              </p>
            )}
        </section>
      )}

      <section className="section">
        <div className="section__head">
          <h2>Prüfung</h2>
        </div>
        <Findings
          findings={[
            ...days.flatMap((day) => day.evaluation?.findings ?? []),
            ...(weekSummary?.evaluation?.findings ?? []),
          ]}
          showDate
          emptyText="Keine Beanstandungen in dieser Woche."
        />
      </section>
    </main>
  );
}
