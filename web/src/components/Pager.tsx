/**
 * Blättern zwischen Zeiträumen: zurück, zum aktuellen, weiter.
 *
 * Als eine zusammenhängende Gruppe statt dreier einzelner Knöpfe — die drei
 * gehören zu einer Handlung. Die Pfeile tragen die Richtung, damit die
 * Beschriftung kurz bleiben kann; der volle Wortlaut steht für
 * Bildschirmleser im aria-label.
 */
export function Pager({
  unit,
  onPrevious,
  onCurrent,
  onNext,
  currentLabel = 'Heute',
  isCurrent = false,
}: {
  /** „Woche“, „Monat“ — für die Bildschirmleser-Beschriftung. */
  unit: string;
  onPrevious: () => void;
  onCurrent?: () => void;
  onNext: () => void;
  currentLabel?: string;
  /** Steht man schon im aktuellen Zeitraum, ist „Heute“ ohne Wirkung. */
  isCurrent?: boolean;
}) {
  return (
    <div className="pager" role="group" aria-label={`${unit} wählen`}>
      <button
        className="button"
        type="button"
        onClick={onPrevious}
        aria-label={`Vorige${unit === 'Woche' ? '' : 'r'} ${unit}`}
      >
        <span aria-hidden="true">←</span>
      </button>
      {onCurrent && (
        <button className="button" type="button" onClick={onCurrent} disabled={isCurrent}>
          {currentLabel}
        </button>
      )}
      <button
        className="button"
        type="button"
        onClick={onNext}
        aria-label={`Nächste${unit === 'Woche' ? '' : 'r'} ${unit}`}
      >
        <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}
