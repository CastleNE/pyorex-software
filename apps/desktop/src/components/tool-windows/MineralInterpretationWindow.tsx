/**
 * Mineral Interpretation — manual / rule-based / library-match (SAM), all
 * converging on the same 3-state model (Suggested/Interpreted/Confirmed).
 * A statistical library match is NEVER shown as an auto-confirmed ID.
 */
import { useEffect, useState } from "react";
import {
  applyRules,
  confirmInterpretation,
  createManualInterpretation,
  libraryMatch,
  listCurrentInterpretations,
  listReferenceLibrary,
  listRules,
  listSamples,
  listSpectraForSample,
  acceptLibraryMatch,
  type InterpretationRule,
  type LibraryMatchResult,
  type ReferenceSpectrumSummary,
  type SpectralSample,
  type SpectrumInterpretation,
} from "@/lib/spectrometry-api";
import { useSpectrometryStore } from "@/stores/spectrometry-store";

interface Props {
  initialTab?: "manual" | "rules" | "library";
}

const STATE_COLOR: Record<string, string> = { suggested: "text-amber-400", interpreted: "text-blue-400", confirmed: "text-emerald-400" };

export default function MineralInterpretationWindow({ initialTab }: Props) {
  const { activeProject } = useSpectrometryStore();
  const [tab, setTab] = useState<"manual" | "rules" | "library">(initialTab ?? "manual");
  const [samples, setSamples] = useState<SpectralSample[]>([]);
  const [sampleId, setSampleId] = useState<string | null>(null);
  const [spectrumId, setSpectrumId] = useState<string | null>(null);
  const [interpretations, setInterpretations] = useState<SpectrumInterpretation[]>([]);

  const [primaryMineral, setPrimaryMineral] = useState("");
  const [comment, setComment] = useState("");

  const [rules, setRules] = useState<InterpretationRule[]>([]);
  const [matchedRules, setMatchedRules] = useState<InterpretationRule[]>([]);

  const [library, setLibrary] = useState<ReferenceSpectrumSummary[]>([]);
  const [matches, setMatches] = useState<LibraryMatchResult[]>([]);

  useEffect(() => {
    if (!activeProject) return;
    listSamples(activeProject.id).then((r) => setSamples(r.samples));
    listRules(activeProject.id).then((r) => setRules(r.rules));
    listReferenceLibrary(activeProject.id).then((r) => setLibrary(r.references));
  }, [activeProject]);

  async function selectSample(id: string) {
    if (!activeProject) return;
    setSampleId(id);
    const { spectra } = await listSpectraForSample(activeProject.id, id);
    setSpectrumId((spectra[0]?.spectrum_id as string) ?? null);
    refreshInterpretations(id);
  }

  function refreshInterpretations(id: string) {
    if (!activeProject) return;
    listCurrentInterpretations(activeProject.id, id).then((r) => setInterpretations(r.interpretations));
  }

  async function handleManualSave() {
    if (!activeProject || !sampleId) return;
    await createManualInterpretation(activeProject.id, sampleId, { spectrumId: spectrumId ?? undefined, primaryMineral, comment, state: "interpreted" });
    refreshInterpretations(sampleId);
    setPrimaryMineral("");
    setComment("");
  }

  async function handleApplyRules() {
    if (!activeProject || !spectrumId || !sampleId) return;
    const res = await applyRules(activeProject.id, spectrumId);
    setMatchedRules(res.matched_rules);
    refreshInterpretations(sampleId);
  }

  async function handleLibraryMatch() {
    if (!activeProject || !spectrumId) return;
    const res = await libraryMatch(activeProject.id, spectrumId);
    setMatches(res.available ? res.matches ?? [] : []);
  }

  async function handleAcceptMatch(match: LibraryMatchResult) {
    if (!activeProject || !spectrumId || !sampleId) return;
    await acceptLibraryMatch(activeProject.id, spectrumId, match, [2100, 2400]);
    refreshInterpretations(sampleId);
  }

  async function handleConfirm(interpretationId: string, newState: "interpreted" | "confirmed") {
    if (!activeProject || !sampleId) return;
    await confirmInterpretation(activeProject.id, interpretationId, newState, { editedBy: "user" });
    refreshInterpretations(sampleId);
  }

  if (!activeProject) return null;

  return (
    <div className="flex h-full overflow-hidden text-xs">
      <aside className="w-40 shrink-0 overflow-y-auto border-r border-zinc-700 p-2">
        {samples.map((s) => (
          <button
            key={s.sample_id}
            onClick={() => selectSample(s.sample_id)}
            className={`block w-full truncate rounded px-1.5 py-0.5 text-left ${sampleId === s.sample_id ? "bg-blue-900/30 text-blue-300" : "text-zinc-300 hover:bg-zinc-800"}`}
          >
            {s.sample_id}
          </button>
        ))}
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 border-b border-zinc-700">
          {(["manual", "rules", "library"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`border-b-2 px-3 py-2 font-medium capitalize transition-colors ${
                tab === t ? "border-blue-500 text-blue-400" : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex flex-1 overflow-hidden">
          <main className="flex-1 overflow-y-auto p-3">
            {!sampleId ? (
              <p className="text-zinc-600">Select a sample.</p>
            ) : tab === "manual" ? (
              <div className="flex max-w-sm flex-col gap-2">
                <label className="text-zinc-400">Primary mineral</label>
                <input value={primaryMineral} onChange={(e) => setPrimaryMineral(e.target.value)} className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-200" />
                <label className="text-zinc-400">Comment</label>
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} className="resize-none rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-200" />
                <button onClick={handleManualSave} disabled={!primaryMineral.trim()} className="self-start rounded-md bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-500 disabled:opacity-40">
                  Save interpretation
                </button>
              </div>
            ) : tab === "rules" ? (
              <div className="flex flex-col gap-2">
                <button onClick={handleApplyRules} className="self-start rounded-md bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-500">
                  Apply rules to selected spectrum
                </button>
                {matchedRules.length > 0 && (
                  <div className="rounded-md border border-zinc-700 p-2">
                    <p className="mb-1 text-zinc-400">Matched:</p>
                    {matchedRules.map((r) => (
                      <p key={r.id} className="text-zinc-300">{r.mineral}</p>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-zinc-500">{rules.length} rule(s) configured for this project.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <button onClick={handleLibraryMatch} disabled={library.length === 0} className="self-start rounded-md bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-500 disabled:opacity-40">
                  Run Spectral Angle Mapper match
                </button>
                {library.length === 0 && <p className="text-zinc-600">No reference spectra in this project's library yet.</p>}
                {matches.map((m) => (
                  <div key={m.reference_id} className="flex items-center justify-between rounded-md border border-zinc-700 px-2 py-1.5">
                    <span className="text-zinc-300">{m.name} ({m.mineral_label}) — score {m.match_score.toFixed(1)}</span>
                    <button onClick={() => handleAcceptMatch(m)} className="text-blue-400 hover:underline">Accept as suggested</button>
                  </div>
                ))}
              </div>
            )}
          </main>

          <aside className="w-64 shrink-0 overflow-y-auto border-l border-zinc-700 p-2">
            <p className="mb-1 font-semibold text-zinc-300">Current interpretations</p>
            {interpretations.length === 0 && <p className="text-zinc-600">None yet.</p>}
            {interpretations.map((it) => (
              <div key={it.interpretation_id} className="mb-2 rounded-md border border-zinc-700 p-1.5">
                <p className="text-zinc-200">{it.primary_mineral}</p>
                <p className={STATE_COLOR[it.state]}>{it.state} · {it.method}</p>
                <div className="mt-1 flex gap-2">
                  {it.state !== "interpreted" && (
                    <button onClick={() => handleConfirm(it.interpretation_id, "interpreted")} className="text-blue-400 hover:underline">Mark interpreted</button>
                  )}
                  {it.state !== "confirmed" && (
                    <button onClick={() => handleConfirm(it.interpretation_id, "confirmed")} className="text-emerald-400 hover:underline">Confirm</button>
                  )}
                </div>
              </div>
            ))}
          </aside>
        </div>
      </div>
    </div>
  );
}
