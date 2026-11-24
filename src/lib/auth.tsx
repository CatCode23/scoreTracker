import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isConfigured } from './supabase';
import type { Assignment, Profile } from './types';
import type { Access } from './domain/permissions';

interface AuthState extends Access {
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(isConfigured);
  const qc = useQueryClient();

  useEffect(() => {
    if (!isConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_IN' && window.location.search.includes('code=')) {
        // Strip the PKCE ?code= from the URL, keep the hash route.
        window.history.replaceState(null, '', window.location.pathname + (window.location.hash || '#/ops'));
      }
      if (event === 'SIGNED_OUT') qc.removeQueries({ queryKey: ['ops'] });
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);

  const uid = session?.user.id;
  const profileQ = useQuery({
    queryKey: ['ops', 'me', uid],
    enabled: Boolean(uid),
    queryFn: async () => {
      const [p, a] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', uid!).maybeSingle(),
        supabase.from('user_assignments').select('*').eq('profile_id', uid!).eq('active', true),
      ]);
      if (p.error) throw p.error;
      if (a.error) throw a.error;
      return { profile: (p.data as Profile | null) ?? null, assignments: (a.data as Assignment[]) ?? [] };
    },
  });

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile: profileQ.data?.profile ?? null,
      assignments: profileQ.data?.assignments ?? [],
      loading: sessionLoading || (Boolean(uid) && profileQ.isLoading),
      signOut: async () => {
        await supabase.auth.signOut();
      },
      refresh: () => void profileQ.refetch(),
    }),
    [session, profileQ, sessionLoading, uid],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** For tests / storybook-like rendering with a fixed identity. */
export function TestAuthProvider({ value, children }: { value: Partial<AuthState>; children: ReactNode }) {
  const v: AuthState = {
    session: null,
    profile: null,
    assignments: [],
    loading: false,
    signOut: async () => {},
    refresh: () => {},
    ...value,
  };
  return <AuthContext.Provider value={v}>{children}</AuthContext.Provider>;
}
