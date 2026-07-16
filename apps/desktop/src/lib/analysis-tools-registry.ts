// Categorized catalog for the "Data Analysis" module — same status:"active"|
// "planned" convention as modules-registry.ts. Landing on Data Analysis shows
// this catalog; it does NOT auto-run Descriptive Statistics or jump straight
// to a flat variable list.
//
// Naming follows the corrected terminology from the product spec exactly:
// "Data Cleaning" (not "Data Cleanned"), "Calculated Variables" (not
// "Calculate Variables"), "Transformations", "Correlation Analysis",
// "Cluster Analysis" family kept as distinct methods (Hierarchical/K-means)
// since no backend reason exists to merge them.
//
// "Correlation Analysis" intentionally consolidates Pearson + Spearman into
// ONE card because the existing analytics.descriptive RPC already computes
// both in a single call — two separate cards would imply two separate
// backend paths that don't exist.

export type AnalysisCategory =
  | "Data Preparation"
  | "Descriptive Analysis"
  | "Bivariate Analysis"
  | "Multivariate Analysis"
  | "Compositional Data Analysis"
  | "Results";

export const ANALYSIS_CATEGORIES: AnalysisCategory[] = [
  "Data Preparation",
  "Descriptive Analysis",
  "Bivariate Analysis",
  "Multivariate Analysis",
  "Compositional Data Analysis",
  "Results",
];

export interface AnalysisTool {
  id: string;
  label: string;
  category: AnalysisCategory;
  status: "active" | "planned";
  description?: string;
}

export const ANALYSIS_TOOLS: AnalysisTool[] = [
  // ── Data Preparation ──────────────────────────────────────────────────────
  { id: "data-cleaning", label: "Data Cleaning", category: "Data Preparation", status: "planned" },
  { id: "missing-values", label: "Missing Values", category: "Data Preparation", status: "planned" },
  { id: "censored-data", label: "Censored Data", category: "Data Preparation", status: "planned" },
  { id: "outlier-detection", label: "Outlier Detection", category: "Data Preparation", status: "planned" },
  { id: "filter-and-select", label: "Filter and Select", category: "Data Preparation", status: "planned" },
  { id: "transformations", label: "Transformations", category: "Data Preparation", status: "planned" },
  { id: "calculated-variables", label: "Calculated Variables", category: "Data Preparation", status: "planned" },

  // ── Descriptive Analysis ──────────────────────────────────────────────────
  {
    id: "descriptive-statistics",
    label: "Descriptive Statistics",
    category: "Descriptive Analysis",
    status: "active",
    description: "Mean/median/std/skewness + Shapiro-Wilk normality per variable (analytics.descriptive).",
  },
  { id: "frequency-analysis", label: "Frequency Analysis", category: "Descriptive Analysis", status: "planned" },
  { id: "grouped-statistics", label: "Grouped Statistics", category: "Descriptive Analysis", status: "planned" },
  { id: "data-distribution", label: "Data Distribution", category: "Descriptive Analysis", status: "planned" },
  { id: "normality-tests", label: "Normality Tests", category: "Descriptive Analysis", status: "planned" },
  { id: "percentiles-and-thresholds", label: "Percentiles and Thresholds", category: "Descriptive Analysis", status: "planned" },

  // ── Bivariate Analysis ────────────────────────────────────────────────────
  {
    id: "correlation-analysis",
    label: "Correlation Analysis",
    category: "Bivariate Analysis",
    status: "active",
    description: "Pearson + Spearman correlation matrix (analytics.descriptive).",
  },
  { id: "covariance-matrix", label: "Covariance Matrix", category: "Bivariate Analysis", status: "planned" },
  { id: "scatter-analysis", label: "Scatter Analysis", category: "Bivariate Analysis", status: "planned" },
  { id: "group-comparison", label: "Group Comparison", category: "Bivariate Analysis", status: "planned" },

  // ── Multivariate Analysis ─────────────────────────────────────────────────
  {
    id: "principal-component-analysis",
    label: "Principal Component Analysis",
    category: "Multivariate Analysis",
    status: "active",
    description: "PCA with mandatory KMO/Bartlett/VIF validation (analytics.pca).",
  },
  { id: "hierarchical-clustering", label: "Hierarchical Clustering", category: "Multivariate Analysis", status: "planned" },
  { id: "kmeans-clustering", label: "K-means Clustering", category: "Multivariate Analysis", status: "planned" },
  { id: "self-organizing-maps", label: "Self-Organizing Maps", category: "Multivariate Analysis", status: "planned" },
  { id: "discriminant-analysis", label: "Discriminant Analysis", category: "Multivariate Analysis", status: "planned" },

  // ── Compositional Data Analysis ───────────────────────────────────────────
  { id: "zero-replacement", label: "Zero Replacement", category: "Compositional Data Analysis", status: "planned" },
  { id: "closure", label: "Closure", category: "Compositional Data Analysis", status: "planned" },
  { id: "clr-transformation", label: "CLR Transformation", category: "Compositional Data Analysis", status: "planned" },
  { id: "alr-transformation", label: "ALR Transformation", category: "Compositional Data Analysis", status: "planned" },
  { id: "ilr-transformation", label: "ILR Transformation", category: "Compositional Data Analysis", status: "planned" },
  { id: "compositional-pca", label: "Compositional PCA", category: "Compositional Data Analysis", status: "planned" },
  { id: "variation-matrix", label: "Variation Matrix", category: "Compositional Data Analysis", status: "planned" },

  // ── Results ───────────────────────────────────────────────────────────────
  {
    id: "analysis-history",
    label: "Analysis History",
    category: "Results",
    status: "active",
    description: "Session log of executed analyses — re-run, duplicate, or delete an entry.",
  },
  { id: "saved-results", label: "Saved Results", category: "Results", status: "planned" },
  { id: "export-results", label: "Export Results", category: "Results", status: "planned" },
  { id: "add-results-to-dataset", label: "Add Results to Dataset", category: "Results", status: "planned" },
];

export function toolsByCategory(category: AnalysisCategory): AnalysisTool[] {
  return ANALYSIS_TOOLS.filter((t) => t.category === category);
}
