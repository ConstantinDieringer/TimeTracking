/**
 * Ladezustand als Platzhalter in der Form des Inhalts, der gleich kommt —
 * ruhiger als ein Text, der aufblitzt, und die Seite springt danach nicht.
 * Erscheint per CSS erst nach 300 ms, damit schnelle Antworten ihn gar nicht
 * erst zeigen.
 */
export function Loading({ text = 'Wird geladen …' }: { text?: string }) {
  return (
    <div className="loading" role="status">
      <span className="visually-hidden">{text}</span>
      <span className="skeleton skeleton--title" />
      <span className="skeleton" />
      <span className="skeleton skeleton--short" />
    </div>
  );
}
