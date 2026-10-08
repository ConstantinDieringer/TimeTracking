/**
 * Durchsucht das gebaute Browser-Bündel (`web/dist`) nach Geheimnissen.
 *
 * Alles mit dem Präfix `VITE_` landet beim Build im öffentlichen JavaScript.
 * Rutscht dort einmal der service_role- oder ein `sb_secret_`-Schlüssel
 * hinein, kann jeder Besucher sämtliche Daten aller Unternehmen lesen und
 * ändern. Dieser Schritt läuft nach jedem `npm run build` und bricht ab,
 * bevor so ein Bündel online gehen kann.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = 'web/dist';

if (!existsSync(DIST)) {
  console.error(`${DIST} fehlt — zuerst bauen.`);
  process.exit(1);
}

/** Werte aus der .env, die nie im Bündel stehen dürfen. */
function secretsFromEnv() {
  if (!existsSync('.env')) return [];
  return readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*(SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|[A-Z_]*SECRET[A-Z_]*)\s*=\s*(.+?)\s*$/))
    .filter(Boolean)
    .map((match) => match[2].replace(/^["']|["']$/g, ''))
    .filter((value) => value.length >= 20);
}

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

function jwtRole(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8')).role ?? null;
  } catch {
    return null;
  }
}

const envSecrets = secretsFromEnv();
const problems = [];

for (const path of files(DIST)) {
  const name = relative(DIST, path);
  if (name.endsWith('.map')) {
    problems.push(`${name}: Source Map im Bündel — legt den Quelltext offen.`);
    continue;
  }
  if (!/\.(js|mjs|html|css|json|txt|webmanifest)$|_headers$/.test(name)) continue;

  const content = readFileSync(path, 'utf8');
  // Ein echter Schlüssel, nicht bloß das Präfix — das steht als Prüfung
  // auch in supabase.ts und supabase-js selbst.
  if (/sb_secret_[\w-]{20,}/.test(content)) {
    problems.push(`${name}: enthält einen Supabase-Secret-Key (sb_secret_…).`);
  }
  for (const [token] of content.matchAll(/eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/g)) {
    if (jwtRole(token) === 'service_role') {
      problems.push(`${name}: enthält den service_role-Schlüssel.`);
    }
  }
  for (const secret of envSecrets) {
    if (content.includes(secret)) {
      problems.push(`${name}: enthält einen geheimen Wert aus der .env.`);
    }
  }
}

if (problems.length > 0) {
  console.error('Das Bündel darf so nicht online gehen:\n');
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  console.error('\nSchlüssel sofort im Supabase-Dashboard austauschen, falls das Bündel schon ausgeliefert wurde.');
  process.exit(1);
}

console.log(`Bündel geprüft: keine Geheimnisse in ${DIST}.`);
