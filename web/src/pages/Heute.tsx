import {
  formatClock,
  formatDateLong,
  formatDuration,
  localDateOf,
  localMinutesOfDay,
  minutesBetween,
} from '@zeiterfassung/legal';
import { useEffect, useRef, useState } from 'react';
import { Ansicht } from '../components/Ansicht';
import { Findings } from '../components/Findings';
import { Icon } from '../components/Icon';
import { Duration } from '../components/Num';
import { Tageslinie } from '../components/Tageslinie';
import { useToast } from '../components/Toast';
import { useOpenEntry, useStamp, useStopStamp, useTimesheet } from '../lib/queries';
import { useI18n, type Locale } from '../lib/i18n';
import { useSession } from '../lib/session';

export function Heute() {
  const { session, profile } = useSession();
  const employeeId = session?.user.id;
  const { t, locale, intlLocale } = useI18n();

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

  const toast = useToast();
  const clockNow = () => formatClock(localMinutesOfDay(new Date()));

  function startSegment(kind: 'work' | 'break') {
    if (!employeeId) return;
    const wasBreak = running?.kind === 'break';
    stamp.mutate(
      { employeeId, kind },
      {
        onSuccess: () =>
          kind === 'break'
            ? toast.show('info', t(`Pause ab ${clockNow()}`, `Break from ${clockNow()}`), t('Gönn dir was — die Uhr läuft mit.', 'Enjoy it — the clock keeps running.'))
            : wasBreak
              ? toast.show('success', t(`Weiter um ${clockNow()}`, `Back at ${clockNow()}`), t('Pause beendet.', 'Break ended.'))
              : toast.show('success', t(`Eingestempelt um ${clockNow()}`, `Clocked in at ${clockNow()}`), t('Einen guten Arbeitstag!', 'Have a good day at work!')),
        onError: (error) => toast.show('error', t('Stempeln fehlgeschlagen', 'Clocking failed'), error.message),
      },
    );
  }

  function stopSegment(id: string) {
    stop.mutate(id, {
      onSuccess: () =>
        toast.show('success', t(`Ausgestempelt um ${clockNow()}`, `Clocked out at ${clockNow()}`), t('Schönen Feierabend!', 'Enjoy your evening!')),
      onError: (error) => toast.show('error', t('Ausstempeln fehlgeschlagen', 'Clocking out failed'), error.message),
    });
  }

  // Einmal am Tag, wenn das Tagessoll während der laufenden Arbeit erreicht wird.
  const announced = useRef<string | null>(null);
  useEffect(() => {
    if (!running || target <= 0 || remaining > 0 || announced.current === today) return;
    if (worked - target > 1) {
      // Schon vor dem Laden erreicht — keine Meldung beim Öffnen der Seite.
      announced.current = today;
      return;
    }
    announced.current = today;
    toast.show('success', t('Tagessoll erreicht', 'Daily target reached'), t(`${formatDuration(target)} h sind geschafft.`, `${formatDuration(target)} h done.`));
  }, [running, target, remaining, worked, today, toast, t]);

  return (
    <main className="page">
      <Ansicht />
      <div className="page__head">
        <div>
          <p className="greeting">
            <Icon name={greetingIcon(now)} size={16} />
            {greeting(now, locale)}
            {firstName && `, ${firstName}`}
          </p>
          <h1>{formatDateLong(today, locale)}</h1>
          <p className="page__subtitle">
            {day?.contract
              ? `${day.contract.typeLabel} · ${day.contract.weeklyHours.toLocaleString(intlLocale)} ${t('h/Woche', 'h/week')}`
              : t('Kein gültiger Vertrag hinterlegt', 'No valid contract on file')}
          </p>
        </div>
        <div className="clock-chip" aria-label={t('Aktuelle Uhrzeit', 'Current time')}>
          <Icon name="clock" size={16} />
          <span>{formatClock(localMinutesOfDay(now))}</span>
        </div>
      </div>

      {day?.holidays.map((holiday) => (
        <div key={holiday.name} className={`finding ${holiday.statutory ? '' : 'finding--hinweis'}`}>
          <span className="finding__reference">{holiday.statutory ? '§ 7 ARG' : t('Hinweis', 'Note')}</span>
          <p className="finding__message">
            <strong>{t(holiday.name, holiday.nameEn)}</strong>
            {holiday.note
              ? ` — ${t(holiday.note, holiday.noteEn ?? holiday.note)}`
              : holiday.statutory
                ? t(' — gesetzlicher Feiertag.', ' — public holiday.')
                : ''}
          </p>
        </div>
      ))}

      <section className={`stamp stamp--${state}`}>
        <div className="stamp__state" aria-live="polite">
          <span key={state} className={`stamp__status stamp__status--${state}`}>
            {state === 'running'
              ? t('Arbeitszeit läuft', 'Working')
              : state === 'break'
                ? t('Pause läuft', 'On break')
                : state === 'done'
                  ? t('Beendet', 'Finished')
                  : t('Noch nicht begonnen', 'Not started yet')}
          </span>
          <p className="stamp__clock">
            {running ? formatDuration(runningMinutes) : formatDuration(worked)}
          </p>
          <p className="stamp__since">
            {running && runningSince
              ? t(`seit ${formatClock(localMinutesOfDay(runningSince))} Uhr`, `since ${formatClock(localMinutesOfDay(runningSince))}`)
              : worked > 0
                ? t('heute erfasst', 'recorded today')
                : t('Ein Klick auf „Kommen“ startet die Aufzeichnung.', 'Click “Clock in” to start recording.')}
          </p>
        </div>

        <div className="stamp__actions">
          {!running && (
            <button
              className="button button--primary button--large"
              type="button"
              disabled={busy || !employeeId}
              onClick={() => startSegment('work')}
            >
              <Icon name="play" />
              {t('Kommen', 'Clock in')}
            </button>
          )}

          {running?.kind === 'work' && (
            <>
              <button
                className="button button--large"
                type="button"
                disabled={busy}
                onClick={() => startSegment('break')}
              >
                <Icon name="coffee" />
                {t('Pause beginnen', 'Start break')}
              </button>
              <button
                className="button button--primary button--large"
                type="button"
                disabled={busy}
                onClick={() => stopSegment(running.id)}
              >
                <Icon name="stop" />
                {t('Gehen', 'Clock out')}
              </button>
            </>
          )}

          {running?.kind === 'break' && (
            <>
              <button
                className="button button--primary button--large"
                type="button"
                disabled={busy}
                onClick={() => startSegment('work')}
              >
                <Icon name="play" />
                {t('Pause beenden', 'End break')}
              </button>
              <button
                className="button button--large"
                type="button"
                disabled={busy}
                onClick={() => stopSegment(running.id)}
              >
                <Icon name="stop" />
                {t('Feierabend', 'Finish for today')}
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
                <strong>{formatDuration(worked)}</strong> {t('von', 'of')} {formatDuration(target)} h
              </span>
              <span className="muted">
                {remaining > 0
                  ? t(`noch ${formatDuration(remaining)} h`, `${formatDuration(remaining)} h to go`)
                  : t('Tagessoll erreicht', 'Daily target reached')}
              </span>
            </div>
            <div
              className={`progress ${remaining <= 0 ? 'progress--done' : ''}`}
              role="progressbar"
              aria-label={t('Fortschritt zum Tagessoll', 'Progress towards daily target')}
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
            <dt className="meta">{t('Gearbeitet', 'Worked')}</dt>
            <dd>
              <Duration minutes={worked} zeroAs="0:00" animate />
            </dd>
          </div>
          <div>
            <dt className="meta">{t('Pause', 'Break')}</dt>
            <dd>
              <Duration minutes={day?.work.breakMinutes ?? 0} zeroAs="0:00" animate />
            </dd>
          </div>
          <div>
            <dt className="meta">{t('Tagessoll', 'Daily target')}</dt>
            <dd>
              <Duration minutes={target} zeroAs="0:00" animate />
            </dd>
          </div>
          <div>
            <dt className="meta">{remaining > 0 ? t('Noch offen', 'Remaining') : t('Saldo heute', 'Balance today')}</dt>
            <dd>
              {remaining > 0 ? (
                <Duration minutes={remaining} animate />
              ) : (
                <Duration minutes={day?.account?.balanceMinutes ?? 0} sign animate />
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section className="section">
        <div className="section__head">
          <h2>{t('Erfassung', 'Entries')}</h2>
        </div>
        {day && day.work.intervals.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('Von', 'From')}</th>
                  <th>{t('Bis', 'To')}</th>
                  <th>{t('Art', 'Type')}</th>
                  <th className="num">{t('Dauer', 'Duration')}</th>
                  <th className="grow">{t('Quelle', 'Source')}</th>
                </tr>
              </thead>
              <tbody>
                {day.work.intervals.map((interval, index) => (
                  <tr key={index}>
                    <td className="num">{formatClock(localMinutesOfDay(interval.start))}</td>
                    <td className="num">
                      {running && index === day.work.intervals.length - 1 ? (
                        <span className="muted">{t('läuft', 'running')}</span>
                      ) : (
                        formatClock(localMinutesOfDay(interval.end))
                      )}
                    </td>
                    <td>
                      <span className={`kind-dot kind-dot--${interval.kind}`} />
                      {t(SEGMENT_LABEL[interval.kind]!, SEGMENT_LABEL_EN[interval.kind]!)}
                    </td>
                    <td>
                      <Duration minutes={minutesBetween(interval.start, interval.end)} />
                    </td>
                    <td className="muted">
                      {interval.source === 'stamped'
                        ? t('Gestempelt', 'Clocked')
                        : t('Nachgetragen', 'Added manually')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">
            <Icon name="clock" size={22} />
            {t('Für heute ist noch nichts erfasst.', 'Nothing recorded for today yet.')}
          </p>
        )}
      </section>

      <section className="section">
        <div className="section__head">
          <h2>{t('Prüfung', 'Compliance check')}</h2>
          <span className="tag tag--muted">
            {day?.evaluation?.regime === 'kjbg'
              ? t('KJBG — unter 18', 'KJBG — under 18')
              : day?.evaluation?.regime === 'ausgenommen'
                ? t('Vom AZG ausgenommen', 'Exempt from AZG')
                : 'AZG'}
          </span>
        </div>
        <Findings
          findings={day?.evaluation?.findings ?? []}
          emptyText={
            day?.evaluation?.regime === 'ausgenommen'
              ? t(
                  'Für diesen Vertrag gelten die Arbeitszeitgrenzen des AZG nicht (§ 1 Abs 2 AZG). Die Zeiten werden trotzdem aufgezeichnet.',
                  'The AZG working-time limits do not apply to this contract (§ 1 Abs 2 AZG). Hours are still recorded.',
                )
              : t('Alles im Rahmen — alle Arbeitszeitregeln eingehalten.', 'All within limits — all working-time rules met.')
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

const SEGMENT_LABEL_EN: Record<string, string> = {
  work: 'Working time',
  break: 'Rest break',
  travel: 'Travel time',
  oncall: 'On call',
};

function greeting(now: Date, locale: Locale): string {
  const hour = now.getHours();
  const en = locale === 'en';
  if (hour < 5) return en ? 'Good night' : 'Gute Nacht';
  if (hour < 11) return en ? 'Good morning' : 'Guten Morgen';
  if (hour < 18) return en ? 'Good afternoon' : 'Guten Tag';
  return en ? 'Good evening' : 'Guten Abend';
}

function greetingIcon(now: Date): 'sun' | 'moon' {
  const hour = now.getHours();
  return hour >= 6 && hour < 19 ? 'sun' : 'moon';
}
