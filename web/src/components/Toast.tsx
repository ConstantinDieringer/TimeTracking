import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Icon, type IconName } from './Icon';

/**
 * Kurze Rückmeldungen nach einer Handlung: „Eingestempelt um 08:12“,
 * „Gespeichert“. Erscheinen unten, verschwinden nach einigen Sekunden von
 * selbst und werden Bildschirmlesern vorgelesen.
 *
 * Fehler bleiben länger stehen als Erfolge — eine Fehlermeldung, die
 * verschwindet, bevor man sie gelesen hat, hilft niemandem.
 */

type Tone = 'success' | 'info' | 'error';

interface ToastItem {
  id: number;
  tone: Tone;
  title: string;
  detail?: string;
  leaving?: boolean;
}

interface ToastApi {
  show: (tone: Tone, title: string, detail?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICON: Record<Tone, IconName> = { success: 'check', info: 'info', error: 'alert' };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, leaving: true } : item)));
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 220);
  }, []);

  const show = useCallback(
    (tone: Tone, title: string, detail?: string) => {
      const id = nextId.current++;
      setItems((current) => [...current.slice(-2), { id, tone, title, detail }]);
      window.setTimeout(() => dismiss(id), tone === 'error' ? 8000 : 3800);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((item) => (
          <div
            key={item.id}
            className={`toast toast--${item.tone} ${item.leaving ? 'toast--leaving' : ''}`}
          >
            <Icon name={ICON[item.tone]} size={20} className="toast__icon" />
            <div className="toast__text">
              <strong>{item.title}</strong>
              {item.detail && <span>{item.detail}</span>}
            </div>
            <button
              className="toast__close"
              type="button"
              aria-label="Meldung schließen"
              onClick={() => dismiss(item.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast muss innerhalb von ToastProvider stehen.');
  return api;
}
