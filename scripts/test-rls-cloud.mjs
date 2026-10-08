/**
 * Führt `npm run test:rls` gegen das verknüpfte Supabase-Cloud-Projekt aus.
 *
 * Projekt und Schlüssel kommen aus der Supabase CLI (`supabase link` und
 * `supabase login` müssen gelaufen sein); nichts davon steht im Repository.
 * Die Tests melden sich ausschließlich mit den Testzugängen aus
 * `supabase/seed.sql` an und berühren nur deren Unternehmen.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ref = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const keys = JSON.parse(
  execFileSync(npx, ['--no-install', 'supabase', 'projects', 'api-keys', '--project-ref', ref, '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    shell: process.platform === 'win32',
  }),
);
const key = (name) => keys.find((entry) => entry.name === name)?.api_key;

const result = spawnSync(npx, ['--no-install', 'vitest', 'run', '--config', 'vitest.rls.config.ts'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    SUPABASE_URL: `https://${ref}.supabase.co`,
    SUPABASE_ANON_KEY: key('anon'),
    SUPABASE_SERVICE_ROLE_KEY: key('service_role'),
  },
});
process.exit(result.status ?? 1);
