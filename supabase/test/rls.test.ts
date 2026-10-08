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

// Nur für das Anlegen eines Testbenutzers wie über die Registrierung. Der
// service_role-Schlüssel der lokalen Instanz ist ebenfalls ein Demo-Schlüssel.
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qJwcBOJ7I0J0GpC2lPZnXE';

/** Inhaberin der Honestas Capital GmbH. */
const MARLENE = '11111111-1111-1111-1111-111111111111';
const ANNA = '22222222-2222-2222-2222-222222222222';
const SOFIA = '33333333-3333-3333-3333-333333333333';
/** Zweiter Administrator der Honestas Capital GmbH, nicht Inhaber. */
const MARKUS = '77777777-7777-7777-7777-777777777777';
/** Mitarbeiterin des zweiten Unternehmens. */
const LISA = '66666666-6666-6666-6666-666666666666';

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
/** Administrator des zweiten Unternehmens — die Gegenprobe. */
let fremderAdmin: SupabaseClient;
/** Administrator ohne Inhaberschaft. */
let markus: SupabaseClient;

beforeAll(async () => {
  [anna, sofia, admin, fremderAdmin, markus] = await Promise.all([
    signIn('anna@example.at'),
    signIn('sofia@example.at'),
    signIn('admin@example.at'),
    signIn('chef@musterbau.at'),
    signIn('markus@example.at'),
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

/**
 * Die Prüfung, auf die es bei mehreren Kunden in einer Datenbank ankommt.
 *
 * Marlene Hofer ist Administratorin der Honestas Capital GmbH, Bernhard Gruber
 * der Musterbau GmbH. Beide haben in ihrem Betrieb volle Rechte — und dürfen
 * voneinander nichts sehen. Ein Admin ist kein Superuser, sondern Admin
 * genau eines Unternehmens.
 */
describe('Unternehmen sehen einander nicht', () => {
  it('zeigt jedem Admin nur die eigene Belegschaft', async () => {
    const eigene = await admin.from('profiles').select('display_name');
    const fremde = await fremderAdmin.from('profiles').select('display_name');

    const namenA = new Set(eigene.data!.map((row) => row.display_name));
    const namenB = new Set(fremde.data!.map((row) => row.display_name));

    expect(namenA).toContain('Anna Berger');
    expect(namenA).not.toContain('Lisa Mayr');
    expect(namenB).toContain('Lisa Mayr');
    expect(namenB).not.toContain('Anna Berger');

    // Keine einzige Person in beiden Mengen.
    expect([...namenA].filter((name) => namenB.has(name))).toEqual([]);
  });

  it('liefert dem fremden Admin keine Zeiten des anderen Unternehmens', async () => {
    const { data, error } = await fremderAdmin
      .from('time_entries')
      .select('id')
      .eq('employee_id', ANNA);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('liefert auch ohne Filter ausschließlich Zeiten des eigenen Unternehmens', async () => {
    const { data } = await fremderAdmin.from('time_entries').select('employee_id');
    expect(data!.length).toBeGreaterThan(0);
    expect(new Set(data!.map((row) => row.employee_id))).toEqual(new Set([LISA]));
  });

  it('lässt den fremden Admin keine Zeit auf fremdem Namen anlegen', async () => {
    const { error } = await fremderAdmin.from('time_entries').insert({
      employee_id: ANNA,
      work_date: '2026-09-21',
      started_at: '2026-09-21T08:00:00+02:00',
      ended_at: '2026-09-21T12:00:00+02:00',
    });
    expect(error).not.toBeNull();
  });

  it('lässt den fremden Admin kein fremdes Profil ändern', async () => {
    const { data } = await fremderAdmin
      .from('profiles')
      .update({ display_name: 'Übernommen' })
      .eq('id', ANNA)
      .select();
    expect(data ?? []).toEqual([]);
  });

  it('trennt auch das Änderungsprotokoll', async () => {
    const { data } = await fremderAdmin.from('audit_log').select('employee_id');
    const fremdeEintraege = (data ?? []).filter((row) =>
      [ANNA, SOFIA].includes(row.employee_id as string),
    );
    expect(fremdeEintraege).toEqual([]);
  });

  it('trennt die Vertragsarten', async () => {
    const eigene = await admin.from('contract_types').select('id, label');
    const fremde = await fremderAdmin.from('contract_types').select('id, label');

    // Beide Unternehmen haben eine Vertragsart „Vollzeit" — aber nicht dieselbe.
    expect(eigene.data!.some((row) => row.label === 'Vollzeit')).toBe(true);
    expect(fremde.data!.some((row) => row.label === 'Vollzeit')).toBe(true);

    const idsA = new Set(eigene.data!.map((row) => row.id));
    const idsB = fremde.data!.map((row) => row.id);
    expect(idsB.filter((id) => idsA.has(id))).toEqual([]);
  });

  it('gibt jedem Unternehmen einen eigenen Betriebsstandard', async () => {
    const eigener = await admin
      .from('settings')
      .select('value')
      .eq('key', 'contract_defaults')
      .maybeSingle();
    const fremder = await fremderAdmin
      .from('settings')
      .select('value')
      .eq('key', 'contract_defaults')
      .maybeSingle();

    expect(eigener.data).not.toBeNull();
    expect(fremder.data).not.toBeNull();

    // Änderung beim einen darf beim anderen nichts bewirken.
    const { error } = await admin.rpc('save_contract_defaults', {
      p_value: { collective_weekly_hours: 41, state: 'W' },
    });
    expect(error).toBeNull();

    const nachher = await fremderAdmin
      .from('settings')
      .select('value')
      .eq('key', 'contract_defaults')
      .maybeSingle();
    expect((nachher.data!.value as Record<string, unknown>).collective_weekly_hours).not.toBe(41);
  });

  it('teilt die gesetzlichen Werte, ohne sie änderbar zu machen', async () => {
    // Die Geringfügigkeitsgrenze gilt für ganz Österreich und hängt an keinem
    // Unternehmen. Lesen dürfen sie alle, ändern niemand.
    for (const [name, client] of [
      ['eigener Admin', admin],
      ['fremder Admin', fremderAdmin],
    ] as const) {
      const { data } = await client
        .from('settings')
        .select('value')
        .eq('key', 'geringfuegigkeitsgrenze_cents')
        .eq('valid_year', 2026)
        .maybeSingle();
      expect(data?.value, name).toBe(55110);
    }

    const { data: geaendert } = await admin
      .from('settings')
      .update({ value: 99999 })
      .eq('key', 'geringfuegigkeitsgrenze_cents')
      .eq('valid_year', 2026)
      .select();
    expect(geaendert ?? []).toEqual([]);
  });

  it('lässt niemanden eine Person in ein fremdes Unternehmen verschieben', async () => {
    const { data: fremdeOrg } = await fremderAdmin
      .from('profiles')
      .select('organization_id')
      .eq('id', LISA)
      .single();

    // Der eigene Admin versucht, Anna in das andere Unternehmen umzuhängen.
    const { data } = await admin
      .from('profiles')
      .update({ organization_id: fremdeOrg!.organization_id })
      .eq('id', ANNA)
      .select();
    expect(data ?? []).toEqual([]);

    const { data: danach } = await admin
      .from('profiles')
      .select('organization_id')
      .eq('id', ANNA)
      .single();
    expect(danach!.organization_id).not.toBe(fremdeOrg!.organization_id);
  });

  it('zeigt jedem nur das eigene Unternehmen', async () => {
    const eigene = await admin.from('organizations').select('name');
    const fremde = await fremderAdmin.from('organizations').select('name');

    expect(eigene.data!.map((row) => row.name)).toEqual(['Honestas Capital GmbH']);
    expect(fremde.data!.map((row) => row.name)).toEqual(['Musterbau GmbH']);
  });
});

/**
 * Rolle und Unternehmen vergibt nur der Server. Was ein Benutzer bei der
 * Registrierung selbst mitschickt (`signUp({ options: { data } })`), landet in
 * user_metadata — und daraus darf nichts als der Name übernommen werden.
 */
describe('Die Registrierung vergibt keine Rechte', () => {
  it('ordnet ein Konto mit selbst behaupteter Admin-Rolle keinem Unternehmen zu', async () => {
    const service = createClient(URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: honestas } = await admin.from('organizations').select('id').single();

    const email = `angreifer-${Date.now()}@example.com`;
    // Derselbe Trigger wie bei signUp: user_metadata ist genau das, was ein
    // Angreifer bei der Registrierung frei befüllen kann.
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email,
      password: 'zeiterfassung',
      email_confirm: true,
      user_metadata: {
        display_name: 'Angreifer',
        role: 'admin',
        organization_id: honestas!.id,
        hired_on: '2000-01-01',
      },
    });
    expect(createError).toBeNull();

    try {
      const angreifer = await signIn(email);

      const { data: eigenes } = await angreifer
        .from('profiles')
        .select('role, organization_id, hired_on')
        .single();
      expect(eigenes!.role).toBe('employee');
      expect(eigenes!.organization_id).toBeNull();
      expect(eigenes!.hired_on).not.toBe('2000-01-01');

      const { data: istAdmin } = await angreifer.rpc('is_admin');
      expect(istAdmin).toBe(false);

      const { data: profile } = await angreifer.from('profiles').select('id');
      expect(profile).toHaveLength(1);
      const { data: zeiten } = await angreifer.from('time_entries').select('id');
      expect(zeiten).toEqual([]);
      const { data: firmen } = await angreifer.from('organizations').select('id');
      expect(firmen).toEqual([]);
    } finally {
      await service.auth.admin.deleteUser(created!.user!.id);
    }
  });

  it('lässt angemeldete Benutzer kein Unternehmen anlegen und niemanden zuordnen', async () => {
    const anlegen = await admin.rpc('create_organization', {
      p_name: 'Eigenmächtig GmbH',
      p_owner_email: 'anna@example.at',
    });
    expect(anlegen.error).not.toBeNull();

    const zuordnen = await fremderAdmin.rpc('assign_to_organization', {
      p_email: 'anna@example.at',
      p_organization: (await fremderAdmin.from('organizations').select('id').single()).data!.id,
      p_role: 'employee',
    });
    expect(zuordnen.error).not.toBeNull();
  });
});

/**
 * Marlene Hofer ist Inhaberin der Honestas Capital GmbH, Markus Leitner
 * gewöhnlicher Administrator. Was immer Administratoren untereinander tun:
 * die Inhaberin kommt immer hinein.
 */
describe('Der Inhaber ist geschützt', () => {
  async function ownerOfHonestas(): Promise<string> {
    const { data } = await admin.from('organizations').select('owner_id').single();
    return data!.owner_id as string;
  }

  it('führt Marlene als Inhaberin', async () => {
    expect(await ownerOfHonestas()).toBe(MARLENE);
    const { data } = await admin.rpc('is_owner');
    expect(data).toBe(true);
    const { data: nichtInhaber } = await markus.rpc('is_owner');
    expect(nichtInhaber).toBe(false);
  });

  it('lässt einen Administrator den Inhaber nicht herabstufen', async () => {
    const { error } = await markus
      .from('profiles')
      .update({ role: 'employee' })
      .eq('id', MARLENE)
      .select();
    expect(error).not.toBeNull();

    const { data } = await admin.from('profiles').select('role').eq('id', MARLENE).single();
    expect(data!.role).toBe('admin');
  });

  it('lässt einen Administrator den Inhaber nicht deaktivieren', async () => {
    const { error } = await markus
      .from('profiles')
      .update({ active: false })
      .eq('id', MARLENE)
      .select();
    expect(error).not.toBeNull();

    const { data } = await admin.from('profiles').select('active').eq('id', MARLENE).single();
    expect(data!.active).toBe(true);
  });

  it('lässt auch den Inhaber sich nicht selbst herabstufen', async () => {
    const { error } = await admin.from('profiles').update({ role: 'employee' }).eq('id', MARLENE);
    expect(error).not.toBeNull();
  });

  it('lässt Administratoren befördern und herabstufen', async () => {
    const befoerdert = await markus
      .from('profiles')
      .update({ role: 'admin' })
      .eq('id', SOFIA)
      .select('role');
    expect(befoerdert.error).toBeNull();
    expect(befoerdert.data).toEqual([{ role: 'admin' }]);

    const herabgestuft = await admin
      .from('profiles')
      .update({ role: 'employee' })
      .eq('id', SOFIA)
      .select('role');
    expect(herabgestuft.error).toBeNull();
    expect(herabgestuft.data).toEqual([{ role: 'employee' }]);
  });

  it('lässt Administratoren kein Profil löschen', async () => {
    // Ein gelöschtes Profil nähme alle Zeiten mit, die nach § 26 AZG
    // aufzubewahren sind.
    const { data } = await admin.from('profiles').delete().eq('id', SOFIA).select();
    expect(data ?? []).toEqual([]);

    const { data: danach } = await admin.from('profiles').select('id').eq('id', SOFIA);
    expect(danach).toHaveLength(1);
  });

  it('lässt nur den Inhaber die Inhaberschaft übertragen', async () => {
    const durchAdmin = await markus.rpc('transfer_ownership', { p_new_owner: MARKUS });
    expect(durchAdmin.error).not.toBeNull();

    const durchMitarbeiterin = await anna.rpc('transfer_ownership', { p_new_owner: ANNA });
    expect(durchMitarbeiterin.error).not.toBeNull();

    expect(await ownerOfHonestas()).toBe(MARLENE);
  });

  it('überträgt nicht in ein fremdes Unternehmen', async () => {
    const { error } = await admin.rpc('transfer_ownership', { p_new_owner: LISA });
    expect(error).not.toBeNull();
    expect(await ownerOfHonestas()).toBe(MARLENE);
  });

  it('überträgt die Inhaberschaft und schützt danach den neuen Inhaber', async () => {
    const hin = await admin.rpc('transfer_ownership', { p_new_owner: MARKUS });
    expect(hin.error).toBeNull();

    try {
      expect(await ownerOfHonestas()).toBe(MARKUS);

      // Marlene bleibt Administratorin, ist aber nicht mehr geschützt —
      // und kann ihrerseits Markus nichts mehr anhaben.
      const { data: marlene } = await admin.from('profiles').select('role').eq('id', MARLENE).single();
      expect(marlene!.role).toBe('admin');

      const angriff = await admin.from('profiles').update({ role: 'employee' }).eq('id', MARKUS);
      expect(angriff.error).not.toBeNull();
    } finally {
      const zurueck = await markus.rpc('transfer_ownership', { p_new_owner: MARLENE });
      expect(zurueck.error).toBeNull();
    }

    expect(await ownerOfHonestas()).toBe(MARLENE);
  });
});

describe('Stammdaten und Inhaberschaft sind protokolliert', () => {
  it('protokolliert eine Änderung an Stammdaten mit Alt- und Neuwert', async () => {
    const { data: vorher } = await admin
      .from('profiles')
      .select('personnel_number')
      .eq('id', SOFIA)
      .single();
    const marke = `P-T${Date.now() % 100000}`;

    try {
      await admin.from('profiles').update({ personnel_number: marke }).eq('id', SOFIA);

      const { data: protokoll } = await admin
        .from('audit_log')
        .select('old_data, new_data, changed_by')
        .eq('table_name', 'profiles')
        .eq('record_id', SOFIA)
        .order('changed_at', { ascending: false })
        .limit(1)
        .single();
      expect((protokoll!.old_data as Record<string, unknown>).personnel_number).toBe(
        vorher!.personnel_number,
      );
      expect((protokoll!.new_data as Record<string, unknown>).personnel_number).toBe(marke);
      expect(protokoll!.changed_by).toBe(MARLENE);

      // Sofia sieht die Änderung an ihren eigenen Stammdaten ebenfalls.
      const { data: eigene } = await sofia
        .from('audit_log')
        .select('id')
        .eq('table_name', 'profiles')
        .eq('record_id', SOFIA);
      expect(eigene!.length).toBeGreaterThan(0);
    } finally {
      await admin
        .from('profiles')
        .update({ personnel_number: vorher!.personnel_number })
        .eq('id', SOFIA);
    }
  });

  it('protokolliert Änderungen am Unternehmen nur für die Verwaltung sichtbar', async () => {
    const { data: firma } = await admin.from('organizations').select('id').single();

    const fuerAdmin = await admin
      .from('audit_log')
      .select('id')
      .eq('table_name', 'organizations')
      .eq('record_id', firma!.id);
    expect(fuerAdmin.data!.length).toBeGreaterThan(0);

    const fuerAnna = await anna
      .from('audit_log')
      .select('id')
      .eq('table_name', 'organizations');
    expect(fuerAnna.data).toEqual([]);
  });
});

describe('Datenschutzinformation', () => {
  it('lässt die Verwaltung den Text setzen und alle im Unternehmen lesen', async () => {
    const text = `Datenschutzinformation Test ${Date.now()}`;
    const { error } = await markus.rpc('save_privacy_notice', { p_text: text });
    expect(error).toBeNull();

    const { data } = await anna
      .from('settings')
      .select('value')
      .eq('key', 'privacy_notice')
      .maybeSingle();
    expect(data!.value).toBe(text);

    // Das andere Unternehmen sieht den Text nicht.
    const fremd = await fremderAdmin
      .from('settings')
      .select('value')
      .eq('key', 'privacy_notice')
      .maybeSingle();
    expect(fremd.data?.value).not.toBe(text);
  });

  it('lässt Mitarbeiter den Text nicht ändern', async () => {
    const { error } = await anna.rpc('save_privacy_notice', { p_text: 'überschrieben' });
    expect(error).not.toBeNull();
  });
});

/**
 * Speicherbegrenzung: nach Ablauf der Frist wird eine ausgeschiedene Person
 * vollständig gelöscht — Aufzeichnungen, Protokoll, Zugang. Das darf nur der
 * Betreiber, und nur für Fällige.
 */
describe('Löschung nach Ablauf der Aufbewahrungsfrist', () => {
  const service = () =>
    createClient(URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

  it('bleibt angemeldeten Benutzern verschlossen', async () => {
    expect((await admin.rpc('retention_overview')).error).not.toBeNull();
    expect((await admin.rpc('purge_employee', { p_employee: SOFIA })).error).not.toBeNull();
  });

  it('löscht nur Fällige und nie aktive Personen', async () => {
    const { error } = await service().rpc('purge_employee', { p_employee: SOFIA });
    expect(error).not.toBeNull();
  });

  it('löscht eine fällige Person mit allen Aufzeichnungen', async () => {
    const svc = service();
    const { data: firma } = await fremderAdmin.from('organizations').select('id').single();

    const { data: created, error: createError } = await svc.auth.admin.createUser({
      email: `ausgeschieden-${Date.now()}@example.com`,
      password: 'zeiterfassung',
      email_confirm: true,
      user_metadata: { display_name: 'Ausgeschieden' },
    });
    expect(createError).toBeNull();
    const id = created!.user!.id;

    try {
      await svc
        .from('profiles')
        .update({ organization_id: firma!.id, hired_on: '2010-01-01' })
        .eq('id', id);
      const { error: entryError } = await svc.from('time_entries').insert({
        employee_id: id,
        work_date: '2015-03-02',
        started_at: '2015-03-02T08:00:00+01:00',
        ended_at: '2015-03-02T12:00:00+01:00',
      });
      expect(entryError).toBeNull();

      // Noch aktiv: nicht löschbar.
      expect((await svc.rpc('purge_employee', { p_employee: id })).error).not.toBeNull();

      await svc.from('profiles').update({ active: false, left_on: '2015-06-30' }).eq('id', id);

      const { data: faellig } = await svc.rpc('retention_overview');
      const zeile = (faellig as Array<{ employee_id: string; due: boolean }>).find(
        (row) => row.employee_id === id,
      );
      expect(zeile?.due).toBe(true);

      const { error } = await svc.rpc('purge_employee', { p_employee: id });
      expect(error).toBeNull();

      const { data: profil } = await svc.from('profiles').select('id').eq('id', id);
      expect(profil).toEqual([]);
      const { data: zeiten } = await svc.from('time_entries').select('id').eq('employee_id', id);
      expect(zeiten).toEqual([]);

      // Vom Protokoll bleibt nur die Löschzeile, ohne personenbezogene Daten.
      const { data: protokoll } = await svc
        .from('audit_log')
        .select('employee_id, old_data, new_data')
        .eq('record_id', id);
      expect(protokoll).toHaveLength(1);
      expect(protokoll![0]!.employee_id).toBeNull();
      expect(protokoll![0]!.old_data).toBeNull();

      const { data: zugang } = await svc.auth.admin.getUserById(id);
      expect(zugang.user).toBeNull();
    } finally {
      await svc.auth.admin.deleteUser(id).catch(() => undefined);
    }
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
    const { data: teilzeit } = await admin
      .from('contract_types')
      .select('id')
      .eq('label', 'Teilzeit')
      .single();

    const { error } = await admin.from('employment_contracts').insert({
      employee_id: ANNA,
      contract_type_id: teilzeit!.id,
      valid_from: '2024-01-01',
      weekly_hours: 20,
      collective_weekly_hours: 38.5,
    });
    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toContain('employment_contracts_no_overlap');
  });
});
