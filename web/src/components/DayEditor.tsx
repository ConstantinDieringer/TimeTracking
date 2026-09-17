import {
  ABSENCE_LABEL,
  atLocalTime,
  formatClock,
  formatDateLong,
  localMinutesOfDay,
  parseHm,
  type AbsenceKind,
  type IsoDate,
} from '@zeiterfassung/legal';
import { useState } from 'react';
import {
  useDeleteAbsence,
  useDeleteSegment,
  useSaveAbsence,
  useSaveSegment,
} from '../lib/queries';
import type { TimesheetDay } from '../lib/timesheet';

const SEGMENT_KINDS = [
  { value: 'work', label: 'Arbeitszeit' },
  { value: 'break', label: 'Ruhepause' },
  { value: 'travel', label: 'Reisezeit' },
  { value: 'oncall', label: 'Rufbereitschaft' },
] as const;

const ABSENCE_KINDS = Object.entries(ABSENCE_LABEL) as Array<[AbsenceKind, string]>;

interface DraftSegment {
  id?: string;
  from: string;
  to: string;
  kind: (typeof SEGMENT_KINDS)[number]['value'];
}

/**
 * Bearbeitung eines Tages.
 *
 * Gearbeitet wird direkt auf den Segmenten statt auf einem vereinfachten
 * „von, bis, Pause". Die Vereinfachung sieht bequemer aus, kann aber einen
 * geteilten Tag nicht abbilden — und die Teilungsregel des § 11 AZG lebt
 * genau davon.
 */
export function DayEditor({
  day,
  employeeId,
  onClose,
}: {
  day: TimesheetDay;
  employeeId: string;
  onClose: () => void;
}) {
  const [drafts, setDrafts] = useState<DraftSegment[]>(() =>
    day.work.intervals.map((interval) => ({
      id: interval.id,
      from: formatClock(localMinutesOfDay(interval.start)),
      to: formatClock(localMinutesOfDay(interval.end)),
      kind: interval.kind,
    })),
  );
  const [error, setError] = useState<string | null>(null);

  const saveSegment = useSaveSegment();
  const deleteSegment = useDeleteSegment();
  const saveAbsence = useSaveAbsence();
  const deleteAbsence = useDeleteAbsence();

  const busy =
    saveSegment.isPending ||
    deleteSegment.isPending ||
    saveAbsence.isPending ||
    deleteAbsence.isPending;

  function update(index: number, patch: Partial<DraftSegment>) {
    setDrafts((current) =>
      current.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)),
    );
  }

  async function handleSave() {
    setError(null);

    for (const draft of drafts) {
      if (!draft.from || !draft.to) {
        setError('Bei jedem Abschnitt müssen Beginn und Ende gesetzt sein.');
        return;
      }
      if (parseHm(draft.to) <= parseHm(draft.from)) {
        setError(`Der Abschnitt ${draft.from}–${draft.to} endet nicht nach seinem Beginn.`);
        return;
      }
    }

    // Zuerst löschen, dann anlegen: die Datenbank weist überlappende Segmente
    // ab, und beim Verschieben einer Zeit überschneidet sich der neue Stand
    // sonst mit dem alten.
    try {
      const keptIds = new Set(drafts.map((draft) => draft.id).filter(Boolean));
      for (const id of collectSegmentIds(day)) {
        if (!keptIds.has(id)) await deleteSegment.mutateAsync(id);
      }

      for (const draft of drafts) {
        await saveSegment.mutateAsync({
          id: draft.id,
          employeeId,
          date: day.date,
          startedAt: atLocalTime(day.date, parseHm(draft.from)).toISOString(),
          endedAt: atLocalTime(day.date, parseHm(draft.to)).toISOString(),
          kind: draft.kind,
        });
      }
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Speichern fehlgeschlagen.');
    }
  }

  async function handleAbsence(kind: string) {
    setError(null);
    try {
      if (kind === '') {
        if (day.absence?.id) await deleteAbsence.mutateAsync(day.absence.id);
      } else {
        if (day.absence?.id && day.absence.kind !== kind) {
          await deleteAbsence.mutateAsync(day.absence.id);
        }
        await saveAbsence.mutateAsync({
          employeeId,
          date: day.date,
          kind: kind as AbsenceKind,
          halfDay: day.absence?.halfDay ?? false,
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Speichern fehlgeschlagen.');
    }
  }

  return (
    <div className="editor">
      <div className="editor__head">
        <h3>{formatDateLong(day.date)}</h3>
        <button className="button button--quiet" type="button" onClick={onClose}>
          Schließen
        </button>
      </div>

      <div className="editor__grid">
        <div>
          <span className="meta">Abschnitte</span>
          <div className="stack editor__segments">
            {drafts.length === 0 && <p className="empty">Noch nichts erfasst.</p>}

            {drafts.map((draft, index) => (
              <div className="editor__segment" key={draft.id ?? `neu-${index}`}>
                <input
                  type="time"
                  aria-label="Beginn"
                  value={draft.from}
                  onChange={(event) => update(index, { from: event.target.value })}
                />
                <span className="muted">bis</span>
                <input
                  type="time"
                  aria-label="Ende"
                  value={draft.to}
                  onChange={(event) => update(index, { to: event.target.value })}
                />
                <select
                  aria-label="Art"
                  value={draft.kind}
                  onChange={(event) =>
                    update(index, { kind: event.target.value as DraftSegment['kind'] })
                  }
                >
                  {SEGMENT_KINDS.map((kind) => (
                    <option key={kind.value} value={kind.value}>
                      {kind.label}
                    </option>
                  ))}
                </select>
                <button
                  className="button button--quiet button--danger"
                  type="button"
                  onClick={() => setDrafts((current) => current.filter((_, i) => i !== index))}
                >
                  Entfernen
                </button>
              </div>
            ))}

            <button
              className="button"
              type="button"
              onClick={() =>
                setDrafts((current) => [
                  ...current,
                  {
                    from: current.at(-1)?.to ?? '08:00',
                    to: '',
                    kind: 'work',
                  },
                ])
              }
            >
              Abschnitt hinzufügen
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="absence">Abwesenheit</label>
          <select
            id="absence"
            value={day.absence?.kind ?? ''}
            disabled={busy}
            onChange={(event) => void handleAbsence(event.target.value)}
          >
            <option value="">Keine</option>
            {ABSENCE_KINDS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          {day.absence?.kind === 'persoenlicher_feiertag' && (
            <p className="muted editor__note">
              Der persönliche Feiertag nach § 7a ARG wird einmal im Kalenderjahr einseitig bestimmt,
              ist drei Monate im Voraus schriftlich bekanntzugeben und verbraucht einen Urlaubstag.
            </p>
          )}
        </div>
      </div>

      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}

      <div className="editor__actions">
        <button className="button button--primary" type="button" disabled={busy} onClick={handleSave}>
          {busy ? 'Wird gespeichert …' : 'Speichern'}
        </button>
        <span className="muted editor__hint">
          Änderungen werden mit Zeitpunkt und Benutzer protokolliert.
        </span>
      </div>
    </div>
  );
}

function collectSegmentIds(day: TimesheetDay): string[] {
  return day.work.intervals
    .map((interval) => interval.id)
    .filter((value): value is string => typeof value === 'string');
}
