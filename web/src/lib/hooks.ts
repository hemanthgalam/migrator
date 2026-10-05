import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(!!path);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (!path) return;
    const id = ++seq.current;
    try {
      const d = await api.get<T>(path);
      if (id === seq.current) { setData(d); setError(null); }
    } catch (e) {
      if (id === seq.current) setError(e as Error);
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    setLoading(!!path);
    reload();
  }, [reload, path]);

  return { data, error, loading, reload, setData };
}

/** Run `fn` at most once per `ms`, trailing. */
export function useDebounced(fn: () => void, ms: number) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return useCallback(() => {
    if (timer.current) return;
    timer.current = setTimeout(() => { timer.current = null; latest.current(); }, ms);
  }, [ms]);
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
