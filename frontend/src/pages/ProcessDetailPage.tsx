import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getLogs,
  getProcess,
  ProcessDto,
  pauseProcess,
  resumeProcess,
  stopProcess,
} from '../lib/api';
import { getSocket } from '../lib/socket';
import { StatusBadge } from '../components/StatusBadge';
import { ProgressBar } from '../components/ProgressBar';

interface LogEntry {
  id: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  event: string;
  message: string;
  createdAt: string;
}

export function ProcessDetailPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();

  const { data: process } = useQuery({
    queryKey: ['process', id],
    queryFn: () => getProcess(id!),
    enabled: Boolean(id),
    refetchInterval: (q) => {
      const p = q.state.data as ProcessDto | undefined;
      return p && ['RUNNING', 'PENDING', 'PAUSED'].includes(p.status) ? 2000 : false;
    },
  });

  const { data: fetchedLogs } = useQuery({
    queryKey: ['process-logs', id],
    queryFn: () => getLogs(id!, 50),
    enabled: Boolean(id),
  });
  const [liveLogs, setLiveLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    if (fetchedLogs) setLiveLogs(fetchedLogs.slice(0, 50));
  }, [fetchedLogs]);

  useEffect(() => {
    if (!id) return;
    const socket = getSocket();
    socket.emit('process:subscribe', { processId: id });

    const onLog = (entry: LogEntry) =>
      setLiveLogs((prev) => [entry, ...prev].slice(0, 200));
    const onUpdate = (p: ProcessDto) => {
      if (p.process_id !== id) return;
      qc.setQueryData(['process', id], p);
    };

    socket.on('process:log', onLog);
    socket.on('process:status', onUpdate);
    socket.on('process:progress', onUpdate);
    socket.on('process:completed', onUpdate);
    socket.on('process:failed', onUpdate);
    socket.on('process:stopped', onUpdate);

    return () => {
      socket.emit('process:unsubscribe', { processId: id });
      socket.off('process:log', onLog);
      socket.off('process:status', onUpdate);
      socket.off('process:progress', onUpdate);
      socket.off('process:completed', onUpdate);
      socket.off('process:failed', onUpdate);
      socket.off('process:stopped', onUpdate);
    };
  }, [id, qc]);

  const stop = useMutation({ mutationFn: () => stopProcess(id!) });
  const pause = useMutation({ mutationFn: () => pauseProcess(id!) });
  const resume = useMutation({ mutationFn: () => resumeProcess(id!) });

  if (!id) return null;
  if (!process) return <p className="text-slate-500">Loading process…</p>;

  const isActive = ['PENDING', 'RUNNING', 'PAUSED'].includes(process.status);

  return (
    <div className="space-y-6">
      <button onClick={() => nav(-1)} className="text-sm text-brand-600 hover:underline">
        ← Back
      </button>

      <section className="bg-white border rounded-xl p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              {process.name ?? '(unnamed process)'}
            </h1>
            <p className="text-xs font-mono text-slate-500 mt-1">{process.process_id}</p>
          </div>
          <StatusBadge status={process.status} />
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>
              {process.progress.processed_files}/{process.progress.total_files} processed
              {process.progress.failed_files > 0 && (
                <span className="text-rose-600 ml-2">
                  ({process.progress.failed_files} failed)
                </span>
              )}
            </span>
            <span>{process.progress.percentage}%</span>
          </div>
          <ProgressBar value={process.progress.percentage} />
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Stat label="Started" value={fmt(process.started_at)} />
          <Stat label="ETA" value={fmt(process.estimated_completion)} />
          <Stat label="Completed" value={fmt(process.completed_at)} />
          <Stat label="Stopped" value={fmt(process.stopped_at)} />
        </div>

        {isActive && (
          <div className="mt-5 flex gap-2">
            {process.status === 'RUNNING' && (
              <button
                onClick={() => pause.mutate()}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm"
              >
                Pause
              </button>
            )}
            {process.status === 'PAUSED' && (
              <button
                onClick={() => resume.mutate()}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm"
              >
                Resume
              </button>
            )}
            <button
              onClick={() => stop.mutate()}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm"
            >
              Stop
            </button>
          </div>
        )}
      </section>

      {process.results && (
        <section className="bg-white border rounded-xl p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-slate-800">Aggregated results</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Stat label="Total words" value={process.results.total_words.toLocaleString()} />
            <Stat label="Total lines" value={process.results.total_lines.toLocaleString()} />
            <Stat label="Total characters" value={process.results.total_characters.toLocaleString()} />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Most frequent words</h3>
            <div className="flex flex-wrap gap-2">
              {process.results.most_frequent_words.map((w) => (
                <span
                  key={w}
                  className="px-2 py-1 rounded-full bg-brand-50 text-brand-700 text-xs border border-brand-100"
                >
                  {w}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">
              Global summary (TextRank + MLP)
            </h3>
            <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
              {process.results.global_summary || '(empty)'}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Files processed</h3>
            <ul className="grid grid-cols-2 md:grid-cols-3 gap-1 text-xs text-slate-600 font-mono">
              {process.results.files_processed.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="bg-white border rounded-xl shadow-sm">
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold text-slate-800">Activity log (live)</h2>
        </div>
        <ul className="max-h-80 overflow-auto scrollbar-thin divide-y text-sm">
          {liveLogs.length === 0 && (
            <li className="p-4 text-slate-500">No events yet.</li>
          )}
          {liveLogs.map((l) => (
            <li key={l.id} className="px-4 py-2 flex items-start gap-3">
              <span
                className={
                  'text-[10px] font-bold w-14 shrink-0 mt-0.5 ' +
                  (l.level === 'ERROR'
                    ? 'text-rose-600'
                    : l.level === 'WARN'
                      ? 'text-amber-600'
                      : 'text-slate-500')
                }
              >
                {l.level}
              </span>
              <div className="flex-1">
                <div className="text-slate-700">{l.message}</div>
                <div className="text-xs text-slate-400">
                  {l.event} · {new Date(l.createdAt).toLocaleTimeString()}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-3 rounded-lg border bg-slate-50">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-800 mt-0.5">{value}</div>
    </div>
  );
}

function fmt(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString();
}
