/** `project.*` RPC (.orex project files) — see packages/ipc-contracts/project/*.v1.json. */
import { callRpc } from './rpc';
import type { ImportedDatasetMeta } from './data-api';

export interface ProjectManifest {
  format: 'pyorex-project'; version: number; app: string; name: string; saved_at: string;
  datasets: { id: string; name: string; row_count: number | null; column_count: number | null; sha256: string; has_ops?: boolean }[];
}
export interface ProjectSaved { path: string; name: string; saved_at: string; datasets: number; bytes: number }
export interface ProjectOpened { manifest: ProjectManifest; state: unknown; id_map: Record<string, string>; datasets: ImportedDatasetMeta[] }

export const projectApi = {
  save: (path: string, name: string | null, state: unknown, datasetIds: string[]) =>
    callRpc<ProjectSaved>('project.save', { path, name, state: state as Record<string, unknown>, dataset_ids: datasetIds }),
  open: (path: string) => callRpc<ProjectOpened>('project.open', { path }),
  inspect: (path: string) => callRpc<{ manifest: ProjectManifest }>('project.inspect', { path }),
};
