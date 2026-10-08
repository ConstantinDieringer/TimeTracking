import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

/**
 * Content Security Policy für das ausgelieferte Bündel.
 *
 * Erlaubt Skripte nur aus der eigenen Herkunft und Verbindungen nur zu
 * Supabase. Selbst wenn es jemandem gelänge, Code einzuschleusen, könnte der
 * weder nachgeladen werden noch die Anmeldung an einen fremden Server senden.
 * Inline-Stile bleiben erlaubt, weil React Stilattribute setzt; Skripte nicht.
 *
 * Nur im Build: der Entwicklungsserver braucht Inline-Skripte für das
 * Neuladen. `frame-ancestors` (Schutz gegen Einbetten) wirkt nur als
 * HTTP-Header und gehört deshalb in die Konfiguration des Hostings.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-src 'none'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
        injectTo: 'head-prepend',
      },
      { tag: 'meta', attrs: { name: 'referrer', content: 'no-referrer' }, injectTo: 'head' },
    ],
  };
}

export default defineConfig({
  plugins: [react(), contentSecurityPolicy()],
  // Die .env liegt im Repo-Wurzelverzeichnis, nicht in web/ — so gibt es eine
  // einzige Stelle für die Supabase-Zugangsdaten.
  envDir: fileURLToPath(new URL('..', import.meta.url)),
  resolve: {
    alias: {
      // Das Rechtslogik-Paket wird direkt aus dem Quelltext eingebunden; ein
      // eigener Build-Schritt dafür bringt hier nichts.
      '@zeiterfassung/legal': fileURLToPath(new URL('../packages/legal/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
