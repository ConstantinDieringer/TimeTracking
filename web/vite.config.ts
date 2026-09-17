import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
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
});
