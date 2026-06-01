// Analysis types — mirrors Python Pydantic schemas

export type AnalysisType =
  | "pca"
  | "clustering_kmeans"
  | "clustering_hierarchical"
  | "correlation"
  | "factor"
  | "descriptive"
  | "outlier"
  | "geochemical_index";

export type AnalysisStatus = "pending" | "running" | "completed" | "failed";

export interface AnalysisMeta {
  id: string;
  projectId: string;
  datasetId: string;
  type: AnalysisType;
  status: AnalysisStatus;
  executedBy: string;
  executedAt: string;
  pipelineRef?: string;
}

// Quality metrics — every analysis result must include these
export interface QualityMetrics {
  warnings: string[];
  // PCA / Factor Analysis
  kmoGlobal?: number;
  bartlettPValue?: number;
  // Clustering
  silhouetteAvg?: number;
  daviesBouldinScore?: number;
  // Hierarchical
  cophenenticCoeff?: number;
  // Factor Analysis
  varianceExplained?: number;
  // Outliers
  nOutliers?: number;
  methodUsed?: string;
}

export interface PCAResult {
  jobId: string;
  nComponents: number;
  explainedVarianceRatio: number[];
  cumulativeVariance: number[];
  loadings: number[][];
  scores: number[][];
  eigenvalues: number[];
  variablesUsed: string[];
  nSamples: number;
  quality: QualityMetrics;
}

export interface KMeansResult {
  jobId: string;
  k: number;
  labels: number[];
  inertia: number;
  elbowCurve: { k: number; inertia: number }[];
  silhouetteCurve: { k: number; score: number }[];
  quality: QualityMetrics;
}
