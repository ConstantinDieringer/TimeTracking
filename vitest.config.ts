import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@zeiterfassung/legal': fileURLToPath(
        new URL('./packages/legal/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'web/src/**/*.test.ts'],
    // Die Rechtslogik rechnet durchgehend in Europe/Vienna. Die Tests laufen
    // in derselben Zone, damit sie auf einem Rechner mit anderer Systemzeit
    // nicht plötzlich anders ausgehen.
    environment: 'node',
  },
});
