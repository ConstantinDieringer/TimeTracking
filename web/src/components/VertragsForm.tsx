import { defaultDailyTargets, formatDuration, type Contract } from '@zeiterfassung/legal';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useContractDefaults, type ContractDefaults } from '../lib/defaults';
import { useContractTypes } from '../lib/queries';
import { supabase, type ContractTypeRow } from '../lib/supabase';
import { GleitzeitFelder, pruefeGleitzeit, type GleitzeitWerte } from './GleitzeitFelder';
import { Einordnung, Normalarbeitszeit } from './Normalarbeitszeit';
import { InfoTip } from './InfoTip';
import { Loading } from './Loading';
import { useToast } from './Toast';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

interface Draft {
  contractTypeId: string;
  validFrom: string;
  validTo: string;
  weeklyHours: string;
  collectiveWeeklyHours: string;
  collectiveAgreement: string;
  dailyTargets: string[];
  gleitzeit: GleitzeitWerte;
  allIn: boolean;
  vacationDaysPerYear: string;
  exemptFromAzg: boolean;
  nightWork: boolean;
  shiftWork: boolean;
  monthlyGross: string;
}

function toNumber(value: string): number {
  return Number(value.replace(',', '.'));
}

function toInput(value: number): string {
  return String(value).replace('.', ',');
}

/**
 * Ausgangszustand des Formulars.
 *
 * Bei einem neuen Vertrag kommt er aus dem Betriebsstandard — damit die immer
 * gleichen Werte nicht bei jedem Vertrag neu eingetippt werden müssen.
 */
function draftFrom(
  contract: Contract | null,
  types: ContractTypeRow[],
  defaults: ContractDefaults,
): Draft {
  if (!contract) {
    const targets = defaultDailyTargets(defaults.collectiveWeeklyHours);
    return {
      contractTypeId: types[0]?.id ?? '',
      validFrom: new Date().toISOString().slice(0, 10),
      validTo: '',
      weeklyHours: toInput(defaults.collectiveWeeklyHours),
      collectiveWeeklyHours: toInput(defaults.collectiveWeeklyHours),
      collectiveAgreement: defaults.collectiveAgreement,
      dailyTargets: [1, 2, 3, 4, 5, 6, 7].map((day) => String(targets[day as 1] ?? 0)),
      gleitzeit: {
        enabled: defaults.flexEnabled,
        periodMonths: defaults.flexPeriodMonths,
        periodAnchor: `${new Date().getFullYear()}-01-01`,
        allowsFullDayCompensation: defaults.flexAllowsFullDayCompensation,
        frameStart: defaults.flexFrameStart,
        frameEnd: defaults.flexFrameEnd,
        maxCarryCreditMinutes: defaults.flexMaxCarryCreditMinutes,
        maxCarryDebitMinutes: defaults.flexMaxCarryDebitMinutes,
      },
      allIn: false,
      vacationDaysPerYear: toInput(defaults.vacationDaysPerYear),
      exemptFromAzg: false,
      nightWork: false,
      shiftWork: false,
      monthlyGross: '',
    };
  }

  const match = types.find((type) => type.label === contract.typeLabel);
  return {
    contractTypeId: match?.id ?? types[0]?.id ?? '',
    validFrom: contract.validFrom,
    validTo: contract.validTo ?? '',
    weeklyHours: toInput(contract.weeklyHours),
    collectiveWeeklyHours: toInput(contract.collectiveWeeklyHours),
    collectiveAgreement: contract.collectiveAgreement ?? '',
    dailyTargets: [1, 2, 3, 4, 5, 6, 7].map((day) =>
      String(contract.dailyTargetMinutes[day as 1] ?? 0),
    ),
    gleitzeit: {
      enabled: contract.flexTime !== null,
      periodMonths: contract.flexTime?.periodMonths ?? 1,
      periodAnchor: contract.flexTime?.periodAnchor ?? contract.validFrom,
      // Bei einem bestehenden Vertrag ist die Frage beantwortet — sonst wäre
      // er nicht speicherbar gewesen.
      allowsFullDayCompensation: contract.flexTime
        ? contract.flexTime.allowsFullDayCompensation
        : null,
      frameStart: contract.flexTime?.frameStart ?? '06:00',
      frameEnd: contract.flexTime?.frameEnd ?? '20:00',
      maxCarryCreditMinutes: contract.flexTime?.maxCarryCredit ?? 2400,
      maxCarryDebitMinutes: contract.flexTime?.maxCarryDebit ?? 600,
    },
    allIn: contract.allIn,
    vacationDaysPerYear: toInput(contract.vacationDaysPerYear),
    exemptFromAzg: contract.exemptFromAzg,
    nightWork: contract.nightWork,
    shiftWork: contract.shiftWork,
    monthlyGross:
      contract.monthlyGrossCents != null
        ? (contract.monthlyGrossCents / 100).toFixed(2).replace('.', ',')
        : '',
  };
}

export function VertragsForm({
  employeeId,
  contract,
  onDone,
  onCancel,
}: {
  employeeId: string;
  contract: Contract | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const types = useContractTypes();
  const defaults = useContractDefaults();
  const client = useQueryClient();
  const toast = useToast();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Erst aufbauen, wenn Vertragsarten und Betriebsstandard da sind — sonst
  // stünde die Vorbelegung im Formular, bevor sie bekannt ist.
  if (!draft && types.data && defaults.data) {
    setDraft(draftFrom(contract, types.data, defaults.data));
  }

  if (!draft) {
    return (
      <div className="editor">
        <Loading />
      </div>
    );
  }

  const weeklyTarget = draft.dailyTargets.reduce((sum, value) => sum + (Number(value) || 0), 0);
  const weeklyHours = toNumber(draft.weeklyHours);
  const targetMismatch =
    Number.isFinite(weeklyHours) && Math.abs(weeklyTarget - weeklyHours * 60) > 5;

  function verteileGleichmaessig() {
    if (!Number.isFinite(weeklyHours)) return;
    const targets = defaultDailyTargets(weeklyHours);
    setDraft({
      ...draft!,
      dailyTargets: [1, 2, 3, 4, 5, 6, 7].map((day) => String(targets[day as 1] ?? 0)),
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const gleitzeitProblem = pruefeGleitzeit(draft!.gleitzeit, true);
    if (gleitzeitProblem) {
      setError(gleitzeitProblem);
      return;
    }
    if (toNumber(draft!.weeklyHours) > toNumber(draft!.collectiveWeeklyHours)) {
      setError(
        'Die vereinbarte Arbeitszeit darf die kollektivvertragliche Normalarbeitszeit nicht dauerhaft überschreiten.',
      );
      return;
    }

    setBusy(true);

    const row = {
      employee_id: employeeId,
      contract_type_id: draft!.contractTypeId,
      valid_from: draft!.validFrom,
      valid_to: draft!.validTo || null,
      weekly_hours: toNumber(draft!.weeklyHours),
      collective_weekly_hours: toNumber(draft!.collectiveWeeklyHours),
      collective_agreement: draft!.collectiveAgreement || null,
      daily_target_minutes: draft!.dailyTargets.map((value) => Number(value) || 0),
      flex_enabled: draft!.gleitzeit.enabled,
      flex_period_months: draft!.gleitzeit.periodMonths,
      flex_period_anchor: draft!.gleitzeit.enabled
        ? draft!.gleitzeit.periodAnchor || draft!.validFrom
        : null,
      flex_allows_full_day_compensation: draft!.gleitzeit.allowsFullDayCompensation === true,
      flex_frame_start: draft!.gleitzeit.frameStart,
      flex_frame_end: draft!.gleitzeit.frameEnd,
      flex_max_carry_credit_minutes: draft!.gleitzeit.maxCarryCreditMinutes,
      flex_max_carry_debit_minutes: draft!.gleitzeit.maxCarryDebitMinutes,
      all_in: draft!.allIn,
      vacation_days_per_year: toNumber(draft!.vacationDaysPerYear),
      exempt_from_azg: draft!.exemptFromAzg,
      night_work: draft!.nightWork,
      shift_work: draft!.shiftWork,
      monthly_gross_cents: draft!.monthlyGross
        ? Math.round(toNumber(draft!.monthlyGross) * 100)
        : null,
    };

    const { error: saveError } = contract?.id
      ? await supabase.from('employment_contracts').update(row).eq('id', contract.id)
      : await supabase.from('employment_contracts').insert(row);

    setBusy(false);

    if (saveError) {
      setError(
        saveError.message.includes('no_overlap')
          ? 'Der Zeitraum überschneidet sich mit einem bestehenden Vertrag. Den vorherigen zuerst beenden.'
          : saveError.message,
      );
      return;
    }

    void client.invalidateQueries({ queryKey: ['contracts'] });
    void client.invalidateQueries({ queryKey: ['overview'] });
    toast.show('success', 'Vertrag gespeichert');
    onDone();
  }

  return (
    <form className="editor" onSubmit={handleSubmit}>
      <div className="editor__head">
        <h3>{contract ? 'Vertrag bearbeiten' : 'Neuer Vertrag'}</h3>
        <button className="button button--quiet" type="button" onClick={onCancel}>
          Abbrechen
        </button>
      </div>

      <fieldset>
        <legend>Grunddaten</legend>
        <div className="form-grid">
          <div>
            <label htmlFor="v-art">Vertragsart</label>
            <select
              id="v-art"
              value={draft.contractTypeId}
              onChange={(event) => setDraft({ ...draft, contractTypeId: event.target.value })}
            >
              {(types.data ?? []).map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="v-von">Gültig ab</label>
            <input
              id="v-von"
              type="date"
              required
              value={draft.validFrom}
              onChange={(event) => setDraft({ ...draft, validFrom: event.target.value })}
            />
          </div>
          <div>
            <label htmlFor="v-bis">Gültig bis</label>
            <input
              id="v-bis"
              type="date"
              value={draft.validTo}
              onChange={(event) => setDraft({ ...draft, validTo: event.target.value })}
            />
          </div>

          <Normalarbeitszeit
            value={toNumber(draft.collectiveWeeklyHours)}
            onChange={(hours) => {
              // War es bisher Vollzeit, zieht die vereinbarte Arbeitszeit mit.
              const wasFullTime =
                toNumber(draft.weeklyHours) === toNumber(draft.collectiveWeeklyHours);
              setDraft({
                ...draft,
                collectiveWeeklyHours: toInput(hours),
                weeklyHours: wasFullTime ? toInput(hours) : draft.weeklyHours,
              });
            }}
          />

          <div>
            <label htmlFor="v-stunden">Vereinbarte Wochenstunden</label>
            <input
              id="v-stunden"
              required
              inputMode="decimal"
              value={draft.weeklyHours}
              onChange={(event) => setDraft({ ...draft, weeklyHours: event.target.value })}
            />
          </div>

          <div>
            <label htmlFor="v-kv">Kollektivvertrag</label>
            <input
              id="v-kv"
              value={draft.collectiveAgreement}
              placeholder="z. B. Handel"
              onChange={(event) => setDraft({ ...draft, collectiveAgreement: event.target.value })}
            />
          </div>
        </div>

        <Einordnung
          weeklyHours={toNumber(draft.weeklyHours)}
          collectiveWeeklyHours={toNumber(draft.collectiveWeeklyHours)}
        />
      </fieldset>

      <fieldset>
        <legend>
          Tagessoll in Minuten
          <InfoTip>
            <span>
              Eine abweichende Verteilung ist zulässig — etwa eine Viertagewoche mit zehn Stunden.
              Sie hebt zugleich die tägliche Normalarbeitszeit auf das Tagessoll an, höchstens auf
              zehn Stunden.
            </span>
            <span className="infotip__ref">§ 4 AZG</span>
          </InfoTip>
        </legend>
        <div className="weekday-grid">
          {WEEKDAYS.map((label, index) => (
            <div key={label}>
              <label htmlFor={`v-tag-${index}`}>{label}</label>
              <input
                id={`v-tag-${index}`}
                type="number"
                min={0}
                max={720}
                value={draft.dailyTargets[index]}
                onChange={(event) => {
                  const next = [...draft.dailyTargets];
                  next[index] = event.target.value;
                  setDraft({ ...draft, dailyTargets: next });
                }}
              />
            </div>
          ))}
        </div>

        <div className="row">
          <button className="button" type="button" onClick={verteileGleichmaessig}>
            Gleichmäßig auf Montag bis Freitag verteilen
          </button>
          <span className={targetMismatch ? 'error-text' : 'muted'}>
            Summe {formatDuration(weeklyTarget)} h
            {targetMismatch
              ? ` — weicht von den vereinbarten ${draft.weeklyHours} Wochenstunden ab.`
              : '.'}
          </span>
        </div>
      </fieldset>

      <GleitzeitFelder
        idPrefix="v"
        werte={draft.gleitzeit}
        onChange={(gleitzeit) => setDraft({ ...draft, gleitzeit })}
      />

      <fieldset>
        <legend>Weiteres</legend>
        <div className="form-grid">
          <div>
            <label htmlFor="v-urlaub">Urlaubsanspruch in Arbeitstagen</label>
            <input
              id="v-urlaub"
              inputMode="decimal"
              value={draft.vacationDaysPerYear}
              onChange={(event) =>
                setDraft({ ...draft, vacationDaysPerYear: event.target.value })
              }
            />
          </div>
          <div>
            <label htmlFor="v-brutto">Monatsbrutto in Euro</label>
            <input
              id="v-brutto"
              inputMode="decimal"
              value={draft.monthlyGross}
              placeholder="nur für geringfügige Beschäftigung"
              onChange={(event) => setDraft({ ...draft, monthlyGross: event.target.value })}
            />
          </div>
        </div>

        <label className="check">
          <input
            type="checkbox"
            checked={draft.allIn}
            onChange={(event) => setDraft({ ...draft, allIn: event.target.checked })}
          />
          <span>
            All-in
            <InfoTip>
              <span>
                Überstunden sind mit dem Gehalt pauschal abgegolten. Die Arbeitszeitgrenzen gelten
                trotzdem, und die Zeiten sind weiterhin aufzuzeichnen.
              </span>
              <span className="infotip__ref">§ 26 AZG</span>
            </InfoTip>
          </span>
        </label>

        <label className="check">
          <input
            type="checkbox"
            checked={draft.exemptFromAzg}
            onChange={(event) => setDraft({ ...draft, exemptFromAzg: event.target.checked })}
          />
          <span>
            Vom AZG ausgenommen
            <InfoTip>
              <span>
                Nur für leitende Angestellte mit maßgeblicher selbständiger Entscheidungsbefugnis.
                Entscheidend ist die tatsächliche Position, nicht die Vertragsart. Die
                Arbeitszeitgrenzen werden dann nicht geprüft.
              </span>
              <span className="infotip__ref">§ 1 Abs 2 Z 8 AZG</span>
            </InfoTip>
          </span>
        </label>

        <label className="check">
          <input
            type="checkbox"
            checked={draft.nightWork}
            onChange={(event) => setDraft({ ...draft, nightWork: event.target.checked })}
          />
          <span>
            Nachtarbeit vereinbart
            <InfoTip>
              <span className="infotip__ref">§ 12a AZG</span>
            </InfoTip>
          </span>
        </label>

        <label className="check">
          <input
            type="checkbox"
            checked={draft.shiftWork}
            onChange={(event) => setDraft({ ...draft, shiftWork: event.target.checked })}
          />
          <span>Schichtarbeit</span>
        </label>
      </fieldset>

      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}

      <div className="editor__actions">
        <button className="button button--primary" type="submit" disabled={busy}>
          {busy ? 'Wird gespeichert …' : 'Vertrag speichern'}
        </button>
      </div>
    </form>
  );
}
