/**
 * Bewegung, aber nur wo sie etwas mitteilt — und nie gegen die Einstellung
 * „Bewegung reduzieren“ des Betriebssystems.
 */

import { useEffect, useRef, useState } from 'react';

const query = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.(query).matches === true;
}

/**
 * Zählt eine Zahl vom vorigen Wert zum neuen hoch. Beim ersten Anzeigen von
 * null an — so sieht man, dass ein Wert gerade berechnet wurde. Bei
 * reduzierter Bewegung steht sofort der Endwert da.
 */
export function useCountUp(target: number, duration = 650): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  const from = useRef(prefersReducedMotion() ? target : 0);

  useEffect(() => {
    if (prefersReducedMotion() || from.current === target) {
      from.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      // Ease-out: schnell los, sanft ankommen.
      const eased = 1 - (1 - progress) ** 3;
      setValue(origin + (target - origin) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else from.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      from.current = target;
    };
  }, [target, duration]);

  return value;
}
