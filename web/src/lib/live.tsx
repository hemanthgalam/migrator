import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { LogEntry, Run } from './types';

type LiveEvent = { type: 'run'; data: Run } | { type: 'log'; data: LogEntry } | { type: 'queue'; data: unknown };
type Listener = (e: LiveEvent) => void;

const LiveContext = createContext<{ connected: boolean; subscribe: (fn: Listener) => () => void } | null>(null);

/** One Server-Sent Events connection shared by the whole app. */
export function LiveProvider({ children }: { children: ReactNode }) {
  const listeners = useRef(new Set<Listener>());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const es = new EventSource('/api/events');
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    for (const type of ['run', 'log', 'queue'] as const) {
      es.addEventListener(type, (msg) => {
        const event = { type, data: JSON.parse((msg as MessageEvent).data) } as LiveEvent;
        listeners.current.forEach((fn) => fn(event));
      });
    }
    return () => es.close();
  }, []);

  const subscribe = (fn: Listener) => {
    listeners.current.add(fn);
    return () => { listeners.current.delete(fn); };
  };

  return <LiveContext.Provider value={{ connected, subscribe }}>{children}</LiveContext.Provider>;
}

export function useLive(handler?: Listener) {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error('useLive must be used inside LiveProvider');
  const ref = useRef(handler);
  ref.current = handler;
  const { subscribe } = ctx;
  useEffect(() => subscribe((e) => ref.current?.(e)), [subscribe]);
  return ctx.connected;
}

/** Merge a live run update into a list, newest first. */
export function upsertRun(list: Run[] | undefined, run: Run, filter?: (r: Run) => boolean): Run[] {
  const current = list || [];
  if (filter && !filter(run)) return current.filter((r) => r.id !== run.id);
  const i = current.findIndex((r) => r.id === run.id);
  if (i === -1) return [run, ...current];
  const next = current.slice();
  next[i] = run;
  return next;
}
