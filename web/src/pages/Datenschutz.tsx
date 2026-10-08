import { useEffect, useState, type FormEvent } from 'react';
import { privacyNoticeTemplate, usePrivacyNotice, useSavePrivacyNotice } from '../lib/privacy';
import { useSession } from '../lib/session';

/**
 * Datenschutzinformation nach Art. 13 DSGVO — für alle lesbar, für die
 * Verwaltung bearbeitbar.
 */
export function Datenschutz() {
  const { isAdmin, organization } = useSession();
  const notice = usePrivacyNotice();
  const save = useSavePrivacyNotice();

  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (notice.data !== undefined) setDraft(notice.data);
  }, [notice.data]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await save.mutateAsync(draft.trim());
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Speichern fehlgeschlagen.');
    }
  }

  const text = notice.data ?? '';

  return (
    <main className="page">
      <div className="page__head">
        <div>
          <h1>Datenschutz</h1>
          <p className="page__subtitle">Information nach Art. 13 DSGVO</p>
        </div>
        {isAdmin && !editing && (
          <button className="button" type="button" onClick={() => setEditing(true)}>
            Bearbeiten
          </button>
        )}
      </div>

      {notice.isLoading && <p className="muted">Wird geladen …</p>}

      {!editing && notice.data !== undefined && (
        <section className="section">
          {text ? (
            <div className="prose">{text}</div>
          ) : (
            <p className="muted">
              {isAdmin
                ? 'Noch keine Datenschutzinformation hinterlegt. Mitarbeiter sind vor Beginn der Aufzeichnung zu informieren (Art. 13 DSGVO). Über „Bearbeiten“ lässt sich eine Vorlage übernehmen.'
                : 'Die Verwaltung hat hier noch keine Datenschutzinformation hinterlegt. Bitte wenden Sie sich an Ihre Personalverwaltung.'}
            </p>
          )}
        </section>
      )}

      {editing && (
        <form onSubmit={handleSubmit}>
          <fieldset>
            <legend>Text für alle Mitarbeiter</legend>
            <label htmlFor="ds-text" className="visually-hidden">
              Datenschutzinformation
            </label>
            <textarea
              id="ds-text"
              rows={28}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <p className="muted editor__note">
              Verantwortlich ist Ihr Unternehmen, nicht der Betreiber dieser Software. Die Vorlage
              beschreibt, was die Software tatsächlich verarbeitet; Angaben in eckigen Klammern
              müssen Sie ergänzen. Sie ist keine Rechtsberatung — lassen Sie den Text vor der
              Veröffentlichung prüfen.
            </p>
          </fieldset>

          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}

          <div className="editor__actions">
            <button className="button button--primary" type="submit" disabled={save.isPending}>
              {save.isPending ? 'Wird gespeichert …' : 'Speichern'}
            </button>
            <button
              className="button"
              type="button"
              onClick={() => {
                if (
                  !draft.trim() ||
                  window.confirm('Den bisherigen Text durch die Vorlage ersetzen?')
                ) {
                  setDraft(privacyNoticeTemplate(organization?.name ?? '[Unternehmen]'));
                }
              }}
            >
              Vorlage einfügen
            </button>
            <button
              className="button button--quiet"
              type="button"
              onClick={() => {
                setDraft(text);
                setEditing(false);
              }}
            >
              Abbrechen
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
