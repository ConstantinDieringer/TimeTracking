-- Tabellenrechte ausdrücklich vergeben
--
-- Ältere Supabase-Instanzen (und die lokale) gaben anon und authenticated per
-- Standardrecht alle Rechte auf jede neue Tabelle in `public`; geschützt hat
-- allein Row Level Security. Neue Cloud-Projekte tun das nicht mehr: dort
-- scheiterte jede Abfrage der Anwendung mit „permission denied“, auch die der
-- Edge Function mit dem service_role-Schlüssel.
--
-- Deshalb hier je Tabelle genau die Rechte, für die es auch eine Policy gibt.
-- RLS bleibt die eigentliche Schranke; die Rechte sind die zweite. anon
-- bekommt nichts — ohne Anmeldung gibt es in dieser Anwendung nichts zu sehen.
--
-- Neue Tabellen brauchen künftig in ihrer Migration eigene grant-Zeilen.

-- Lesen dürfen angemeldete Benutzer alles; was sie davon sehen, entscheidet RLS.
grant select on
  organizations,
  profiles,
  contract_types,
  employment_contracts,
  time_entries,
  absences,
  audit_log,
  settings
to authenticated;

-- Profile werden nur geändert: angelegt vom Trigger handle_new_user, gelöscht nie.
grant update on profiles to authenticated;

-- Erfassung durch Mitarbeiter und Verwaltung.
grant insert, update, delete on time_entries, absences to authenticated;

-- Stammdaten der Verwaltung.
grant insert, update, delete on contract_types, employment_contracts, settings to authenticated;

-- organizations und audit_log bleiben für Clients schreibgeschützt: das
-- Unternehmen ändert der Betreiber, das Protokoll schreibt nur der Trigger.

-- Die Edge Function admin-users arbeitet mit dem service_role-Schlüssel. Der
-- umgeht RLS, braucht aber trotzdem Tabellenrechte.
grant select, insert, update, delete on
  organizations,
  profiles,
  contract_types,
  employment_contracts,
  time_entries,
  absences,
  audit_log,
  settings
to service_role;

grant usage, select on all sequences in schema public to authenticated, service_role;
