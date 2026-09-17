/**
 * Betriebsstandard: die Vorbelegung für neue Verträge.
 *
 * Liegt in der Tabelle `settings` unter dem Schlüssel `contract_defaults`.
 * Lesen darf jeder Angemeldete — es sind Betriebsdaten, keine persönlichen —,
 * schreiben nur die Verwaltung. Das regelt RLS, nicht dieser Code.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AustrianState } from '@zeiterfassung/legal';
import type { Json } from './database.types';
import { supabase } from './supabase';

export interface ContractDefaults {
  collectiveWeeklyHours: number;
  collectiveAgreement: string;
  /** `''` heißt: noch nicht festgelegt. Muss vom Arbeitgeber gesetzt werden. */
  state: AustrianState | '';
  vacationDaysPerYear: number;

  flexEnabled: boolean;
  flexPeriodMonths: number;
  /**
   * `null` heißt: nicht entschieden. Kein stillschweigendes `false` — von
   * dieser Angabe hängt ab, ob die tägliche Normalarbeitszeit zehn oder zwölf
   * Stunden beträgt (§ 4b Abs 4 AZG), und damit bares Geld.
   */
  flexAllowsFullDayCompensation: boolean | null;
  flexFrameStart: string;
  flexFrameEnd: string;
  flexMaxCarryCreditMinutes: number;
  flexMaxCarryDebitMinutes: number;
}

export const FALLBACK_DEFAULTS: ContractDefaults = {
  collectiveWeeklyHours: 38.5,
  collectiveAgreement: '',
  state: '',
  vacationDaysPerYear: 25,
  flexEnabled: false,
  flexPeriodMonths: 1,
  flexAllowsFullDayCompensation: null,
  flexFrameStart: '06:00',
  flexFrameEnd: '20:00',
  flexMaxCarryCreditMinutes: 2400,
  flexMaxCarryDebitMinutes: 600,
};

const SETTINGS_KEY = 'contract_defaults';
/** 0 steht in `settings` für „gilt jahresunabhängig". */
const YEARLESS = 0;

/** Die Form, in der die Werte in der jsonb-Spalte liegen. */
type Stored = { [key: string]: Json | undefined };

function fromStored(value: Stored | null): ContractDefaults {
  if (!value) return FALLBACK_DEFAULTS;

  const pick = <T,>(key: string, fallback: T): T =>
    value[key] === undefined || value[key] === null ? fallback : (value[key] as T);

  return {
    collectiveWeeklyHours: Number(pick('collective_weekly_hours', 38.5)),
    collectiveAgreement: pick('collective_agreement', ''),
    state: pick('state', '') as AustrianState | '',
    vacationDaysPerYear: Number(pick('vacation_days_per_year', 25)),
    flexEnabled: pick('flex_enabled', false),
    flexPeriodMonths: Number(pick('flex_period_months', 1)),
    // Hier absichtlich ohne Fallback auf false: null bleibt null.
    flexAllowsFullDayCompensation:
      value['flex_allows_full_day_compensation'] === undefined
        ? null
        : (value['flex_allows_full_day_compensation'] as boolean | null),
    flexFrameStart: pick('flex_frame_start', '06:00'),
    flexFrameEnd: pick('flex_frame_end', '20:00'),
    flexMaxCarryCreditMinutes: Number(pick('flex_max_carry_credit_minutes', 2400)),
    flexMaxCarryDebitMinutes: Number(pick('flex_max_carry_debit_minutes', 600)),
  };
}

function toStored(defaults: ContractDefaults): Stored {
  return {
    collective_weekly_hours: defaults.collectiveWeeklyHours,
    collective_agreement: defaults.collectiveAgreement,
    state: defaults.state,
    vacation_days_per_year: defaults.vacationDaysPerYear,
    flex_enabled: defaults.flexEnabled,
    flex_period_months: defaults.flexPeriodMonths,
    flex_allows_full_day_compensation: defaults.flexAllowsFullDayCompensation,
    flex_frame_start: defaults.flexFrameStart,
    flex_frame_end: defaults.flexFrameEnd,
    flex_max_carry_credit_minutes: defaults.flexMaxCarryCreditMinutes,
    flex_max_carry_debit_minutes: defaults.flexMaxCarryDebitMinutes,
  };
}

export function useContractDefaults() {
  return useQuery({
    queryKey: ['contract-defaults'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ContractDefaults> => {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', SETTINGS_KEY)
        .eq('valid_year', YEARLESS)
        .maybeSingle();
      if (error) throw error;
      return fromStored((data?.value ?? null) as Stored | null);
    },
  });
}

export function useSaveContractDefaults() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (defaults: ContractDefaults) => {
      // Über eine Funktion statt per upsert: die Eindeutigkeit hängt seit der
      // Mandantentrennung an einem partiellen Index, den ein Konflikt-Ziel im
      // Client nicht ansprechen kann. Die Funktion bindet den Wert zugleich an
      // das Unternehmen des Aufrufers.
      const { error } = await supabase.rpc('save_contract_defaults', {
        p_value: toStored(defaults),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['contract-defaults'] });
    },
  });
}
