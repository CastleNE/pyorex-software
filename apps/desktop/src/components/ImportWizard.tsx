/**
 * ImportWizard — modal for importing CSV/Excel files.
 *
 * Step 1 (preview): file overview, separator, sample-type column
 * Step 2 (spatial): coordinate reference system — shown only when coordinate
 *                   columns are auto-detected
 * Step 3 (nullmap): sentinel null value mappings
 * Confirm: call data.import, notify parent with result
 */
import { useState, useEffect } from "react";
import { previewFile, importFile } from "@/lib/data-api";
import type {
  ColumnPreview,
  NullMappingInput,
  SampleTypeMappingInput,
  ImportedDatasetMeta,
  SpatialRef,
  CoordPairDetection,
  SpatialDetection,
} from "@/lib/data-api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  filePath: string;
  onImported: (meta: ImportedDatasetMeta) => void;
  onCancel: () => void;
}

type Step = "preview" | "spatial" | "nullmap" | "importing" | "error";

// ── Component ─────────────────────────────────────────────────────────────────

export default function ImportWizard({ filePath, onImported, onCancel }: Props) {
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath;

  const [step, setStep] = useState<Step>("preview");
  const [errorMsg, setErrorMsg] = useState("");
  const [preview, setPreview] = useState<{
    columns: ColumnPreview[];
    total_rows: number;
    file_size_kb: number;
    spatial_detection: SpatialDetection;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  // Step 1 config
  const [datasetName, setDatasetName] = useState(
    fileName.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ")
  );
  const [separator, setSeparator] = useState(",");
  const [customSep, setCustomSep] = useState("");
  const [sampleTypeCol, setSampleTypeCol] = useState<string>("");

  // Step 2 (spatial) config
  const [selectedPair, setSelectedPair] = useState<CoordPairDetection | null>(null);
  const [skipSpatial, setSkipSpatial] = useState(false);

  // Step 3 config
  const [nullRows, setNullRows] = useState<
    { column: string; sentinel: string; null_type: "BELOW_LOD" | "NOT_ANALYZED" | "MISSING" }[]
  >([]);

  const isExcel = /\.(xlsx|xls|xlsm)$/i.test(fileName);
  const activeSep = separator === "custom" ? customSep : separator;

  useEffect(() => {
    if (isExcel) return;
    if (separator === "custom" && customSep.length !== 1) return;
    setLoading(true);
    setPreview(null);
    if (step === "error") setStep("preview");
    previewFile(filePath, 50, activeSep)
      .then((r) => {
        setPreview({
          columns: r.columns,
          total_rows: r.total_rows,
          file_size_kb: r.file_size_kb,
          spatial_detection: r.spatial_detection,
        });
        // Auto-select first detected pair (geographic preferred)
        const pairs = r.spatial_detection.pairs;
        if (pairs.length > 0) {
          const geo = pairs.find((p) => p.is_geographic) ?? pairs[0];
          setSelectedPair(geo);
        }
        setLoading(false);
      })
      .catch((e) => {
        setErrorMsg(String(e));
        setStep("error");
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, activeSep]);

  // Excel: fetch once on mount
  useEffect(() => {
    if (!isExcel) return;
    setLoading(true);
    previewFile(filePath, 50, ",")
      .then((r) => {
        setPreview({
          columns: r.columns,
          total_rows: r.total_rows,
          file_size_kb: r.file_size_kb,
          spatial_detection: r.spatial_detection,
        });
        const pairs = r.spatial_detection.pairs;
        if (pairs.length > 0) {
          const geo = pairs.find((p) => p.is_geographic) ?? pairs[0];
          setSelectedPair(geo);
        }
        setLoading(false);
      })
      .catch((e) => {
        setErrorMsg(String(e));
        setStep("error");
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasSpatialStep =
    !loading && (preview?.spatial_detection.pairs.length ?? 0) > 0;

  function goNext() {
    if (step === "preview") {
      if (hasSpatialStep) setStep("spatial");
      else setStep("nullmap");
    } else if (step === "spatial") {
      setStep("nullmap");
    }
  }

  function goBack() {
    if (step === "nullmap") {
      if (hasSpatialStep) setStep("spatial");
      else setStep("preview");
    } else if (step === "spatial") {
      setStep("preview");
    }
  }

  function addNullRow() {
    if (!preview) return;
    const numCols = preview.columns.filter((c) => c.dtype === "numeric");
    const col = numCols.find((c) => !nullRows.some((r) => r.column === c.name));
    if (!col) return;
    setNullRows((prev) => [...prev, { column: col.name, sentinel: "-999", null_type: "BELOW_LOD" }]);
  }

  function removeNullRow(i: number) {
    setNullRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateNullRow(
    i: number,
    field: "column" | "sentinel" | "null_type",
    value: string
  ) {
    setNullRows((prev) =>
      prev.map((row, idx) => (idx === i ? { ...row, [field]: value } : row))
    );
  }

  async function handleImport() {
    if (!preview) return;
    setStep("importing");
    try {
      const nullMappings: NullMappingInput[] = nullRows.map((r) => ({
        column: r.column,
        sentinel_value: r.sentinel,
        null_type: r.null_type,
      }));
      const sampleTypeMapping: SampleTypeMappingInput | undefined = sampleTypeCol
        ? { column: sampleTypeCol, value_map: {} }
        : undefined;

      const spatialRef: SpatialRef | null =
        !skipSpatial && selectedPair ? selectedPair : null;

      const result = await importFile({
        filePath,
        datasetName,
        separator: activeSep,
        nullMappings,
        sampleTypeMapping,
        spatialRef,
        iogasDisplayCols: preview.spatial_detection.iogas_display_cols,
      });
      onImported(result.dataset);
    } catch (e) {
      setErrorMsg(String(e));
      setStep("error");
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const steps = hasSpatialStep
    ? ["1. Preview", "2. Spatial ref", "3. Null values"]
    : ["1. Preview", "2. Null values"];

  const stepIndex =
    step === "preview" ? 0
    : step === "spatial" ? 1
    : step === "nullmap" ? (hasSpatialStep ? 2 : 1)
    : -1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex flex-col w-[720px] max-h-[85vh] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Import Dataset</h2>
            <p className="text-xs text-zinc-500 mt-0.5 truncate max-w-md">{fileName}</p>
          </div>
          <button
            onClick={onCancel}
            className="text-zinc-500 hover:text-zinc-200 text-lg leading-none px-1"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {loading && <LoadingState />}

          {!loading && step === "error" && <ErrorState message={errorMsg} />}

          {!loading && (step === "preview" || step === "spatial" || step === "nullmap") && preview && (
            <>
              {/* ── Step 1: Preview ── */}
              {step === "preview" && (
                <>
                  {/* Dataset name */}
                  <div className="mb-4">
                    <label className="text-xs text-zinc-400 block mb-1">Dataset name</label>
                    <input
                      value={datasetName}
                      onChange={(e) => setDatasetName(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-600 rounded-md text-zinc-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Separator (CSV only) */}
                  {!isExcel && (
                    <div className="mb-4">
                      <label className="text-xs text-zinc-400 block mb-1">Column separator</label>
                      <div className="flex items-center gap-2 flex-wrap">
                        {(
                          [
                            { label: "Comma  ,", value: "," },
                            { label: "Semicolon  ;", value: ";" },
                            { label: "Tab  ⇥", value: "\t" },
                            { label: "Pipe  |", value: "|" },
                            { label: "Custom", value: "custom" },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => setSeparator(opt.value)}
                            className={`px-3 py-1 text-xs rounded border transition-colors ${
                              separator === opt.value
                                ? "bg-blue-600 border-blue-500 text-white"
                                : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                        {separator === "custom" && (
                          <input
                            maxLength={1}
                            value={customSep}
                            onChange={(e) => setCustomSep(e.target.value)}
                            placeholder="char"
                            className="w-16 px-2 py-1 text-xs bg-zinc-800 border border-zinc-600 rounded text-zinc-100 font-mono text-center focus:outline-none focus:border-blue-500"
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Stats */}
                  <div className="flex gap-4 mb-4 text-xs text-zinc-400">
                    <span>{preview.total_rows.toLocaleString()} rows</span>
                    <span>{preview.columns.length} columns</span>
                    <span>{preview.file_size_kb} KB</span>
                    {preview.spatial_detection.iogas_display_cols.length > 0 && (
                      <span className="text-amber-400">
                        {preview.spatial_detection.iogas_display_cols.length} ioGAS display cols
                      </span>
                    )}
                  </div>

                  {/* Sample-type column */}
                  <div className="mb-4">
                    <label className="text-xs text-zinc-400 block mb-1">
                      Sample-type column{" "}
                      <span className="text-zinc-600">(optional — identifies blanks, duplicates, CRMs)</span>
                    </label>
                    <select
                      value={sampleTypeCol}
                      onChange={(e) => setSampleTypeCol(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-600 rounded-md text-zinc-100 focus:outline-none focus:border-blue-500"
                    >
                      <option value="">— none —</option>
                      {preview.columns
                        .filter((c) => c.dtype === "text" && !c.is_iogas_display)
                        .map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <ColumnTable columns={preview.columns} />
                </>
              )}

              {/* ── Step 2: Spatial Reference ── */}
              {step === "spatial" && (
                <SpatialRefStep
                  pairs={preview.spatial_detection.pairs}
                  selectedPair={selectedPair}
                  skipSpatial={skipSpatial}
                  onSelectPair={setSelectedPair}
                  onSkip={setSkipSpatial}
                />
              )}

              {/* ── Step 3: Null mappings ── */}
              {step === "nullmap" && (
                <NullMappingEditor
                  columns={preview.columns.filter((c) => c.dtype === "numeric")}
                  rows={nullRows}
                  onAdd={addNullRow}
                  onRemove={removeNullRow}
                  onUpdate={updateNullRow}
                />
              )}
            </>
          )}

          {step === "importing" && <LoadingState label="Importing and saving as Parquet…" />}
        </div>

        {/* Footer */}
        {!loading && step !== "importing" && step !== "error" && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-700 shrink-0">
            {/* Step dots */}
            <div className="flex gap-2 text-xs text-zinc-500">
              {steps.map((label, i) => (
                <StepDot key={label} active={i === stepIndex} label={label} />
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              {(step === "nullmap" || step === "spatial") && (
                <button
                  onClick={goBack}
                  className="px-4 py-1.5 text-xs rounded-md bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700"
                >
                  Back
                </button>
              )}
              {(step === "preview" || step === "spatial") && (
                <button
                  onClick={goNext}
                  className="px-4 py-1.5 text-xs rounded-md bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700"
                >
                  {step === "preview" && hasSpatialStep ? "Next: Spatial ref →" : "Next: Null values →"}
                </button>
              )}
              <button
                onClick={handleImport}
                disabled={!datasetName.trim()}
                className="px-5 py-1.5 text-xs font-semibold rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Import Dataset
              </button>
            </div>
          </div>
        )}

        {step === "error" && (
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-zinc-700 shrink-0">
            <button
              onClick={onCancel}
              className="px-4 py-1.5 text-xs rounded-md bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SpatialRefStep({
  pairs,
  selectedPair,
  skipSpatial,
  onSelectPair,
  onSkip,
}: {
  pairs: CoordPairDetection[];
  selectedPair: CoordPairDetection | null;
  skipSpatial: boolean;
  onSelectPair: (p: CoordPairDetection) => void;
  onSkip: (skip: boolean) => void;
}) {
  return (
    <div>
      <p className="text-xs text-zinc-400 mb-4">
        Coordinate columns were detected. Select the pair to use for map plots and
        KML export. If the data is in a projected system (e.g. UTM, AMG), PyOrex
        will reproject to WGS84 automatically when needed.
      </p>

      <div className="space-y-2 mb-5">
        {pairs.map((pair, i) => {
          const isSelected = !skipSpatial && selectedPair?.x_col === pair.x_col && selectedPair?.y_col === pair.y_col;
          return (
            <button
              key={i}
              onClick={() => { onSelectPair(pair); onSkip(false); }}
              className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                isSelected
                  ? "border-blue-500 bg-blue-600/10"
                  : "border-zinc-700 bg-zinc-800 hover:border-zinc-500"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-zinc-200">{pair.crs_label}</span>
                <span className="text-xs text-zinc-500 font-mono">{pair.crs}</span>
              </div>
              <div className="flex gap-6 text-xs text-zinc-400">
                <span>
                  X / {pair.is_geographic ? "Longitude" : "Easting"}:{" "}
                  <span className="font-mono text-zinc-300">{pair.x_col}</span>
                </span>
                <span>
                  Y / {pair.is_geographic ? "Latitude" : "Northing"}:{" "}
                  <span className="font-mono text-zinc-300">{pair.y_col}</span>
                </span>
              </div>
              {!pair.is_geographic && (
                <p className="text-xs text-amber-400/80 mt-1">
                  Projected — will be reprojected to WGS84 for KML/map output
                </p>
              )}
            </button>
          );
        })}
      </div>

      <button
        onClick={() => onSkip(!skipSpatial)}
        className={`flex items-center gap-2 text-xs transition-colors ${
          skipSpatial ? "text-zinc-300" : "text-zinc-500 hover:text-zinc-300"
        }`}
      >
        <span
          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
            skipSpatial ? "border-zinc-400 bg-zinc-700" : "border-zinc-600"
          }`}
        >
          {skipSpatial && <span className="text-zinc-200 text-xs leading-none">✓</span>}
        </span>
        Skip spatial reference — import without coordinate system
      </button>
    </div>
  );
}

function ColumnTable({ columns }: { columns: ColumnPreview[] }) {
  return (
    <div className="border border-zinc-700 rounded-lg overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-zinc-800 text-zinc-400 text-left">
            <th className="px-3 py-2 font-medium">Column</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium text-right">Nulls</th>
            <th className="px-3 py-2 font-medium">Sample values</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((col, i) => (
            <tr
              key={col.name}
              className={`border-t border-zinc-800 ${i % 2 === 0 ? "bg-zinc-900" : "bg-zinc-850"} ${
                col.is_iogas_display ? "opacity-50" : ""
              }`}
            >
              <td className="px-3 py-1.5 font-mono text-zinc-100 truncate max-w-[140px]">
                {col.name}
                {col.is_iogas_display && (
                  <span className="ml-2 text-amber-500/70 text-xs font-sans">ioGAS</span>
                )}
              </td>
              <td className="px-3 py-1.5">
                <TypeBadge dtype={col.dtype} />
              </td>
              <td className="px-3 py-1.5 text-right text-zinc-400">
                {col.null_count > 0 ? (
                  <span className="text-amber-400">{col.null_pct}%</span>
                ) : (
                  <span className="text-zinc-600">0%</span>
                )}
              </td>
              <td className="px-3 py-1.5 text-zinc-500 truncate max-w-[180px]">
                {col.sample_values.slice(0, 3).join(", ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NullMappingEditor({
  columns,
  rows,
  onAdd,
  onRemove,
  onUpdate,
}: {
  columns: ColumnPreview[];
  rows: { column: string; sentinel: string; null_type: string }[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  onUpdate: (i: number, field: "column" | "sentinel" | "null_type", value: string) => void;
}) {
  return (
    <div>
      <p className="text-xs text-zinc-400 mb-3">
        Define sentinel values that represent non-detects or missing data. These will be
        replaced with proper nulls during import.
      </p>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex gap-2 items-center">
            <select
              value={row.column}
              onChange={(e) => onUpdate(i, "column", e.target.value)}
              className="flex-1 px-2 py-1.5 text-xs bg-zinc-800 border border-zinc-600 rounded text-zinc-100 focus:outline-none focus:border-blue-500"
            >
              {columns.map((c) => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
            <input
              value={row.sentinel}
              onChange={(e) => onUpdate(i, "sentinel", e.target.value)}
              placeholder="Sentinel (e.g. -999)"
              className="w-28 px-2 py-1.5 text-xs bg-zinc-800 border border-zinc-600 rounded text-zinc-100 font-mono focus:outline-none focus:border-blue-500"
            />
            <select
              value={row.null_type}
              onChange={(e) => onUpdate(i, "null_type", e.target.value)}
              className="w-36 px-2 py-1.5 text-xs bg-zinc-800 border border-zinc-600 rounded text-zinc-100 focus:outline-none focus:border-blue-500"
            >
              <option value="BELOW_LOD">Below LOD</option>
              <option value="NOT_ANALYZED">Not analyzed</option>
              <option value="MISSING">Missing</option>
            </select>
            <button
              onClick={() => onRemove(i)}
              className="text-zinc-600 hover:text-red-400 px-1"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      {columns.length > rows.length && (
        <button
          onClick={onAdd}
          className="mt-3 flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200"
        >
          <span className="text-lg leading-none">+</span> Add null mapping
        </button>
      )}
      {columns.length === 0 && (
        <p className="text-xs text-zinc-600 italic">No numeric columns detected.</p>
      )}
    </div>
  );
}

function TypeBadge({ dtype }: { dtype: string }) {
  const styles: Record<string, string> = {
    numeric: "text-blue-400 bg-blue-400/10",
    text: "text-emerald-400 bg-emerald-400/10",
    boolean: "text-purple-400 bg-purple-400/10",
    datetime: "text-amber-400 bg-amber-400/10",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${styles[dtype] ?? "text-zinc-400"}`}>
      {dtype}
    </span>
  );
}

function StepDot({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={active ? "text-blue-400 font-medium" : "text-zinc-600"}>{label}</span>
  );
}

function LoadingState({ label = "Loading preview…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col gap-2 py-8">
      <p className="text-sm font-semibold text-red-400">Import failed</p>
      <p className="text-xs text-zinc-400 font-mono bg-zinc-800 rounded p-3 break-all">{message}</p>
    </div>
  );
}
