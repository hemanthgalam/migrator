import clsx from 'clsx';
import {
  AlertTriangle, CheckCircle2, Clock, Database, FileText, FlaskConical, Globe, Leaf, Loader2, RotateCw, X, XCircle, Ban,
} from 'lucide-react';
import {
  createContext, forwardRef, useCallback, useContext, useEffect, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import type { RunStatus } from '../lib/types';

// ---- Buttons ---------------------------------------------------------------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-cta-500 text-navy-900 hover:bg-cta-600 shadow-sm disabled:bg-cta-500/50',
  secondary: 'surface border border-brand-600 text-brand-600 hover:bg-brand-50 dark:border-brand-400 dark:text-sky-300 dark:hover:bg-brand-500/10',
  ghost: 'text-2 hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/50',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant; size?: 'sm' | 'md'; loading?: boolean; icon?: ReactNode;
}>(({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...props }, ref) => (
  <button
    ref={ref}
    disabled={disabled || loading}
    className={clsx(
      'inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-60',
      size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-9 px-3.5 text-sm',
      VARIANTS[variant],
      className,
    )}
    {...props}
  >
    {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
    {children}
  </button>
));
Button.displayName = 'Button';

// ---- Layout primitives -----------------------------------------------------

export function Card({ className, children, ...props }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('surface rounded-xl border border-default shadow-xs', className)} {...props}>{children}</div>;
}

export function CardHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-default px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-1">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-2">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, breadcrumb }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; breadcrumb?: ReactNode }) {
  return (
    <div className="mb-6">
      {breadcrumb && <div className="mb-2 text-[13px] text-3">{breadcrumb}</div>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-1">{title}</h1>
          {description && <p className="mt-1 text-sm text-2">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-600/15 dark:text-brand-500">{icon}</div>
      <h3 className="text-[15px] font-semibold text-1">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-2">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('size-5 animate-spin text-3', className)} />;
}

export function Loading() {
  return <div className="flex justify-center py-16"><Spinner /></div>;
}

export function ErrorBanner({ error }: { error: Error | string | null | undefined }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{typeof error === 'string' ? error : error.message}</span>
    </div>
  );
}

// ---- Form controls ---------------------------------------------------------

const control = 'w-full rounded-lg border border-default surface px-3 text-sm text-1 shadow-xs placeholder:text-[var(--text-3)] focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15 disabled:opacity-60';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={clsx(control, 'h-9', className)} {...props} />
));
Input.displayName = 'Input';

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(control, 'min-h-20 py-2 font-mono text-[13px]', className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={clsx(control, 'h-9 pr-8', className)} {...props}>{children}</select>;
}

export function Field({ label, help, htmlFor, children, required }: { label: string; help?: ReactNode; htmlFor?: string; children: ReactNode; required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-1">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
      {help && <p className="text-xs text-3">{help}</p>}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={clsx('relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors', checked ? 'bg-brand-600' : 'bg-[var(--status-neutral)]')}
    >
      <span className={clsx('inline-block size-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4.5' : 'translate-x-0.5')} />
    </button>
  );
}

// ---- Status ----------------------------------------------------------------

const STATUS: Record<RunStatus, { label: string; cls: string; icon: ReactNode }> = {
  queued: { label: 'Queued', cls: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700', icon: <Clock className="size-3.5" /> },
  retrying: { label: 'Retrying', cls: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900', icon: <RotateCw className="size-3.5" /> },
  running: { label: 'Running', cls: 'bg-brand-50 text-brand-700 ring-brand-100 dark:bg-brand-600/15 dark:text-sky-300 dark:ring-brand-600/30', icon: <Loader2 className="size-3.5 animate-spin" /> },
  succeeded: { label: 'Succeeded', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900', icon: <CheckCircle2 className="size-3.5" /> },
  failed: { label: 'Failed', cls: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900', icon: <XCircle className="size-3.5" /> },
  cancelled: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700', icon: <Ban className="size-3.5" /> },
};

export function StatusBadge({ status }: { status: RunStatus }) {
  const s = STATUS[status];
  return (
    <span data-testid="run-status" data-status={status} className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', s.cls)}>
      {s.icon}{s.label}
    </span>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'brand' }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium',
      tone === 'brand' ? 'bg-brand-50 text-brand-700 dark:bg-brand-600/15 dark:text-sky-300' : 'surface-2 text-2')}>
      {children}
    </span>
  );
}

export function Progress({ value, active, tone = 'brand' }: { value: number | null; active?: boolean; tone?: 'brand' | 'good' | 'bad' }) {
  const pct = value == null ? (active ? 100 : 0) : Math.max(0, Math.min(100, value * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full surface-2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={clsx('h-full rounded-full transition-[width] duration-300',
          tone === 'good' ? 'bg-[var(--status-good)]' : tone === 'bad' ? 'bg-[var(--status-critical)]' : 'bg-brand-600',
          active && 'progress-animated')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function ConnectorIcon({ type, className }: { type: string; className?: string }) {
  const cls = clsx('size-4', className);
  const icon = {
    sample: <FlaskConical className={cls} />,
    filesystem: <FileText className={cls} />,
    http: <Globe className={cls} />,
    mongodb: <Leaf className={cls} />,
  }[type] || <Database className={cls} />;
  const tint = {
    sample: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
    filesystem: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
    http: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
    mongodb: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
  }[type] || 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-sky-300';
  return <span className={clsx('grid size-8 shrink-0 place-items-center rounded-lg', tint)}>{icon}</span>;
}

// ---- Modal -----------------------------------------------------------------

export function Modal({ open, onClose, title, description, children, footer, wide }: {
  open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-slate-950/40 p-4 pt-[8vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className={clsx('surface w-full rounded-2xl border border-default shadow-2xl', wide ? 'max-w-2xl' : 'max-w-lg')} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 px-6 pt-5">
          <div>
            <h2 className="text-lg font-semibold text-1">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-2">{description}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-3 hover:bg-[var(--surface-2)]"><X className="size-4" /></button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 rounded-b-2xl border-t border-default surface-2 px-6 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

// ---- Toasts ----------------------------------------------------------------

type Toast = { id: number; title: string; description?: string; tone: 'success' | 'error' | 'info' };
const ToastContext = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts((all) => [...all.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-80 flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role="status" className="pointer-events-auto flex gap-3 rounded-xl border border-default surface p-3.5 shadow-lg">
            {t.tone === 'success' ? <CheckCircle2 className="size-5 shrink-0 text-emerald-600" /> : t.tone === 'error' ? <XCircle className="size-5 shrink-0 text-red-600" /> : <Clock className="size-5 shrink-0 text-brand-600" />}
            <div className="min-w-0">
              <p className="text-sm font-medium text-1">{t.title}</p>
              {t.description && <p className="mt-0.5 text-[13px] break-words text-2">{t.description}</p>}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

// ---- Tables ----------------------------------------------------------------

export function Table({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto"><table className="w-full text-left text-sm">{children}</table></div>;
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={clsx('border-b border-default px-5 py-2.5 text-xs font-medium tracking-wide text-3 uppercase', className)}>{children}</th>;
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={clsx('border-b border-default px-5 py-3 align-middle', className)}>{children}</td>;
}
