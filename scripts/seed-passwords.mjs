/**
 * Setzt das Passwort aller Testzugänge aus `supabase/seed.sql` auf den Wert
 * von SEED_PASSWORD (aus der Umgebung oder der .env im Wurzelverzeichnis).
 *
 * seed.sql vergibt bewusst nur zufällige Passwörter, damit keines im
 * Repository steht. Erst dieses Skript macht die Testzugänge benutzbar.
 *
 *   npm run seed:passwords            verknüpftes Cloud-Projekt (wie test:rls)
 *   npm run seed:passwords -- --local lokale Instanz aus `npm run db:start`
 *
 * Berührt nur die festen Kennungen der Testzugänge, nie andere Benutzer.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const SEED_USERS = [
  '11111111-1111-1111-1111-111111111111', // admin@example.at
  '22222222-2222-2222-2222-222222222222', // anna@example.at
  '33333333-3333-3333-3333-333333333333', // sofia@example.at
  '44444444-4444-4444-4444-444444444444', // jonas@example.at
  '77777777-7777-7777-7777-777777777777', // markus@example.at
  '55555555-5555-5555-5555-555555555555', // chef@musterbau.at
  '66666666-6666-6666-6666-666666666666', // lisa@musterbau.at
];

function fromDotenv(name) {
  if (!existsSync('.env')) return undefined;
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (match && match[1] === name) return match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return undefined;
}

const password = process.env.SEED_PASSWORD || fromDotenv('SEED_PASSWORD');
// Dieselbe Regel wie in Supabase Auth (config.toml).
if (!password || password.length < 12 || !/\p{L}/u.test(password) || !/\d/.test(password)) {
  console.error('SEED_PASSWORD fehlt oder ist zu schwach (mindestens 12 Zeichen mit Buchstaben und Ziffern).');
  process.exit(1);
}

let url;
let serviceKey;
if (process.argv.includes('--local')) {
  url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54421';
  // Demo-Schlüssel jeder lokalen Supabase-Instanz, wie in supabase/test/rls.test.ts.
  serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qJwcBOJ7I0J0GpC2lPZnXE';
} else {
  const ref = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const keys = JSON.parse(
    execFileSync(npx, ['--no-install', 'supabase', 'projects', 'api-keys', '--project-ref', ref, '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: process.platform === 'win32',
    }),
  );
  url = `https://${ref}.supabase.co`;
  serviceKey = keys.find((entry) => entry.name === 'service_role')?.api_key;
}

const service = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failed = false;
for (const id of SEED_USERS) {
  const { data, error } = await service.auth.admin.updateUserById(id, { password });
  if (error) {
    // Fehlt ein Testzugang (etwa schon gelöscht), ist das kein Fehler.
    if (error.status === 404) continue;
    console.error(`${id}: ${error.message}`);
    failed = true;
  } else {
    console.log(`Passwort gesetzt: ${data.user.email}`);
  }
}
process.exit(failed ? 1 : 0);
