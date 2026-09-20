/**
 * Typed helpers for the lithogeochemistry.* RPC methods.
 */
import { callRpc } from "./rpc";

export type TasSeries = "Ultrabasic" | "Basic" | "Intermediate" | "Acid" | "Invalid";

export interface TasSample {
  sample_id: string;
  sio2: number | null;
  total_alkali: number | null;
  series: TasSeries;
}

export interface TasClassifyResult {
  samples: TasSample[];
  counts_by_series: Record<TasSeries, number>;
  series_boundaries: [number, number, number];
}

export function tasClassify(
  datasetId: string,
  sio2Column: string,
  na2oColumn: string,
  k2oColumn: string
): Promise<TasClassifyResult> {
  return callRpc("lithogeochemistry.tas.classify", {
    dataset_id: datasetId,
    sio2_column: sio2Column,
    na2o_column: na2oColumn,
    k2o_column: k2oColumn,
  });
}
