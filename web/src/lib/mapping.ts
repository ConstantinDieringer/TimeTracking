/**
 * Übersetzung zwischen den Datenbankzeilen und den Typen der Rechtslogik.
 *
 * Das Paket `@zeiterfassung/legal` kennt Supabase absichtlich nicht. Diese
 * Datei ist die einzige Stelle, an der beide Welten aufeinandertreffen.
 */

import type {
  Absence,
  AbsenceKind,
  AustrianState,
  Contract,
  ContractCategory,
  Employee,
  Minutes,
  SegmentKind,
  TimeSegment,
  Weekday,
} from '@zeiterfassung/legal';
import type { AbsenceRow, ContractRow, ContractTypeRow, ProfileRow, TimeEntryRow } from './supabase';

export function toEmployee(row: ProfileRow): Employee {
  return {
    id: row.id,
    displayName: row.display_name,
    personnelNumber: row.personnel_number,
    birthDate: row.birth_date,
    hiredOn: row.hired_on,
    leftOn: row.left_on,
    state: row.state as AustrianState,
  };
}

export function toContract(row: ContractRow, type: ContractTypeRow | undefined): Contract {
  const targets = row.daily_target_minutes ?? [];
  const dailyTargetMinutes = {
    1: targets[0] ?? 0,
    2: targets[1] ?? 0,
    3: targets[2] ?? 0,
    4: targets[3] ?? 0,
    5: targets[4] ?? 0,
    6: targets[5] ?? 0,
    7: targets[6] ?? 0,
  } as Record<Weekday, Minutes>;

  return {
    id: row.id,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    category: (type?.category ?? 'vollzeit') as ContractCategory,
    typeLabel: type?.label ?? 'Unbekannt',
    weeklyHours: Number(row.weekly_hours),
    collectiveWeeklyHours: Number(row.collective_weekly_hours),
    collectiveAgreement: row.collective_agreement,
    dailyTargetMinutes,
    flexTime: row.flex_enabled
      ? {
          periodMonths: row.flex_period_months,
          periodAnchor: row.flex_period_anchor ?? row.valid_from,
          allowsFullDayCompensation: row.flex_allows_full_day_compensation,
          frameStart: (row.flex_frame_start ?? '06:00:00').slice(0, 5),
          frameEnd: (row.flex_frame_end ?? '20:00:00').slice(0, 5),
          maxCarryCredit: row.flex_max_carry_credit_minutes,
          maxCarryDebit: row.flex_max_carry_debit_minutes,
        }
      : null,
    allIn: row.all_in,
    vacationDaysPerYear: Number(row.vacation_days_per_year),
    exemptFromAzg: row.exempt_from_azg,
    nightWork: row.night_work,
    shiftWork: row.shift_work,
    monthlyGrossCents: row.monthly_gross_cents,
  };
}

export function toSegment(row: TimeEntryRow): TimeSegment {
  return {
    id: row.id,
    date: row.work_date,
    start: row.started_at,
    end: row.ended_at,
    kind: row.kind as SegmentKind,
    source: row.source as TimeSegment['source'],
    note: row.note,
  };
}

export function toAbsence(row: AbsenceRow): Absence {
  return {
    id: row.id,
    date: row.absence_date,
    kind: row.kind as AbsenceKind,
    halfDay: row.half_day,
    note: row.note,
  };
}

/** Der Vertrag, der an diesem Tag galt — nicht der aktuelle. */
export function contractOn(contracts: readonly Contract[], date: string): Contract | null {
  return (
    contracts.find(
      (contract) => contract.validFrom <= date && (contract.validTo === null || contract.validTo >= date),
    ) ?? null
  );
}
