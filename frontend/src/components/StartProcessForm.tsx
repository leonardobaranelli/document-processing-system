import { FormEvent, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { startProcess } from '../lib/api';

export function StartProcessForm() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [inputDirectory, setInputDirectory] = useState('');
  const [batchSize, setBatchSize] = useState<number>(5);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      startProcess({
        name: name || undefined,
        inputDirectory: inputDirectory || undefined,
        batchSize,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['processes'] });
      setName('');
      setError(null);
    },
    onError: (err: { message?: string }) => setError(err?.message ?? 'Failed to start process'),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <form onSubmit={onSubmit} className="bg-white border rounded-xl p-4 space-y-3 shadow-sm">
      <h2 className="font-semibold text-slate-800">Start new analysis</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <input
          className="border rounded-lg px-3 py-2 text-sm"
          placeholder="Process name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
        />
        <input
          className="border rounded-lg px-3 py-2 text-sm"
          placeholder="Input directory (defaults to server config)"
          value={inputDirectory}
          onChange={(e) => setInputDirectory(e.target.value)}
        />
        <input
          type="number"
          min={1}
          max={100}
          className="border rounded-lg px-3 py-2 text-sm"
          placeholder="Batch size"
          value={batchSize}
          onChange={(e) => setBatchSize(Number(e.target.value))}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">
          Files will be loaded from the backend's <code className="text-brand-700">DOCUMENTS_INPUT_DIR</code> if left empty.
        </span>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold disabled:opacity-60"
        >
          {mutation.isPending ? 'Starting…' : 'Start process'}
        </button>
      </div>
      {error && <p className="text-rose-600 text-sm">{error}</p>}
    </form>
  );
}
