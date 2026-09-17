import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY fehlen. Werte aus `npm run db:start` in die .env übernehmen.',
  );
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export type Tables = Database['public']['Tables'];
export type ProfileRow = Tables['profiles']['Row'];
export type ContractRow = Tables['employment_contracts']['Row'];
export type ContractTypeRow = Tables['contract_types']['Row'];
export type TimeEntryRow = Tables['time_entries']['Row'];
export type AbsenceRow = Tables['absences']['Row'];
export type AuditRow = Tables['audit_log']['Row'];
