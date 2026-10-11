import { monthName, parseIsoDate, type Contract, type Employee } from '@zeiterfassung/legal';
import { useState } from 'react';
import { buildDayCsv, downloadCsv } from '../export/csv';
import { buildMonthJournal, downloadPdf } from '../export/pdf';
import type { Timesheet, TimesheetDay } from '../lib/timesheet';
import { InfoTip } from './InfoTip';

/**
 * Ausgabe der Aufzeichnungen.
 *
 * Steht bewusst auch dem Mitarbeiter selbst offen: nach § 26 Abs 8 AZG hat er
 * Anspruch darauf, seine Aufzeichnungen einmal im Monat kostenlos zu erhalten.
 * Ein Selbstbedienungs-Download erledigt das, ohne dass jemand nachfragen muss.
 */
export function Export({
  employee,
  personnelNumber,
  contract,
  month,
  days,
  timesheet,
  openingBalanceMinutes = 0,
}: {
  employee: Employee;
  personnelNumber?: string | null;
  contract: Contract | null;
  month: string;
  days: TimesheetDay[];
  timesheet: Timesheet;
  openingBalanceMinutes?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { year, month: monthNumber } = parseIsoDate(`${month}-01`);
  const slug = `${employee.displayName.replace(/[^\p{L}\d]+/gu, '-')}-${month}`;

  async function handlePdf() {
    if (!contract) {
      setError('Ohne gültigen Vertrag lässt sich kein Journal erstellen.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const balance = days.reduce((sum, day) => sum + (day.account?.balanceMinutes ?? 0), 0);
      const bytes = await buildMonthJournal({
        employee,
        personnelNumber,
        contractLabel: contract.typeLabel,
        weeklyHours: contract.weeklyHours,
        collectiveAgreement: contract.collectiveAgreement,
        flexEnabled: contract.flexTime !== null,
        openingBalanceMinutes,
        closingBalanceMinutes: openingBalanceMinutes + balance,
        month,
        days,
        timesheet,
      });
      downloadPdf(bytes, `Arbeitszeitaufzeichnung-${slug}.pdf`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Der Export ist fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="row">
        <button className="button" type="button" disabled={busy} onClick={handlePdf}>
          {busy ? 'Wird erstellt …' : `Monatsjournal ${monthName(monthNumber)} ${year} als PDF`}
        </button>
        <button
          className="button"
          type="button"
          onClick={() => downloadCsv(buildDayCsv(days), `Zeiten-${slug}.csv`)}
        >
          Als CSV für die Lohnverrechnung
        </button>
        <InfoTip>
          <span>
            Das PDF enthält Beginn, Ende und Dauer jedes Abschnitts sowie die Ruhepausen
            {contract?.flexTime ? ', bei Gleitzeit zusätzlich den Saldo' : ''}.
          </span>
          <span className="infotip__ref">
            § 26 Abs 1 AZG{contract?.flexTime ? ', § 26 Abs 5 AZG' : ''}
          </span>
        </InfoTip>
      </div>

      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}

    </div>
  );
}
