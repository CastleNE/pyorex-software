/**
 * CRM library management — simple CRUD, single local JSON file for now (no
 * multi-tenancy exists yet — see analysis/qaqc/crm_library.py).
 */
import { useEffect, useState } from "react";
import { qaqcCrmLibraryList, qaqcCrmLibraryUpsert, type CrmDefinition } from "@/lib/data-api";

interface VariableRow {
  variable: string;
  certified: string;
  uncertainty: string;
}

export default function CrmLibraryWindow() {
  const [crms, setCrms] = useState<CrmDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [rows, setRows] = useState<VariableRow[]>([{ variable: "", certified: "", uncertainty: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    qaqcCrmLibraryList()
      .then((r) => setCrms(r.crms))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function startNew() {
    setEditingName("__new__");
    setFormName("");
    setRows([{ variable: "", certified: "", uncertainty: "" }]);
  }

  function startEdit(crm: CrmDefinition) {
    setEditingName(crm.name);
    setFormName(crm.name);
    const vars = Object.keys(crm.certified_values);
    setRows(
      vars.length > 0
        ? vars.map((v) => ({
            variable: v,
            certified: String(crm.certified_values[v]),
            uncertainty: crm.uncertainty[v] != null ? String(crm.uncertainty[v]) : "",
          }))
        : [{ variable: "", certified: "", uncertainty: "" }]
    );
  }

  function updateRow(i: number, patch: Partial<VariableRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { variable: "", certified: "", uncertainty: "" }]);
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    if (!formName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const certified_values: Record<string, number> = {};
      const uncertainty: Record<string, number> = {};
      for (const row of rows) {
        if (!row.variable.trim() || row.certified.trim() === "") continue;
        certified_values[row.variable.trim()] = Number(row.certified);
        if (row.uncertainty.trim() !== "") uncertainty[row.variable.trim()] = Number(row.uncertainty);
      }
      await qaqcCrmLibraryUpsert(formName.trim(), certified_values, uncertainty);
      setEditingName(null);
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-900 text-xs">
      <div className="flex items-center justify-between border-b border-zinc-700 px-3 py-2">
        <p className="font-semibold text-zinc-300">CRM Library</p>
        <button onClick={startNew} className="rounded-md bg-blue-600 px-2.5 py-1 font-medium text-white hover:bg-blue-500">
          + Add CRM
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-40 shrink-0 overflow-y-auto border-r border-zinc-700 p-2">
          {loading && <p className="text-zinc-600">Loading…</p>}
          {!loading && crms.length === 0 && <p className="text-zinc-600">No CRMs defined yet.</p>}
          {crms.map((crm) => (
            <button
              key={crm.name}
              onClick={() => startEdit(crm)}
              className={`block w-full truncate rounded px-2 py-1 text-left ${
                editingName === crm.name ? "bg-blue-900/30 text-blue-300" : "text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              {crm.name}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {error && <div className="mb-2 rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-red-300">{error}</div>}

          {editingName === null ? (
            <p className="text-zinc-600">Select a CRM to view, or "+ Add CRM" to create one.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-zinc-400">Name</label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. OREAS-262"
                  disabled={editingName !== "__new__"}
                  className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-200 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="mb-1 block text-zinc-400">Certified values</label>
                {rows.map((row, i) => (
                  <div key={i} className="mb-1 flex items-center gap-1.5">
                    <input
                      value={row.variable}
                      onChange={(e) => updateRow(i, { variable: e.target.value })}
                      placeholder="Variable (e.g. Au)"
                      className="w-24 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-200"
                    />
                    <input
                      value={row.certified}
                      onChange={(e) => updateRow(i, { certified: e.target.value })}
                      placeholder="Certified"
                      type="number"
                      className="w-24 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-200"
                    />
                    <input
                      value={row.uncertainty}
                      onChange={(e) => updateRow(i, { uncertainty: e.target.value })}
                      placeholder="±1σ (optional)"
                      type="number"
                      className="w-28 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-200"
                    />
                    <button onClick={() => removeRow(i)} className="text-zinc-500 hover:text-red-400">
                      ✕
                    </button>
                  </div>
                ))}
                <button onClick={addRow} className="mt-1 text-blue-400 hover:underline">
                  + Add variable
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving || !formName.trim()}
                  className="rounded-md bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => setEditingName(null)}
                  className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-400 hover:bg-zinc-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
