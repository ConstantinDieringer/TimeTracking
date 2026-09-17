import { COMMON_COLLECTIVE_WEEKLY_HOURS } from '@zeiterfassung/legal';
import { useId, useState } from 'react';

/**
 * Auswahl der kollektivvertraglichen Normalarbeitszeit.
 *
 * In Österreich sind es fast immer 38,5 oder 40 Stunden, deshalb stehen beide
 * als Vorauswahl bereit. Ein freies Feld bleibt trotzdem nötig: einzelne
 * Kollektivverträge sehen abweichende Werte vor, und bei Betrieben ohne KV
 * gelten die 40 Stunden des § 3 AZG.
 *
 * Der Wert ist nicht dasselbe wie die vereinbarte Arbeitszeit einer Person.
 * Er gehört dem Betrieb und entscheidet, ab wann aus Mehrarbeit eine
 * Überstunde wird — deshalb ein eigenes Feld statt einer Ableitung.
 */
export function Normalarbeitszeit({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (hours: number) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const isCommon = COMMON_COLLECTIVE_WEEKLY_HOURS.some((hours) => hours === value);
  const [custom, setCustom] = useState(!isCommon);

  return (
    <div>
      <label htmlFor={id}>Normalarbeitszeit laut Kollektivvertrag</label>
      <select
        id={id}
        disabled={disabled}
        value={custom ? 'custom' : String(value)}
        onChange={(event) => {
          if (event.target.value === 'custom') {
            setCustom(true);
            return;
          }
          setCustom(false);
          onChange(Number(event.target.value));
        }}
      >
        {COMMON_COLLECTIVE_WEEKLY_HOURS.map((hours) => (
          <option key={hours} value={String(hours)}>
            {hours.toLocaleString('de-AT')} Stunden
          </option>
        ))}
        <option value="custom">Anderer Wert …</option>
      </select>

      {custom && (
        <input
          className="stacked-input"
          aria-label="Abweichende Normalarbeitszeit in Stunden"
          inputMode="decimal"
          value={String(value).replace('.', ',')}
          disabled={disabled}
          onChange={(event) => {
            const parsed = Number(event.target.value.replace(',', '.'));
            if (Number.isFinite(parsed)) onChange(parsed);
          }}
        />
      )}
    </div>
  );
}

/**
 * Einordnung der vereinbarten Arbeitszeit gegen die Normalarbeitszeit.
 *
 * Macht im Formular sichtbar, was die beiden Zahlen bedeuten — die
 * Unterscheidung zwischen Mehrarbeit und Überstunde hängt genau daran, und
 * sie ist die am häufigsten falsch gerechnete Stelle im AZG.
 */
export function Einordnung({
  weeklyHours,
  collectiveWeeklyHours,
}: {
  weeklyHours: number;
  collectiveWeeklyHours: number;
}) {
  if (!Number.isFinite(weeklyHours) || !Number.isFinite(collectiveWeeklyHours)) return null;

  if (weeklyHours > collectiveWeeklyHours) {
    return (
      <p className="error-text">
        Die vereinbarte Arbeitszeit liegt über der Normalarbeitszeit. Dauerhaft ist das nicht
        zulässig — jede Stunde darüber wäre Überstunde.
      </p>
    );
  }

  if (weeklyHours === collectiveWeeklyHours) {
    return (
      <p className="muted">
        Vollzeit. Mehrarbeit nach § 19d AZG kommt nicht in Betracht; alles über der
        Normalarbeitszeit ist Überstunde mit 50 % Zuschlag.
      </p>
    );
  }

  const room = Math.round((collectiveWeeklyHours - weeklyHours) * 10) / 10;
  return (
    <p className="muted">
      Teilzeit. Die nächsten {room.toLocaleString('de-AT')} Wochenstunden über der Vereinbarung
      sind Mehrarbeit mit 25 % (§ 19d AZG); erst darüber beginnt die Überstunde mit 50 %.
    </p>
  );
}
