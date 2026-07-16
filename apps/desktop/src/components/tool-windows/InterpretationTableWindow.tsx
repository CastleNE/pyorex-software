/**
 * Interpretation Table — read view of all current (is_current=true)
 * interpretations across the project.
 */
import { useEffect, useState } from "react";
import { listCurrentInterpretations, type SpectrumInterpretation } from "@/lib/spectrometry-api";
import { useSpectrometryStore } from "@/stores/spectrometry-store";

const STATE_COLOR: Record<string, string> = { suggested: "text-amber-400", interpreted: "text-blue-400", confirmed: "text-emerald-400" };

export default function InterpretationTableWindow() {
  const { activeProject } = useSpectrometryStore();
  const [rows, setRows] = useState<SpectrumInterpretation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeProject) return;
    listCurrentInterpretations(activeProject.id).then((r) => {
      setRows(r.interpretations);
      setLoading(false);
    });
  }, [activeProject]);

  if (!activeProject) return null;
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-zinc-900 p-2 text-xs">
      {rows.length === 0 ? (
        <p className="text-zinc-600">No interpretations yet.</p>
      ) : (
        <table className="min-w-full">
          <thead className="bg-zinc-850 text-zinc-400">
            <tr>
              {["Sample", "Primary Mineral", "Secondary", "Group", "Method", "State", "Confidence"].map((h) => (
                <th key={h} className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.interpretation_id} className="border-t border-zinc-800">
                <td className="px-2 py-1">{r.sample_id}</td>
                <td className="px-2 py-1 text-zinc-200">{r.primary_mineral ?? "—"}</td>
                <td className="px-2 py-1">{r.secondary_mineral ?? "—"}</td>
                <td className="px-2 py-1">{r.mineral_group ?? "—"}</td>
                <td className="px-2 py-1">{r.method}</td>
                <td className={`px-2 py-1 font-medium ${STATE_COLOR[r.state]}`}>{r.state}</td>
                <td className="px-2 py-1">{r.confidence != null ? r.confidence.toFixed(1) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
