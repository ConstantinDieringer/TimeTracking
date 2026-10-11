import {
  addDays,
  checkGeringfuegigkeit,
  endOfIsoWeek,
  flexPeriodFor,
  formatDateShort,
  formatDuration,
  localDateOf,
  startOfIsoWeek,
  sumClassifications,
  checkSeventeenWeekAverage,
  AVERAGE_WINDOW_WEEKS,
  type RuleResult,
} from '@zeiterfassung/legal';
import { useMemo } from 'react';
import { Findings } from '../components/Findings';
import { InfoTip } from '../components/InfoTip';
import { Duration } from '../components/Num';
import { useContracts, useEmployee, useTimesheet } from '../lib/queries';
import { useSession } from '../lib/session';
import { contractOn } from '../lib/mapping';
import { collectFindings } from '../lib/timesheet';
import { Loading } from '../components/Loading';
import { Urlaubskonto } from '../components/Urlaubskonto';

export function Auswertung() {
  const { session } = useSession();
  const employeeId = session?.user.id;

  const today = localDateOf(new Date());
  const year = Number(today.slice(0, 4));
  const yearStart = `${year}-01-01`;

  // Der Durchrechnungszeitraum reicht 17 Wochen zurück und damit unter
  // Umständen ins Vorjahr — sonst wäre der Schnitt im Jänner falsch.
  const historyStart = startOfIsoWeek(addDays(today, -7 * AVERAGE_WINDOW_WEEKS));
  const from = historyStart < yearStart ? historyStart : yearStart;

  const employee = useEmployee(employeeId);
  const contracts = useContracts(employeeId);
  const { timesheet, isLoading } = useTimesheet({ employeeId, from, to: endOfIsoWeek(today) });

  const contract = contracts.data ? contractOn(contracts.data, today) : null;

  const yearDays = useMemo(
    () => timesheet?.days.filter((day) => day.date >= yearStart && day.date <= today) ?? [],
    [timesheet, yearStart, today],
  );

  const yearBalance = yearDays.reduce((sum, day) => sum + (day.account?.balanceMinutes ?? 0), 0);
  const yearWorked = yearDays.reduce((sum, day) => sum + day.work.workMinutes, 0);
  const yearTarget = yearDays.reduce((sum, day) => sum + (day.account?.targetMinutes ?? 0), 0);

  // Vergangene Arbeitstage ganz ohne Erfassung und ohne Abwesenheit. Sie sind
  // die häufigste Ursache eines auffällig negativen Saldos — und ein Saldo,
  // dessen Zustandekommen niemand erklären kann, ist wertlos.
  const unrecorded = yearDays.filter(
    (day) =>
      (day.account?.targetMinutes ?? 0) > 0 &&
      day.work.workMinutes === 0 &&
      !day.absence &&
      day.holidays.every((holiday) => !holiday.statutory),
  );
  const unrecordedMinutes = unrecorded.reduce(
    (sum, day) => sum + (day.account?.targetMinutes ?? 0),
    0,
  );

  const classifications = useMemo(
    () =>
      sumClassifications(
        (timesheet?.weeks ?? [])
          .filter((week) => week.weekStart >= yearStart)
          .map((week) => week.classification)
          .filter((value): value is NonNullable<typeof value> => value !== null),
      ),
    [timesheet, yearStart],
  );

  const average = timesheet
    ? checkSeventeenWeekAverage(timesheet.weeklyTotals, startOfIsoWeek(today))
    : null;


  const flexPeriod = contract?.flexTime ? flexPeriodFor(contract.flexTime, today) : null;
  const flexBalance = flexPeriod
    ? yearDays
        .filter((day) => day.date >= flexPeriod.start && day.date <= flexPeriod.end)
        .reduce((sum, day) => sum + (day.account?.balanceMinutes ?? 0), 0)
    : null;

  const extraFindings: RuleResult[] = [];
  if (average) extraFindings.push(average);
  if (contract) {
    const geringfuegig = checkGeringfuegigkeit(contract, `${today.slice(0, 7)}-01`);
    if (geringfuegig) extraFindings.push(geringfuegig);
  }

  const openFindings = timesheet
    ? collectFindings({ ...timesheet, days: yearDays }).filter(
        (finding) => finding.severity === 'verstoss',
      )
    : [];

  return (
    <main className="page">
      <div className="page__head">
        <div>
          <h1>Auswertung {year}</h1>
          <p className="page__subtitle">
            {contract
              ? `${contract.typeLabel} · ${contract.weeklyHours.toLocaleString('de-AT')} h vereinbart, ${contract.collectiveWeeklyHours.toLocaleString('de-AT')} h kollektivvertraglich`
              : 'Kein gültiger Vertrag hinterlegt'}
          </p>
        </div>
        <span className="meta">Stand {formatDateShort(today)}</span>
      </div>

      {isLoading && <Loading />}

      <section className="section">
        <div className="section__head">
          <h2>Zeitkonto</h2>
        </div>
        <dl className="figures">
          <div>
            <dt className="meta">Gearbeitet</dt>
            <dd>
              <Duration minutes={yearWorked} zeroAs="0:00" animate />
            </dd>
          </div>
          <div>
            <dt className="meta">Sollzeit</dt>
            <dd>
              <Duration minutes={yearTarget} muted zeroAs="0:00" animate />
            </dd>
          </div>
          <div>
            <dt className="meta">Saldo seit Jahresbeginn</dt>
            <dd>
              <Duration minutes={yearBalance} sign animate />
            </dd>
          </div>
          {flexPeriod && (
            <div>
              <dt className="meta">
                Gleitzeitsaldo
                {contract?.flexTime && (
                  <InfoTip>
                    <span>
                      Laufende Gleitzeitperiode {formatDateShort(flexPeriod.start)} bis{' '}
                      {formatDateShort(flexPeriod.end)}. Übertragbar sind höchstens{' '}
                      {formatDuration(contract.flexTime.maxCarryCredit)} h Guthaben und{' '}
                      {formatDuration(contract.flexTime.maxCarryDebit)} h Zeitschuld.
                    </span>
                    <span>
                      Die tägliche Normalarbeitszeit beträgt{' '}
                      {contract.flexTime.allowsFullDayCompensation
                        ? '12 Stunden, weil die Vereinbarung ganztägigen Verbrauch von Zeitguthaben zulässt.'
                        : '10 Stunden — die elfte Stunde ist Überstunde, weil die Vereinbarung keinen ganztägigen Verbrauch von Zeitguthaben vorsieht.'}
                    </span>
                    <span className="infotip__ref">§ 4b Abs 2 Z 3 und Abs 4 AZG</span>
                  </InfoTip>
                )}
              </dt>
              <dd>
                <Duration minutes={flexBalance ?? 0} sign animate />
              </dd>
            </div>
          )}
        </dl>

        {unrecorded.length > 0 && (
          <p className="figures__note">
            An {unrecorded.length}{' '}
            {unrecorded.length === 1 ? 'vergangenen Arbeitstag' : 'vergangenen Arbeitstagen'} ist
            weder Arbeitszeit noch eine Abwesenheit erfasst; das entspricht{' '}
            {formatDuration(unrecordedMinutes)} h des Saldos. Der erste ist der{' '}
            {formatDateShort(unrecorded[0]!.date)}.
            <InfoTip>
              <span>Ohne Nachtrag bleibt die gesetzlich vorgeschriebene Aufzeichnung lückenhaft.</span>
              <span className="infotip__ref">§ 26 AZG</span>
            </InfoTip>
          </p>
        )}

      </section>

      <section className="section">
        <div className="section__head">
          <h2>
            Mehrleistung im Jahr
            <InfoTip>
              <span>
                <strong>Mehrarbeit</strong> sind Stunden über der vereinbarten Teilzeit bis zur
                Normalarbeitszeit, mit 25 % Zuschlag. <strong>Überstunden</strong> liegen über der
                Normalarbeitszeit, mit 50 % Zuschlag. Die Spalte „Zuschlag als Zeit“ rechnet den
                Zuschlag in Stunden um.
              </span>
              {contract?.allIn && (
                <span>
                  All-in-Vertrag: Überstunden sind pauschal abgegolten. Aufzuzeichnen sind sie
                  trotzdem — nur so lässt sich prüfen, ob die Pauschale die geleisteten Stunden
                  deckt.
                </span>
              )}
              <span className="infotip__ref">§ 3, § 10 Abs 1, § 19d Abs 3a und § 26 AZG</span>
            </InfoTip>
          </h2>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th className="grow">Art</th>
                <th className="num">Zeit</th>
                <th className="num">Zuschlag als Zeit</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Normalarbeitszeit</td>
                <td>
                  <Duration minutes={classifications.normalMinutes} zeroAs="0:00" />
                </td>
                <td className="num num--muted">—</td>
              </tr>
              <tr>
                <td>
                  Mehrarbeit <span className="muted">· 25 %</span>
                </td>
                <td>
                  <Duration minutes={classifications.mehrarbeitMinutes} zeroAs="0:00" />
                </td>
                <td>
                  <Duration minutes={classifications.mehrarbeitSurchargeMinutes} zeroAs="0:00" />
                </td>
              </tr>
              <tr>
                <td>
                  Überstunden <span className="muted">· 50 %</span>
                </td>
                <td>
                  <Duration minutes={classifications.ueberstundenMinutes} zeroAs="0:00" />
                </td>
                <td>
                  <Duration minutes={classifications.ueberstundenSurchargeMinutes} zeroAs="0:00" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {employeeId && <Urlaubskonto employeeId={employeeId} />}

      <section className="section">
        <div className="section__head">
          <h2>
            Laufende Prüfungen
            <InfoTip>
              <span>
                Regeln, die sich nicht an einem einzelnen Tag prüfen lassen, sondern nur über
                mehrere Wochen — etwa der Durchschnitt von höchstens 48 Wochenstunden über 17
                Wochen. Sie werden mit jeder neuen Arbeitszeit neu berechnet.
              </span>
              <span className="infotip__ref">§ 9 Abs 4 AZG</span>
            </InfoTip>
          </h2>
        </div>
        <Findings findings={extraFindings} />
      </section>

      <section className="section">
        <div className="section__head">
          <h2>Offene Verstöße</h2>
          <span className="meta">seit Jahresbeginn</span>
        </div>
        <Findings
          findings={openFindings}
          showDate
          emptyText="Seit Jahresbeginn keine Verstöße aufgezeichnet."
        />
      </section>
    </main>
  );
}
