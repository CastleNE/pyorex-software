/**
 * "Editor" — persistent Attribute Manager stub for GEOCHEMISTRY (Phase 1:
 * visual shell only). Phase 2 wires this to the active Scientific Workspace
 * tool window: Variable picker, categorical/numeric categorization, size/
 * shape/color encodings, presets — see the Geochemistry Phase 1 plan.
 */
export default function GeochemistryEditorPanel() {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-700 bg-zinc-900">
      <div className="border-b border-zinc-700 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Editor</h2>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
        <div className="text-3xl opacity-20">🎛</div>
        <p className="text-xs text-zinc-600">
          Variable, Categories, Ranges, Symbols, Size and Labels controls land here in a future pass.
        </p>
      </div>

      <div className="border-t border-zinc-800 px-3 py-2">
        <button
          disabled
          title="Coming soon"
          className="text-xs text-zinc-600 underline decoration-dotted disabled:cursor-not-allowed"
        >
          View Operation Guide
        </button>
      </div>
    </aside>
  );
}
