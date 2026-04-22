import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { listProcesses, ProcessDto } from '../lib/api';
import { getSocket } from '../lib/socket';
import { StartProcessForm } from '../components/StartProcessForm';
import { StatusBadge } from '../components/StatusBadge';
import { ProgressBar } from '../components/ProgressBar';

export function DashboardPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['processes'],
    queryFn: listProcesses,
    refetchInterval: 5000,
  });

  useEffect(() => {
    const socket = getSocket();
    const invalidate = () => qc.invalidateQueries({ queryKey: ['processes'] });
    const upsert = (p: ProcessDto) => {
      qc.setQueryData<ProcessDto[]>(['processes'], (prev = []) => {
        const idx = prev.findIndex((x) => x.process_id === p.process_id);
        if (idx === -1) return [p, ...prev];
        const copy = prev.slice();
        copy[idx] = p;
        return copy;
      });
    };
    socket.on('process:created', upsert);
    socket.on('process:status', upsert);
    socket.on('process:progress', upsert);
    socket.on('process:completed', upsert);
    socket.on('process:failed', upsert);
    socket.on('process:stopped', upsert);
    socket.on('disconnect', invalidate);
    return () => {
      socket.off('process:created', upsert);
      socket.off('process:status', upsert);
      socket.off('process:progress', upsert);
      socket.off('process:completed', upsert);
      socket.off('process:failed', upsert);
      socket.off('process:stopped', upsert);
      socket.off('disconnect', invalidate);
    };
  }, [qc]);

  return (
    <div className="space-y-6">
      <StartProcessForm />

      <section className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Processes</h2>
          <span className="text-xs text-slate-500">
            {data ? `${data.length} process(es)` : '…'}
          </span>
        </div>

        {isLoading && <p className="p-4 text-slate-500 text-sm">Loading processes…</p>}
        {error && (
          <p className="p-4 text-rose-600 text-sm">
            Failed to load processes. Is the backend running?
          </p>
        )}

        {data && data.length === 0 && (
          <p className="p-6 text-slate-500 text-sm">
            No processes yet. Start one with the form above.
          </p>
        )}

        {data && data.length > 0 && (
          <div className="divide-y">
            {data.map((p) => (
              <Link
                to={`/processes/${p.process_id}`}
                key={p.process_id}
                className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition"
              >
                <div className="w-40 truncate">
                  <div className="font-medium text-slate-800 truncate">{p.name ?? '(unnamed)'}</div>
                  <div className="text-xs text-slate-500 font-mono">{p.process_id.slice(0, 8)}…</div>
                </div>
                <StatusBadge status={p.status} />
                <div className="flex-1">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>
                      {p.progress.processed_files}/{p.progress.total_files} files
                      {p.progress.failed_files > 0 && (
                        <span className="text-rose-600 ml-2">({p.progress.failed_files} failed)</span>
                      )}
                    </span>
                    <span>{p.progress.percentage}%</span>
                  </div>
                  <ProgressBar value={p.progress.percentage} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
