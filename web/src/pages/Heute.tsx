import {
  formatClock,
  formatDateLong,
  formatDuration,
  localDateOf,
  localMinutesOfDay,
  minutesBetween,
} from '@zeiterfassung/legal';
import { useEffect, useState } from 'react';
import { Findings } from '../components/Findings';
import { Duration } from '../components/Num';
import { useOpenEntry, useStamp, useStopStamp, useTimesheet } from '../lib/queries';
import { useSession } from '../lib/session';

export function Heute() {
  const { session } = useSession();
  const employeeId = session?.user.id;

  // Sekundentakt, solange gestempelt wird — sonst stünde die laufende Dauer
  // still und man wüsste nicht, ob die Uhr überhaupt läuft.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const today = localDateOf(now);
  const { timesheet } = useTimesheet({ employeeId, from: today, to: today, now });
  const openEntry = useOpenEntry(employeeId);
  const stamp = useStamp();
  const stop = useStopStamp();

  const day = timesheet?.byDate.get(today);
  const running = openEntry.data;
  const runningSince = running ? new Date(running.started_at) : null;
  const runningMinutes = runningSince ? minutesBetween(runningSince, now) : 0;

  const busy = stamp.isPending || stop.isPending;
  const target = day?.account?.targetMinutes ?? 0;
  const worked = day?.work.workMinutes ?? 0;
  const remaining = target - worked;

  return (
    <main className="page">
      <div className="page__head">
        <div>
          <h1>{formatDateLong(today)}</h1>
          <p className="page__subtitle">
            {day?.contract
              ? `${day.contract.typeLabel} · ${day.contract.weeklyHours.toLocaleString('de-AT')} h/Woche`
              : 'Kein gültiger Vertrag hinterlegt'}
          </p>
        </div>
        <div className="row">
          <span className="meta">Uhrzeit</span>
          <span className="num">{formatClock(localMinutesOfDay(now))}</span>
        </div>
      </div>

      {day?.holidays.map((holiday) => (
        <div key={holiday.name} className={`finding ${holiday.statutory ? '' : 'finding--hinweis'}`}>
          <span className="finding__reference">{holiday.statutory ? '§ 7 ARG' : 'Hinweis'}</span>
          <p className="finding__message">
            <strong>{holiday.name}</strong>
            {holiday.note ? ` — ${holiday.note}` : holiday.statutory ? ' — gesetzlicher Feiertag.' : ''}
          </p>
        </div>
      ))}

      <section className="stamp">
        <div className="stamp__state" aria-live="polite">
          <span
            className={`stamp__status ${
              running ? (running.kind === 'break' ? 'stamp__status--break' : 'stamp__status--running') : ''
            }`}
          >
            {running
              ? running.kind === 'break'
                ? 'Pause läuft'
                : 'Arbeitszeit läuft'
              : worked > 0
                ? 'Beendet'
                : 'Noch nicht begonnen'}
          </span>
          <p className="stamp__clock">
            {running ? formatDuration(runningMinutes) : formatDuration(worked)}
          </p>
          <p className="stamp__since">
            {running && runningSince
              ? `seit ${formatClock(localMinutesOfDay(runningSince))} Uhr`
              : worked > 0
                ? 'heute erfasst'
                : ' '}
          </p>
        </div>

        <div className="stamp__actions">
          {!running && (
            <button
              className="button button--primary button--large"
              type="button"
              disabled={busy || !employeeId}
              onClick={() => stamp.mutate({ employeeId: employeeId!, kind: 'work' })}
            >
              Kommen
            </button>
          )}

          {running?.kind === 'work' && (
            <>
              <button
                className="button button--large"
                type="button"
                disabled={busy}
                onClick={() => stamp.mutate({ employeeId: employeeId!, kind: 'break' })}
              >
                Pause beginnen
              </button>
              <button
                className="button button--primary button--large"
                type="button"
                disabled={busy}
                onClick={() => stop.mutate(running.id)}
              >
                Gehen
              </button>
            </>
          )}

          {running?.kind === 'break' && (
            <>
              <button
                className="button button--primary button--large"
                type="button"
                disabled={busy}
                onClick={() => stamp.mutate({ employeeId: employeeId!, kind: 'work' })}
              >
                Pause beenden
              </button>
              <button
                className="button button--large"
                type="button"
                disabled={busy}
                onClick={() => stop.mutate(running.id)}
              >
                Feierabend
              </button>
            </>
          )}
        </div>

        <dl className="stamp__figures">
          <div>
            <dt className="meta">Gearbeitet</dt>
            <dd>
              <Duration minutes={worked} zeroAs="0:00" />
            </dd>
          </div>
          <div>
            <dt className="meta">Pause</dt>
            <dd>
              <Duration minutes={day?.work.breakMinutes ?? 0} zeroAs="0:00" />
            </dd>
          </div>
          <div>
            <dt className="meta">Tagessoll</dt>
            <dd>
              <Duration minutes={target} zeroAs="0:00" />
            </dd>
          </div>
          <div>
            <dt className="meta">{remaining > 0 ? 'Noch offen' : 'Saldo heute'}</dt>
            <dd>
              {remaining > 0 ? (
                <Duration minutes={remaining} />
              ) : (
                <Duration minutes={day?.account?.balanceMinutes ?? 0} sign />
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section className="section">
        <div className="section__head">
          <h2>Erfassung</h2>
        </div>
        {day && day.work.intervals.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Von</th>
                  <th>Bis</th>
                  <th>Art</th>
                  <th className="num">Dauer</th>
                  <th className="grow">Quelle</th>
                </tr>
              </thead>
              <tbody>
                {day.work.intervals.map((interval, index) => (
                  <tr key={index}>
                    <td className="num">{formatClock(localMinutesOfDay(interval.start))}</td>
                    <td className="num">
                      {running && index === day.work.intervals.length - 1 ? (
                        <span className="muted">läuft</span>
                      ) : (
                        formatClock(localMinutesOfDay(interval.end))
                      )}
                    </td>
                    <td>{SEGMENT_LABEL[interval.kind]}</td>
                    <td>
                      <Duration minutes={minutesBetween(interval.start, interval.end)} />
                    </td>
                    <td className="muted">
                      {interval.source === 'stamped' ? 'Gestempelt' : 'Nachgetragen'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">Für heute ist noch nichts erfasst.</p>
        )}
      </section>

      <section className="section">
        <div className="section__head">
          <h2>Prüfung</h2>
          <span className="meta">
            {day?.evaluation?.regime === 'kjbg'
              ? 'KJBG — unter 18'
              : day?.evaluation?.regime === 'ausgenommen'
                ? 'Vom AZG ausgenommen'
                : 'AZG'}
          </span>
        </div>
        <Findings
          findings={day?.evaluation?.findings ?? []}
          emptyText={
            day?.evaluation?.regime === 'ausgenommen'
              ? 'Für diesen Vertrag gelten die Arbeitszeitgrenzen des AZG nicht (§ 1 Abs 2 AZG). Die Zeiten werden trotzdem aufgezeichnet.'
              : 'Keine Beanstandungen.'
          }
        />
      </section>
    </main>
  );
}

const SEGMENT_LABEL: Record<string, string> = {
  work: 'Arbeitszeit',
  break: 'Ruhepause',
  travel: 'Reisezeit',
  oncall: 'Rufbereitschaft',
};
