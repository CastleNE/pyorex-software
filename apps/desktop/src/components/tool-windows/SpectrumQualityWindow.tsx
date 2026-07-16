/**
 * Spectrum Quality — templated on DataQualityWindow.tsx. Also serves as the
 * target for the "Instrument Metadata"/"Duplicate Samples"/"Invalid Spectra"
 * catalog cards (tabs over the same report, not separate algorithms).
 */
import { useEffect, useState } from "react";
import { getSpectralQualityReport, type SpectralQualityReport } from "@/lib/spectrometry-api";
import { useSpectrometryStore } from "@/stores/spectrometry-store";

interface Props {
  initialTab?: string;
}

const STATUS_COLOR: Record<string, string> = { Valid: "text-emerald-400", Warning: "text-amber-400", Invalid: "text-red-400" };

export default function SpectrumQualityWindow({ initialTab }: Props) {
  const { activeProject } = useSpectrometryStore();
  const [report, setReport] = useState<SpectralQualityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(initialTab ?? "overview");

  function load() {
    if (!activeProject) return;
    setLoading(true);
    getSpectralQualityReport(activeProject.id).then((r) => {
      setReport(r);
      setLoading(false);
    });
  }

  useEffect(load, [activeProject]);

  if (!activeProject) return null;
  if (loading || !report) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "metadata", label: "Instrument Metadata" },
    { id: "duplicates", label: "Duplicate Samples" },
    { id: "invalid", label: "Invalid Spectra" },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-900 text-xs">
      <div className="flex shrink-0 border-b border-zinc-700">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-3 py-2 font-medium transition-colors ${
              tab === t.id ? "border-blue-500 text-blue-400" : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t.label}
          </button>
        ))}
        <button onClick={load} className="ml-auto px-3 py-2 text-blue-400 hover:underline">Refresh</button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {tab === "overview" && (
          <div className="overflow-x-auto rounded-md border border-zinc-700">
            <table className="min-w-full">
              <thead className="bg-zinc-850 text-zinc-400">
                <tr>
                  <th className="px-2 py-1.5 text-left font-semibold">Spectrum</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Status</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Score</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Reasons</th>
                </tr>
              </thead>
              <tbody>
                {report.per_spectrum.map((r) => (
                  <tr key={r.spectrum_id} className="border-t border-zinc-800">
                    <td className="px-2 py-1 font-mono">{r.spectrum_id.slice(0, 14)}</td>
                    <td className={`px-2 py-1 font-medium ${STATUS_COLOR[r.status] ?? ""}`}>{r.status}</td>
                    <td className="px-2 py-1">{r.score}</td>
                    <td className="px-2 py-1 text-zinc-500">{r.reasons.join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "metadata" && (
          <div className="space-y-1">
            {(report.checks.check_possible_calibration_issues ?? []).map((c, i) => (
              <p key={i} className="text-amber-300">⚠ Possible calibration issue: {JSON.stringify(c)}</p>
            ))}
            {(report.checks.check_possible_calibration_issues ?? []).length === 0 && (
              <p className="text-zinc-600">No calibration/instrument metadata issues detected.</p>
            )}
          </div>
        )}

        {tab === "duplicates" && (
          <div className="space-y-1">
            <p className="mb-1 font-semibold text-zinc-300">Duplicate files / Sample IDs / identical spectra</p>
            {["check_duplicate_files", "check_duplicate_sample_ids", "check_identical_spectra"].map((key) =>
              (report.checks[key] ?? []).map((c, i) => (
                <p key={`${key}-${i}`} className="text-zinc-400">{key}: {JSON.stringify(c)}</p>
              ))
            )}
            {["check_duplicate_files", "check_duplicate_sample_ids", "check_identical_spectra"].every((k) => (report.checks[k] ?? []).length === 0) && (
              <p className="text-zinc-600">No duplicates found.</p>
            )}
          </div>
        )}

        {tab === "invalid" && (
          <div className="space-y-1">
            {report.per_spectrum.filter((r) => r.status === "Invalid").map((r) => (
              <p key={r.spectrum_id} className="text-red-300">{r.spectrum_id}: {r.reasons.join(", ")}</p>
            ))}
            {report.per_spectrum.filter((r) => r.status === "Invalid").length === 0 && (
              <p className="text-zinc-600">No invalid spectra.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
