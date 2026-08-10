import { useEffect, useRef } from "react";
import { useDatasetStore } from "@/stores/dataset-store";
import ActionButton from "@/components/ActionButton";
import DataToolbar from "@/components/DataToolbar";
import DataGrid from "@/components/DataGrid";
import PyOrexLogo from "@/components/PyOrexLogo";
import SummaryTilesBar from "@/components/SummaryTilesBar";
import DataQualityWindow from "@/components/tool-windows/DataQualityWindow";
import WorkspaceArea from "@/components/window-manager/WorkspaceArea";
import type { WorkspaceAreaHandle } from "@/components/window-manager/types";

interface Props {
  onOpenData: () => void;
}

// Pantalla "Data": espacio de preparación/exploración estilo Excel/Power BI.
// Una sola área de trabajo con ventanas flotantes (drag/resize/minimize) —
// la grilla de datos es una ventana más, no un panel fijo — con una barra de
// KPIs (SummaryTilesBar) siempre visible arriba, sin importar qué ventanas
// estén abiertas.
export default function DataScreen({ onOpenData }: Props) {
  const { dataset, hasData } = useDatasetStore();
  const workspaceRef = useRef<WorkspaceAreaHandle>(null);

  function openDataGridWindow() {
    if (!dataset) return;
    workspaceRef.current?.openWindow({
      id: "data-grid",
      title: `${dataset.name} — Data Grid`,
      icon: "📋",
      defaultPos: { x: 16, y: 16, width: 1040, height: 560 },
      render: () => <DataGrid workspaceRef={workspaceRef} />,
    });
  }

  function openDataQuality() {
    if (!dataset) return;
    workspaceRef.current?.openWindow({
      id: "data-quality",
      title: "Data Quality",
      icon: "🩺",
      defaultPos: { x: 60, y: 40, width: 640, height: 460 },
      render: () => <DataQualityWindow datasetId={dataset.id} />,
    });
  }

  // Auto-open the grid the first time a dataset becomes active, so the
  // primary content is visible immediately — same as before, but now it's a
  // regular floating window the user can move/resize/minimize/close.
  useEffect(() => {
    if (dataset) openDataGridWindow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset?.id]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 bg-zinc-850 border-b border-zinc-700 shrink-0">
        <ActionButton label="Load Files" icon="📂" onClick={onOpenData} />
        <ActionButton label="Cloud repository" icon="☁" disabled title="Próximamente — OneDrive, Google Drive" />
        <ActionButton label="Online server" icon="🗄" disabled title="Próximamente" />
      </div>

      {hasData && dataset ? (
        <>
          <DataToolbar workspaceRef={workspaceRef} onOpenGrid={openDataGridWindow} />
          <div className="min-h-0 flex-1 overflow-hidden">
            <WorkspaceArea
              ref={workspaceRef}
              banner={<SummaryTilesBar dataset={dataset} onOpenQuality={openDataQuality} onOpenGrid={openDataGridWindow} />}
              emptyState={
                <DataEmptyState
                  datasetName={dataset.name}
                  rowCount={dataset.rowCount}
                  columnCount={dataset.columnCount}
                  importedAt={dataset.importedAt}
                />
              }
            />
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-3">
          <div className="text-4xl opacity-20">📄</div>
          <p className="text-sm text-zinc-600">Carga un archivo para ver la vista previa</p>
          <button
            onClick={onOpenData}
            className="px-4 py-1.5 text-xs rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
          >
            Load Files…
          </button>
        </div>
      )}
    </div>
  );
}

function DataEmptyState({
  datasetName,
  rowCount,
  columnCount,
  importedAt,
}: {
  datasetName: string;
  rowCount: number;
  columnCount: number;
  importedAt: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2">
      <PyOrexLogo size={40} />
      <p className="mt-1 text-sm font-medium text-zinc-300">{datasetName}</p>
      <p className="text-xs text-zinc-500">
        {rowCount.toLocaleString()} rows × {columnCount} cols · loaded {new Date(importedAt).toLocaleString()}
      </p>
      <p className="mt-2 text-[11px] text-zinc-700">Open a tool from the toolbar to work here</p>
    </div>
  );
}
