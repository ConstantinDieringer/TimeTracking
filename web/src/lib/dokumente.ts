/**
 * Dienstverträge als PDF: Ablegen durch die Verwaltung, Ansehen durch die
 * Person selbst.
 *
 * Wer was darf, entscheidet die Datenbank (Tabelle `contract_documents` und
 * Bucket `dienstvertraege`, siehe Migration 20261011120000). Dieser Code
 * prüft nur, was sich vor dem Hochladen sinnvoll prüfen lässt.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, type Tables } from './supabase';

export type ContractDocument = Tables['contract_documents']['Row'];
export type DocumentKind = 'dienstvertrag' | 'dienstzettel' | 'nachtrag';

export const BUCKET = 'dienstvertraege';
export const MAX_BYTES = 10 * 1024 * 1024;

export const KIND_LABEL: Record<DocumentKind, { de: string; en: string }> = {
  dienstvertrag: { de: 'Dienstvertrag', en: 'Employment contract' },
  dienstzettel: { de: 'Dienstzettel', en: 'Statement of employment terms' },
  nachtrag: { de: 'Nachtrag', en: 'Amendment' },
};

export function useContractDocuments(employeeId: string | undefined) {
  return useQuery({
    queryKey: ['contract-documents', employeeId],
    enabled: Boolean(employeeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contract_documents')
        .select('*')
        .eq('employee_id', employeeId!)
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/** Der Prüfwert, mit dem sich eine ausgetauschte Datei erkennen lässt. */
async function sha256(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Ein PDF beginnt mit „%PDF-“. Die Endung allein sagt nichts. */
function looksLikePdf(data: ArrayBuffer): boolean {
  const head = new Uint8Array(data.slice(0, 5));
  return String.fromCharCode(...head) === '%PDF-';
}

export function useUploadContractDocument(employeeId: string, organizationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { file: File; kind: DocumentKind; validFrom: string | null }) => {
      const { file, kind, validFrom } = input;
      if (file.size === 0) throw new Error('Die Datei ist leer.');
      if (file.size > MAX_BYTES) throw new Error('Die Datei ist größer als 10 MB.');

      const data = await file.arrayBuffer();
      if (!looksLikePdf(data)) throw new Error('Nur PDF-Dateien können abgelegt werden.');

      const path = `${organizationId}/${employeeId}/${crypto.randomUUID()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, data, { contentType: 'application/pdf', upsert: false });
      if (uploadError) throw uploadError;

      const { error: rowError } = await supabase.from('contract_documents').insert({
        employee_id: employeeId,
        organization_id: organizationId,
        kind,
        valid_from: validFrom,
        file_name: file.name.slice(0, 200),
        storage_path: path,
        size_bytes: file.size,
        sha256: await sha256(data),
      });
      if (rowError) {
        // Ohne Zeile wäre die Datei unsichtbar und würde nie gelöscht.
        await supabase.storage.from(BUCKET).remove([path]);
        throw rowError;
      }
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['contract-documents', employeeId] });
      void client.invalidateQueries({ queryKey: ['audit-log', employeeId] });
    },
  });
}

export function useDeleteContractDocument(employeeId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (document: ContractDocument) => {
      // Erst die Zeile: ihr Löschen wird protokolliert. Scheitert danach das
      // Entfernen der Datei, bleibt sie für niemanden erreichbar liegen.
      const { error: rowError } = await supabase
        .from('contract_documents')
        .delete()
        .eq('id', document.id);
      if (rowError) throw rowError;
      const { error: fileError } = await supabase.storage.from(BUCKET).remove([document.storage_path]);
      if (fileError) throw fileError;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['contract-documents', employeeId] });
      void client.invalidateQueries({ queryKey: ['audit-log', employeeId] });
    },
  });
}

export interface OpenedDocument {
  url: string;
  /** Stimmt die Datei noch mit dem Prüfwert beim Ablegen überein? */
  intact: boolean;
}

/**
 * Lädt das PDF über die angemeldete Verbindung. Ein öffentlicher Link
 * entsteht dabei nicht — die Datei wird nur im eigenen Browser geöffnet.
 */
export async function loadContractDocument(document: ContractDocument): Promise<OpenedDocument> {
  const { data, error } = await supabase.storage.from(BUCKET).download(document.storage_path);
  if (error) throw error;
  const buffer = await data.arrayBuffer();
  const intact = (await sha256(buffer)) === document.sha256;
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }));
  return { url, intact };
}

/** Vermerkt das erste Öffnen durch die Person selbst (Nachweis nach § 2 AVRAG). */
export async function markViewed(documentId: string): Promise<void> {
  await supabase.rpc('mark_contract_document_viewed', { p_document: documentId });
}

/**
 * Öffnet das PDF in einem neuen Tab. Der Tab wird sofort beim Klick geöffnet,
 * bevor die Datei geladen ist — sonst hielte ihn der Browser für ein Pop-up.
 * Wo das nicht geht, wird die Datei stattdessen gespeichert.
 *
 * Angezeigt wird über einen signierten Link, der nach 60 Sekunden verfällt,
 * nicht über eine blob:-Adresse: ein blob:-Tab übernähme die Content Security
 * Policy der Anwendung, und `object-src 'none'` hält Chrome dort vom
 * PDF-Viewer ab. Der Prüfwert wird trotzdem an der geladenen Datei geprüft.
 */
export async function openContractDocument(document: ContractDocument): Promise<OpenedDocument> {
  const tab = window.open('', '_blank');
  try {
    const opened = await loadContractDocument(document);
    if (tab) {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(document.storage_path, 60);
      if (error) throw error;
      tab.location.href = data.signedUrl;
      URL.revokeObjectURL(opened.url);
    } else {
      saveContractDocument(opened.url, document.file_name);
      setTimeout(() => URL.revokeObjectURL(opened.url), 60_000);
    }
    return opened;
  } catch (error) {
    tab?.close();
    throw error;
  }
}

export function saveContractDocument(url: string, fileName: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  link.click();
}

export async function downloadContractDocument(document: ContractDocument): Promise<OpenedDocument> {
  const opened = await loadContractDocument(document);
  saveContractDocument(opened.url, document.file_name);
  setTimeout(() => URL.revokeObjectURL(opened.url), 60_000);
  return opened;
}

export function formatBytes(bytes: number, locale: string): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString(locale)} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString(locale, { maximumFractionDigits: 1 })} MB`;
}
