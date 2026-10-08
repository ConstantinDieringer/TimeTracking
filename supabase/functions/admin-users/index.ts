/**
 * Benutzerverwaltung — die einzige Funktion, die serverseitig laufen muss.
 *
 * Grund: das Anlegen und Deaktivieren von Benutzern braucht den
 * `service_role`-Schlüssel, und der darf niemals ins Browser-Bundle. Alles
 * andere in dieser Anwendung läuft über RLS-geschützte Direktabfragen.
 *
 * Die Funktion prüft die Berechtigung nicht anhand dessen, was der Aufrufer
 * behauptet, sondern fragt mit seinem eigenen Token die Datenbank: nur wer
 * dort als aktiver Admin geführt ist, kommt durch.
 *
 * Der service_role-Schlüssel kommt nur dort zum Einsatz, wo es ohne ihn nicht
 * geht (Supabase Auth, das noch unzugeordnete Profil). Alles andere läuft mit
 * dem Token des Aufrufers — dann gelten RLS und Trigger, und das
 * Änderungsprotokoll nennt den richtigen Urheber.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Herkünfte, die die Funktion aus dem Browser aufrufen dürfen. Beim
 * Online-Stellen als Secret setzen:
 * `supabase secrets set ALLOWED_ORIGINS=https://app.example.at`.
 * Ohne Angabe nur die lokalen Entwicklungs- und Vorschauserver.
 */
const ALLOWED_ORIGINS = new Set(
  (Deno.env.get('ALLOWED_ORIGINS') ??
    'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 72; // bcrypt wertet nicht mehr aus
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface CreatePayload {
  action: 'create';
  email: string;
  password: string;
  displayName: string;
  role: 'employee' | 'admin';
  hiredOn: string;
}

interface SetPasswordPayload {
  action: 'set-password';
  userId: string;
  password: string;
}

interface SetActivePayload {
  action: 'set-active';
  userId: string;
  active: boolean;
}

type Payload = CreatePayload | SetPasswordPayload | SetActivePayload;

/** Fehler, deren Text der Aufrufer sehen darf. */
class Rejection extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

function corsHeaders(origin: string | null): Record<string, string> {
  // Die Herkunft wird nur zurückgespiegelt, wenn sie auf der Liste steht.
  // Ein `*` ließe jede Website die Funktion im Namen eines angemeldeten
  // Administrators ansprechen, sobald dessen Token einmal abhanden kommt.
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function passwordProblem(password: unknown): string | null {
  if (typeof password !== 'string') return 'Das Passwort fehlt.';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Das Passwort darf höchstens ${MAX_PASSWORD_LENGTH} Zeichen haben.`;
  }
  // Dieselbe Regel wie in Supabase Auth (password_requirements), hier nur mit
  // verständlicher Meldung.
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) {
    return 'Das Passwort muss Buchstaben und Ziffern enthalten.';
  }
  return null;
}

/**
 * Nimmt aus dem Aufruf genau die erwarteten Felder mit dem erwarteten Typ —
 * alles andere wird abgewiesen, nicht stillschweigend übernommen.
 */
function parsePayload(raw: unknown): Payload {
  if (typeof raw !== 'object' || raw === null) throw new Rejection('Ungültiger Aufruf.');
  const body = raw as Record<string, unknown>;

  switch (body.action) {
    case 'create': {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
      const hiredOn = body.hiredOn ?? new Date().toISOString().slice(0, 10);
      if (!EMAIL.test(email) || email.length > 254) {
        throw new Rejection('Bitte eine gültige E-Mail-Adresse angeben.');
      }
      if (displayName.length < 1 || displayName.length > 200) {
        throw new Rejection('Der Name muss zwischen 1 und 200 Zeichen lang sein.');
      }
      if (body.role !== undefined && body.role !== 'employee' && body.role !== 'admin') {
        throw new Rejection('Unbekannte Rolle.');
      }
      if (typeof hiredOn !== 'string' || !ISO_DATE.test(hiredOn) || Number.isNaN(Date.parse(hiredOn))) {
        throw new Rejection('Das Eintrittsdatum ist ungültig.');
      }
      const problem = passwordProblem(body.password);
      if (problem) throw new Rejection(problem);
      return {
        action: 'create',
        email,
        password: body.password as string,
        displayName,
        role: body.role === 'admin' ? 'admin' : 'employee',
        hiredOn,
      };
    }

    case 'set-password': {
      if (typeof body.userId !== 'string' || !UUID.test(body.userId)) {
        throw new Rejection('Ungültige Benutzerkennung.');
      }
      const problem = passwordProblem(body.password);
      if (problem) throw new Rejection(problem);
      return { action: 'set-password', userId: body.userId, password: body.password as string };
    }

    case 'set-active': {
      if (typeof body.userId !== 'string' || !UUID.test(body.userId)) {
        throw new Rejection('Ungültige Benutzerkennung.');
      }
      if (typeof body.active !== 'boolean') throw new Rejection('Ungültiger Aufruf.');
      return { action: 'set-active', userId: body.userId, active: body.active };
    }

    default:
      throw new Rejection('Unbekannte Aktion.');
  }
}

Deno.serve(async (request) => {
  const cors = corsHeaders(request.headers.get('Origin'));

  function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: cors['Access-Control-Allow-Origin'] ? 204 : 403, headers: cors });
  }
  if (request.method !== 'POST') {
    return json({ error: 'Nur POST ist zulässig.' }, 405);
  }

  try {
    return await handle(request, json);
  } catch (caught) {
    if (caught instanceof Rejection) return json({ error: caught.message }, caught.status);
    // Einzelheiten nur ins Protokoll der Funktion: Meldungen von Postgres
    // oder Supabase Auth nennen Tabellen, Spalten und Constraints.
    console.error('admin-users', caught);
    return json({ error: 'Die Aktion ist fehlgeschlagen.' }, 500);
  }
});

async function handle(
  request: Request,
  json: (body: unknown, status?: number) => Response,
): Promise<Response> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) {
    throw new Error('Umgebungsvariablen fehlen.');
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    throw new Rejection('Nicht angemeldet.', 401);
  }

  // Mit dem Token des Aufrufers — dadurch gelten für diese Abfrage dieselben
  // Policies wie für ihn selbst.
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Prüft die Signatur des Tokens beim Auth-Server, statt ihm zu glauben.
  const { data: callerData, error: callerError } = await caller.auth.getUser(
    authorization.slice('Bearer '.length),
  );
  const callerId = callerData.user?.id;
  if (callerError || !callerId) throw new Rejection('Nicht angemeldet.', 401);

  const [{ data: isAdmin, error: roleError }, { data: callerIsOwner }, { data: organizationId }] =
    await Promise.all([
      caller.rpc('is_admin'),
      caller.rpc('is_owner'),
      // Das Unternehmen kommt aus dem Token des Aufrufers, nie aus dem Aufruf
      // selbst. Sonst ließe sich ein Benutzer in einen fremden Mandanten anlegen.
      caller.rpc('current_organization_id'),
    ]);
  // Im Zweifel abweisen: ein Fehler bei der Prüfung ist kein „ja“.
  if (roleError || isAdmin !== true) {
    throw new Rejection('Diese Aktion ist Administratoren vorbehalten.', 403);
  }
  if (!organizationId) throw new Rejection('Der Aufrufer ist keinem Unternehmen zugeordnet.', 403);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new Rejection('Der Aufruf enthält keinen gültigen JSON-Körper.');
  }
  const payload = parsePayload(raw);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /**
   * Die Zielperson im Unternehmen des Aufrufers, oder null.
   *
   * Muss ausdrücklich geprüft werden: Aufrufe mit dem service_role-Schlüssel
   * umgehen Row Level Security. Ohne diese Prüfung könnte ein Administrator
   * das Passwort einer Person aus einem fremden Unternehmen zurücksetzen,
   * sofern er deren Kennung kennt.
   */
  async function target(userId: string) {
    const { data, error } = await admin
      .from('profiles')
      .select('organization_id, role')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.organization_id !== organizationId) {
      throw new Rejection('Diese Person gehört nicht zu Ihrem Unternehmen.', 403);
    }
    const { data: org, error: orgError } = await admin
      .from('organizations')
      .select('owner_id')
      .eq('id', organizationId)
      .single();
    if (orgError) throw orgError;
    return { role: data.role as 'employee' | 'admin', isOwner: org.owner_id === userId };
  }

  /**
   * Vorgänge in Supabase Auth erreicht kein Datenbank-Trigger. Damit sie im
   * Änderungsprotokoll stehen — mit dem Aufrufer als Urheber, nicht mit dem
   * service_role-Schlüssel —, schreibt die Funktion sie selbst hinein.
   */
  async function audit(userId: string, operation: 'INSERT' | 'UPDATE', details: object) {
    const { error } = await admin.from('audit_log').insert({
      table_name: 'auth.users',
      record_id: userId,
      employee_id: userId,
      organization_id: organizationId,
      operation,
      old_data: null,
      new_data: details,
      changed_by: callerId,
    });
    if (error) throw error;
  }

  /**
   * Meldet die Person überall ab. Das Passwort ist zu diesem Zeitpunkt schon
   * gesetzt; scheitert nur das Abmelden, steht es im Protokoll der Funktion,
   * statt die geglückte Änderung als Fehler zu melden.
   */
  async function endSessions(userId: string) {
    const { error } = await admin.rpc('end_sessions', { p_user: userId });
    if (error) console.error('admin-users: Abmelden fehlgeschlagen', error);
  }

  switch (payload.action) {
    case 'create': {
      const { data, error } = await admin.auth.admin.createUser({
        email: payload.email,
        password: payload.password,
        // Der Admin legt den Zugang an und übergibt ihn persönlich; eine
        // Bestätigungsmail wäre hier nur eine zusätzliche Hürde.
        email_confirm: true,
        user_metadata: {
          display_name: payload.displayName,
        },
      });
      if (error) {
        // Die einzige Auth-Meldung, mit der die Verwaltung etwas anfangen
        // kann. Alles andere bleibt im Protokoll der Funktion.
        if (error.code === 'email_exists' || /already/i.test(error.message)) {
          throw new Rejection('Für diese E-Mail-Adresse gibt es bereits einen Zugang.');
        }
        if (error.code === 'weak_password') {
          throw new Rejection('Das Passwort ist zu schwach oder bereits in Datenlecks aufgetaucht.');
        }
        throw error;
      }

      // Rolle, Unternehmen und Eintrittsdatum setzt erst dieser Schritt mit
      // dem service_role-Schlüssel. Nicht über user_metadata — das kann jeder
      // Benutzer selbst beschreiben, und der Trigger handle_new_user übernimmt
      // daraus bewusst nur den Namen. Und nicht über app_metadata — GoTrue
      // schreibt das erst nach dem INSERT, den der Trigger sieht.
      const { error: profileError } = await admin
        .from('profiles')
        .update({
          organization_id: organizationId,
          role: payload.role,
          hired_on: payload.hiredOn,
          display_name: payload.displayName,
        })
        .eq('id', data.user.id);
      if (profileError) {
        // Kein Konto ohne Zuordnung zurücklassen.
        await admin.auth.admin.deleteUser(data.user.id);
        throw profileError;
      }

      await audit(data.user.id, 'INSERT', {
        aktion: 'zugang_angelegt',
        rolle: payload.role,
      });
      return json({ userId: data.user.id });
    }

    case 'set-password': {
      const person = await target(payload.userId);
      if (payload.userId !== callerId) {
        if (person.isOwner) {
          throw new Rejection('Das Passwort des Inhabers kann nur er selbst ändern.', 403);
        }
        // Wer das Passwort eines anderen Administrators setzt, kann sich als
        // dieser anmelden und in seinem Namen handeln. Das bleibt dem Inhaber
        // vorbehalten.
        if (person.role === 'admin' && callerIsOwner !== true) {
          throw new Rejection(
            'Das Passwort eines Administrators kann nur der Inhaber zurücksetzen.',
            403,
          );
        }
      }
      const { error } = await admin.auth.admin.updateUserById(payload.userId, {
        password: payload.password,
      });
      if (error) {
        if (error.code === 'weak_password') {
          throw new Rejection('Das Passwort ist zu schwach oder bereits in Datenlecks aufgetaucht.');
        }
        throw error;
      }
      // Bestehende Anmeldungen mit dem alten Passwort beenden: wer es
      // zurücksetzen ließ, weil es bekannt geworden ist, will genau das.
      await endSessions(payload.userId);
      await audit(payload.userId, 'UPDATE', { aktion: 'passwort_gesetzt' });
      return json({ ok: true });
    }

    case 'set-active': {
      const person = await target(payload.userId);
      // Der Trigger protect_owner würde das Profil-Update ohnehin abweisen;
      // hier früher und mit verständlicher Meldung.
      if (!payload.active && person.isOwner) {
        throw new Rejection('Der Inhaber kann nicht deaktiviert werden.', 403);
      }
      // Mit dem Token des Aufrufers: RLS und Trigger prüfen mit, und das
      // Protokoll nennt ihn als Urheber. Erst das Profil, dann die Sperre in
      // Supabase Auth — scheitert das Profil, wird niemand gesperrt.
      // Deaktivieren statt löschen: die Aufzeichnungen sind nach § 26 AZG
      // aufzubewahren, und ein gelöschter Benutzer nähme sie mit.
      const { data: updated, error: profileError } = await caller
        .from('profiles')
        .update({ active: payload.active })
        .eq('id', payload.userId)
        .select('id');
      if (profileError) throw profileError;
      if (!updated || updated.length === 0) {
        throw new Rejection('Die Änderung wurde abgewiesen.', 403);
      }

      const { error } = await admin.auth.admin.updateUserById(payload.userId, {
        ban_duration: payload.active ? 'none' : '876000h',
      });
      if (error) throw error;
      if (!payload.active) await endSessions(payload.userId);
      return json({ ok: true });
    }
  }
}
