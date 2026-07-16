/**
 * QAQC module screen — unlike Data Analysis's tool catalog, QAQC has one
 * real panel per dataset, so its WorkspaceArea opens QaqcPanel automatically
 * on mount instead of showing a catalog as the empty state. Additional
 * floating windows (control charts, CRM library) are opened from within
 * QaqcPanel using the same window-manager instance.
 */
import { useEffect, useRef } from "react";
import { useDatasetStore } from "@/stores/dataset-store";
import WorkspaceArea from "@/components/window-manager/WorkspaceArea";
import type { WorkspaceAreaHandle } from "@/components/window-manager/types";
import QaqcPanel from "@/components/tool-windows/QaqcPanel";

interface Props {
  onOpenData: () => void;
}

export default function QaqcScreen({ onOpenData }: Props) {
  const { dataset, hasData } = useDatasetStore();
  const workspaceRef = useRef<WorkspaceAreaHandle>(null);

  useEffect(() => {
    if (!dataset) return;
    workspaceRef.current?.openWindow({
      id: "qaqc-panel",
      title: "QAQC Summary",
      icon: "🧪",
      defaultPos: { x: 20, y: 20, width: 820, height: 560 },
      render: () => <QaqcPanel datasetId={dataset.id} workspaceRef={workspaceRef} />,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset?.id]);

  if (!hasData || !dataset) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-zinc-900">
        <div className="text-4xl opacity-20">🧪</div>
        <p className="text-sm text-zinc-600">Cargá un dataset para revisar QAQC</p>
        <button
          onClick={onOpenData}
          className="rounded-md border border-zinc-700 bg-zinc-800 px-4 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700"
        >
          Open Data…
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <WorkspaceArea
        ref={workspaceRef}
        emptyState={
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <p className="text-xs text-zinc-600">Loading QAQC panel…</p>
          </div>
        }
      />
    </div>
  );
}
