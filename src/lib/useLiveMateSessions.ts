import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchLiveMateSessions, LiveMateSession } from './liveMateSessions';
import { supabase } from './supabase';

type LiveMateSessionsState = {
  sessions: LiveMateSession[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export const useLiveMateSessions = (): LiveMateSessionsState => {
  const [sessions, setSessions] = useState<LiveMateSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const refreshIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const refreshId = refreshIdRef.current + 1;
    refreshIdRef.current = refreshId;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id || null;

      if (!mountedRef.current || refreshId !== refreshIdRef.current) return;

      setUserId(currentUserId);
      if (!currentUserId) {
        setSessions([]);
        setError(null);
        setLoading(false);
        return;
      }

      const nextSessions = await fetchLiveMateSessions();
      if (!mountedRef.current || refreshId !== refreshIdRef.current) return;

      setSessions(nextSessions);
      setError(null);
    } catch (refreshError: any) {
      if (!mountedRef.current || refreshId !== refreshIdRef.current) return;

      console.warn('Could not refresh live mate sessions:', refreshError);
      setError(refreshError?.message || 'Could not load live mates.');
    } finally {
      if (mountedRef.current && refreshId === refreshIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      refresh();
    });

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [refresh]);

  useEffect(() => {
    if (!userId) return undefined;

    const channel = supabase
      .channel(`live-mate-sessions-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_mate_sessions',
        },
        () => {
          refresh();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh, userId]);

  return { sessions, loading, error, refresh };
};
