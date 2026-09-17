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
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface CreatePayload {
  action: 'create';
  email: string;
  password: string;
  displayName: string;
  role?: 'employee' | 'admin';
  hiredOn?: string;
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (request.method !== 'POST') {
    return json({ error: 'Nur POST ist zulässig.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: 'Die Funktion ist nicht vollständig konfiguriert.' }, 500);
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization) {
    return json({ error: 'Nicht angemeldet.' }, 401);
  }

  // Mit dem Token des Aufrufers — dadurch gelten für diese Abfrage dieselben
  // Policies wie für ihn selbst.
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });

  const { data: isAdmin, error: roleError } = await caller.rpc('is_admin');
  if (roleError) {
    return json({ error: `Berechtigung konnte nicht geprüft werden: ${roleError.message}` }, 500);
  }
  if (!isAdmin) {
    return json({ error: 'Diese Aktion ist Administratoren vorbehalten.' }, 403);
  }

  // Das Unternehmen kommt aus dem Token des Aufrufers, nie aus dem Aufruf
  // selbst. Sonst ließe sich ein Benutzer in einen fremden Mandanten anlegen.
  const { data: organizationId, error: orgError } = await caller.rpc('current_organization_id');
  if (orgError || !organizationId) {
    return json({ error: 'Der Aufrufer ist keinem Unternehmen zugeordnet.' }, 403);
  }

  let payload: Payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Der Aufruf enthält keinen gültigen JSON-Körper.' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  /**
   * Gehört die Zielperson zum Unternehmen des Aufrufers?
   *
   * Muss ausdrücklich geprüft werden: die folgenden Aufrufe laufen mit dem
   * service_role-Schlüssel und umgehen damit Row Level Security. Ohne diese
   * Prüfung könnte ein Administrator das Passwort einer Person aus einem
   * fremden Unternehmen zurücksetzen, sofern er deren Kennung kennt.
   */
  async function belongsToCallerOrganization(userId: string): Promise<boolean> {
    const { data } = await admin
      .from('profiles')
      .select('organization_id')
      .eq('id', userId)
      .maybeSingle();
    return data?.organization_id === organizationId;
  }

  switch (payload.action) {
    case 'create': {
      if (!payload.email || !payload.password || !payload.displayName) {
        return json({ error: 'E-Mail, Passwort und Name sind erforderlich.' }, 400);
      }
      if (payload.password.length < 10) {
        return json({ error: 'Das Passwort muss mindestens 10 Zeichen haben.' }, 400);
      }

      const { data, error } = await admin.auth.admin.createUser({
        email: payload.email,
        password: payload.password,
        // Der Admin legt den Zugang an und übergibt ihn persönlich; eine
        // Bestätigungsmail wäre hier nur eine zusätzliche Hürde.
        email_confirm: true,
        user_metadata: {
          display_name: payload.displayName,
          role: payload.role ?? 'employee',
          hired_on: payload.hiredOn ?? new Date().toISOString().slice(0, 10),
          organization_id: organizationId,
        },
      });
      if (error) return json({ error: error.message }, 400);
      return json({ userId: data.user.id });
    }

    case 'set-password': {
      if (payload.password.length < 10) {
        return json({ error: 'Das Passwort muss mindestens 10 Zeichen haben.' }, 400);
      }
      if (!(await belongsToCallerOrganization(payload.userId))) {
        return json({ error: 'Diese Person gehört nicht zu Ihrem Unternehmen.' }, 403);
      }
      const { error } = await admin.auth.admin.updateUserById(payload.userId, {
        password: payload.password,
      });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    case 'set-active': {
      if (!(await belongsToCallerOrganization(payload.userId))) {
        return json({ error: 'Diese Person gehört nicht zu Ihrem Unternehmen.' }, 403);
      }
      // Deaktivieren statt löschen: die Aufzeichnungen sind nach § 26 AZG
      // aufzubewahren, und ein gelöschter Benutzer nähme sie mit.
      const { error: profileError } = await admin
        .from('profiles')
        .update({ active: payload.active })
        .eq('id', payload.userId);
      if (profileError) return json({ error: profileError.message }, 400);

      const { error } = await admin.auth.admin.updateUserById(payload.userId, {
        ban_duration: payload.active ? 'none' : '876000h',
      });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    default:
      return json({ error: 'Unbekannte Aktion.' }, 400);
  }
});
