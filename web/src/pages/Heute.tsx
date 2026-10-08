import {
  formatClock,
  formatDateLong,
  formatDuration,
  localDateOf,
  localMinutesOfDay,
  minutesBetween,
} from '@zeiterfassung/legal';
import { useEffect, useState } from 'react';
import { Ansicht } from '../components/Ansicht';
import { Findings } from '../components/Findings';
import { Icon } from '../components/Icon';
import { Duration } from '../components/Num';
import { Tageslinie } from '../components/Tageslinie';
import { useOpenEntry, useStamp, useStopStamp, useTimesheet } from '../lib/queries';
import { useSession } from '../lib/session';

export function Heute() {
  const { session, profile } = useSession();
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
  const progress = target > 0 ? Math.min(worked / target, 1) : 0;

  const state = running ? (running.kind === 'break' ? 'break' : 'running') : worked > 0 ? 'done' : 'idle';
  const firstName = profile?.display_name.split(/\s+/)[0] ?? '';

  return (
    <main className="page">
      <Ansicht />
      <div className="page__head">
        <div>
          <p className="greeting">
            <Icon name={greetingIcon(now)} size={16} />
            {greeting(now)}
            {firstName && `, ${firstName}`}
          </p>
          <h1>{formatDateLong(today)}</h1>
          <p className="page__subtitle">
            {day?.contract
              ? `${day.contract.typeLabel} · ${day.contract.weeklyHours.toLocaleString('de-AT')} h/Woche`
              : 'Kein gültiger Vertrag hinterlegt'}
          </p>
        </div>
        <div className="clock-chip" aria-label="Aktuelle Uhrzeit">
          <Icon name="clock" size={16} />
          <span>{formatClock(localMinutesOfDay(now))}</span>
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

      <section className={`stamp stamp--${state}`}>
        <div className="stamp__state" aria-live="polite">
          <span className={`stamp__status stamp__status--${state}`}>
            {state === 'running'
              ? 'Arbeitszeit läuft'
              : state === 'break'
                ? 'Pause läuft'
                : state === 'done'
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
                : 'Ein Klick auf „Kommen“ startet die Aufzeichnung.'}
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
              <Icon name="play" />
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
                <Icon name="coffee" />
                Pause beginnen
              </button>
              <button
                className="button button--primary button--large"
                type="button"
                disabled={busy}
                onClick={() => stop.mutate(running.id)}
              >
                <Icon name="stop" />
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
                <Icon name="play" />
                Pause beenden
              </button>
              <button
                className="button button--large"
                type="button"
                disabled={busy}
                onClick={() => stop.mutate(running.id)}
              >
                <Icon name="stop" />
                Feierabend
              </button>
            </>
          )}
        </div>

        {/* Fortschritt zum Tagessoll — die eine Frage, die man sich beim Blick
            auf die Seite stellt: wie weit bin ich heute? */}
        {target > 0 && (
          <div className="progress-block">
            <div className="progress-block__labels">
              <span>
                <strong>{formatDuration(worked)}</strong> von {formatDuration(target)} h
              </span>
              <span className="muted">
                {remaining > 0 ? `noch ${formatDuration(remaining)} h` : 'Tagessoll erreicht'}
              </span>
            </div>
            <div
              className={`progress ${remaining <= 0 ? 'progress--done' : ''}`}
              role="progressbar"
              aria-label="Fortschritt zum Tagessoll"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
            >
              <div className="progress__bar" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
        )}

        {day && day.work.intervals.length > 0 && (
          <Tageslinie intervals={day.work.intervals} now={now} running={Boolean(running)} />
        )}

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
                    <td>
                      <span className={`kind-dot kind-dot--${interval.kind}`} />
                      {SEGMENT_LABEL[interval.kind]}
                    </td>
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
          <p className="empty">
            <Icon name="clock" size={22} />
            Für heute ist noch nichts erfasst.
          </p>
        )}
      </section>

      <section className="section">
        <div className="section__head">
          <h2>Prüfung</h2>
          <span className="tag tag--muted">
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
              : 'Alles im Rahmen — keine Beanstandungen.'
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

function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 5) return 'Gute Nacht';
  if (hour < 11) return 'Guten Morgen';
  if (hour < 18) return 'Guten Tag';
  return 'Guten Abend';
}

function greetingIcon(now: Date): 'sun' | 'moon' {
  const hour = now.getHours();
  return hour >= 6 && hour < 19 ? 'sun' : 'moon';
}
