export function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
      <div
        className="h-full bg-brand-500 transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
