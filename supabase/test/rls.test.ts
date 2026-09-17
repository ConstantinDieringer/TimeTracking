/**
 * Prüfung der Row Level Security gegen die laufende lokale Instanz.
 *
 * Diese Tests sind der eigentliche Beleg dafür, dass die Anwendung ohne
 * eigenen Server auskommt: sie melden sich als echte Benutzer an und versuchen
 * genau das, was ein manipulierter Client versuchen würde. Was Postgres hier
 * verweigert, kann auch kein Frontend-Fehler aufreißen.
 *
 * Voraussetzung: `npm run db:start`. Lauf mit `npm run test:rls`.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54421';
// Der anon key der lokalen Instanz ist bei allen Supabase-Projekten derselbe
// Demo-Schlüssel; überschreibbar, falls die Instanz anders konfiguriert ist.
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const ANNA = '22222222-2222-2222-2222-222222222222';
const SOFIA = '33333333-3333-3333-3333-333333333333';

function anonClient(): SupabaseClient {
  return createClient(URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signIn(email: string): Promise<SupabaseClient> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({
    email,
    password: 'zeiterfassung',
  });
  if (error) throw new Error(`Anmeldung als ${email} fehlgeschlagen: ${error.message}`);
  return client;
}

let anna: SupabaseClient;
let sofia: SupabaseClient;
let admin: SupabaseClient;

beforeAll(async () => {
  [anna, sofia, admin] = await Promise.all([
    signIn('anna@example.at'),
    signIn('sofia@example.at'),
    signIn('admin@example.at'),
  ]);
}, 30_000);

describe('Mitarbeiter sehen nur die eigenen Zeiten', () => {
  it('liefert Anna ihre eigenen Einträge', async () => {
    const { data, error } = await anna.from('time_entries').select('id').eq('employee_id', ANNA);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  // Der entscheidende Fall: die Abfrage ist syntaktisch gültig und läuft
  // fehlerfrei durch — sie liefert nur nichts. Genau so soll RLS wirken.
  it('liefert Anna zu Sofias Einträgen nichts, statt einen Fehler zu werfen', async () => {
    const { data, error } = await anna.from('time_entries').select('id').eq('employee_id', SOFIA);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('liefert auch ohne Filter ausschließlich eigene Zeilen', async () => {
    const { data, error } = await anna.from('time_entries').select('employee_id');
    expect(error).toBeNull();
    expect(new Set(data!.map((row) => row.employee_id))).toEqual(new Set([ANNA]));
  });

  it('zeigt dem Admin alles', async () => {
    const { data, error } = await admin.from('time_entries').select('employee_id');
    expect(error).toBeNull();
    expect(new Set(data!.map((row) => row.employee_id)).size).toBeGreaterThan(1);
  });
});

describe('Fremde Zeiten lassen sich nicht ändern', () => {
  it('betrifft beim Ändern eines fremden Eintrags null Zeilen', async () => {
    const { data: sofiasEintrag } = await sofia.from('time_entries').select('id').limit(1).single();

    const { data, error } = await anna
      .from('time_entries')
      .update({ note: 'von Anna verändert' })
      .eq('id', sofiasEintrag!.id)
      .select();

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('weist das Anlegen eines Eintrags auf fremden Namen ab', async () => {
    const { error } = await anna.from('time_entries').insert({
      employee_id: SOFIA,
      work_date: '2026-09-21',
      started_at: '2026-09-21T08:00:00+02:00',
      ended_at: '2026-09-21T12:00:00+02:00',
    });
    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toContain('row-level security');
  });

  it('betrifft beim Löschen eines fremden Eintrags null Zeilen', async () => {
    const { data: sofiasEintrag } = await sofia.from('time_entries').select('id').limit(1).single();
    const { data, error } = await anna
      .from('time_entries')
      .delete()
      .eq('id', sofiasEintrag!.id)
      .select();
    expect(error).toBeNull();
    expect(data).toEqual([]);

    // Und der Eintrag steht noch.
    const { data: danach } = await sofia.from('time_entries').select('id').eq('id', sofiasEintrag!.id);
    expect(danach).toHaveLength(1);
  });
});

describe('Stammdaten bleiben dem Admin vorbehalten', () => {
  it('lässt Anna sich nicht selbst zur Administratorin machen', async () => {
    const { data } = await anna.from('profiles').update({ role: 'admin' }).eq('id', ANNA).select();
    expect(data ?? []).toEqual([]);

    const { data: danach } = await anna.from('profiles').select('role').eq('id', ANNA).single();
    expect(danach!.role).toBe('employee');
  });

  it('lässt Anna ihr Geburtsdatum nicht ändern', async () => {
    // Das Geburtsdatum entscheidet, ob das KJBG oder das AZG gilt — es ist
    // deshalb kein Profilfeld, sondern ein Stammdatum.
    const { data } = await anna
      .from('profiles')
      .update({ birth_date: '2010-01-01' })
      .eq('id', ANNA)
      .select();
    expect(data ?? []).toEqual([]);

    const { data: danach } = await anna.from('profiles').select('birth_date').eq('id', ANNA).single();
    expect(danach!.birth_date).toBe('1990-05-12');
  });

  it('lässt Anna ihren Vertrag lesen, aber nicht ändern', async () => {
    const { data: vertrag, error } = await anna
      .from('employment_contracts')
      .select('id, weekly_hours')
      .eq('employee_id', ANNA)
      .single();
    expect(error).toBeNull();
    expect(Number(vertrag!.weekly_hours)).toBe(38.5);

    const { data: geaendert } = await anna
      .from('employment_contracts')
      .update({ weekly_hours: 20 })
      .eq('id', vertrag!.id)
      .select();
    expect(geaendert ?? []).toEqual([]);
  });

  it('lässt den Admin den Vertrag ändern', async () => {
    const { data: vertrag } = await admin
      .from('employment_contracts')
      .select('id, collective_agreement')
      .eq('employee_id', ANNA)
      .single();

    const { data, error } = await admin
      .from('employment_contracts')
      .update({ collective_agreement: vertrag!.collective_agreement })
      .eq('id', vertrag!.id)
      .select();
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});

describe('Das Änderungsprotokoll ist unveränderlich', () => {
  it('zeigt Anna ihre eigene Historie', async () => {
    const { data, error } = await anna.from('audit_log').select('id, table_name, operation');
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it('zeigt Anna nichts aus fremder Historie', async () => {
    const { data } = await anna.from('audit_log').select('employee_id');
    expect(new Set(data!.map((row) => row.employee_id))).toEqual(new Set([ANNA]));
  });

  it('lässt niemanden einen Eintrag schreiben', async () => {
    for (const [name, client] of [
      ['Mitarbeiterin', anna],
      ['Admin', admin],
    ] as const) {
      const { error } = await client.from('audit_log').insert({
        table_name: 'time_entries',
        record_id: ANNA,
        operation: 'INSERT',
      });
      expect(error, `${name} durfte schreiben`).not.toBeNull();
    }
  });

  it('lässt auch den Admin nichts löschen', async () => {
    // Ein Protokoll, das sich bereinigen lässt, ist keines. Deshalb gibt es
    // bewusst keine Policy für DELETE — auch nicht für Administratoren.
    const vorher = await admin.from('audit_log').select('id', { count: 'exact', head: true });
    const { data } = await admin.from('audit_log').delete().gt('id', 0).select();
    expect(data ?? []).toEqual([]);

    const nachher = await admin.from('audit_log').select('id', { count: 'exact', head: true });
    expect(nachher.count).toBe(vorher.count);
  });

  it('protokolliert eine Korrektur mit Alt- und Neuwert', async () => {
    const { data: eintrag } = await anna
      .from('time_entries')
      .select('id, note')
      .eq('employee_id', ANNA)
      .limit(1)
      .single();

    const marke = `Korrektur ${Date.now()}`;
    await anna.from('time_entries').update({ note: marke }).eq('id', eintrag!.id);

    const { data: protokoll } = await anna
      .from('audit_log')
      .select('operation, old_data, new_data, changed_by')
      .eq('record_id', eintrag!.id)
      .eq('operation', 'UPDATE')
      .order('changed_at', { ascending: false })
      .limit(1)
      .single();

    expect(protokoll!.operation).toBe('UPDATE');
    expect((protokoll!.new_data as Record<string, unknown>).note).toBe(marke);
    expect((protokoll!.old_data as Record<string, unknown>).note).toBe(eintrag!.note);
    expect(protokoll!.changed_by).toBe(ANNA);

    await anna.from('time_entries').update({ note: eintrag!.note }).eq('id', eintrag!.id);
  });
});

describe('Ohne Anmeldung geht nichts', () => {
  it('liefert anonym keine Zeilen', async () => {
    const gast = anonClient();
    for (const tabelle of ['time_entries', 'profiles', 'absences', 'employment_contracts']) {
      const { data } = await gast.from(tabelle).select('*');
      expect(data ?? [], tabelle).toEqual([]);
    }
  });
});

describe('Die Datenbank hält die Erfassung konsistent', () => {
  it('weist überlappende Segmente ab', async () => {
    // Doppelt gezählte Arbeitszeit würde jede Grenze verfälschen — die
    // 12-Stunden-Grenze ebenso wie den Saldo.
    const { error } = await anna.from('time_entries').insert({
      employee_id: ANNA,
      work_date: '2026-09-14',
      started_at: '2026-09-14T09:00:00+02:00',
      ended_at: '2026-09-14T11:00:00+02:00',
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('überschneidet');
  });

  it('lässt nur ein laufendes Segment je Person zu', async () => {
    const { data: erstes, error: ersterFehler } = await anna
      .from('time_entries')
      .insert({
        employee_id: ANNA,
        work_date: '2026-09-25',
        started_at: '2026-09-25T08:00:00+02:00',
        ended_at: null,
      })
      .select()
      .single();
    expect(ersterFehler).toBeNull();

    const { error } = await anna.from('time_entries').insert({
      employee_id: ANNA,
      work_date: '2026-09-25',
      started_at: '2026-09-25T09:00:00+02:00',
      ended_at: null,
    });
    expect(error).not.toBeNull();

    await anna.from('time_entries').delete().eq('id', erstes!.id);
  });

  it('weist ein Ende vor dem Beginn ab', async () => {
    const { error } = await anna.from('time_entries').insert({
      employee_id: ANNA,
      work_date: '2026-09-26',
      started_at: '2026-09-26T12:00:00+02:00',
      ended_at: '2026-09-26T08:00:00+02:00',
    });
    expect(error).not.toBeNull();
  });

  it('weist zwei gleichzeitig gültige Verträge ab', async () => {
    // Welche Wochenstunden gälten dann am Dienstag? Die Frage darf gar nicht
    // erst entstehen.
    const { error } = await admin.from('employment_contracts').insert({
      employee_id: ANNA,
      contract_type_id: 'aaaaaaa1-0000-0000-0000-000000000002',
      valid_from: '2024-01-01',
      weekly_hours: 20,
      collective_weekly_hours: 38.5,
    });
    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toContain('employment_contracts_no_overlap');
  });
});
