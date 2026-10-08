import { useRef } from "react";
import { useDatasetStore } from "@/stores/dataset-store";
import DataGrid from "@/components/DataGrid";
import DataToolbar from "@/components/data/DataToolbar";
import ColumnProfileStrip, { useColumnProfile } from "@/components/data/ColumnProfileStrip";
import WorkspaceArea from "@/components/window-manager/WorkspaceArea";
import type { WorkspaceAreaHandle } from "@/components/window-manager/types";
import PxIcon from "@/components/PxIcon";
import { useL } from "@/lib/i18n";

interface Props {
  onOpenData: () => void;
}

// «Tabla y preparación»: one toolbar row, the column profile (distribution, completeness and issues of every
// column of the rows on screen) and the grid using the rest of the height. Tool windows (filter, calculated
// column, quality, QAQC…) float over the grid instead of taking a canvas of their own.
export default function DataScreen({ onOpenData }: Props) {
  const L = useL();
  const { dataset, hasData } = useDatasetStore();
  const workspaceRef = useRef<WorkspaceAreaHandle>(null);
  const { profile, error, loading, onlySelection } = useColumnProfile(dataset?.id);

  if (!hasData || !dataset) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <PxIcon name="table" className="h-9 w-9 text-subtle" />
        <p className="text-sm text-subtle">{L({ es: "Carga un archivo para ver la vista previa", en: "Load a file to see the preview" })}</p>
        <button
          onClick={onOpenData}
          className="rounded-md bg-accent-strong px-4 py-1.5 text-xs font-medium text-on-accent transition-colors hover:bg-accent-hover"
        >
          {L({ es: "Cargar archivos…", en: "Load Files…" })}
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <DataToolbar workspaceRef={workspaceRef} profile={profile} onlySelection={onlySelection} />
      <ColumnProfileStrip profile={profile} error={error} loading={loading} />
      <div className="relative min-h-0 flex-1 overflow-hidden bg-app">
        <DataGrid workspaceRef={workspaceRef} />
        <WorkspaceArea ref={workspaceRef} overlay />
      </div>
    </div>
  );
}
