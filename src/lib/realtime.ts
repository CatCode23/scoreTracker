import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, isConfigured } from './supabase';

/**
 * Public live updates. Subscribes to the non-sensitive public_updates feed and refetches
 * the public views when an official/public change happens. Falls back to polling.
 */
export function usePublicRealtime(): 'live' | 'connecting' | 'polling' {
  const qc = useQueryClient();
  const [state, setState] = useState<'live' | 'connecting' | 'polling'>(
    isConfigured ? 'connecting' : 'polling',
  );

  useEffect(() => {
    if (!isConfigured) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel('public-updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'public_updates' },
        () => {
          clearTimeout(timer);
          timer = setTimeout(() => void qc.invalidateQueries({ queryKey: ['public'] }), 400);
        },
      )
      .subscribe((status) => {
        setState(
          status === 'SUBSCRIBED'
            ? 'live'
            : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT'
              ? 'polling'
              : 'connecting',
        );
      });
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  return state;
}

/** Operations live updates (RLS-filtered by Supabase Realtime). */
export function useOpsRealtime(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!isConfigured || !enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ['ops'] });
        void qc.invalidateQueries({ queryKey: ['public'] });
      }, 500);
    };
    const channel = supabase
      .channel('ops-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_results' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'corrections' }, refresh)
      .subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [qc, enabled]);
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
