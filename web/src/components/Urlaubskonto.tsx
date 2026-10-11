import {
  formatDateShort,
  localDateOf,
  minDate,
  vacationLedger,
  vacationYearFor,
  type AbsenceKind,
} from '@zeiterfassung/legal';
import { useContractDefaults } from '../lib/defaults';
import { contractOn } from '../lib/mapping';
import { useAbsences, useContracts, useEmployee } from '../lib/queries';
import { Icon } from './Icon';
import { InfoTip } from './InfoTip';
import { Counter } from './Num';

/**
 * Urlaubskonto einer Person — für sie selbst in der Auswertung, für die
 * Verwaltung im Mitarbeiterblatt.
 *
 * Gerechnet wird über alle Urlaubsjahre seit Beginn der Aufzeichnung:
 * Übertrag, Verjährung nach zwei Jahren (§ 4 Abs 5 UrlG), schrittweiser Erwerb
 * in den ersten sechs Monaten (§ 2 Abs 2 UrlG) und bei Austritt die
 * Urlaubsersatzleistung in Tagen (§ 10 UrlG).
 */
export function Urlaubskonto({ employeeId }: { employeeId: string }) {
  const employee = useEmployee(employeeId);
  const contracts = useContracts(employeeId);
  const defaults = useContractDefaults();

  const today = localDateOf(new Date());
  // Nach dem Austritt zählt der Stand am letzten Arbeitstag.
  const asOf = employee.data?.leftOn ? minDate(today, employee.data.leftOn) : today;
  const mode = defaults.data?.vacationYear ?? 'arbeitsjahr';

  // Abwesenheiten ab dem ersten Urlaubsjahr, das das Konto führt.
  const since = employee.data
    ? (employee.data.vacationOpening?.date ??
      vacationYearFor(
        employee.data.hiredOn,
        employee.data.trackedSince && employee.data.trackedSince > employee.data.hiredOn
          ? employee.data.trackedSince
          : employee.data.hiredOn,
        mode,
      ).start)
    : asOf;
  const absences = useAbsences(employeeId, since, asOf);

  if (!employee.data || !contracts.data || !absences.data) return null;

  const ledger = vacationLedger({
    employee: employee.data,
    contractAt: (date) => contractOn(contracts.data!, date),
    absences: absences.data.map((row) => ({
      date: row.absence_date,
      kind: row.kind as AbsenceKind,
      halfDay: row.half_day,
    })),
    asOf,
    mode,
  });

  if (!ledger) {
    return (
      <section className="section">
        <div className="section__head">
          <h2>Urlaubskonto</h2>
        </div>
        <p className="empty">Ohne gültigen Vertrag lässt sich kein Urlaubskonto rechnen.</p>
      </section>
    );
  }

  const available = ledger.entitlementDays + ledger.carriedOverDays;
  const used = available > 0 ? Math.min(Math.max(ledger.consumedDays / available, 0), 1) : 0;
  const days = (value: number) => value.toLocaleString('de-AT', { maximumFractionDigits: 2 });

  return (
    <section className="section">
      <div className="section__head">
        <h2>
          Urlaubskonto
          <InfoTip>
            <span>
              Verbrauchter Urlaub wird immer vom ältesten Anspruch abgezogen. Nicht genommener
              Urlaub verjährt zwei Jahre nach Ende des Urlaubsjahres, in dem er entstanden ist.
            </span>
            {ledger.accruing && ledger.fullFrom && (
              <span>
                In den ersten sechs Monaten entsteht der Urlaub schrittweise, im Verhältnis zur
                zurückgelegten Dienstzeit. Ab {formatDateShort(ledger.fullFrom)} stehen die vollen{' '}
                {days(ledger.fullEntitlementDays)} Arbeitstage zu.
              </span>
            )}
            {!ledger.accruing && ledger.aliquot && ledger.compensationDays === null && (
              <span>
                Der Anspruch ist wegen Ein- oder Austritt im Urlaubsjahr anteilig gekürzt. Voller
                Jahresanspruch: {days(ledger.fullEntitlementDays)} Arbeitstage.
              </span>
            )}
            {ledger.expiredDays > 0 && (
              <span>
                In früheren Urlaubsjahren sind {days(ledger.expiredDays)} Tage ungenutzt verjährt —
                sofern rechtzeitig auf den drohenden Verfall hingewiesen wurde; sonst bleiben sie
                bestehen.
              </span>
            )}
            <span className="infotip__ref">§ 2 UrlG (Anspruch), § 4 Abs 5 UrlG (Verjährung)</span>
          </InfoTip>
        </h2>
        <span className="meta">
          Urlaubsjahr {formatDateShort(ledger.periodStart)} – {formatDateShort(ledger.periodEnd)}
        </span>
      </div>

      <dl className="figures">
        <div>
          <dt className="meta">{ledger.accruing ? 'Bisher erworben' : 'Anspruch'}</dt>
          <dd className="num">
            <Counter value={ledger.entitlementDays} />
          </dd>
        </div>
        <div>
          <dt className="meta">Aus Vorjahren</dt>
          <dd className="num">
            <Counter value={ledger.carriedOverDays} />
          </dd>
        </div>
        <div>
          <dt className="meta">Verbraucht</dt>
          <dd className="num">
            <Counter value={ledger.consumedDays} />
          </dd>
        </div>
        <div>
          <dt className="meta">Offen</dt>
          <dd className="num">
            <Counter value={ledger.remainingDays} />
          </dd>
        </div>
      </dl>

      <div className="progress-block progress-block--spaced">
        <div className="progress-block__labels">
          <span>
            <strong>{days(ledger.consumedDays)}</strong> von {days(available)} Tagen genommen
          </span>
          <span className="muted">{days(ledger.remainingDays)} offen</span>
        </div>
        <div
          className="progress"
          role="progressbar"
          aria-label="Verbrauchter Urlaub"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(used * 100)}
        >
          <div className="progress__bar" style={{ width: `${used * 100}%` }} />
        </div>
      </div>

      {ledger.compensationDays !== null && (
        <div className="finding finding--hinweis vacation__note">
          <Icon name="info" className="finding__icon" />
          <div className="finding__body">
            <p className="finding__message">
              {ledger.compensationDays >= 0 ? (
                <>
                  <strong>Urlaubsersatzleistung: {days(ledger.compensationDays)} Tage.</strong>{' '}
                  Das Dienstverhältnis endet am {formatDateShort(employee.data.leftOn!)}; offener
                  Urlaub wird ausbezahlt.
                  <InfoTip>
                    <span>
                      Ausbezahlt werden der anteilige Anspruch des laufenden Urlaubsjahres und der
                      Rest aus früheren Jahren. Den Betrag errechnet die Lohnverrechnung.
                    </span>
                    <span className="infotip__ref">§ 10 UrlG</span>
                  </InfoTip>
                </>
              ) : (
                <>
                  <strong>{days(-ledger.compensationDays)} Tage mehr genommen als erworben.</strong>
                  <InfoTip>
                    <span>
                      Ein Rückersatz ist nur bei unberechtigtem vorzeitigem Austritt oder
                      verschuldeter Entlassung vorgesehen.
                    </span>
                    <span className="infotip__ref">§ 10 UrlG</span>
                  </InfoTip>
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {ledger.expiringDays > 0 && ledger.compensationDays === null && (
        <div className="finding finding--hinweis vacation__note">
          <Icon name="info" className="finding__icon" />
          <div className="finding__body">
            <p className="finding__message">
              <strong>{days(ledger.expiringDays)} Tage verjähren am {formatDateShort(ledger.periodEnd)}</strong>,
              wenn sie bis dahin nicht genommen werden.
              <InfoTip>
                <span>Verbrauchter Urlaub wird immer vom ältesten Anspruch abgezogen.</span>
                <span className="infotip__ref">§ 4 Abs 5 UrlG</span>
              </InfoTip>
            </p>
          </div>
        </div>
      )}

    </section>
  );
}
