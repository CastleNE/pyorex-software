/**
 * AnalyticsWorkspace — tool "Data Analysis" del grupo Geochemistry.
 *
 * Descriptive stats + PCA (RF-04) sobre las variables numéricas del dataset
 * activo. Ambos análisis pasan por analytics.descriptive / analytics.pca
 * (ver packages/ipc-contracts/analytics/*.v1.json) y muestran las métricas
 * de calidad obligatorias (CLAUDE.md regla 6): normalidad, KMO, Bartlett,
 * VIF y warnings — nunca solo el resultado numérico.
 */
import { useMemo, useState } from "react";
import Plot from "react-plotly.js";
import { useDatasetStore } from "@/stores/dataset-store";
import { runDescriptive, runPca, type DescriptiveResult, type PcaResult } from "@/lib/data-api";

type AnalysisTab = "descriptive" | "pca";

const DARK_BG = "#18181b"; // zinc-900
const GRID_COLOR = "#3f3f46"; // zinc-700
const FONT_COLOR = "#d4d4d8"; // zinc-300

const SAMPLE_TYPE_COLORS: Record<string, string> = {
  S: "#71717a",
  FB: "#60a5fa",
  QB: "#a78bfa",
  FD: "#fb923c",
  QD: "#facc15",
  CRM: "#34d399",
  STD: "#34d399",
};
const DEFAULT_COLOR = "#71717a";

interface Props {
  onOpenData: () => void;
}

export default function AnalyticsWorkspace({ onOpenData }: Props) {
  const { dataset, hasData } = useDatasetStore();
  const [tab, setTab] = useState<AnalysisTab>("descriptive");
  const [selectedVars, setSelectedVars] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [descriptive, setDescriptive] = useState<DescriptiveResult | null>(null);
  const [pca, setPca] = useState<PcaResult | null>(null);

  const numericCols = useMemo(
    () =>
      dataset?.columns
        .filter((c) => c.dataType === "numeric" && !c.name.startsWith("_"))
        .map((c) => c.name) ?? [],
    [dataset]
  );

  function toggleVar(name: string) {
    setSelectedVars((prev) => (prev.includes(name) ? prev.filter((v) => v !== name) : [...prev, name]));
  }

  async function handleRun() {
    if (!dataset || selectedVars.length === 0) return;
    if (tab === "pca" && selectedVars.length < 2) {
      setError("PCA requiere al menos 2 variables.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (tab === "descriptive") {
        setDescriptive(await runDescriptive(dataset.id, selectedVars));
      } else {
        setPca(await runPca(dataset.id, selectedVars));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  if (!hasData) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-zinc-900">
        <div className="text-4xl opacity-20">📊</div>
        <p className="text-sm text-zinc-600">Cargá un dataset para analizar</p>
        <button
          onClick={onOpenData}
          className="px-4 py-1.5 text-xs rounded-md bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700"
        >
          Open Data…
        </button>
      </div>
    );
  }

  const hasResult = tab === "descriptive" ? descriptive !== null : pca !== null;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left: tabs + variable picker */}
      <aside className="flex flex-col w-64 min-w-56 border-r border-zinc-700 bg-zinc-900 shrink-0">
        <div className="flex border-b border-zinc-700 shrink-0">
          <TabButton label="Descriptive" active={tab === "descriptive"} onClick={() => setTab("descriptive")} />
          <TabButton label="PCA" active={tab === "pca"} onClick={() => setTab("pca")} />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <p className="text-xs font-semibold text-zinc-400 mb-1.5">Variables numéricas</p>
          {numericCols.length === 0 && <p className="text-xs text-zinc-600">Sin columnas numéricas.</p>}
          {numericCols.map((name) => (
            <label key={name} className="flex items-center gap-2 py-1 text-xs text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedVars.includes(name)}
                onChange={() => toggleVar(name)}
                className="accent-blue-500"
              />
              <span className="truncate">{name}</span>
            </label>
          ))}
        </div>
        <div className="px-3 py-2.5 border-t border-zinc-700 shrink-0">
          <button
            onClick={handleRun}
            disabled={loading || selectedVars.length === 0}
            className="w-full px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          >
            {loading ? "Calculando…" : tab === "descriptive" ? "Run Descriptive" : "Run PCA"}
          </button>
        </div>
      </aside>

      {/* Right: results */}
      <main className="flex-1 overflow-y-auto bg-zinc-900 p-4">
        {error && (
          <div className="mb-3 px-3 py-2 text-xs rounded-md bg-red-950/50 border border-red-800 text-red-300">
            {error}
          </div>
        )}
        {tab === "descriptive" && descriptive && <DescriptiveResults result={descriptive} />}
        {tab === "pca" && pca && <PcaResults result={pca} />}
        {!error && !hasResult && (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <p className="text-xs text-zinc-600">
              Elegí variables y ejecutá {tab === "descriptive" ? "Descriptive" : "PCA"}.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

// ── Descriptive results ───────────────────────────────────────────────────

function DescriptiveResults({ result }: { result: DescriptiveResult }) {
  return (
    <div className="flex flex-col gap-4">
      <WarningsBanner warnings={result.warnings} />
      <p className="text-xs text-zinc-500">n = {result.n_samples_used.toLocaleString()} muestras usadas</p>

      <div className="overflow-x-auto rounded-md border border-zinc-700">
        <table className="min-w-full text-xs">
          <thead className="bg-zinc-850 text-zinc-400">
            <tr>
              {["Variable", "N", "Nulls", "Mean", "Median", "Std", "Min", "Max", "Skewness", "Normal (Shapiro p)"].map(
                (h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {result.stats.map((s) => (
              <tr key={s.variable} className="border-t border-zinc-800 text-zinc-300">
                <td className="px-3 py-1.5 font-medium">{s.variable}</td>
                <td className="px-3 py-1.5">{s.n}</td>
                <td className="px-3 py-1.5">{s.n_nulls}</td>
                <td className="px-3 py-1.5">{fmt(s.mean)}</td>
                <td className="px-3 py-1.5">{fmt(s.median)}</td>
                <td className="px-3 py-1.5">{fmt(s.std)}</td>
                <td className="px-3 py-1.5">{fmt(s.min)}</td>
                <td className="px-3 py-1.5">{fmt(s.max)}</td>
                <td className="px-3 py-1.5">{fmt(s.skewness)}</td>
                <td className="px-3 py-1.5">
                  {s.shapiro_p == null ? (
                    <span className="text-zinc-600">—</span>
                  ) : (
                    <span className={s.normal ? "text-emerald-400" : "text-amber-400"}>
                      {s.normal ? "Sí" : "No"} (p={fmt(s.shapiro_p)})
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.correlation.variables.length >= 2 && (
        <div className="rounded-md border border-zinc-700 p-2">
          <p className="text-xs font-semibold text-zinc-400 mb-1 px-1">Correlación (Spearman)</p>
          <Plot
            data={[
              {
                type: "heatmap",
                z: result.correlation.matrix,
                x: result.correlation.variables,
                y: result.correlation.variables,
                zmin: -1,
                zmax: 1,
                colorscale: "RdBu",
                reversescale: true,
              },
            ]}
            layout={{
              paper_bgcolor: DARK_BG,
              plot_bgcolor: DARK_BG,
              font: { color: FONT_COLOR, size: 10 },
              margin: { t: 10, r: 10, b: 60, l: 80 },
              height: 320,
            }}
            config={{ responsive: true, displaylogo: false }}
            style={{ width: "100%" }}
          />
        </div>
      )}
    </div>
  );
}

// ── PCA results ────────────────────────────────────────────────────────────

function PcaResults({ result }: { result: PcaResult }) {
  const pc1 = result.scores.map((row) => row[0] ?? null);
  const pc2 = result.scores.map((row) => row[1] ?? null);
  const pctVar = (i: number) => `${(result.explained_variance_ratio[i] * 100).toFixed(1)}%`;

  const groups = new Map<string, { x: number[]; y: number[] }>();
  result.sample_types.forEach((type, i) => {
    const key = type || "S";
    if (!groups.has(key)) groups.set(key, { x: [], y: [] });
    groups.get(key)!.x.push(pc1[i] ?? NaN);
    groups.get(key)!.y.push(pc2[i] ?? NaN);
  });

  return (
    <div className="flex flex-col gap-4">
      <WarningsBanner warnings={result.warnings} />

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="KMO global" value={result.kmo_global.toFixed(2)} />
        <StatCard label="Bartlett p-value" value={result.bartlett_p_value.toFixed(3)} />
        <StatCard label="Componentes (≥80%)" value={String(result.components_for_80pct)} />
      </div>

      <div className="rounded-md border border-zinc-700 p-2">
        <p className="text-xs font-semibold text-zinc-400 mb-1 px-1">Varianza explicada</p>
        <Plot
          data={[
            {
              type: "bar",
              name: "Individual",
              x: result.explained_variance_ratio.map((_, i) => `PC${i + 1}`),
              y: result.explained_variance_ratio,
              marker: { color: "#60a5fa" },
            },
            {
              type: "scatter",
              mode: "lines+markers",
              name: "Acumulada",
              x: result.cumulative_variance.map((_, i) => `PC${i + 1}`),
              y: result.cumulative_variance,
              line: { color: "#34d399" },
              yaxis: "y",
            },
          ]}
          layout={{
            paper_bgcolor: DARK_BG,
            plot_bgcolor: DARK_BG,
            font: { color: FONT_COLOR, size: 10 },
            margin: { t: 10, r: 10, b: 40, l: 40 },
            height: 260,
            showlegend: true,
            yaxis: { tickformat: ".0%", gridcolor: GRID_COLOR },
          }}
          config={{ responsive: true, displaylogo: false }}
          style={{ width: "100%" }}
        />
      </div>

      {result.n_components >= 2 && (
        <div className="rounded-md border border-zinc-700 p-2">
          <p className="text-xs font-semibold text-zinc-400 mb-1 px-1">
            Scores — PC1 ({pctVar(0)}) vs PC2 ({pctVar(1)})
          </p>
          <Plot
            data={Array.from(groups.entries()).map(([name, { x, y }]) => ({
              type: "scatter" as const,
              mode: "markers" as const,
              name,
              x,
              y,
              marker: { color: SAMPLE_TYPE_COLORS[name.toUpperCase()] ?? DEFAULT_COLOR, size: 6, opacity: 0.8 },
            }))}
            layout={{
              paper_bgcolor: DARK_BG,
              plot_bgcolor: DARK_BG,
              font: { color: FONT_COLOR, size: 10 },
              margin: { t: 10, r: 10, b: 40, l: 50 },
              height: 340,
              xaxis: { title: { text: `PC1 (${pctVar(0)})` }, gridcolor: GRID_COLOR, zerolinecolor: GRID_COLOR },
              yaxis: { title: { text: `PC2 (${pctVar(1)})` }, gridcolor: GRID_COLOR, zerolinecolor: GRID_COLOR },
            }}
            config={{ responsive: true, displaylogo: false }}
            style={{ width: "100%" }}
          />
        </div>
      )}

      <div className="overflow-x-auto rounded-md border border-zinc-700">
        <table className="min-w-full text-xs">
          <thead className="bg-zinc-850 text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Variable</th>
              {Array.from({ length: Math.min(result.n_components, 4) }, (_, i) => (
                <th key={i} className="px-3 py-2 text-left font-semibold">
                  PC{i + 1} loading
                </th>
              ))}
              <th className="px-3 py-2 text-left font-semibold">VIF</th>
            </tr>
          </thead>
          <tbody>
            {result.variables_used.map((v, i) => (
              <tr key={v} className="border-t border-zinc-800 text-zinc-300">
                <td className="px-3 py-1.5 font-medium">{v}</td>
                {Array.from({ length: Math.min(result.n_components, 4) }, (_, c) => (
                  <td key={c} className="px-3 py-1.5">
                    {fmt(result.loadings[i]?.[c])}
                  </td>
                ))}
                <td className={`px-3 py-1.5 ${result.vif[v] > 10 ? "text-amber-400" : ""}`}>{fmt(result.vif[v])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Shared bits ────────────────────────────────────────────────────────────

function WarningsBanner({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="px-3 py-2 text-xs rounded-md bg-amber-950/40 border border-amber-800/60 text-amber-300 space-y-1">
      {warnings.map((w, i) => (
        <p key={i}>⚠ {w}</p>
      ))}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-700 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="text-lg font-semibold text-zinc-200">{value}</p>
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
        active ? "text-blue-400 border-blue-500" : "text-zinc-400 border-transparent hover:text-zinc-200"
      }`}
    >
      {label}
    </button>
  );
}

function fmt(v: number | undefined | null): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toFixed(3);
}
