/**
 * "Applied Steps" — visible history for the non-destructive edit overlay
 * (overlay.py's op log, already wired end-to-end via data-ops-store's
 * applyOp/undo/redo). Jumping to an arbitrary earlier step is done by
 * replaying undo()/redo() in a loop — the backend is a simple stack with no
 * jump-to-index RPC. Removing one step out of the middle of the stack is
 * out of scope (backend only supports popping from the top).
 */
import { useEffect, useState } from "react";
import type { OperationType, OverlayOpEntry } from "@/lib/data-api";
import { useDataOpsStore } from "@/stores/data-ops-store";
import { tx, useL } from "@/lib/i18n";

interface Props {
  datasetId: string;
}

export default function AppliedStepsWindow({ datasetId }: Props) {
  const L = useL();
  const overlay = useDataOpsStore((s) => s.getOverlay(datasetId));
  const loadOverlay = useDataOpsStore((s) => s.loadOverlay);
  const undo = useDataOpsStore((s) => s.undo);
  const redo = useDataOpsStore((s) => s.redo);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!overlay) loadOverlay(datasetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId]);

  async function undoToStep(index: number) {
    if (!overlay || busy) return;
    setBusy(true);
    try {
      const steps = overlay.ops.length - 1 - index;
      for (let i = 0; i < steps; i++) await undo(datasetId);
    } finally {
      setBusy(false);
    }
  }

  async function redoToStep(index: number) {
    if (busy) return;
    setBusy(true);
    try {
      for (let i = 0; i <= index; i++) await redo(datasetId);
    } finally {
      setBusy(false);
    }
  }

  if (!overlay) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  const hasSteps = overlay.ops.length > 0 || overlay.redo_stack.length > 0;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-app text-xs">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {!hasSteps && <p className="py-4 text-center text-subtle">{L({ es: "Aún no se han aplicado operaciones.", en: "No operations applied yet." })}</p>}

        {overlay.ops.map((op, i) => {
          const isLast = i === overlay.ops.length - 1;
          return (
            <div key={op.id} className="flex items-center gap-2 border-b border-line py-1.5">
              <span className="w-5 shrink-0 text-right font-mono text-subtle">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-fg">{describeOperation(op)}</p>
                <p className="text-[10px] text-subtle">{new Date(op.applied_at).toLocaleTimeString()}</p>
              </div>
              {!isLast && (
                <button
                  onClick={() => undoToStep(i)}
                  disabled={busy}
                  className="shrink-0 rounded border border-line px-2 py-0.5 text-muted hover:bg-hover disabled:opacity-40"
                >
                  {L({ es: "Deshacer hasta aquí", en: "Undo to here" })}
                </button>
              )}
            </div>
          );
        })}

        {overlay.redo_stack.length > 0 && (
          <p className="mb-1 mt-3 text-[10px] font-semibold uppercase tracking-wide text-subtle">{L({ es: "Deshecho (se puede rehacer)", en: "Undone (redo available)" })}</p>
        )}
        {[...overlay.redo_stack].reverse().map((op, i, arr) => {
          const forwardIndex = arr.length - 1 - i; // index within redo_stack from the bottom
          return (
            <div key={op.id} className="flex items-center gap-2 border-b border-dashed border-line py-1.5 opacity-50">
              <span className="w-5 shrink-0 text-right font-mono text-subtle">↷</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-muted">{describeOperation(op)}</p>
              </div>
              <button
                onClick={() => redoToStep(forwardIndex)}
                disabled={busy}
                className="shrink-0 rounded border border-line px-2 py-0.5 text-muted hover:bg-hover disabled:opacity-40"
              >
                {L({ es: "Rehacer hasta aquí", en: "Redo to here" })}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function describeOperation(op: OverlayOpEntry): string {
  const p = op.params as Record<string, unknown>;
  const type = op.type as OperationType;
  switch (type) {
    case "rename_column":
      return tx({ es: `Renombrada "${p.column}" → "${p.new_name}"`, en: `Renamed "${p.column}" → "${p.new_name}"` });
    case "hide_column":
      return tx({ es: `Columna oculta "${p.column}"`, en: `Hid column "${p.column}"` });
    case "unhide_column":
      return tx({ es: `Columna mostrada "${p.column}"`, en: `Unhid column "${p.column}"` });
    case "drop_column":
      return tx({ es: `Columna eliminada "${p.column}"`, en: `Dropped column "${p.column}"` });
    case "change_dtype":
      return tx({ es: `Tipo de "${p.column}" cambiado a ${p.new_dtype}`, en: `Changed type of "${p.column}" to ${p.new_dtype}` });
    case "add_calculated_column":
      return tx({ es: `Columna calculada agregada "${p.name}" (${p.formula})`, en: `Added calculated column "${p.name}" (${p.formula})` });
    default:
      return String(type);
  }
}
