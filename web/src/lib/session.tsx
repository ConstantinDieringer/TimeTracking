import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { supabase, type OrganizationRow, type ProfileRow } from './supabase';

interface SessionState {
  session: Session | null;
  profile: ProfileRow | null;
  organization: OrganizationRow | null;
  loading: boolean;
  isAdmin: boolean;
  isOwner: boolean;
  /** Profil und Unternehmen neu laden, etwa nach eigener Herabstufung oder Übertragung. */
  refresh: () => void;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [organization, setOrganization] = useState<OrganizationRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (!data.session) setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setProfile(null);
        setOrganization(null);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    let active = true;

    Promise.all([
      supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle(),
      // RLS liefert ausschließlich das eigene Unternehmen — oder nichts.
      supabase.from('organizations').select('*').maybeSingle(),
    ]).then(([profileResult, organizationResult]) => {
      if (!active) return;
      setProfile(profileResult.data);
      setOrganization(organizationResult.data);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [session, generation]);

  const refresh = useCallback(() => setGeneration((value) => value + 1), []);

  const value = useMemo<SessionState>(
    () => ({
      session,
      profile,
      organization,
      loading,
      // Die Rolle aus dem Profil steuert nur, was angezeigt wird. Verbindlich
      // ist allein die Row Level Security in der Datenbank — wer hier trickst,
      // sieht höchstens leere Tabellen.
      isAdmin: profile?.role === 'admin' && profile.organization_id !== null,
      isOwner: Boolean(profile && organization && organization.owner_id === profile.id),
      refresh,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, profile, organization, loading, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession muss innerhalb von SessionProvider stehen.');
  return value;
}
