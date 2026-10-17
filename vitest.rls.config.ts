import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Eigene Konfiguration, weil diese Tests eine laufende Supabase-Instanz
 * brauchen. So bleibt `npm test` schnell und läuft überall — auch ohne Docker.
 */
export default defineConfig({
  test: {
    include: ['supabase/test/**/*.test.ts'],
    environment: 'node',
    // SEED_PASSWORD und Co. aus der .env; gesetzte Umgebungsvariablen gehen vor.
    env: { ...loadEnv('test', process.cwd(), ''), ...process.env },
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Die Tests schreiben teils in dieselben Zeilen; nacheinander bleibt das
    // Ergebnis vorhersagbar.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
