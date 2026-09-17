import { formatDuration, type Minutes } from '@zeiterfassung/legal';

/**
 * Eine Zahl in einer Tabellenspalte.
 *
 * Immer rechtsbündig und im Monospace-Schnitt — Stunden vergleicht man
 * senkrecht. Salden tragen ihr Vorzeichen und färben sich, ohne dass ein
 * Symbol danebensteht.
 */
export function Duration({
  minutes,
  sign = false,
  muted = false,
  zeroAs = '—',
}: {
  minutes: Minutes | null | undefined;
  sign?: boolean;
  muted?: boolean;
  zeroAs?: string;
}) {
  if (minutes === null || minutes === undefined) {
    return <span className="num num--muted">—</span>;
  }
  if (minutes === 0 && !sign) {
    return <span className="num num--muted">{zeroAs}</span>;
  }

  const tone = sign ? (minutes > 0 ? 'num--positive' : minutes < 0 ? 'num--negative' : '') : '';
  return (
    <span className={`num ${muted ? 'num--muted' : ''} ${tone}`.trim()}>
      {formatDuration(minutes, { sign })}
    </span>
  );
}
