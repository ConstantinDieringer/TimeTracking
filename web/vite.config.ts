import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * Content Security Policy für das ausgelieferte Bündel.
 *
 * Erlaubt Skripte nur aus der eigenen Herkunft und Verbindungen nur zum
 * eigenen Supabase-Projekt. Selbst wenn es jemandem gelänge, Code
 * einzuschleusen, könnte der weder nachgeladen werden noch die Anmeldung an
 * einen fremden Server senden — auch nicht an ein anderes Supabase-Projekt.
 * Inline-Stile bleiben erlaubt, weil React Stilattribute setzt; Skripte nicht.
 *
 * Nur im Build: der Entwicklungsserver braucht Inline-Skripte für das
 * Neuladen.
 */
function contentSecurityPolicy(
  supabaseUrl: string | undefined,
  { header, https }: { header: boolean; https: boolean },
): string {
  let connect = 'https://*.supabase.co wss://*.supabase.co';
  if (supabaseUrl) {
    const url = new URL(supabaseUrl);
    connect = `${url.origin} ${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}`;
  }
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${connect}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'none'",
    // Wirkt nur als HTTP-Header; im <meta> ignoriert der Browser es.
    ...(header ? ["frame-ancestors 'none'"] : []),
    ...(header && https ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

/**
 * Header, die das Hosting mitschicken muss. Der Build legt sie als
 * `dist/_headers` ab — Netlify und Cloudflare Pages lesen diese Datei
 * unverändert; bei anderen Hostern sind sie in deren Konfiguration zu
 * übernehmen. `https: false` für die lokale Vorschau, die über http läuft.
 */
function securityHeaders(
  supabaseUrl: string | undefined,
  { https }: { https: boolean },
): Record<string, string> {
  return {
    'Content-Security-Policy': contentSecurityPolicy(supabaseUrl, { header: true, https }),
    ...(https ? { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains' } : {}),
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
}

function securityPlugin(supabaseUrl: string | undefined): Plugin {
  return {
    name: 'security-headers',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: {
          'http-equiv': 'Content-Security-Policy',
          content: contentSecurityPolicy(supabaseUrl, { header: false, https: true }),
        },
        injectTo: 'head-prepend',
      },
      { tag: 'meta', attrs: { name: 'referrer', content: 'no-referrer' }, injectTo: 'head' },
    ],
    generateBundle() {
      const lines = Object.entries(securityHeaders(supabaseUrl, { https: true })).map(
        ([name, value]) => `  ${name}: ${value}`,
      );
      this.emitFile({ type: 'asset', fileName: '_headers', source: ['/*', ...lines, ''].join('\n') });
    },
  };
}

// Die .env liegt im Repo-Wurzelverzeichnis, nicht in web/ — so gibt es eine
// einzige Stelle für die Supabase-Zugangsdaten.
const envDir = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, envDir, 'VITE_');
  const supabaseUrl = env.VITE_SUPABASE_URL;

  // Ohne diese Werte bricht die App beim Start ab und zeigt eine leere
  // Seite. Lieber den Build scheitern lassen: dann bleibt beim Hoster die
  // letzte funktionierende Version online. Beim Hoster (Cloudflare: Settings
  // → Builds → Variables and secrets) als Build-Variablen setzen, nicht als
  // Laufzeitvariablen — Vite schreibt sie beim Bauen ins Bündel.
  // Supabase-Projekte liegen unter .supabase.co. Ein angehängtes „m“ fällt
  // beim Lesen kaum auf, lässt aber jede Anmeldung mit „Failed to fetch“
  // scheitern — und die Maske meldet dann nur „Passwort stimmt nicht“.
  if (supabaseUrl && /\.supabase\.com\/?$/.test(supabaseUrl)) {
    throw new Error(`VITE_SUPABASE_URL endet auf .supabase.com, richtig ist .supabase.co: ${supabaseUrl}`);
  }

  if (command === 'build') {
    const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter((name) => !env[name]);
    if (missing.length > 0) {
      throw new Error(`Build abgebrochen: ${missing.join(' und ')} nicht gesetzt.`);
    }
  }

  return {
    plugins: [react(), securityPlugin(supabaseUrl)],
    envDir,
    // Keine Source Maps im ausgelieferten Bündel: sie legten den Quelltext
    // samt Kommentaren offen.
    build: { sourcemap: false },
    resolve: {
      alias: {
        // Das Rechtslogik-Paket wird direkt aus dem Quelltext eingebunden; ein
        // eigener Build-Schritt dafür bringt hier nichts.
        '@zeiterfassung/legal': fileURLToPath(
          new URL('../packages/legal/src/index.ts', import.meta.url),
        ),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
    },
    preview: {
      port: 4173,
      strictPort: true,
      // Damit sich die Header vor dem Online-Stellen lokal prüfen lassen.
      headers: securityHeaders(supabaseUrl, { https: false }),
    },
  };
});
