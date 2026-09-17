import { formatDateShort, type RuleResult } from '@zeiterfassung/legal';

/**
 * Darstellung der Regelbefunde.
 *
 * Die Fundstelle steht immer neben der Meldung. Das ist keine Zierde: eine
 * Warnung, die ihre gesetzliche Grundlage nennt, lässt sich nachschlagen und
 * gegebenenfalls widerlegen — eine ohne wirkt wie eine Behauptung der Software.
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
    return emptyText ? <p className="empty">{emptyText}</p> : null;
  }

  return (
    <div>
      {findings.map((finding, index) => (
        <div
          key={`${finding.code}-${finding.date ?? index}`}
          className={`finding finding--${finding.severity}`}
        >
          <span className="finding__reference">{finding.reference}</span>
          <p className="finding__message">
            {showDate && finding.date && (
              <span className="muted">{formatDateShort(finding.date)} — </span>
            )}
            {finding.message}
          </p>
        </div>
      ))}
    </div>
  );
}
