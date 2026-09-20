import { useEffect, useRef, useState } from "react";
import { useDatasetStore } from "@/stores/dataset-store";
import { useDataPreviewStore } from "@/stores/data-preview-store";
import QuickToolsRibbon from "@/components/QuickToolsRibbon";
import DataPreviewPanel from "@/components/DataPreviewPanel";
import PyOrexLogo from "@/components/PyOrexLogo";
import SummaryTilesBar from "@/components/SummaryTilesBar";
import DataQualityWindow from "@/components/tool-windows/DataQualityWindow";
import WorkspaceArea from "@/components/window-manager/WorkspaceArea";
import type { WorkspaceAreaHandle } from "@/components/window-manager/types";

interface Props {
  onOpenData: () => void;
}

// Pantalla "Data": espacio de preparación/exploración estilo Excel/Power BI.
// El canvas superior (WorkspaceArea) sigue siendo ventanas flotantes
// ad-hoc (Calculated Column, Data Quality, quick-charts clavados desde la
// grilla) con una barra de KPIs (SummaryTilesBar) siempre visible arriba.
// La grilla en sí ya NO es una de esas ventanas — es "Data Preview", un
// panel acoplable/flotante independiente (ver DataPreviewPanel.tsx) anclado
// abajo por defecto, estilo VS Code/QGIS.
export default function DataScreen({ onOpenData }: Props) {
  const { dataset, hasData } = useDatasetStore();
  const resetPreviewForNewDataset = useDataPreviewStore((s) => s.resetForNewDataset);
  const openPreview = useDataPreviewStore((s) => s.open);
  const workspaceRef = useRef<WorkspaceAreaHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dockZoneActive, setDockZoneActive] = useState(false);

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

  // Show Data Preview docked-at-bottom the first time a dataset becomes
  // active, so the primary content is visible immediately.
  useEffect(() => {
    if (dataset) resetPreviewForNewDataset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset?.id]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">


      {hasData && dataset ? (
        <>
          <QuickToolsRibbon workspaceRef={workspaceRef} />
          <div ref={containerRef} className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <WorkspaceArea
                ref={workspaceRef}
                banner={<SummaryTilesBar dataset={dataset} onOpenQuality={openDataQuality} onOpenGrid={openPreview} />}
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
            <DataPreviewPanel
              containerRef={containerRef}
              workspaceRef={workspaceRef}
              onDockZoneChange={setDockZoneActive}
            />
            {dockZoneActive && <DockZoneIndicator />}
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

// Bottom-band highlight shown while dragging the floating Data Preview panel
// near the dock zone — matches the panel's last docked height so the user
// sees exactly where it'll land.
function DockZoneIndicator() {
  const dockedHeight = useDataPreviewStore((s) => s.dockedHeight);
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[90] border-2 border-dashed border-blue-400 bg-blue-500/10"
      style={{ height: dockedHeight }}
    />
  );
}
