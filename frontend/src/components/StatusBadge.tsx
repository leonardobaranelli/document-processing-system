import clsx from 'clsx';
import type { ProcessStatus } from '../lib/api';

const STYLES: Record<ProcessStatus, string> = {
  PENDING: 'bg-slate-100 text-slate-700 border-slate-200',
  RUNNING: 'bg-sky-100 text-sky-800 border-sky-200 animate-pulse',
  PAUSED: 'bg-amber-100 text-amber-800 border-amber-200',
  COMPLETED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  FAILED: 'bg-rose-100 text-rose-800 border-rose-200',
  STOPPED: 'bg-zinc-200 text-zinc-700 border-zinc-300',
};

export function StatusBadge({ status }: { status: ProcessStatus }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 text-xs font-semibold border rounded-full',
        STYLES[status],
      )}
    >
      {status}
    </span>
  );
}
