/**
 * Mitarbeiterübersicht für die Verwaltung.
 *
 * Bewusst vier Abfragen für alle Personen statt vier je Person: bei einem
 * kleinen Team ist das eine Abfrage pro Tabelle, und die Auswertung passiert
 * ohnehin im Browser.
 */

import { useQuery } from '@tanstack/react-query';
import {
  endOfMonth,
  localDateOf,
  startOfMonth,
  type Employee,
  type Minutes,
} from '@zeiterfassung/legal';
import { toAbsence, toContract, toEmployee, toSegment, contractOn } from './mapping';
import { supabase } from './supabase';
import { buildTimesheet, collectFindings } from './timesheet';

export interface OverviewRow {
  employee: Employee;
  active: boolean;
  role: string;
  contractLabel: string;
  weeklyHours: number | null;
  workedMinutes: Minutes;
  targetMinutes: Minutes;
  balanceMinutes: Minutes;
  violations: number;
  hints: number;
  /** Kein gültiger Vertrag am Stichtag — das ist ein Pflegefehler, kein Nullwert. */
  missingContract: boolean;
}

export function useOverview(enabled: boolean, month?: string) {
  const today = localDateOf(new Date());
  const anchor = month ? `${month}-01` : today;
  const from = startOfMonth(anchor);
  const to = endOfMonth(anchor);

  return useQuery({
    queryKey: ['overview', from, to],
    enabled,
    queryFn: async (): Promise<{ rows: OverviewRow[]; from: string; to: string }> => {
      const [profiles, contracts, entries, absences] = await Promise.all([
        supabase.from('profiles').select('*').order('display_name'),
        supabase.from('employment_contracts').select('*, contract_types(*)'),
        supabase.from('time_entries').select('*').gte('work_date', from).lte('work_date', to),
        supabase.from('absences').select('*').gte('absence_date', from).lte('absence_date', to),
      ]);

      const failed = [profiles, contracts, entries, absences].find((result) => result.error);
      if (failed?.error) throw failed.error;

      const rows = (profiles.data ?? []).map((profileRow) => {
        const employee = toEmployee(profileRow);

        const employeeContracts = (contracts.data ?? [])
          .filter((row) => row.employee_id === employee.id)
          .map((row) => {
            const { contract_types: type, ...contract } = row as typeof row & {
              contract_types: Parameters<typeof toContract>[1];
            };
            return toContract(contract, type ?? undefined);
          })
          .sort((a, b) => b.validFrom.localeCompare(a.validFrom));

        const timesheet = buildTimesheet({
          employee,
          contracts: employeeContracts,
          segments: (entries.data ?? [])
            .filter((row) => row.employee_id === employee.id)
            .map(toSegment),
          absences: (absences.data ?? [])
            .filter((row) => row.employee_id === employee.id)
            .map(toAbsence),
          from,
          to,
        });

        const findings = collectFindings(timesheet);
        const current = contractOn(employeeContracts, today);

        return {
          employee,
          active: profileRow.active,
          role: profileRow.role,
          contractLabel: current?.typeLabel ?? '—',
          weeklyHours: current?.weeklyHours ?? null,
          workedMinutes: timesheet.days.reduce((sum, day) => sum + day.work.workMinutes, 0),
          targetMinutes: timesheet.days.reduce(
            (sum, day) => sum + (day.account?.targetMinutes ?? 0),
            0,
          ),
          balanceMinutes: timesheet.days.reduce(
            (sum, day) => sum + (day.account?.balanceMinutes ?? 0),
            0,
          ),
          violations: findings.filter((finding) => finding.severity === 'verstoss').length,
          hints: findings.filter((finding) => finding.severity === 'hinweis').length,
          missingContract: current === null && profileRow.active,
        } satisfies OverviewRow;
      });

      return { rows, from, to };
    },
  });
}
