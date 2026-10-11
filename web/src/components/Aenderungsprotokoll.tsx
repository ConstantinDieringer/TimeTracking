import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  CATEGORY_LABEL,
  changedByLabel,
  describeEntry,
  groupStampDays,
  type Category,
  type Lookups,
} from '../lib/protokoll';
import { useAllEmployees, useAuditLog } from '../lib/queries';
import { supabase } from '../lib/supabase';
import { InfoTip } from './InfoTip';

const FILTERS: Array<Category | 'alle'> = ['alle', 'eingetragen', 'geaendert', 'hochgeladen', 'geloescht', 'zugang'];

/**
 * Änderungsprotokoll einer Person im Mitarbeiterblatt.
 *
 * Gegliedert nach dem, was die Verwaltung wissen will: was eingetragen wurde
 * (mit Zeitraum), was hochgeladen wurde, und was geändert wurde — bei
 * Arbeitszeiten der ursprüngliche Zeitraum neben dem neuen.
 */
export function Aenderungsprotokoll({ employeeId }: { employeeId: string }) {
  // Ein gestempelter Tag sind sechs Einträge; 600 reichen gut drei Monate zurück.
  const audit = useAuditLog(employeeId, 600);
  const people = useAllEmployees(true);
  const [filter, setFilter] = useState<Category | 'alle'>('alle');

  // Alle Vertragsarten, auch archivierte: alte Einträge verweisen auf sie.
  const contractTypes = useQuery({
    queryKey: ['contract-types', 'alle'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('contract_types').select('id, label');
      if (error) throw error;
      return data;
    },
  });

  const lookups: Lookups = {
    names: new Map((people.data ?? []).map((person) => [person.id, person.display_name])),
    contractTypes: new Map((contractTypes.data ?? []).map((type) => [type.id, type.label])),
  };

  // Einträge ohne inhaltliche Änderung (etwa nur ein neuer Zeitstempel)
  // sagen niemandem etwas und fallen weg.
  const entries = groupStampDays(
    (audit.data ?? [])
      .map((entry) => ({ entry, described: describeEntry(entry, lookups) }))
      .filter(({ described }) => !described.empty),
  );

  const counts = new Map<Category, number>();
  for (const { described } of entries) {
    counts.set(described.category, (counts.get(described.category) ?? 0) + 1);
  }
  const shown = filter === 'alle' ? entries : entries.filter(({ described }) => described.category === filter);

  return (
    <section className="section">
      <div className="section__head">
        <h2>
          Änderungsprotokoll
          <InfoTip>
            <span>
              Wird von der Datenbank selbst geschrieben und lässt sich weder ändern noch löschen —
              auch nicht aus der Verwaltung heraus.
            </span>
            <span>
              Bei geänderten Arbeitszeiten steht der ursprüngliche Zeitraum durchgestrichen neben dem
              neuen. Zeiten in österreichischer Ortszeit.
            </span>
          </InfoTip>
        </h2>
        <span className="meta">Letzte {entries.length} Einträge</span>
      </div>

      <div className="protokoll__filter" role="group" aria-label="Nach Vorgang filtern">
        {FILTERS.filter((value) => value === 'alle' || counts.has(value)).map((value) => (
          <button
            key={value}
            type="button"
            className={`chip${filter === value ? ' chip--active' : ''}`}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {value === 'alle' ? 'Alle' : CATEGORY_LABEL[value]}
            <span className="chip__count">{value === 'alle' ? entries.length : counts.get(value)}</span>
          </button>
        ))}
      </div>

      <ol className="protokoll">
        {shown.map(({ entry, described }) => (
          <li key={entry.id} className="protokoll__eintrag">
            <div className="protokoll__kopf">
              <span className={`protokoll__art protokoll__art--${described.category}`}>
                {CATEGORY_LABEL[described.category]}
              </span>
              <span className="protokoll__titel">{described.title}</span>
              <span className="meta protokoll__wann">
                {new Date(entry.changed_at).toLocaleString('de-AT', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                · {changedByLabel(entry.changed_by, employeeId, lookups.names)}
              </span>
            </div>
            {(described.subject || described.detail) && (
              <p className="protokoll__betreff">
                {described.subject}
                {described.detail && <span className="muted"> · {described.detail}</span>}
              </p>
            )}
            {described.changes.length > 0 && (
              <ul className="protokoll__changes">
                {described.changes.map((change, index) => (
                  <li key={`${change.label}-${index}`}>
                    <span className="protokoll__feld">{change.label}:</span>{' '}
                    {change.before && change.after ? (
                      <>
                        <del>{change.before}</del> → <ins>{change.after}</ins>
                      </>
                    ) : change.after ? (
                      <ins>{change.after}</ins>
                    ) : (
                      <del>{change.before}</del>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
        {shown.length === 0 && <li className="empty">Keine Einträge.</li>}
      </ol>
    </section>
  );
}
