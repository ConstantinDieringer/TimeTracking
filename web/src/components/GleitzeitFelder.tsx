import { formatDuration } from '@zeiterfassung/legal';
import { useId } from 'react';

export interface GleitzeitWerte {
  enabled: boolean;
  periodMonths: number;
  /** Nur im Vertrag nötig, nicht im Betriebsstandard. */
  periodAnchor?: string;
  /** `null` = noch nicht entschieden. */
  allowsFullDayCompensation: boolean | null;
  frameStart: string;
  frameEnd: string;
  maxCarryCreditMinutes: number;
  maxCarryDebitMinutes: number;
}

/**
 * Prüft, ob die Gleitzeitangaben vollständig sind.
 * Gibt eine Fehlermeldung zurück oder `null`, wenn alles passt.
 */
export function pruefeGleitzeit(werte: GleitzeitWerte, brauchtAnker: boolean): string | null {
  if (!werte.enabled) return null;

  if (werte.allowsFullDayCompensation === null) {
    return 'Bitte angeben, ob die Gleitzeitvereinbarung ganztägigen Verbrauch von Zeitguthaben zulässt. Davon hängt ab, ob die tägliche Normalarbeitszeit 10 oder 12 Stunden beträgt.';
  }
  if (brauchtAnker && !werte.periodAnchor) {
    return 'Bitte angeben, wann die erste Gleitzeitperiode beginnt.';
  }
  if (werte.frameEnd <= werte.frameStart) {
    return 'Das Ende des Gleitzeitrahmens muss nach seinem Beginn liegen.';
  }
  if (werte.maxCarryCreditMinutes < 0 || werte.maxCarryDebitMinutes < 0) {
    return 'Die Übertragsgrenzen dürfen nicht negativ sein.';
  }
  return null;
}

const PERIODEN = [
  { months: 1, label: 'Ein Monat' },
  { months: 3, label: 'Ein Quartal' },
  { months: 6, label: 'Ein halbes Jahr' },
  { months: 12, label: 'Ein Jahr' },
] as const;

/**
 * Gleitzeitparameter nach § 4b AZG.
 *
 * Die Frage nach dem ganztägigen Verbrauch ist bewusst als Auswahl ohne
 * Vorbelegung gebaut und nicht als Häkchen. Ein Häkchen, das niemand
 * anfasst, bedeutet „nein" — und wer es übersieht, verbucht Überstunden als
 * Normalarbeitszeit oder umgekehrt. Beides kostet Geld, in unterschiedliche
 * Richtungen.
 */
export function GleitzeitFelder({
  werte,
  onChange,
  zeigeAnker = true,
  idPrefix = 'gz',
}: {
  werte: GleitzeitWerte;
  onChange: (werte: GleitzeitWerte) => void;
  zeigeAnker?: boolean;
  idPrefix?: string;
}) {
  const uid = useId();
  const id = (name: string) => `${idPrefix}-${name}-${uid}`;

  function patch(änderung: Partial<GleitzeitWerte>) {
    onChange({ ...werte, ...änderung });
  }

  return (
    <fieldset>
      <legend>Gleitzeit nach § 4b AZG</legend>

      <label className="check">
        <input
          type="checkbox"
          checked={werte.enabled}
          onChange={(event) => patch({ enabled: event.target.checked })}
        />
        <span>Es besteht eine schriftliche Gleitzeitvereinbarung</span>
      </label>

      {!werte.enabled && (
        <p className="muted editor__note">
          Ohne schriftliche Vereinbarung gibt es keine Gleitzeit. Die tägliche Normalarbeitszeit
          beträgt dann acht Stunden, alles darüber ist Überstunde.
        </p>
      )}

      {werte.enabled && (
        <>
          <div className="form-grid">
            <div>
              <label htmlFor={id('periode')}>Gleitzeitperiode</label>
              <select
                id={id('periode')}
                value={String(werte.periodMonths)}
                onChange={(event) => patch({ periodMonths: Number(event.target.value) })}
              >
                {PERIODEN.map((periode) => (
                  <option key={periode.months} value={String(periode.months)}>
                    {periode.label}
                  </option>
                ))}
              </select>
            </div>

            {zeigeAnker && (
              <div>
                <label htmlFor={id('anker')}>Erste Periode beginnt am</label>
                <input
                  id={id('anker')}
                  type="date"
                  required
                  value={werte.periodAnchor ?? ''}
                  onChange={(event) => patch({ periodAnchor: event.target.value })}
                />
              </div>
            )}

            <div>
              <label htmlFor={id('rahmen-von')}>Gleitzeitrahmen ab</label>
              <input
                id={id('rahmen-von')}
                type="time"
                required
                value={werte.frameStart}
                onChange={(event) => patch({ frameStart: event.target.value })}
              />
            </div>

            <div>
              <label htmlFor={id('rahmen-bis')}>Gleitzeitrahmen bis</label>
              <input
                id={id('rahmen-bis')}
                type="time"
                required
                value={werte.frameEnd}
                onChange={(event) => patch({ frameEnd: event.target.value })}
              />
            </div>

            <div>
              <label htmlFor={id('guthaben')}>Übertragbares Guthaben in Stunden</label>
              <input
                id={id('guthaben')}
                type="number"
                min={0}
                max={400}
                step={0.5}
                required
                value={werte.maxCarryCreditMinutes / 60}
                onChange={(event) =>
                  patch({ maxCarryCreditMinutes: Math.round(Number(event.target.value) * 60) })
                }
              />
            </div>

            <div>
              <label htmlFor={id('schuld')}>Übertragbare Zeitschuld in Stunden</label>
              <input
                id={id('schuld')}
                type="number"
                min={0}
                max={400}
                step={0.5}
                required
                value={werte.maxCarryDebitMinutes / 60}
                onChange={(event) =>
                  patch({ maxCarryDebitMinutes: Math.round(Number(event.target.value) * 60) })
                }
              />
            </div>
          </div>

          <div className="decision">
            <span className="decision__question">
              Lässt die Vereinbarung ganztägigen Verbrauch von Zeitguthaben zu — und schließt sie
              ihn im Zusammenhang mit der wöchentlichen Ruhezeit nicht aus?
            </span>

            <div className="decision__options">
              <label className="check">
                <input
                  type="radio"
                  name={id('ganztag')}
                  checked={werte.allowsFullDayCompensation === true}
                  onChange={() => patch({ allowsFullDayCompensation: true })}
                />
                <span>
                  <strong>Ja</strong> — tägliche Normalarbeitszeit bis 12 Stunden
                </span>
              </label>

              <label className="check">
                <input
                  type="radio"
                  name={id('ganztag')}
                  checked={werte.allowsFullDayCompensation === false}
                  onChange={() => patch({ allowsFullDayCompensation: false })}
                />
                <span>
                  <strong>Nein</strong> — tägliche Normalarbeitszeit bis 10 Stunden, jede weitere
                  Stunde ist Überstunde
                </span>
              </label>
            </div>

            {werte.allowsFullDayCompensation === null && (
              <p className="decision__pending">
                Diese Angabe fehlt noch. Sie steht in der Gleitzeitvereinbarung und lässt sich
                nicht schätzen.
              </p>
            )}
          </div>

          <p className="muted editor__note">
            Übertragbar sind derzeit {formatDuration(werte.maxCarryCreditMinutes)} h Guthaben und{' '}
            {formatDuration(werte.maxCarryDebitMinutes)} h Zeitschuld in die nächste Periode
            (§ 4b Abs 2 Z 3 AZG). Wird die Grenze überschritten, meldet das Tool es rechtzeitig vor
            Periodenende.
          </p>
        </>
      )}
    </fieldset>
  );
}
