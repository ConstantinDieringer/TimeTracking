import {
  STATE_LABEL,
  defaultDailyTargets,
  formatDuration,
  localDateOf,
  type AustrianState,
} from '@zeiterfassung/legal';
import { useEffect, useState, type FormEvent } from 'react';
import { useContractDefaults } from '../lib/defaults';
import { useContractTypes } from '../lib/queries';
import { supabase } from '../lib/supabase';
import { GleitzeitFelder, pruefeGleitzeit, type GleitzeitWerte } from './GleitzeitFelder';
import { Einordnung, Normalarbeitszeit } from './Normalarbeitszeit';
import { useToast } from './Toast';

/**
 * Anlegen eines Mitarbeiters.
 *
 * Legt Zugang, Stammdaten und ersten Vertrag in einem Schritt an. Getrennt
 * wäre es unvollständiger, als es aussieht: ohne Vertrag gibt es kein
 * Tagessoll und keine Regelprüfung, und ohne Geburtsdatum wird ein Lehrling
 * wie ein Erwachsener behandelt. Beides lässt sich hier nicht übersehen.
 *
 * Der Zugang selbst entsteht über die Edge Function `admin-users` — dafür
 * braucht es den service_role-Schlüssel, der nicht ins Browser-Bundle darf.
 * Stammdaten und Vertrag schreibt der Client danach direkt; RLS lässt das für
 * Administratoren zu.
 */
export function NeuerZugang({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const types = useContractTypes();
  const defaults = useContractDefaults();

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  // Einladung: die Person legt ihr Passwort selbst fest, niemand sonst kennt
  // es. Erstpasswort: für den Fall, dass keine E-Mail ankommen kann.
  const [method, setMethod] = useState<'passwort' | 'einladung'>('passwort');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'employee' | 'admin'>('employee');
  const [hiredOn, setHiredOn] = useState(() => localDateOf(new Date()));
  const [birthDate, setBirthDate] = useState('');
  const [personnelNumber, setPersonnelNumber] = useState('');
  // Leer statt vorbelegt: das Bundesland ist eine Angabe des Arbeitgebers und
  // soll bewusst gesetzt werden, nicht stillschweigend auf Wien stehen.
  const [state, setState] = useState<AustrianState | ''>('');

  const [contractTypeId, setContractTypeId] = useState('');
  const [collectiveWeeklyHours, setCollectiveWeeklyHours] = useState(38.5);
  const [weeklyHoursInput, setWeeklyHoursInput] = useState('38,5');
  const [collectiveAgreement, setCollectiveAgreement] = useState('');
  const [vacationDays, setVacationDays] = useState(25);
  const [gleitzeit, setGleitzeit] = useState<GleitzeitWerte>({
    enabled: false,
    periodMonths: 1,
    periodAnchor: '',
    allowsFullDayCompensation: null,
    frameStart: '06:00',
    frameEnd: '20:00',
    maxCarryCreditMinutes: 2400,
    maxCarryDebitMinutes: 600,
  });

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Den Betriebsstandard übernehmen, sobald er geladen ist. Danach nicht mehr —
  // sonst überschriebe er Eingaben, die gerade gemacht werden.
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (!defaults.data || prefilled) return;
    const standard = defaults.data;
    setCollectiveWeeklyHours(standard.collectiveWeeklyHours);
    setWeeklyHoursInput(String(standard.collectiveWeeklyHours).replace('.', ','));
    setCollectiveAgreement(standard.collectiveAgreement);
    setVacationDays(standard.vacationDaysPerYear);
    setState(standard.state);
    setGleitzeit((current) => ({
      ...current,
      enabled: standard.flexEnabled,
      periodMonths: standard.flexPeriodMonths,
      allowsFullDayCompensation: standard.flexAllowsFullDayCompensation,
      frameStart: standard.flexFrameStart,
      frameEnd: standard.flexFrameEnd,
      maxCarryCreditMinutes: standard.flexMaxCarryCreditMinutes,
      maxCarryDebitMinutes: standard.flexMaxCarryDebitMinutes,
    }));
    setPrefilled(true);
  }, [defaults.data, prefilled]);

  // Der Anker der ersten Gleitzeitperiode richtet sich sinnvollerweise nach
  // dem Eintritt, solange ihn niemand von Hand gesetzt hat.
  useEffect(() => {
    setGleitzeit((current) =>
      current.periodAnchor ? current : { ...current, periodAnchor: hiredOn },
    );
  }, [hiredOn]);

  const weeklyHours = Number(weeklyHoursInput.replace(',', '.'));
  const dailyTargets = Number.isFinite(weeklyHours) ? defaultDailyTargets(weeklyHours) : null;
  const selectedType = (types.data ?? []).find((type) => type.id === contractTypeId);

  // Solange die Vertragsarten laden, steht die Vorauswahl nicht fest.
  if (types.data && !contractTypeId && types.data[0]) {
    setContractTypeId(types.data[0].id);
  }

  /** Die Normalarbeitszeit ist zugleich die Vorgabe für ein Vollzeitverhältnis. */
  function handleCollectiveChange(hours: number) {
    const wasFullTime = weeklyHours === collectiveWeeklyHours;
    setCollectiveWeeklyHours(hours);
    if (wasFullTime) setWeeklyHoursInput(String(hours).replace('.', ','));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!Number.isFinite(weeklyHours) || weeklyHours <= 0) {
      setError('Die vereinbarten Wochenstunden sind keine gültige Zahl.');
      return;
    }
    if (weeklyHours > collectiveWeeklyHours) {
      setError(
        'Die vereinbarte Arbeitszeit darf die kollektivvertragliche Normalarbeitszeit nicht dauerhaft überschreiten.',
      );
      return;
    }
    if (!contractTypeId) {
      setError('Es ist keine Vertragsart hinterlegt. Zuerst eine Vertragsart anlegen.');
      return;
    }
    if (!state) {
      setError('Bitte das Bundesland angeben — es bestimmt, welche Landesfeiertage gelten.');
      return;
    }

    const gleitzeitProblem = pruefeGleitzeit(gleitzeit, true);
    if (gleitzeitProblem) {
      setError(gleitzeitProblem);
      return;
    }

    setBusy(true);

    const { data, error: invokeError } = await supabase.functions.invoke('admin-users', {
      body:
        method === 'einladung'
          ? { action: 'invite', email, displayName, role, hiredOn }
          : { action: 'create', email, password, displayName, role, hiredOn },
    });

    if (invokeError || data?.error) {
      setBusy(false);
      setError(data?.error ?? invokeError!.message);
      return;
    }

    const userId: string = data.userId;

    // Der Trigger hat das Profil bereits mit Name und Eintritt angelegt; hier
    // kommt dazu, was er nicht wissen kann.
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        birth_date: birthDate || null,
        personnel_number: personnelNumber || null,
        state,
      })
      .eq('id', userId);

    if (profileError) {
      setBusy(false);
      setError(
        `Der Zugang wurde angelegt, die Stammdaten konnten aber nicht gespeichert werden: ${profileError.message}`,
      );
      return;
    }

    const { error: contractError } = await supabase.from('employment_contracts').insert({
      employee_id: userId,
      contract_type_id: contractTypeId,
      valid_from: hiredOn,
      weekly_hours: weeklyHours,
      collective_weekly_hours: collectiveWeeklyHours,
      collective_agreement: collectiveAgreement || null,
      daily_target_minutes: [1, 2, 3, 4, 5, 6, 7].map((day) => dailyTargets![day as 1] ?? 0),
      vacation_days_per_year: vacationDays,
      flex_enabled: gleitzeit.enabled,
      flex_period_months: gleitzeit.periodMonths,
      flex_period_anchor: gleitzeit.enabled ? (gleitzeit.periodAnchor || hiredOn) : null,
      flex_allows_full_day_compensation: gleitzeit.allowsFullDayCompensation === true,
      flex_frame_start: gleitzeit.frameStart,
      flex_frame_end: gleitzeit.frameEnd,
      flex_max_carry_credit_minutes: gleitzeit.maxCarryCreditMinutes,
      flex_max_carry_debit_minutes: gleitzeit.maxCarryDebitMinutes,
    });

    setBusy(false);

    if (contractError) {
      setError(
        `Der Zugang wurde angelegt, der Vertrag aber nicht: ${contractError.message}. Er lässt sich im Mitarbeiterblatt nachtragen.`,
      );
      return;
    }

    toast.show(
      'success',
      `${displayName} angelegt`,
      method === 'einladung'
        ? `Die Einladung ist an ${email} unterwegs. Der Link gilt eine Stunde.`
        : 'Zugangsdaten jetzt persönlich übergeben.',
    );
    onDone();
  }

  return (
    <form className="editor" onSubmit={handleSubmit}>
      <div className="editor__head">
        <h3>Neuer Mitarbeiter</h3>
      </div>

      <fieldset>
        <legend>Zugang</legend>
        <div className="form-grid">
          <div>
            <label htmlFor="neu-name">Name</label>
            <input
              id="neu-name"
              required
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="neu-email">E-Mail</label>
            <input
              id="neu-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="neu-methode">Zugang per</label>
            <select
              id="neu-methode"
              value={method}
              onChange={(event) => setMethod(event.target.value as 'passwort' | 'einladung')}
            >
              <option value="einladung">Einladung per E-Mail</option>
              <option value="passwort">Erstpasswort</option>
            </select>
          </div>
          {method === 'passwort' && (
            <div>
              <label htmlFor="neu-passwort">Erstpasswort</label>
              <input
                id="neu-passwort"
                type="text"
                required
                minLength={12}
                maxLength={72}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
          )}
          <div>
            <label htmlFor="neu-rolle">Rolle</label>
            <select
              id="neu-rolle"
              value={role}
              onChange={(event) => setRole(event.target.value as 'employee' | 'admin')}
            >
              <option value="employee">Mitarbeiter</option>
              <option value="admin">Verwaltung</option>
            </select>
          </div>
        </div>
        <p className="muted editor__note">
          {method === 'einladung'
            ? 'Die Person bekommt eine E-Mail mit einem Link, über den sie ihr Passwort selbst festlegt — niemand sonst kennt es. Der Link gilt eine Stunde.'
            : 'Das Erstpasswort braucht mindestens 12 Zeichen mit Buchstaben und Ziffern. Es steht im Klartext, damit es persönlich übergeben werden kann.'}{' '}
          Eine Rolle in der Verwaltung sieht die Zeiten aller Mitarbeiter.
        </p>
      </fieldset>

      <fieldset>
        <legend>Stammdaten</legend>
        <div className="form-grid">
          <div>
            <label htmlFor="neu-eintritt">Eintritt</label>
            <input
              id="neu-eintritt"
              type="date"
              required
              value={hiredOn}
              onChange={(event) => setHiredOn(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="neu-geburt">Geburtsdatum</label>
            <input
              id="neu-geburt"
              type="date"
              value={birthDate}
              onChange={(event) => setBirthDate(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="neu-nr">Personalnummer</label>
            <input
              id="neu-nr"
              value={personnelNumber}
              onChange={(event) => setPersonnelNumber(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="neu-land">Bundesland des Arbeitsorts</label>
            <select
              id="neu-land"
              required
              value={state}
              onChange={(event) => setState(event.target.value as AustrianState)}
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
        <p className="muted editor__note">
          Das Geburtsdatum entscheidet tagesgenau, ob das KJBG oder das AZG gilt. Fehlt es, wird
          die Person wie eine erwachsene behandelt — bei Lehrlingen unbedingt eintragen. Das
          Bundesland bestimmt die angezeigten Landesfeiertage; es ist mit dem Betriebsstandard
          vorbelegt und für Mitarbeiter an anderen Standorten zu ändern.
        </p>
      </fieldset>

      <fieldset>
        <legend>Erster Vertrag</legend>
        <div className="form-grid">
          <div>
            <label htmlFor="neu-art">Vertragsart</label>
            <select
              id="neu-art"
              value={contractTypeId}
              onChange={(event) => setContractTypeId(event.target.value)}
            >
              {(types.data ?? []).map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <Normalarbeitszeit value={collectiveWeeklyHours} onChange={handleCollectiveChange} />

          <div>
            <label htmlFor="neu-stunden">Vereinbarte Wochenstunden</label>
            <input
              id="neu-stunden"
              required
              inputMode="decimal"
              value={weeklyHoursInput}
              onChange={(event) => setWeeklyHoursInput(event.target.value)}
            />
          </div>

          <div>
            <label htmlFor="neu-kv">Kollektivvertrag</label>
            <input
              id="neu-kv"
              value={collectiveAgreement}
              placeholder="z. B. Handel"
              onChange={(event) => setCollectiveAgreement(event.target.value)}
            />
          </div>

          <div>
            <label htmlFor="neu-urlaub">Urlaubsanspruch in Arbeitstagen</label>
            <input
              id="neu-urlaub"
              type="number"
              min={25}
              max={60}
              step={0.5}
              value={vacationDays}
              onChange={(event) => setVacationDays(Number(event.target.value))}
            />
          </div>
        </div>

        <Einordnung weeklyHours={weeklyHours} collectiveWeeklyHours={collectiveWeeklyHours} />

        {dailyTargets && (
          <p className="muted editor__note">
            Vorschlag für die Verteilung: Montag bis Freitag je{' '}
            {formatDuration(dailyTargets[1])} h, Wochenende frei. Eine abweichende Verteilung nach
            § 4 AZG lässt sich im Mitarbeiterblatt einstellen.
            {selectedType?.category === 'lehrling' &&
              ' Für Lehrlinge unter 18 gelten zusätzlich die engeren Grenzen des KJBG.'}
          </p>
        )}
      </fieldset>

      <GleitzeitFelder idPrefix="neu" werte={gleitzeit} onChange={setGleitzeit} />

      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}

      <div className="editor__actions">
        <button className="button button--primary" type="submit" disabled={busy || types.isLoading}>
          {busy ? 'Wird angelegt …' : 'Mitarbeiter anlegen'}
        </button>
      </div>
    </form>
  );
}
