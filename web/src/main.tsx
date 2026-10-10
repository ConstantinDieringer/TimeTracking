import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

// Geist als variable Schrift: eine Datei für alle Stärken. Die übrigen
// Schriftsysteme sind per unicode-range eingebunden und werden nur geladen,
// wenn eine Seite sie tatsächlich braucht.
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';

import './styles/tokens.css';
import './styles/base.css';
import './styles/pages.css';

import { App } from './App';
import { ToastProvider } from './components/Toast';
import { LocaleProvider } from './lib/i18n';
import { LocaleSync, SessionProvider } from './lib/session';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Zeiten ändern sich nur, wenn jemand stempelt — und dann wird der
      // Cache gezielt entwertet. Ein Neuladen beim Fensterwechsel bringt hier
      // nichts außer Flackern.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: 1,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <SessionProvider>
          <LocaleSync />
          <BrowserRouter>
            <ToastProvider>
              <App />
            </ToastProvider>
          </BrowserRouter>
        </SessionProvider>
      </LocaleProvider>
    </QueryClientProvider>
  </StrictMode>,
);
