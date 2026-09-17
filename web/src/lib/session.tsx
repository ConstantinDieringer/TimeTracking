import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase, type ProfileRow } from './supabase';

interface SessionState {
  session: Session | null;
  profile: ProfileRow | null;
  loading: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);

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

    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setProfile(data);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [session]);

  const value = useMemo<SessionState>(
    () => ({
      session,
      profile,
      loading,
      // Die Rolle aus dem Profil steuert nur, was angezeigt wird. Verbindlich
      // ist allein die Row Level Security in der Datenbank — wer hier trickst,
      // sieht höchstens leere Tabellen.
      isAdmin: profile?.role === 'admin',
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, profile, loading],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession muss innerhalb von SessionProvider stehen.');
  return value;
}
