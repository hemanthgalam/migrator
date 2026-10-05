import clsx from 'clsx';
import { Activity, BookOpen, Cable, LayoutDashboard, Menu, Moon, Plus, Settings, Sun, Workflow, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { IS_DEMO } from '../lib/api';
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

function DemoBanner() {
  const reset = () => import('../demo/server').then((m) => m.resetDemo());
  return (
    <div className="border-b border-brand-200 bg-brand-50 px-4 py-2 text-[13px] text-navy-800 sm:px-6 lg:px-8 dark:border-brand-600/30 dark:bg-brand-600/10 dark:text-sky-200" data-testid="demo-banner">
      <span className="font-medium">Browser demo.</span> Pipelines run in this tab with sample data and file storage, and your changes stay in this browser.
      Databases need the <a className="underline" href="https://github.com/hemanthgalam/migrator#quick-start">self-hosted server</a>.{' '}
      <button className="underline" onClick={reset}>Reset demo</button>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [theme, toggleTheme] = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMenuOpen(false), [location.pathname]);

  const sidebar = (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-5">
      <nav className="flex flex-col gap-0.5" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => clsx(
              'flex items-center gap-2.5 rounded-lg border-l-[3px] px-2.5 py-2 text-sm transition-colors',
              isActive
                ? 'border-brand-600 bg-brand-50 font-semibold text-brand-600 dark:border-brand-400 dark:bg-brand-500/15 dark:text-sky-300'
                : 'border-transparent font-medium text-2 hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]',
            )}
          >
            <Icon className="size-4" />{label}
          </NavLink>
        ))}
        <a
          href={`${import.meta.env.BASE_URL}api-docs/`}
          className="flex items-center gap-2.5 rounded-lg border-l-[3px] border-transparent px-2.5 py-2 text-sm font-medium text-2 transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]"
        >
          <BookOpen className="size-4" />API docs
        </a>
      </nav>
      <div className="mt-auto">
        <WorkerStatus />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <header className="fixed inset-x-0 top-0 z-50 flex h-12 items-center gap-3 bg-navy-800 px-3 text-white shadow-sm sm:px-4 dark:border-b dark:border-white/10 dark:bg-navy-900">
        <button className="rounded-md p-1.5 text-slate-200 hover:bg-white/10 lg:hidden" onClick={() => setMenuOpen((o) => !o)} aria-label="Open menu">
          {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
        <Link to="/" className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-md bg-cta-500 text-navy-900">
            <Workflow className="size-4" />
          </span>
          <span className="text-[15px] font-bold tracking-tight">Migrator</span>
          <span className="rounded border border-white/25 px-1.5 py-px text-[10px] font-semibold tracking-wide text-slate-200 uppercase">ETL</span>
        </Link>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={toggleTheme} className="rounded-full p-2 text-slate-200 hover:bg-white/10" aria-label="Toggle theme" title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <Link to="/pipelines/new"><Button variant="primary" size="sm" icon={<Plus className="size-4" />}>New pipeline</Button></Link>
        </div>
      </header>
      <aside className="fixed top-12 bottom-0 left-0 hidden w-60 border-r border-default surface lg:block">{sidebar}</aside>
      {menuOpen && (
        <div className="fixed inset-x-0 top-12 bottom-0 z-40 lg:hidden" onClick={() => setMenuOpen(false)}>
          <div className="absolute inset-0 bg-slate-950/40" />
          <aside className="absolute inset-y-0 left-0 w-64 surface shadow-xl" onClick={(e) => e.stopPropagation()}>{sidebar}</aside>
        </div>
      )}
      <div className="pt-12 lg:pl-60">
        {IS_DEMO && <DemoBanner />}
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
