/**
 * Semantic column roles per dataset (geochemistry.column_roles), shared by the ribbon availability dots, the
 * Variables panel and the Editor's automapping. A user correction refreshes every consumer at once.
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { geoApi } from '../lib/geochemistry-api';
import { roleMapFrom, type ColumnRoleMap } from '../lib/semantic-roles';
import { variablesApi } from '../lib/variables-api';
import { markProjectDataChanged } from '../lib/project-events';
import { useGeochemistryStore } from './geochemistry-store';

interface RolesState {
  byDataset: Record<string, ColumnRoleMap>;
  errors: Record<string, string>;
  load: (datasetId: string, force?: boolean) => Promise<void>;
  setRole: (datasetId: string, column: string, role: string | null, analyte?: string | null) => Promise<void>;
}

const inflight = new Map<string, Promise<void>>();

export const useColumnRoles = create<RolesState>((set, get) => {
  const put = (datasetId: string, roles: ColumnRoleMap) => {
    set(s => ({ byDataset: { ...s.byDataset, [datasetId]: roles }, errors: { ...s.errors, [datasetId]: '' } }));
    // Keep the Editor's automapping in step with the correction.
    if (useGeochemistryStore.getState().datasetId === datasetId) useGeochemistryStore.setState({ columnRoles: roles });
  };
  return {
    byDataset: {}, errors: {},
    load: (datasetId, force = false) => {
      if (!force && get().byDataset[datasetId]) return Promise.resolve();
      const running = inflight.get(datasetId); if (running && !force) return running;
      const p = geoApi.columnRoles(datasetId)
        .then(r => put(datasetId, roleMapFrom(r.columns)))
        .catch(e => set(s => ({ errors: { ...s.errors, [datasetId]: e instanceof Error ? e.message : String(e) } })))
        .finally(() => inflight.delete(datasetId));
      inflight.set(datasetId, p);
      return p;
    },
    setRole: async (datasetId, column, role, analyte = null) => {
      const r = await variablesApi.setColumnRole(datasetId, column, role, analyte);
      put(datasetId, roleMapFrom(r.columns));
      markProjectDataChanged();
    },
  };
});

/** Roles of one dataset; the Workbench's freshly loaded copy wins when it is for the same dataset. */
export function useDatasetRoles(datasetId: string | undefined): ColumnRoleMap | null {
  const cached = useColumnRoles(s => (datasetId ? s.byDataset[datasetId] : undefined));
  const geoDataset = useGeochemistryStore(s => s.datasetId), geoRoles = useGeochemistryStore(s => s.columnRoles);
  useEffect(() => { if (datasetId) void useColumnRoles.getState().load(datasetId); }, [datasetId]);
  if (datasetId && geoDataset === datasetId && Object.keys(geoRoles).length) return geoRoles;
  return cached ?? null;
}
