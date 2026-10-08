import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY fehlen. Werte aus `npm run db:start` in die .env übernehmen.',
  );
}

// Ein geheimer Schlüssel im Browser-Bündel wäre ein Totalschaden: er umgeht
// Row Level Security für alle Unternehmen. Lieber gar nicht starten.
if (anonKey.startsWith('sb_secret_') || jwtRole(anonKey) === 'service_role') {
  throw new Error(
    'VITE_SUPABASE_ANON_KEY enthält einen geheimen Schlüssel. Nur den öffentlichen anon- bzw. publishable-Schlüssel verwenden.',
  );
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

/** Die Rolle aus einem Legacy-Schlüssel im JWT-Format, sonst null. */
function jwtRole(key: string): string | null {
  const payload = key.split('.')[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return (JSON.parse(json) as { role?: string }).role ?? null;
  } catch {
    return null;
  }
}

export type Tables = Database['public']['Tables'];
export type ProfileRow = Tables['profiles']['Row'];
export type OrganizationRow = Tables['organizations']['Row'];
export type ContractRow = Tables['employment_contracts']['Row'];
export type ContractTypeRow = Tables['contract_types']['Row'];
export type TimeEntryRow = Tables['time_entries']['Row'];
export type AbsenceRow = Tables['absences']['Row'];
export type AuditRow = Tables['audit_log']['Row'];
