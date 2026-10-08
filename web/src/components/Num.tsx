import { formatDuration, type Minutes } from '@zeiterfassung/legal';
import { useCountUp } from '../lib/motion';

/**
 * Eine Dauer. Salden tragen ihr Vorzeichen und färben sich, ohne dass ein
 * Symbol danebensteht.
 *
 * Mit `animate` zählt der Wert beim Erscheinen und bei Änderungen hoch — für
 * Kennzahlen-Kacheln, nicht für Tabellenspalten, wo Bewegung nur stört.
 */
export function Duration({
  minutes,
  sign = false,
  muted = false,
  zeroAs = '—',
  animate = false,
}: {
  minutes: Minutes | null | undefined;
  sign?: boolean;
  muted?: boolean;
  zeroAs?: string;
  animate?: boolean;
}) {
  if (minutes === null || minutes === undefined) {
    return <span className="num num--muted">—</span>;
  }
  if (animate) {
    return <AnimatedDuration minutes={minutes} sign={sign} muted={muted} zeroAs={zeroAs} />;
  }
  return <Formatted minutes={minutes} shown={minutes} sign={sign} muted={muted} zeroAs={zeroAs} />;
}

function AnimatedDuration({
  minutes,
  sign,
  muted,
  zeroAs,
}: {
  minutes: Minutes;
  sign: boolean;
  muted: boolean;
  zeroAs: string;
}) {
  const shown = Math.round(useCountUp(minutes));
  return <Formatted minutes={minutes} shown={shown} sign={sign} muted={muted} zeroAs={zeroAs} />;
}

function Formatted({
  minutes,
  shown,
  sign,
  muted,
  zeroAs,
}: {
  minutes: Minutes;
  shown: Minutes;
  sign: boolean;
  muted: boolean;
  zeroAs: string;
}) {
  if (minutes === 0 && !sign) {
    return <span className="num num--muted">{zeroAs}</span>;
  }
  // Die Farbe richtet sich nach dem Endwert, nicht nach dem Zwischenstand —
  // sonst flackerte ein negativer Saldo beim Hochzählen kurz grün.
  const tone = sign ? (minutes > 0 ? 'num--positive' : minutes < 0 ? 'num--negative' : '') : '';
  return (
    <span className={`num ${muted ? 'num--muted' : ''} ${tone}`.trim()}>
      {formatDuration(shown, { sign })}
    </span>
  );
}

/** Eine Anzahl, etwa Urlaubstage, die beim Erscheinen hochzählt. */
export function Counter({ value, decimals = 2 }: { value: number; decimals?: number }) {
  const shown = useCountUp(value);
  const factor = 10 ** decimals;
  return (
    <>
      {(Math.round(shown * factor) / factor).toLocaleString('de-AT', {
        maximumFractionDigits: decimals,
      })}
    </>
  );
}
