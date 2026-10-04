import clsx from 'clsx';
import { Activity, Cable, LayoutDashboard, Menu, Moon, Plus, Settings, Sun, Workflow, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useApi, useDebounced } from '../lib/hooks';
import { useLive } from '../lib/live';
import { Button } from './ui';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/pipelines', label: 'Pipelines', icon: Workflow },
  { to: '/runs', label: 'Runs', icon: Activity },
  { to: '/connections', label: 'Connections', icon: Cable },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('theme', theme); } catch { /* storage unavailable */ }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))] as const;
}

function WorkerStatus() {
  const { data, reload } = useApi<{ queue: { concurrency: number; active: number } }>('/health');
  const refresh = useDebounced(reload, 300);
  const connected = useLive((e) => { if (e.type === 'run' || e.type === 'queue') refresh(); });
  const q = data?.queue;
  return (
    <div className="rounded-xl border border-default surface p-3" data-testid="worker-status">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-1">Workers</span>
        <span className={clsx('inline-flex items-center gap-1.5', connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-3')}>
          <span className={clsx('size-1.5 rounded-full', connected ? 'bg-emerald-500' : 'bg-slate-400')} />
          {connected ? 'Live' : 'Offline'}
        </span>
      </div>
      <div className="mt-2 flex gap-1" aria-label={`${q?.active ?? 0} of ${q?.concurrency ?? 0} workers busy`}>
        {Array.from({ length: q?.concurrency ?? 0 }).map((_, i) => (
          <span key={i} className={clsx('h-1.5 flex-1 rounded-full', i < (q?.active ?? 0) ? 'bg-brand-600 progress-animated' : 'surface-2')} />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-3">{q ? `${q.active} of ${q.concurrency} busy` : '—'}</p>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [theme, toggleTheme] = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMenuOpen(false), [location.pathname]);

  const sidebar = (
    <div className="flex h-full flex-col gap-6 px-3 py-5">
      <Link to="/" className="flex items-center gap-2.5 px-2">
        <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
          <Workflow className="size-4.5" />
        </span>
        <span className="text-[15px] font-semibold tracking-tight text-1">Migrator</span>
        <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700 uppercase dark:bg-brand-600/15 dark:text-indigo-300">ETL</span>
      </Link>
      <nav className="flex flex-col gap-0.5" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => clsx(
              'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
              isActive ? 'bg-brand-50 text-brand-700 dark:bg-brand-600/15 dark:text-indigo-300' : 'text-2 hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]',
            )}
          >
            <Icon className="size-4" />{label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto space-y-3">
        <WorkerStatus />
        <button onClick={toggleTheme} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-2 hover:bg-[var(--surface-2)]" aria-label="Toggle theme">
          {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-default surface lg:block">{sidebar}</aside>
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMenuOpen(false)}>
          <div className="absolute inset-0 bg-slate-950/40" />
          <aside className="absolute inset-y-0 left-0 w-64 surface shadow-xl" onClick={(e) => e.stopPropagation()}>{sidebar}</aside>
        </div>
      )}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-default bg-[var(--surface-0)]/85 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button className="rounded-md p-1.5 text-2 lg:hidden" onClick={() => setMenuOpen((o) => !o)} aria-label="Open menu">
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          <span className="text-sm font-medium text-2 lg:hidden">Migrator</span>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/pipelines/new"><Button variant="primary" size="sm" icon={<Plus className="size-4" />}>New pipeline</Button></Link>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
