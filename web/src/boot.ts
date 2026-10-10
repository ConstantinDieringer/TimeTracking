/**
 * Einstieg in die App, der auch dann etwas anzeigt, wenn sie beim Start
 * abstürzt — etwa weil beim Bauen die Supabase-Zugangsdaten fehlten. Sonst
 * bliebe nur eine leere weiße Seite, und niemand wüsste, woran es liegt.
 *
 * Der Fehlertext steht im DOM statt in einem Inline-Skript: die Content
 * Security Policy erlaubt keine Inline-Skripte.
 */

import('./main').catch((error: unknown) => {
  console.error(error);
  const root = document.getElementById('root');
  if (!root) return;

  const box = document.createElement('div');
  box.style.cssText =
    'max-width:32rem;margin:15vh auto;padding:0 16px;font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a';

  const title = document.createElement('h1');
  title.style.cssText = 'font-size:1.25rem;margin:0 0 .5rem';
  title.textContent = 'Die Zeiterfassung konnte nicht starten.';

  const text = document.createElement('p');
  text.style.margin = '0 0 1rem';
  text.textContent =
    'Bitte die Seite neu laden. Bleibt der Fehler, die Personalverwaltung informieren. ' +
    'The time tracker could not start — please reload, or contact your administrator.';

  const detail = document.createElement('pre');
  detail.style.cssText =
    'white-space:pre-wrap;font-size:.8rem;color:#666;background:#f4f4f4;padding:.75rem;border-radius:6px';
  detail.textContent = error instanceof Error ? error.message : String(error);

  box.append(title, text, detail);
  root.replaceChildren(box);
});
