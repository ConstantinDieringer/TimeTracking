import {
  addMonths,
  describeAbsence,
  endOfMonth,
  formatDateLong,
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
import { Ansicht } from '../components/Ansicht';
import { DayEditor } from '../components/DayEditor';
import { Export } from '../components/Export';
import { InfoTip } from '../components/InfoTip';
import { Findings } from '../components/Findings';
import { Loading } from '../components/Loading';
import { Duration } from '../components/Num';
import { Pager } from '../components/Pager';
import { contractOn } from '../lib/mapping';
import {
  isLockedDay,
  useContracts,
  useEmployee,
  usePeriodLocks,
  useTimesheet,
} from '../lib/queries';
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
  // Der Tag, über dem Maus oder Tastaturfokus gerade steht — für die Vorschau.
  const [peek, setPeek] = useState<IsoDate | null>(null);

  // Das Raster beginnt beim Montag der Woche, in die der Monatserste fällt,
  // und läuft in ganzen Wochen weiter — sonst rutschen die Spalten.
  const gridStart = startOfIsoWeek(from);
  const { timesheet, isLoading } = useTimesheet({ employeeId, from: gridStart, to });
  const employee = useEmployee(employeeId);
  const contracts = useContracts(employeeId);
  const locks = usePeriodLocks();

  const monthDays = timesheet?.days.filter((day) => day.date >= from && day.date <= to) ?? [];
  const gridDays = timesheet?.days.filter((day) => day.date >= gridStart && day.date <= to) ?? [];
  const editingDay = editing ? (timesheet?.byDate.get(editing) ?? null) : null;
  const peekDay = peek ? (timesheet?.byDate.get(peek) ?? null) : null;

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
      <Ansicht />
      <div className="page__head">
        <div>
          <h1>
            {monthName(month)} {year}
          </h1>
          <p className="page__subtitle">
            {formatDuration(worked)} von {formatDuration(targetToDate)} h bis heute · Saldo{' '}
            {formatDuration(balance, { sign: true })} h · Monatssoll{' '}
            {formatDuration(targetMonth)} h
            {isLockedDay(locks.data, from) && (
              <>
                {' '}
                <span className="tag tag--muted">Abgeschlossen</span>
              </>
            )}
          </p>
        </div>
        <Pager
          unit="Monat"
          currentLabel="Dieser Monat"
          isCurrent={from === startOfMonth(today)}
          onPrevious={() =>
            navigate(`/monat/${addMonths(from, -1).slice(0, 7)}`, { viewTransition: true })
          }
          onCurrent={() => navigate('/monat', { viewTransition: true })}
          onNext={() =>
            navigate(`/monat/${addMonths(from, 1).slice(0, 7)}`, { viewTransition: true })
          }
        />
      </div>

      {isLoading && <Loading />}

      <div
        className="calendar"
        role="grid"
        aria-label={`${monthName(month)} ${year}`}
        onMouseLeave={() => setPeek(null)}
      >
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
            day.date === editing ? 'calendar__cell--selected' : '',
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
              aria-pressed={day.date === editing}
              onClick={() => setEditing(editing === day.date ? null : day.date)}
              onMouseEnter={() => setPeek(day.date)}
              onFocus={() => setPeek(day.date)}
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

              {/* Wie voll war der Tag? Ein dünner Balken am Zellenboden,
                  gefüllt bis zum Anteil am Tagessoll. */}
              {day.account && day.account.targetMinutes > 0 && day.work.workMinutes > 0 && (
                <span className="calendar__bar" aria-hidden="true">
                  <span
                    style={{
                      width: `${Math.min(day.work.workMinutes / day.account.targetMinutes, 1) * 100}%`,
                    }}
                  />
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

      {/* Vorschau des Tages unter Maus oder Fokus — die Details, ohne den Tag
          gleich öffnen zu müssen. Ohne Auswahl steht hier die Legende. */}
      {/* Ohne aria-live: jede Mausbewegung würde sonst vorgelesen. Wer mit
          Tastatur und Bildschirmleser unterwegs ist, hört die Zelle selbst. */}
      <div className="day-peek">
        {peekDay ? (
          <>
            <strong className="day-peek__date">{formatDateLong(peekDay.date)}</strong>
            <span>
              {peekDay.work.workMinutes > 0
                ? `${formatDuration(peekDay.work.workMinutes)} h gearbeitet`
                : peekDay.absence
                  ? describeAbsence(peekDay.absence)
                  : peekDay.holidays.find((entry) => entry.statutory)?.name ?? 'Nichts erfasst'}
            </span>
            {peekDay.work.breakMinutes > 0 && (
              <span className="muted">{formatDuration(peekDay.work.breakMinutes)} h Pause</span>
            )}
            {peekDay.account && peekDay.account.targetMinutes > 0 && (
              <span className="muted">Soll {formatDuration(peekDay.account.targetMinutes)} h</span>
            )}
            {peekDay.account && peekDay.account.balanceMinutes !== 0 && (
              <span
                className={
                  peekDay.account.balanceMinutes > 0 ? 'num--positive' : 'num--negative'
                }
              >
                Saldo {formatDuration(peekDay.account.balanceMinutes, { sign: true })} h
              </span>
            )}
            {(peekDay.evaluation?.findings ?? []).length > 0 && (
              <span className="day-peek__finding">
                {peekDay.evaluation!.findings[0]!.message}
              </span>
            )}
          </>
        ) : (
          <span className="muted">
            Fahren Sie über einen Tag für Details, ein Klick öffnet ihn zum Bearbeiten. Ein Punkt
            oben rechts steht für einen Befund: bernsteinfarben für einen Hinweis, rot für einen
            Verstoß.
          </span>
        )}
      </div>

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
              <Duration minutes={worked} zeroAs="0:00" animate />
            </dd>
          </div>
          <div>
            <dt className="meta">Soll bis heute</dt>
            <dd>
              <Duration minutes={targetToDate} muted zeroAs="0:00" animate />
            </dd>
          </div>
          <div>
            <dt className="meta">Monatssoll</dt>
            <dd>
              <Duration minutes={targetMonth} muted zeroAs="0:00" animate />
            </dd>
          </div>
          <div>
            <dt className="meta">Saldo</dt>
            <dd>
              <Duration minutes={balance} sign animate />
            </dd>
          </div>
          <div>
            <dt className="meta">
              Feiertagsarbeit
              <InfoTip>
                <span>
                  Arbeit an einem gesetzlichen Feiertag wird zusätzlich zum Feiertagsentgelt
                  vergütet und begründet Anspruch auf Ersatzruhe.
                </span>
                <span className="infotip__ref">§ 9 Abs 5 und § 6 ARG</span>
              </InfoTip>
            </dt>
            <dd>
              <Duration minutes={holidayWork} zeroAs="0:00" animate />
            </dd>
          </div>
        </dl>
      </section>

      <section className="section">
        <div className="section__head">
          <h2>Prüfung</h2>
          <span className="meta">{findings.length} Befunde</span>
        </div>
        <Findings findings={findings} showDate emptyText="In diesem Monat wurden alle Arbeitszeitregeln eingehalten." />
      </section>

      <section className="section">
        <div className="section__head">
          <h2>
            Meine Aufzeichnungen
            <InfoTip>
              <span>
                Sie haben das Recht, Ihre Arbeitszeitaufzeichnungen jederzeit kostenlos zu
                erhalten — hier als PDF oder CSV.
              </span>
              <span className="infotip__ref">§ 26 Abs 8 AZG</span>
            </InfoTip>
          </h2>
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
          <Loading />
        )}
      </section>
    </main>
  );
}
