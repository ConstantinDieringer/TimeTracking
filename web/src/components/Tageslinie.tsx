import { formatClock, localMinutesOfDay } from '@zeiterfassung/legal';

interface Interval {
  start: Date;
  end: Date;
  kind: string;
}

/**
 * Der Tag als Zeitstrahl: Arbeit grün, Pausen bernsteinfarben, dazwischen die
 * Lücken. Auf einen Blick sieht man, wann begonnen wurde, wo die Pause lag und
 * ob der Tag zerstückelt war — was eine Tabelle erst beim Lesen verrät.
 *
 * Der Ausschnitt reicht mindestens von 7 bis 18 Uhr und wächst, wenn früher
 * begonnen oder länger gearbeitet wurde.
 */
export function Tageslinie({
  intervals,
  now,
  running,
}: {
  intervals: readonly Interval[];
  now: Date;
  running: boolean;
}) {
  const minutes = intervals.flatMap((interval) => [
    localMinutesOfDay(interval.start),
    localMinutesOfDay(interval.end),
  ]);
  const from = Math.min(7 * 60, Math.floor(Math.min(...minutes) / 60) * 60);
  const to = Math.max(18 * 60, Math.ceil(Math.max(...minutes, localMinutesOfDay(now)) / 60) * 60);
  const span = to - from;
  const at = (minute: number) => `${((minute - from) / span) * 100}%`;

  // Beschriftung alle drei Stunden, nur im Inneren des Strahls — an den
  // Rändern stießen die Zahlen sonst aneinander oder liefen hinaus.
  const step = 180;
  const ticks: number[] = [];
  for (let minute = Math.ceil(from / step) * step; minute < to; minute += step) {
    if (minute > from) ticks.push(minute);
  }

  const nowMinute = localMinutesOfDay(now);

  return (
    <div className="timeline">
      <div className="timeline__track" role="img" aria-label={describe(intervals)}>
        {ticks.map((minute) => (
          <span key={minute} className="timeline__gridline" style={{ left: at(minute) }} />
        ))}
        {intervals.map((interval, index) => {
          const start = localMinutesOfDay(interval.start);
          const end = localMinutesOfDay(interval.end);
          return (
            <span
              key={index}
              className={`timeline__segment timeline__segment--${interval.kind}`}
              style={{ left: at(start), width: `${(Math.max(end - start, 2) / span) * 100}%` }}
              title={`${formatClock(start)}–${formatClock(end)}`}
            />
          );
        })}
        {running && nowMinute >= from && nowMinute <= to && (
          <span className="timeline__now" style={{ left: at(nowMinute) }} />
        )}
      </div>
      <div className="timeline__ticks" aria-hidden="true">
        {ticks.map((minute) => (
          <span key={minute} style={{ left: at(minute) }}>
            {formatClock(minute)}
          </span>
        ))}
      </div>
      <div className="timeline__legend" aria-hidden="true">
        <span>
          <i className="kind-dot kind-dot--work" />
          Arbeit
        </span>
        <span>
          <i className="kind-dot kind-dot--break" />
          Pause
        </span>
      </div>
    </div>
  );
}

function describe(intervals: readonly Interval[]): string {
  return (
    'Tagesverlauf: ' +
    intervals
      .map(
        (interval) =>
          `${interval.kind === 'break' ? 'Pause' : 'Arbeit'} ${formatClock(
            localMinutesOfDay(interval.start),
          )} bis ${formatClock(localMinutesOfDay(interval.end))}`,
      )
      .join(', ')
  );
}
