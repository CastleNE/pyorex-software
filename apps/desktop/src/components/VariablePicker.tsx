/**
 * Reusable searchable/grouped variable picker used by analysis tool windows
 * and the Calculated Column tool. Groups columns via classifyColumns()
 * (Identifiers/Coordinates/Dates/Calculated/Numeric/Categorical/Other).
 * Categories outside `recommendedCategories` start collapsed — variables
 * outside the "correct" type for a given analysis are never hidden, only
 * de-emphasized, so the user can still pick them manually when valid.
 */
import { useMemo, useState } from "react";
import type { ColumnMeta } from "@/stores/dataset-store";
import { classifyColumns, VARIABLE_CATEGORIES, type VariableCategory } from "@/lib/variable-classification";

interface Props {
  columns: ColumnMeta[];
  selected: string[];
  onChange: (names: string[]) => void;
  recommendedCategories?: VariableCategory[];
}

export default function VariablePicker({ columns, selected, onChange, recommendedCategories }: Props) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<VariableCategory>>(
    new Set(recommendedCategories ?? VARIABLE_CATEGORIES)
  );

  const grouped = useMemo(() => classifyColumns(columns), [columns]);
  const query = search.trim().toLowerCase();

  function toggle(name: string) {
    onChange(selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]);
  }

  function toggleCategory(cat: VariableCategory) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function selectAll() {
    const visible = VARIABLE_CATEGORIES.flatMap((cat) =>
      grouped[cat].filter((c) => !query || c.name.toLowerCase().includes(query)).map((c) => c.name)
    );
    onChange(Array.from(new Set([...selected, ...visible])));
  }

  function clearAll() {
    onChange([]);
  }

  return (
    <div className="flex h-full flex-col text-xs">
      <div className="shrink-0 border-b border-zinc-700 p-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search columns…"
          className="mb-2 w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-200 outline-none focus:border-blue-500"
        />
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button onClick={selectAll} className="text-blue-400 hover:underline">
              Select All
            </button>
            <button onClick={clearAll} className="text-zinc-500 hover:underline">
              Clear
            </button>
          </div>
          <span className="text-zinc-500">{selected.length} selected</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {VARIABLE_CATEGORIES.map((cat) => {
          const items = grouped[cat].filter((c) => !query || c.name.toLowerCase().includes(query));
          if (items.length === 0) return null;
          const isRecommended = !recommendedCategories || recommendedCategories.includes(cat);
          const isExpanded = expanded.has(cat);
          return (
            <div key={cat} className="mb-2">
              <button
                onClick={() => toggleCategory(cat)}
                className="mb-1 flex w-full items-center gap-1 px-1 text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-500 hover:text-zinc-300"
              >
                <span>{isExpanded ? "▾" : "▸"}</span>
                <span>{cat}</span>
                <span className="text-zinc-700">({items.length})</span>
                {!isRecommended && <span className="ml-auto normal-case text-zinc-700">not typical</span>}
              </button>
              {isExpanded &&
                items.map((col) => (
                  <label key={col.name} className="flex cursor-pointer items-center gap-2 px-2 py-0.5 text-zinc-300">
                    <input
                      type="checkbox"
                      checked={selected.includes(col.name)}
                      onChange={() => toggle(col.name)}
                      className="accent-blue-500"
                    />
                    <span className="truncate">{col.name}</span>
                  </label>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
