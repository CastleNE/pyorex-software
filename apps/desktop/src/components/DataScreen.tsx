import { useDatasetStore } from "@/stores/dataset-store";
import ActionButton from "@/components/ActionButton";
import DataTable from "@/components/DataTable";

interface Props {
  onOpenData: () => void;
}

// Pantalla "Data": fuentes de carga + preview del dataset activo.
// Separada de "Módulos" — aquí solo se carga y se mira, el análisis vive
// en Módulos.
export default function DataScreen({ onOpenData }: Props) {
  const { dataset, hasData } = useDatasetStore();

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 bg-zinc-850 border-b border-zinc-700 shrink-0">
        <ActionButton label="Load Files" icon="📂" onClick={onOpenData} />
        <ActionButton label="Cloud repository" icon="☁" disabled title="Próximamente — OneDrive, Google Drive" />
        <ActionButton label="Online server" icon="🗄" disabled title="Próximamente" />
        {hasData && (
          <span className="ml-auto text-xs text-zinc-500">
            {dataset!.name} — {dataset!.rowCount.toLocaleString()} rows × {dataset!.columnCount} cols
          </span>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        {hasData ? (
          <DataTable />
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
    </div>
  );
}
