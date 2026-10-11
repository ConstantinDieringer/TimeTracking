import { formatDateShort } from '@zeiterfassung/legal';
import { Icon } from '../components/Icon';
import { InfoTip } from '../components/InfoTip';
import { Loading } from '../components/Loading';
import { useToast } from '../components/Toast';
import {
  KIND_LABEL,
  downloadContractDocument,
  formatBytes,
  markViewed,
  openContractDocument,
  useContractDocuments,
  type ContractDocument,
  type DocumentKind,
} from '../lib/dokumente';
import { useI18n } from '../lib/i18n';
import { useSession } from '../lib/session';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Der eigene Dienstvertrag zum Ansehen, Speichern und Ausdrucken. Genau das
 * verlangt § 2 AVRAG für eine elektronische Übergabe des Dienstzettels.
 */
export function MeinVertrag() {
  const { profile } = useSession();
  const { t, locale, intlLocale } = useI18n();
  const toast = useToast();
  const client = useQueryClient();
  const documents = useContractDocuments(profile?.id);

  async function handle(
    action: (document: ContractDocument) => Promise<{ intact: boolean }>,
    document: ContractDocument,
  ) {
    try {
      const { intact } = await action(document);
      if (!document.first_viewed_at) {
        await markViewed(document.id);
        void client.invalidateQueries({ queryKey: ['contract-documents', profile?.id] });
      }
      if (!intact) {
        toast.show(
          'error',
          t('Prüfwert stimmt nicht', 'Checksum mismatch'),
          t(
            'Die Datei weicht von der abgelegten Fassung ab. Bitte die Personalverwaltung informieren.',
            'The file differs from the version that was stored. Please inform your HR administration.',
          ),
        );
      }
    } catch (cause) {
      toast.show(
        'error',
        t('Öffnen fehlgeschlagen', 'Could not open the document'),
        cause instanceof Error ? cause.message : String(cause),
      );
    }
  }

  return (
    <main className="page">
      <div className="page__head">
        <div>
          <h1>
            {t('Mein Vertrag', 'My contract')}
            <InfoTip>
              <span>
                {t(
                  'Nur Sie und die Personalverwaltung Ihres Unternehmens können diese Dokumente sehen. Wann Sie ein Dokument zum ersten Mal geöffnet haben, wird als Nachweis der Übergabe gespeichert. Gespeichert wird in der EU.',
                  'Only you and your company’s HR administration can see these documents. The first time you open a document is recorded as proof of delivery. Data is stored in the EU.',
                )}
              </span>
              <span className="infotip__ref">§ 2 AVRAG</span>
            </InfoTip>
          </h1>
          <p className="page__subtitle">
            {t(
              'Dienstvertrag, Dienstzettel und Nachträge, die die Personalverwaltung abgelegt hat.',
              'Employment contract, statement of terms and amendments stored by your HR administration.',
            )}
          </p>
        </div>
      </div>

      {documents.isLoading && <Loading />}

      {documents.data && documents.data.length === 0 && (
        <section className="section">
          <p className="empty">
            <Icon name="file" />
            {t(
              'Noch kein Dokument abgelegt. Die Personalverwaltung stellt Ihren Dienstvertrag hier bereit.',
              'No document yet. Your HR administration will provide your employment contract here.',
            )}
          </p>
        </section>
      )}

      {documents.data && documents.data.length > 0 && (
        <section className="section">
          <ul className="documents">
            {documents.data.map((document) => (
              <li key={document.id} className="document">
                <Icon name="file" size={22} className="document__icon" />
                <div className="document__body">
                  <p className="document__title">
                    {KIND_LABEL[document.kind as DocumentKind]?.[locale] ?? document.kind}
                    {document.valid_from &&
                      ` · ${t('gültig ab', 'valid from')} ${formatDateShort(document.valid_from)}`}
                  </p>
                  <p className="meta document__name" title={document.file_name}>
                    {document.file_name} · {formatBytes(document.size_bytes, intlLocale)} ·{' '}
                    {t('bereitgestellt am', 'provided on')}{' '}
                    {new Date(document.uploaded_at).toLocaleDateString(intlLocale)}
                  </p>
                </div>
                <div className="row row--nowrap document__actions">
                  <button
                    className="button"
                    type="button"
                    onClick={() => void handle(openContractDocument, document)}
                  >
                    {t('Ansehen', 'View')}
                  </button>
                  <button
                    className="button button--quiet"
                    type="button"
                    onClick={() => void handle(downloadContractDocument, document)}
                  >
                    {t('Speichern', 'Save')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

    </main>
  );
}
