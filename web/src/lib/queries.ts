/**
 * Datenzugriff. Jede Abfrage geht direkt an Supabase; die Zugriffstrennung
 * macht Postgres über Row Level Security, nicht dieser Code.
 */

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { addDays, localDateOf, type IsoDate } from '@zeiterfassung/legal';
import { useMemo } from 'react';
import { toAbsence, toContract, toEmployee, toSegment } from './mapping';
import { supabase, type AbsenceRow, type TimeEntryRow } from './supabase';
import { buildTimesheet, type Timesheet } from './timesheet';

// --- Stammdaten -------------------------------------------------------------

export function useEmployee(employeeId: string | undefined) {
  return useQuery({
    queryKey: ['employee', employeeId],
    enabled: Boolean(employeeId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', employeeId!)
        .single();
      if (error) throw error;
      return toEmployee(data);
    },
  });
}

export function useContracts(employeeId: string | undefined) {
  return useQuery({
    queryKey: ['contracts', employeeId],
    enabled: Boolean(employeeId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employment_contracts')
        .select('*, contract_types(*)')
        .eq('employee_id', employeeId!)
        .order('valid_from', { ascending: false });
      if (error) throw error;
      return data.map((row) => {
        const { contract_types: type, ...contract } = row as typeof row & {
          contract_types: Parameters<typeof toContract>[1];
        };
        return toContract(contract, type ?? undefined);
      });
    },
  });
}

export function useContractTypes() {
  return useQuery({
    queryKey: ['contract-types'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contract_types')
        .select('*')
        .eq('archived', false)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });
}

export function useAllEmployees(enabled: boolean) {
  return useQuery({
    queryKey: ['employees'],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('display_name');
      if (error) throw error;
      return data;
    },
  });
}

// --- Zeiten -----------------------------------------------------------------

export function useTimeEntries(employeeId: string | undefined, from: IsoDate, to: IsoDate) {
  return useQuery({
    queryKey: ['time-entries', employeeId, from, to],
    enabled: Boolean(employeeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_entries')
        .select('*')
        .eq('employee_id', employeeId!)
        .gte('work_date', from)
        .lte('work_date', to)
        .order('started_at');
      if (error) throw error;
      return data as TimeEntryRow[];
    },
  });
}

export function useAbsences(employeeId: string | undefined, from: IsoDate, to: IsoDate) {
  return useQuery({
    queryKey: ['absences', employeeId, from, to],
    enabled: Boolean(employeeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('absences')
        .select('*')
        .eq('employee_id', employeeId!)
        .gte('absence_date', from)
        .lte('absence_date', to)
        .order('absence_date');
      if (error) throw error;
      return data as AbsenceRow[];
    },
  });
}

/** Das laufende Segment, falls gerade gestempelt wird. */
export function useOpenEntry(employeeId: string | undefined) {
  return useQuery({
    queryKey: ['open-entry', employeeId],
    enabled: Boolean(employeeId),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_entries')
        .select('*')
        .eq('employee_id', employeeId!)
        .is('ended_at', null)
        .maybeSingle();
      if (error) throw error;
      return (data as TimeEntryRow | null) ?? null;
    },
  });
}

// --- Zusammengesetzte Auswertung -------------------------------------------

export interface UseTimesheetOptions {
  employeeId: string | undefined;
  from: IsoDate;
  to: IsoDate;
  /** Sekundengenaue Neuberechnung, solange ein Segment läuft. */
  now?: Date;
}

export function useTimesheet({
  employeeId,
  from,
  to,
  now,
}: UseTimesheetOptions): { timesheet: Timesheet | null; isLoading: boolean; error: unknown } {
  // Einen Tag früher laden, damit die Ruhezeit des ersten angezeigten Tages
  // gegen das Ende des Vortags gemessen werden kann.
  const fetchFrom = addDays(from, -1);
  // Zwei Tage länger, damit die Wochenruhe bis in die Folgewoche reicht.
  const fetchTo = addDays(to, 2);

  const employee = useEmployee(employeeId);
  const contracts = useContracts(employeeId);
  const entries = useTimeEntries(employeeId, fetchFrom, fetchTo);
  const absences = useAbsences(employeeId, fetchFrom, fetchTo);

  const timesheet = useMemo(() => {
    if (!employee.data || !contracts.data || !entries.data || !absences.data) return null;
    return buildTimesheet({
      employee: employee.data,
      contracts: contracts.data,
      segments: entries.data.map(toSegment),
      absences: absences.data.map(toAbsence),
      from: fetchFrom,
      to: fetchTo,
      now,
    });
  }, [employee.data, contracts.data, entries.data, absences.data, fetchFrom, fetchTo, now]);

  return {
    timesheet,
    isLoading:
      employee.isLoading || contracts.isLoading || entries.isLoading || absences.isLoading,
    error: employee.error ?? contracts.error ?? entries.error ?? absences.error,
  };
}

// --- Änderungen -------------------------------------------------------------

function invalidateTimes(client: ReturnType<typeof useQueryClient>) {
  void client.invalidateQueries({ queryKey: ['time-entries'] });
  void client.invalidateQueries({ queryKey: ['open-entry'] });
}

export interface StampInput {
  employeeId: string;
  kind: 'work' | 'break';
}

/**
 * Stempeln. Ein laufendes Segment wird beendet, bevor ein neues beginnt —
 * die Datenbank lässt ohnehin nur eines offen, aber so bleibt der Ablauf
 * für den Benutzer ein einziger Klick.
 */
export function useStamp() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async ({ employeeId, kind }: StampInput) => {
      const now = new Date();

      const { data: open } = await supabase
        .from('time_entries')
        .select('id')
        .eq('employee_id', employeeId)
        .is('ended_at', null)
        .maybeSingle();

      if (open) {
        const { error } = await supabase
          .from('time_entries')
          .update({ ended_at: now.toISOString() })
          .eq('id', open.id);
        if (error) throw error;
      }

      const { error } = await supabase.from('time_entries').insert({
        employee_id: employeeId,
        work_date: localDateOf(now),
        started_at: now.toISOString(),
        ended_at: null,
        kind,
        source: 'stamped',
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateTimes(client),
  });
}

export function useStopStamp() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (entryId: string) => {
      const { error } = await supabase
        .from('time_entries')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', entryId);
      if (error) throw error;
    },
    onSuccess: () => invalidateTimes(client),
  });
}

export interface SaveSegmentInput {
  id?: string;
  employeeId: string;
  date: IsoDate;
  startedAt: string;
  endedAt: string;
  kind: 'work' | 'break' | 'travel' | 'oncall';
  note?: string | null;
}

export function useSaveSegment() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (input: SaveSegmentInput) => {
      const row = {
        employee_id: input.employeeId,
        work_date: input.date,
        started_at: input.startedAt,
        ended_at: input.endedAt,
        kind: input.kind,
        // Jede Eingabe von Hand wird als solche gekennzeichnet — die
        // Aufzeichnung soll erkennen lassen, was gestempelt und was
        // nachgetragen wurde.
        source: 'manual' as const,
        note: input.note ?? null,
      };

      if (input.id) {
        const { error } = await supabase.from('time_entries').update(row).eq('id', input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('time_entries').insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => invalidateTimes(client),
  });
}

export function useDeleteSegment() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (entryId: string) => {
      const { error } = await supabase.from('time_entries').delete().eq('id', entryId);
      if (error) throw error;
    },
    onSuccess: () => invalidateTimes(client),
  });
}

export interface SaveAbsenceInput {
  employeeId: string;
  date: IsoDate;
  kind: AbsenceKindValue;
  halfDay: boolean;
  note?: string | null;
  announcedOn?: IsoDate | null;
}

type AbsenceKindValue =
  | 'urlaub'
  | 'krankenstand'
  | 'pflegefreistellung'
  | 'zeitausgleich'
  | 'persoenlicher_feiertag'
  | 'sonderurlaub'
  | 'dienstfreistellung'
  | 'unbezahlt';

export function useSaveAbsence() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (input: SaveAbsenceInput) => {
      const { error } = await supabase.from('absences').upsert(
        {
          employee_id: input.employeeId,
          absence_date: input.date,
          kind: input.kind,
          half_day: input.halfDay,
          note: input.note ?? null,
          announced_on: input.announcedOn ?? null,
        },
        { onConflict: 'employee_id,absence_date,kind' },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['absences'] });
    },
  });
}

export function useDeleteAbsence() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (absenceId: string) => {
      const { error } = await supabase.from('absences').delete().eq('id', absenceId);
      if (error) throw error;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['absences'] });
    },
  });
}

// --- Änderungsprotokoll -----------------------------------------------------

export function useAuditLog(employeeId: string | undefined, limit = 100) {
  return useQuery({
    queryKey: ['audit-log', employeeId, limit],
    enabled: Boolean(employeeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .eq('employee_id', employeeId!)
        .order('changed_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
  });
}

export type { UseQueryResult };
