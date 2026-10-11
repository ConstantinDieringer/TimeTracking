import { formatDateShort } from '@zeiterfassung/legal';
import { useRef, useState, type FormEvent } from 'react';
import {
  KIND_LABEL,
  MAX_BYTES,
  downloadContractDocument,
  formatBytes,
  openContractDocument,
  useContractDocuments,
  useDeleteContractDocument,
  useUploadContractDocument,
  type ContractDocument,
  type DocumentKind,
} from '../lib/dokumente';
import { useSession } from '../lib/session';
import { InfoTip } from './InfoTip';
import { useToast } from './Toast';

/**
 * Dienstverträge einer Person im Mitarbeiterblatt der Verwaltung.
 *
 * Nur ablegen und löschen, nie ersetzen: eine Änderung des Vertrags ist ein
 * Nachtrag, der neben dem alten Dokument liegt.
 */
export function Dienstvertraege({ employeeId }: { employeeId: string }) {
  const { organization } = useSession();
  const toast = useToast();
  const documents = useContractDocuments(employeeId);
  const upload = useUploadContractDocument(employeeId, organization?.id ?? '');
  const remove = useDeleteContractDocument(employeeId);

  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<DocumentKind>('dienstvertrag');
  const [validFrom, setValidFrom] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setError(null);
    try {
      await upload.mutateAsync({ file, kind, validFrom: validFrom || null });
      toast.show('success', `${KIND_LABEL[kind].de} abgelegt`, 'Die Person kann ihn jetzt unter „Vertrag“ ansehen.');
      setFile(null);
      setValidFrom('');
      if (fileInput.current) fileInput.current.value = '';
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function handleDelete(document: ContractDocument) {
    if (
      !window.confirm(
        `„${document.file_name}“ endgültig löschen?\n\nDienstverträge sind Personalunterlagen und in der Regel bis sieben Jahre nach dem Austritt aufzubewahren. Nur löschen, wenn das Dokument falsch abgelegt wurde oder die Frist abgelaufen ist. Das Löschen wird protokolliert.`,
      )
    ) {
      return;
    }
    try {
      await remove.mutateAsync(document);
      toast.show('success', 'Dokument gelöscht');
    } catch (cause) {
      toast.show('error', 'Löschen fehlgeschlagen', cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function handle(action: (document: ContractDocument) => Promise<{ intact: boolean }>, document: ContractDocument) {
    try {
      const { intact } = await action(document);
      if (!intact) {
        toast.show('error', 'Prüfwert stimmt nicht', 'Die Datei weicht von der abgelegten Fassung ab.');
      }
    } catch (cause) {
      toast.show('error', 'Öffnen fehlgeschlagen', cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <section className="section">
      <div className="section__head">
        <h2>
          Dienstvertrag
          <InfoTip>
            <span>
              Sehen können das Dokument nur die Verwaltung dieses Unternehmens und die Person
              selbst. Ablegen, erstes Öffnen durch die Person und Löschen werden protokolliert; das
              erste Öffnen gilt als Nachweis der elektronischen Übergabe eines Dienstzettels.
            </span>
            <span>
              Abgelegte Dateien lassen sich nicht ersetzen — eine Änderung als Nachtrag hochladen.
            </span>
            <span>
              <strong>Keine Gesundheitsdaten</strong>, Angaben zu einer Behinderung oder zur
              Gewerkschaftszugehörigkeit im Dokument, soweit sie für das Arbeitsverhältnis nicht
              nötig sind.
            </span>
            <span className="infotip__ref">§ 2 AVRAG, Art. 9 DSGVO</span>
          </InfoTip>
        </h2>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Art</th>
              <th className="grow">Datei</th>
              <th>Gültig ab</th>
              <th>Abgelegt</th>
              <th>Von der Person geöffnet</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(documents.data ?? []).map((document) => (
              <tr key={document.id}>
                <td>{KIND_LABEL[document.kind as DocumentKind]?.de ?? document.kind}</td>
                <td className="grow">
                  <span className="document__name" title={document.file_name}>
                    {document.file_name}
                  </span>{' '}
                  <span className="meta">{formatBytes(document.size_bytes, 'de-AT')}</span>
                </td>
                <td className="num num--muted">
                  {document.valid_from ? formatDateShort(document.valid_from) : '—'}
                </td>
                <td className="num num--muted">
                  {new Date(document.uploaded_at).toLocaleDateString('de-AT')}
                </td>
                <td className="num num--muted">
                  {document.first_viewed_at
                    ? new Date(document.first_viewed_at).toLocaleString('de-AT')
                    : 'noch nicht'}
                </td>
                <td>
                  <div className="row row--nowrap">
                    <button
                      className="button button--quiet"
                      type="button"
                      onClick={() => void handle(openContractDocument, document)}
                    >
                      Ansehen
                    </button>
                    <button
                      className="button button--quiet"
                      type="button"
                      onClick={() => void handle(downloadContractDocument, document)}
                    >
                      Speichern
                    </button>
                    <button
                      className="button button--quiet button--danger"
                      type="button"
                      disabled={remove.isPending}
                      onClick={() => void handleDelete(document)}
                    >
                      Löschen
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {documents.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  Noch kein Dienstvertrag abgelegt.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form className="editor" onSubmit={handleUpload}>
        <div className="form-grid">
          <div>
            <label htmlFor="dok-datei">PDF-Datei (höchstens {formatBytes(MAX_BYTES, 'de-AT')})</label>
            <input
              id="dok-datei"
              ref={fileInput}
              type="file"
              accept="application/pdf,.pdf"
              required
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <div>
            <label htmlFor="dok-art">Art</label>
            <select id="dok-art" value={kind} onChange={(event) => setKind(event.target.value as DocumentKind)}>
              {(Object.keys(KIND_LABEL) as DocumentKind[]).map((value) => (
                <option key={value} value={value}>
                  {KIND_LABEL[value].de}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="dok-gueltig">Gültig ab</label>
            <input
              id="dok-gueltig"
              type="date"
              value={validFrom}
              onChange={(event) => setValidFrom(event.target.value)}
            />
          </div>
        </div>

        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}

        <div className="editor__actions">
          <button className="button button--primary" type="submit" disabled={!file || upload.isPending}>
            {upload.isPending ? 'Wird abgelegt …' : 'Hochladen'}
          </button>
        </div>
      </form>

    </section>
  );
}
