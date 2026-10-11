/**
 * Datenschutzinformation nach Art. 13 DSGVO.
 *
 * Verantwortlicher ist das jeweilige Unternehmen, nicht der Betreiber dieser
 * Software — deshalb hinterlegt jedes Unternehmen seinen eigenen Text. Er
 * liegt in `settings` unter `privacy_notice`; lesen darf jeder im
 * Unternehmen, schreiben nur die Verwaltung.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

export function usePrivacyNotice() {
  return useQuery({
    queryKey: ['privacy-notice'],
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'privacy_notice')
        .eq('valid_year', 0)
        .maybeSingle();
      if (error) throw error;
      return typeof data?.value === 'string' ? data.value : '';
    },
  });
}

export function useSavePrivacyNotice() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (text: string) => {
      const { error } = await supabase.rpc('save_privacy_notice', { p_text: text });
      if (error) throw error;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['privacy-notice'] });
    },
  });
}

/**
 * Ausgangspunkt für den eigenen Text. Beschreibt, was diese Software
 * tatsächlich verarbeitet; alles in eckigen Klammern muss das Unternehmen
 * selbst ergänzen. Keine Rechtsberatung — vor der Veröffentlichung prüfen
 * lassen.
 */
export function privacyNoticeTemplate(organizationName: string): string {
  return `Datenschutzinformation zur Arbeitszeiterfassung

1. Verantwortlicher
${organizationName}, [Anschrift], [E-Mail für Datenschutzanfragen]
[Falls bestellt: Datenschutzbeauftragte:r, Kontakt]

2. Zwecke und Rechtsgrundlagen
Wir zeichnen Ihre Arbeitszeiten auf, weil das Arbeitszeitgesetz uns dazu verpflichtet (§ 26 AZG), und überwachen damit die Einhaltung von Höchstarbeitszeiten, Ruhepausen und Ruhezeiten nach AZG, ARG und – bei Jugendlichen – KJBG. Die Aufzeichnungen sind außerdem Grundlage für Urlaubsverwaltung (UrlG) und Lohnverrechnung (Überstunden, Zuschläge).
Rechtsgrundlagen: Art. 6 Abs. 1 lit. c DSGVO (rechtliche Verpflichtung) und Art. 6 Abs. 1 lit. b DSGVO (Arbeitsvertrag). Für die Abwesenheitsart „Krankenstand“ – ohne Diagnose – Art. 9 Abs. 2 lit. b DSGVO.

3. Verarbeitete Daten
Name, Personalnummer, Geburtsdatum (bestimmt, ob das KJBG gilt), Ein- und Austrittsdatum, Bundesland, Vertragsdaten (Wochenstunden, Kollektivvertrag, Gleitzeitvereinbarung), Beginn und Ende von Arbeitszeit und Pausen, Abwesenheiten (Urlaub, Krankenstand, Pflegefreistellung u. a.) sowie ein Protokoll aller Änderungen an diesen Daten mit Zeitpunkt und ändernder Person.
Ihr Dienstvertrag, Dienstzettel und Nachträge als PDF, sofern die Personalverwaltung sie hier ablegt (Art. 6 Abs. 1 lit. b und c DSGVO, § 2 AVRAG). Sie sehen nur Ihre eigenen Dokumente, außer Ihnen nur die Personalverwaltung. Gespeichert wird, wann Sie ein Dokument zum ersten Mal geöffnet haben – als Nachweis der Übergabe.

4. Empfänger
Innerhalb des Unternehmens: die Personalverwaltung. [Lohnverrechnung / Steuerberatung: Name]. Auf Verlangen das Arbeitsinspektorat.
Auftragsverarbeiter: [Betreiber der Software, Name und Anschrift] sowie dessen Hosting-Dienstleister Supabase Inc.; die Daten liegen auf Servern in der EU (Irland).
[Übermittlung in Drittländer: Supabase Inc. hat ihren Sitz in den USA. Grundlage laut Auftragsverarbeitungsvertrag ergänzen, etwa EU-US Data Privacy Framework oder Standardvertragsklauseln.]

5. Speicherdauer
Während des Arbeitsverhältnisses und danach [7] Jahre ab Ende des Austrittsjahres, weil die Aufzeichnungen Grundlage der Lohnverrechnung sind. Für Dienstverträge gilt dieselbe Frist. Danach werden sie gelöscht.

6. Ihre Rechte
Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und Datenübertragbarkeit. Ihre eigenen Aufzeichnungen können Sie jederzeit unter „Monat“ als PDF oder CSV herunterladen (§ 26 Abs. 8 AZG).
Beschwerden können Sie an die Österreichische Datenschutzbehörde richten (www.dsb.gv.at).

7. Pflicht zur Bereitstellung
Die Aufzeichnung ist gesetzlich vorgeschrieben. Ohne sie ist eine Beschäftigung nicht möglich.

8. Keine automatisierte Entscheidung
Die Software weist auf mögliche Verstöße gegen Arbeitszeitvorschriften hin. Entscheidungen über Sie trifft sie nicht.
`;
}
