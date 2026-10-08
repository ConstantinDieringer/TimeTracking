import { formatDateShort, type RuleResult } from '@zeiterfassung/legal';
import { Icon } from './Icon';

/**
 * Darstellung der Regelbefunde.
 *
 * Die Fundstelle steht immer neben der Meldung. Das ist keine Zierde: eine
 * Warnung, die ihre gesetzliche Grundlage nennt, lässt sich nachschlagen und
 * gegebenenfalls widerlegen — eine ohne wirkt wie eine Behauptung der Software.
 *
 * Keine Befunde sind eine gute Nachricht und werden auch so gezeigt: mit
 * Häkchen auf grünem Grund statt als graue Leerstelle.
 */
export function Findings({
  findings,
  showDate = false,
  emptyText,
}: {
  findings: readonly RuleResult[];
  showDate?: boolean;
  emptyText?: string;
}) {
  if (findings.length === 0) {
    return emptyText ? (
      <p className="all-clear">
        <Icon name="check" size={20} />
        {emptyText}
      </p>
    ) : null;
  }

  return (
    <div>
      {findings.map((finding, index) => (
        <div
          key={`${finding.code}-${finding.date ?? index}`}
          className={`finding finding--${finding.severity}`}
        >
          <Icon
            name={finding.severity === 'verstoss' ? 'alert' : 'info'}
            className="finding__icon"
          />
          <div className="finding__body">
            <p className="finding__message">
              {showDate && finding.date && (
                <span className="finding__date">{formatDateShort(finding.date)}</span>
              )}
              {finding.message}
            </p>
            <span className="finding__reference">{finding.reference}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
