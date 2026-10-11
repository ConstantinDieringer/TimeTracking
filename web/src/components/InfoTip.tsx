import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../lib/i18n';
import { Icon } from './Icon';

/**
 * Ein kleines (i) mit Erläuterung — für Gesetzesbezüge und Hintergrund, die
 * man nachlesen können soll, die aber nicht jede Seite füllen müssen.
 *
 * Mit der Maus erscheint die Erläuterung beim Darüberfahren. Auf dem Telefon,
 * wo es kein Darüberfahren gibt, öffnet ein Tippen sie und ein zweites (oder
 * ein Tippen daneben) schließt sie; mit der Tastatur genauso über Enter,
 * Escape schließt.
 *
 * Die Blase hängt am Ende von <body> und ist fest positioniert. So schneidet
 * sie keine Tabelle mit seitlichem Scrollen ab, und sie bleibt immer
 * vollständig im Bild.
 */
export function InfoTip({ children, label }: { children: ReactNode; label?: string }) {
  const { t } = useI18n();
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const visible = pinned || hovered;

  // Kurz warten, bevor die Blase beim Verlassen zuklappt: sonst schlösse sie
  // sich in der Lücke zwischen (i) und Blase, und man käme nie hinein.
  const closeTimer = useRef<number | undefined>(undefined);
  const enter = (event: { pointerType: string }) => {
    if (event.pointerType !== 'mouse') return;
    window.clearTimeout(closeTimer.current);
    setHovered(true);
  };
  const leave = (event: { pointerType: string }) => {
    if (event.pointerType !== 'mouse') return;
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setHovered(false), 150);
  };
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const place = useCallback(() => {
    const button = anchor.current?.getBoundingClientRect();
    const box = bubble.current?.getBoundingClientRect();
    if (!button || !box) return;
    const gap = 6;
    const margin = 16;
    const left = Math.min(
      Math.max(button.left + button.width / 2 - box.width / 2, margin),
      window.innerWidth - margin - box.width,
    );
    const below = button.bottom + gap;
    const top =
      below + box.height > window.innerHeight - margin && button.top - gap - box.height > margin
        ? button.top - gap - box.height
        : below;
    setPosition({ top, left: Math.max(left, margin) });
  }, []);

  useLayoutEffect(() => {
    if (!visible) {
      setPosition(null);
      return;
    }
    place();
  }, [visible, place]);

  useEffect(() => {
    if (!visible) return;
    const onScroll = () => place();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [visible, place]);

  useEffect(() => {
    if (!pinned) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!anchor.current?.contains(target) && !bubble.current?.contains(target)) setPinned(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPinned(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [pinned]);

  return (
    <span
      className="infotip"
      ref={anchor}
      // Nur echte Mäuse: auf dem Touchscreen meldet ein Tippen auch „enter“,
      // und die Erläuterung ließe sich dann nicht mehr schließen.
      onPointerEnter={enter}
      onPointerLeave={leave}
    >
      <button
        type="button"
        className="infotip__button"
        aria-label={label ?? t('Erläuterung', 'Explanation')}
        aria-expanded={visible}
        aria-describedby={visible ? id : undefined}
        onClick={(event) => {
          // In einem <label> soll der Klick nicht das Eingabefeld auslösen.
          event.preventDefault();
          event.stopPropagation();
          setPinned((value) => !value);
        }}
      >
        <Icon name="info" size={16} />
      </button>
      {visible &&
        createPortal(
          <span
            role="tooltip"
            id={id}
            ref={bubble}
            className="infotip__bubble"
            style={
              position
                ? { top: position.top, left: position.left }
                : { top: 0, left: 0, visibility: 'hidden' }
            }
            onPointerEnter={enter}
            onPointerLeave={leave}
          >
            {children}
          </span>,
          document.body,
        )}
    </span>
  );
}
