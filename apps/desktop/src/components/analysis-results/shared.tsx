export const DARK_BG = "#18181b"; // zinc-900
export const GRID_COLOR = "#3f3f46"; // zinc-700
export const FONT_COLOR = "#d4d4d8"; // zinc-300

export function WarningsBanner({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="space-y-1 rounded-md border border-amber-800/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
      {warnings.map((w, i) => (
        <p key={i}>⚠ {w}</p>
      ))}
    </div>
  );
}

export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-700 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="text-lg font-semibold text-zinc-200">{value}</p>
    </div>
  );
}

export function fmt(v: number | undefined | null): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toFixed(3);
}
