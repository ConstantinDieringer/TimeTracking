/**
 * Ladehinweis. Erscheint per CSS erst nach 300 ms, damit schnelle Antworten
 * nicht jedes Mal kurz „Wird geladen“ aufblitzen lassen.
 */
export function Loading({ text = 'Wird geladen …' }: { text?: string }) {
  return (
    <p className="loading" role="status">
      {text}
    </p>
  );
}
