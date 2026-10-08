import {
  addMonths,
  describeAbsence,
  endOfMonth,
  formatDuration,
  isWeekend,
  localDateOf,
  monthName,
  parseIsoDate,
  startOfIsoWeek,
  startOfMonth,
  weekdayOf,
  type IsoDate,
} from '@zeiterfassung/legal';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { DayEditor } from '../components/DayEditor';
import { Export } from '../components/Export';
import { Findings } from '../components/Findings';
import { Duration } from '../components/Num';
import { contractOn } from '../lib/mapping';
import { useContracts, useEmployee, useTimesheet } from '../lib/queries';
import { useSession } from '../lib/session';
import { collectFindings, sumBalance } from '../lib/timesheet';

const WEEKDAY_HEADS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export function Monat() {
  const { session } = useSession();
  const employeeId = session?.user.id;
  const navigate = useNavigate();
  const params = useParams();

  const today = localDateOf(new Date());
  const anchor: IsoDate = params.month ? `${params.month}-01` : startOfMonth(today);
  const from = startOfMonth(anchor);
  const to = endOfMonth(anchor);
  const { year, month } = parseIsoDate(from);

  const [editing, setEditing] = useState<IsoDate | null>(null);

  // Das Raster beginnt beim Montag der Woche, in die der Monatserste fällt,
  // und läuft in ganzen Wochen weiter — sonst rutschen die Spalten.
  const gridStart = startOfIsoWeek(from);
  const { timesheet, isLoading } = useTimesheet({ employeeId, from: gridStart, to });
  const employee = useEmployee(employeeId);
  const contracts = useContracts(employeeId);

  const monthDays = timesheet?.days.filter((day) => day.date >= from && day.date <= to) ?? [];
  const gridDays = timesheet?.days.filter((day) => day.date >= gridStart && day.date <= to) ?? [];
  const editingDay = editing ? (timesheet?.byDate.get(editing) ?? null) : null;

  const worked = monthDays.reduce((sum, day) => sum + day.work.workMinutes, 0);
  // Das volle Monatssoll ist die Planungsgröße, das Soll bis heute die
  // Vergleichsgröße. Beide zu vermengen erzeugt genau den Eindruck, man liege
  // Mitte des Monats um ein halbes Monatssoll zurück.
  const targetMonth = monthDays.reduce((sum, day) => sum + (day.account?.targetMinutes ?? 0), 0);
  const targetToDate = monthDays
    .filter((day) => !day.account?.future)
    .reduce((sum, day) => sum + (day.account?.targetMinutes ?? 0), 0);
  const balance = sumBalance(monthDays);
  const holidayWork = monthDays.reduce((sum, day) => sum + (day.account?.holidayWorkMinutes ?? 0), 0);

  const findings = timesheet
    ? collectFindings({ ...timesheet, days: monthDays })
    : [];

  return (
    <main className="page">
      <div className="page__head">
        <div>
          <h1>
            {monthName(month)} {year}
          </h1>
          <p className="page__subtitle">
            {formatDuration(worked)} von {formatDuration(targetToDate)} h bis heute · Saldo{' '}
            {formatDuration(balance, { sign: true })} h · Monatssoll{' '}
            {formatDuration(targetMonth)} h
          </p>
        </div>
        <div className="row">
          <button
            className="button"
            type="button"
            onClick={() => navigate(`/monat/${addMonths(from, -1).slice(0, 7)}`)}
          >
            Voriger
          </button>
          <button className="button" type="button" onClick={() => navigate('/monat')}>
            Aktueller
          </button>
          <button
            className="button"
            type="button"
            onClick={() => navigate(`/monat/${addMonths(from, 1).slice(0, 7)}`)}
          >
            Nächster
          </button>
        </div>
      </div>

      {isLoading && <p className="muted">Wird geladen …</p>}

      <div className="calendar" role="grid" aria-label={`${monthName(month)} ${year}`}>
        {WEEKDAY_HEADS.map((head) => (
          <div key={head} className="calendar__head" role="columnheader">
            {head}
          </div>
        ))}

        {/* Leere Zellen vor dem Monatsersten, damit die Spalten stimmen. */}
        {gridDays
          .filter((day) => day.date < from)
          .map((day) => (
            <div key={day.date} className="calendar__cell calendar__cell--outside" role="gridcell">
              <span className="calendar__day">{parseIsoDate(day.date).day}</span>
            </div>
          ))}

        {monthDays.map((day) => {
          const holiday = day.holidays.find((entry) => entry.statutory);
          const observance = day.holidays.find((entry) => !entry.statutory);
          const severity = day.evaluation?.worstSeverity ?? 'ok';
          const classes = [
            'calendar__cell',
            isWeekend(day.date) ? 'calendar__cell--weekend' : '',
            holiday ? 'calendar__cell--holiday' : '',
            day.date === today ? 'calendar__cell--today' : '',
            day.account?.future ? 'calendar__cell--future' : '',
            severity !== 'ok' ? `calendar__cell--${severity}` : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button
              key={day.date}
              type="button"
              className={classes}
              role="gridcell"
              onClick={() => setEditing(editing === day.date ? null : day.date)}
            >
              <span className="calendar__day">{parseIsoDate(day.date).day}</span>

              {day.work.workMinutes > 0 && (
                <span className="calendar__hours">{formatDuration(day.work.workMinutes)}</span>
              )}

              {day.absence && (
                <span className="calendar__label">{describeAbsence(day.absence)}</span>
              )}
              {holiday && !day.absence && (
                <span className="calendar__label">{holiday.name}</span>
              )}
              {observance && !holiday && !day.absence && (
                <span className="calendar__label calendar__label--muted" title={observance.note}>
                  {observance.name}
                </span>
              )}

              {day.account && day.account.balanceMinutes !== 0 && (
                <span
                  className={`calendar__balance ${
                    day.account.balanceMinutes > 0 ? 'is-positive' : 'is-negative'
                  }`}
                >
                  {formatDuration(day.account.balanceMinutes, { sign: true })}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="calendar__legend meta">
        Eine markierte Ecke steht für einen Befund: ocker für einen Hinweis, ziegelrot für einen
        Verstoß. Ein Klick öffnet den Tag. Weekday-Spalten beginnen am Montag nach ISO 8601.
      </p>

      {editingDay && employeeId && (
        <DayEditor day={editingDay} employeeId={employeeId} onClose={() => setEditing(null)} />
      )}

      <section className="section">
        <div className="section__head">
          <h2>Monat</h2>
        </div>
        <dl className="figures">
          <div>
            <dt className="meta">Gearbeitet</dt>
            <dd>
              <Duration minutes={worked} zeroAs="0:00" />
            </dd>
          </div>
          <div>
            <dt className="meta">Soll bis heute</dt>
            <dd>
              <Duration minutes={targetToDate} muted zeroAs="0:00" />
            </dd>
          </div>
          <div>
            <dt className="meta">Monatssoll</dt>
            <dd>
              <Duration minutes={targetMonth} muted zeroAs="0:00" />
            </dd>
          </div>
          <div>
            <dt className="meta">Saldo</dt>
            <dd>
              <Duration minutes={balance} sign />
            </dd>
          </div>
          <div>
            <dt className="meta">Feiertagsarbeit</dt>
            <dd>
              <Duration minutes={holidayWork} zeroAs="0:00" />
            </dd>
          </div>
        </dl>
        {holidayWork > 0 && (
          <p className="muted figures__note">
            Arbeit an einem Feiertag wird zusätzlich zum Feiertagsentgelt vergütet (§ 9 Abs 5 ARG)
            und begründet Anspruch auf Ersatzruhe nach § 6 ARG.
          </p>
        )}
      </section>

      <section className="section">
        <div className="section__head">
          <h2>Prüfung</h2>
          <span className="meta">{findings.length} Befunde</span>
        </div>
        <Findings findings={findings} showDate emptyText="Keine Beanstandungen in diesem Monat." />
      </section>

      <section className="section">
        <div className="section__head">
          <h2>Meine Aufzeichnungen</h2>
          <span className="meta">§ 26 Abs 8 AZG</span>
        </div>
        {timesheet && employee.data ? (
          <Export
            employee={employee.data}
            personnelNumber={employee.data.personnelNumber}
            contract={contractOn(contracts.data ?? [], from)}
            month={from.slice(0, 7)}
            days={monthDays}
            timesheet={timesheet}
          />
        ) : (
          <p className="muted">Wird geladen …</p>
        )}
      </section>
    </main>
  );
}
