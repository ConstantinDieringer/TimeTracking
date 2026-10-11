import { STATE_LABEL, type AustrianState } from '@zeiterfassung/legal';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { InfoTip } from '../components/InfoTip';
import { GleitzeitFelder, pruefeGleitzeit } from '../components/GleitzeitFelder';
import { Loading } from '../components/Loading';
import { Normalarbeitszeit } from '../components/Normalarbeitszeit';
import { useToast } from '../components/Toast';
import {
  FALLBACK_DEFAULTS,
  useContractDefaults,
  useSaveContractDefaults,
  type ContractDefaults,
} from '../lib/defaults';

/**
 * Betriebsstandard.
 *
 * Die Werte, die für alle gleich sind — Normalarbeitszeit, Kollektivvertrag,
 * Bundesland, Gleitzeitparameter. Neue Verträge starten damit, jeder einzelne
 * kann davon abweichen.
 */
export function AdminEinstellungen() {
  const gespeichert = useContractDefaults();
  const speichern = useSaveContractDefaults();
  const toast = useToast();

  const [draft, setDraft] = useState<ContractDefaults>(FALLBACK_DEFAULTS);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (gespeichert.data) setDraft(gespeichert.data);
  }, [gespeichert.data]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    if (!draft.state) {
      setError('Bitte das Bundesland des Betriebs angeben.');
      return;
    }

    // Im Betriebsstandard ist der Periodenanker nicht nötig — er richtet sich
    // nach dem Eintritt und wird erst am einzelnen Vertrag gesetzt.
    const problem = pruefeGleitzeit(
      {
        enabled: draft.flexEnabled,
        periodMonths: draft.flexPeriodMonths,
        allowsFullDayCompensation: draft.flexAllowsFullDayCompensation,
        frameStart: draft.flexFrameStart,
        frameEnd: draft.flexFrameEnd,
        maxCarryCreditMinutes: draft.flexMaxCarryCreditMinutes,
        maxCarryDebitMinutes: draft.flexMaxCarryDebitMinutes,
      },
      false,
    );
    if (problem) {
      setError(problem);
      return;
    }

    try {
      await speichern.mutateAsync(draft);
      setSaved(true);
      toast.show('success', 'Betriebsstandard gespeichert', 'Gilt für neu angelegte Verträge.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Speichern fehlgeschlagen.');
    }
  }

  return (
    <main className="page">
      <div className="page__head">
        <div>
          <Link className="meta" to="/admin">
            ← Verwaltung
          </Link>
          <h1>Betriebsstandard</h1>
          <p className="page__subtitle">
            Vorbelegung für neu angelegte Verträge. Bestehende Verträge bleiben unberührt.
          </p>
        </div>
      </div>

      {gespeichert.isLoading && <Loading />}

      <form onSubmit={handleSubmit}>
        <fieldset>
          <legend>Arbeitszeit</legend>
          <div className="form-grid">
            <Normalarbeitszeit
              value={draft.collectiveWeeklyHours}
              onChange={(hours) => setDraft({ ...draft, collectiveWeeklyHours: hours })}
            />

            <div>
              <label htmlFor="std-kv">Kollektivvertrag</label>
              <input
                id="std-kv"
                value={draft.collectiveAgreement}
                placeholder="z. B. Handel"
                onChange={(event) =>
                  setDraft({ ...draft, collectiveAgreement: event.target.value })
                }
              />
            </div>

            <div>
              <label htmlFor="std-urlaub">
                Urlaubsanspruch in Arbeitstagen
                <InfoTip>
                  <span>
                    Mindestens 25 Arbeitstage, nach 25 Dienstjahren 30. Ein höherer vertraglicher
                    Anspruch ist möglich, ein niedrigerer nicht — das Tool rechnet immer mit dem für
                    die Person günstigeren Wert.
                  </span>
                  <span className="infotip__ref">§ 2 UrlG</span>
                </InfoTip>
              </label>
              <input
                id="std-urlaub"
                type="number"
                min={25}
                max={60}
                step={0.5}
                value={draft.vacationDaysPerYear}
                onChange={(event) =>
                  setDraft({ ...draft, vacationDaysPerYear: Number(event.target.value) })
                }
              />
            </div>
          </div>

          <div className="form-grid">
            <div>
              <label htmlFor="std-urlaubsjahr">
                Urlaubsjahr
                <InfoTip>
                  <span>
                    Neue Mitarbeiter erwerben ihren Urlaub in den ersten sechs Monaten schrittweise,
                    im Verhältnis zur zurückgelegten Dienstzeit; danach steht der volle
                    Jahresanspruch zu. Das Kalenderjahr als Urlaubsjahr ist nur zulässig, wenn Ihr
                    Kollektivvertrag oder eine Betriebsvereinbarung es vorsieht.
                  </span>
                  <span className="infotip__ref">§ 2 Abs 2 und 4 UrlG</span>
                </InfoTip>
              </label>
              <select
                id="std-urlaubsjahr"
                value={draft.vacationYear}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    vacationYear: event.target.value as ContractDefaults['vacationYear'],
                  })
                }
              >
                <option value="arbeitsjahr">Arbeitsjahr ab Eintritt (gesetzlicher Regelfall)</option>
                <option value="kalenderjahr">Kalenderjahr (nur mit KV oder Betriebsvereinbarung)</option>
              </select>
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Standort</legend>
          <div className="form-grid">
            <div>
              <label htmlFor="std-land">
                Bundesland des Betriebs
                <InfoTip>
                  <span>
                    Steuert, welche Landesfeiertage angezeigt werden — Leopold in Wien und
                    Niederösterreich, Rupert in Salzburg und so fort. Diese Tage sind{' '}
                    <strong>keine</strong> gesetzlichen Feiertage und begründen weder
                    Feiertagsruhe noch Feiertagsentgelt. Bei Mitarbeitern an anderen Standorten
                    lässt sich das Bundesland einzeln überschreiben.
                  </span>
                  <span className="infotip__ref">§ 7 ARG</span>
                </InfoTip>
              </label>
              <select
                id="std-land"
                required
                value={draft.state}
                onChange={(event) =>
                  setDraft({ ...draft, state: event.target.value as AustrianState })
                }
              >
                <option value="">Bitte wählen …</option>
                {(Object.entries(STATE_LABEL) as Array<[AustrianState, string]>).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>
        </fieldset>

        <GleitzeitFelder
          idPrefix="std"
          zeigeAnker={false}
          werte={{
            enabled: draft.flexEnabled,
            periodMonths: draft.flexPeriodMonths,
            allowsFullDayCompensation: draft.flexAllowsFullDayCompensation,
            frameStart: draft.flexFrameStart,
            frameEnd: draft.flexFrameEnd,
            maxCarryCreditMinutes: draft.flexMaxCarryCreditMinutes,
            maxCarryDebitMinutes: draft.flexMaxCarryDebitMinutes,
          }}
          onChange={(werte) =>
            setDraft({
              ...draft,
              flexEnabled: werte.enabled,
              flexPeriodMonths: werte.periodMonths,
              flexAllowsFullDayCompensation: werte.allowsFullDayCompensation,
              flexFrameStart: werte.frameStart,
              flexFrameEnd: werte.frameEnd,
              flexMaxCarryCreditMinutes: werte.maxCarryCreditMinutes,
              flexMaxCarryDebitMinutes: werte.maxCarryDebitMinutes,
            })
          }
        />

        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}

        <div className="editor__actions">
          <button className="button button--primary" type="submit" disabled={speichern.isPending}>
            {speichern.isPending ? 'Wird gespeichert …' : 'Betriebsstandard speichern'}
          </button>
          {saved && <span className="muted">Gespeichert.</span>}
        </div>
      </form>
    </main>
  );
}
