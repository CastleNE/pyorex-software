/**
 * ImportWizard — Importación de datasets geoquímicos estilo IoGAS v7.
 *
 * Step 1 (preview):   resumen del archivo, nombre, separador
 * Step 2 (columns):   panel Special Columns + tabla de columnas con Import/Analito/Unidad/Alias
 * Step 3 (spatial):   selector CRS global
 * Step 4 (validate):  resumen antes de importar — único lugar con botón Import Dataset
 */
import { useState, useEffect, useMemo } from "react";
import { previewFile, importFile } from "@/lib/data-api";
import type {
  ColumnPreview,
  ImportedDatasetMeta,
  SpatialConfig,
  GeometrySource,
  ImportedColumnProfile,
  ColumnRole,
  ModuleAvailability,
  ImportFlag,
  Unit,
  ColumnMapping,
  PreviewResult,
  SampleTypeMappingInput,
} from "@/lib/data-api";

// ── Sample type value mapping (RF-10.1.2) ────────────────────────────────────

const SAMPLE_TYPE_CODES = ["S", "FB", "LB", "FD", "LD", "CRM"] as const;
type SampleTypeCode = (typeof SAMPLE_TYPE_CODES)[number];

const SAMPLE_TYPE_LABELS: Record<SampleTypeCode, string> = {
  S: "S — Regular",
  FB: "FB — Field Blank",
  LB: "LB — Lab Blank",
  FD: "FD — Field Duplicate",
  LD: "LD — Lab Duplicate",
  CRM: "CRM — Reference Material",
};

/** Auto-suggestion only — the user reviews/overrides every mapping before import. */
function guessSampleTypeCode(raw: string): SampleTypeCode | null {
  const v = raw.toLowerCase();
  if (v.includes("blanco") || v.includes("blank")) {
    return v.includes("lab") ? "LB" : "FB";
  }
  if (v.includes("dup")) {
    return v.includes("lab") ? "LD" : "FD";
  }
  if (v.includes("crm") || v.includes("std") || v.includes("standard") || v.includes("ref")) {
    return "CRM";
  }
  return null;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const ANALYTE_LIST = [
  "Ag","Al","Al2O3","Ar","As","As2O3","Au","B","B2O3","Ba","BaO","Be","Bi","BO3","Br",
  "C","Ca","CaO","Cd","Ce","Ce2O3","CeO2","Cl","Co","CoO","CO2","CO3","Cr","Cr2O3","Cs","Cs2O","Cu","CuO",
  "Dy","Dy2O3","Er","Er2O3","Eu","Eu2O3","F","Fe","Fe2O3","FeO","Fe2O3*","FeO*",
  "Ga","Gd","Gd2O3","Ge","H2O","He","Hf","Hg","Ho","Ho2O3","I","In","Ir",
  "K","K2O","Kr","La","La2O3","Li","Li2O","LOI","Lu","Lu2O3",
  "Mg","MgO","Mn","MnO","Mn3O4","Mo","N","Na","Na2O","Nb","Nb2O5","Nd","Nd2O3","Ne","Ni","NiO",
  "OH-","OH+","Os","P","P2O5","Pb","PbO","Pd","Pm","Pm2O3","Pr","Pr2O3","Pr6O11","Pt",
  "Ra","Rb","Rb2O","Re","Rh","Rn","Ru","S","Sb","Sc","Sc2O3","Se","Si","SiO2",
  "Sm","Sm2O3","Sn","SnO2","SO2","SO3","SO4","Sr","SrO",
  "Ta","Ta2O5","Tb","Tb2O3","Tb4O7","Tc","Te","Th","Ti","TiO2","Tl","Tm","Tm2O3",
  "U","U3O8","V","V2O5","W","Y","Y2O3","Yb","Yb2O3","Zn","ZnO","Zr","ZrO2",
];

interface CrsPreset {
  epsg: string;
  label: string;
  category: string;
  isGeo: boolean;
}

const CRS_PRESETS: CrsPreset[] = [
  { epsg: "EPSG:4326", label: "WGS84 (geographic)",    category: "Geographic", isGeo: true  },
  { epsg: "EPSG:4283", label: "GDA94 (geographic)",    category: "Geographic", isGeo: true  },
  { epsg: "EPSG:7844", label: "GDA2020 (geographic)",  category: "Geographic", isGeo: true  },
  { epsg: "EPSG:4248", label: "PSAD56 (geographic)",   category: "Geographic", isGeo: true  },
  // WGS84 UTM North 1–60
  ...Array.from({ length: 60 }, (_, i) => ({
    epsg: `EPSG:${32601 + i}`, label: `WGS84 / UTM Zone ${i + 1}N`,
    category: "WGS84 UTM North", isGeo: false,
  })),
  // WGS84 UTM South 1–60
  ...Array.from({ length: 60 }, (_, i) => ({
    epsg: `EPSG:${32701 + i}`, label: `WGS84 / UTM Zone ${i + 1}S`,
    category: "WGS84 UTM South", isGeo: false,
  })),
  // Peru
  { epsg: "EPSG:32717", label: "WGS84 / UTM Zone 17S",  category: "Peru", isGeo: false },
  { epsg: "EPSG:32718", label: "WGS84 / UTM Zone 18S",  category: "Peru", isGeo: false },
  { epsg: "EPSG:32719", label: "WGS84 / UTM Zone 19S",  category: "Peru", isGeo: false },
  { epsg: "EPSG:24877", label: "PSAD56 / UTM Zone 17S", category: "Peru", isGeo: false },
  { epsg: "EPSG:24878", label: "PSAD56 / UTM Zone 18S", category: "Peru", isGeo: false },
  { epsg: "EPSG:24879", label: "PSAD56 / UTM Zone 19S", category: "Peru", isGeo: false },
  { epsg: "EPSG:5839",  label: "Peru96 / UTM Zone 17S", category: "Peru", isGeo: false },
  { epsg: "EPSG:5387",  label: "Peru96 / UTM Zone 18S", category: "Peru", isGeo: false },
  { epsg: "EPSG:5389",  label: "Peru96 / UTM Zone 19S", category: "Peru", isGeo: false },
  // Australia GDA94 AMG
  ...Array.from({ length: 11 }, (_, i) => ({
    epsg: `EPSG:${20248 + i}`, label: `GDA94 / AMG Zone ${48 + i}`,
    category: "Australia", isGeo: false,
  })),
  // Australia GDA2020 MGA
  ...Array.from({ length: 11 }, (_, i) => ({
    epsg: `EPSG:${7848 + i}`, label: `GDA2020 / MGA Zone ${48 + i}`,
    category: "Australia", isGeo: false,
  })),
  // South America PSAD56
  ...Array.from({ length: 6 }, (_, i) => ({
    epsg: `EPSG:${24817 + i}`, label: `PSAD56 / UTM Zone ${17 + i}S`,
    category: "South America", isGeo: false,
  })),
];

const CRS_CATEGORIES = ["All", ...Array.from(new Set(CRS_PRESETS.map(p => p.category)))];

const ROLE_LABELS: Record<ColumnRole, string> = {
  sample_identifier:  "ID muestra",
  coordinate_x:       "Coord X",
  coordinate_y:       "Coord Y",
  coordinate_z:       "Coord Z",
  longitude_wgs84:    "WGS84 Lon",
  latitude_wgs84:     "WGS84 Lat",
  datetime:           "Fecha/Hora",
  sample_type_qaqc:   "Tipo muestra",
  assay_element:      "Elemento",
  assay_oxide:        "Óxido",
  assay_compound:     "Compuesto",
  calculated_numeric: "Calculado",
  ratio_numeric:      "Ratio",
  index_numeric:      "Índice",
  physical_numeric:   "Físico",
  text_attribute:     "Texto",
  date_attribute:     "Fecha",
  qaqc_attribute:     "QAQC",
  metadata:           "Metadata",
  ignored:            "Ignorar",
  unknown:            "Desconocido",
};

const ROLE_COLORS: Record<string, string> = {
  sample_identifier:  "text-purple-400 bg-purple-400/10 border-purple-400/30",
  coordinate_x:       "text-blue-400 bg-blue-400/10 border-blue-400/30",
  coordinate_y:       "text-blue-400 bg-blue-400/10 border-blue-400/30",
  coordinate_z:       "text-blue-300 bg-blue-300/10 border-blue-300/30",
  longitude_wgs84:    "text-cyan-400 bg-cyan-400/10 border-cyan-400/30",
  latitude_wgs84:     "text-cyan-400 bg-cyan-400/10 border-cyan-400/30",
  datetime:           "text-sky-400 bg-sky-400/10 border-sky-400/30",
  sample_type_qaqc:   "text-orange-400 bg-orange-400/10 border-orange-400/30",
  assay_element:      "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
  assay_oxide:        "text-teal-400 bg-teal-400/10 border-teal-400/30",
  assay_compound:     "text-teal-300 bg-teal-300/10 border-teal-300/30",
  calculated_numeric: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  ratio_numeric:      "text-yellow-300 bg-yellow-300/10 border-yellow-300/30",
  index_numeric:      "text-amber-400 bg-amber-400/10 border-amber-400/30",
  physical_numeric:   "text-orange-300 bg-orange-300/10 border-orange-300/30",
  text_attribute:     "text-zinc-400 bg-zinc-400/10 border-zinc-400/30",
  date_attribute:     "text-sky-300 bg-sky-300/10 border-sky-300/30",
  qaqc_attribute:     "text-orange-400 bg-orange-400/10 border-orange-400/30",
  metadata:           "text-zinc-500 bg-zinc-500/10 border-zinc-500/30",
  ignored:            "text-zinc-600 bg-zinc-600/10 border-zinc-600/30",
  unknown:            "text-red-400 bg-red-400/10 border-red-400/30",
};

const ALL_ROLES: ColumnRole[] = [
  "sample_identifier","coordinate_x","coordinate_y","coordinate_z",
  "longitude_wgs84","latitude_wgs84","datetime","sample_type_qaqc",
  "assay_element","assay_oxide","assay_compound",
  "ratio_numeric","index_numeric","calculated_numeric","physical_numeric",
  "text_attribute","date_attribute","qaqc_attribute",
  "metadata","ignored","unknown",
];

const ASSAY_ROLES = new Set<ColumnRole>(["assay_element","assay_oxide","assay_compound"]);

// Solid fill variant of ROLE_COLORS — same hue/shade, used for bar segments instead of badges.
const ROLE_BAR_COLORS: Record<string, string> = {
  sample_identifier:  "bg-purple-400",
  coordinate_x:       "bg-blue-400",
  coordinate_y:       "bg-blue-400",
  coordinate_z:       "bg-blue-300",
  longitude_wgs84:    "bg-cyan-400",
  latitude_wgs84:     "bg-cyan-400",
  datetime:           "bg-sky-400",
  sample_type_qaqc:   "bg-orange-400",
  assay_element:      "bg-emerald-400",
  assay_oxide:        "bg-teal-400",
  assay_compound:     "bg-teal-300",
  calculated_numeric: "bg-yellow-400",
  ratio_numeric:      "bg-yellow-300",
  index_numeric:      "bg-amber-400",
  physical_numeric:   "bg-orange-300",
  text_attribute:     "bg-zinc-400",
  date_attribute:     "bg-sky-300",
  qaqc_attribute:     "bg-orange-400",
  metadata:           "bg-zinc-500",
  ignored:            "bg-zinc-600",
  unknown:            "bg-red-400",
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface Props {
  filePath: string;
  onImported: (meta: ImportedDatasetMeta) => void;
  onCancel: () => void;
}

type Step = "preview" | "columns" | "spatial" | "validate" | "importing" | "error";

interface SpecialCols {
  id: string;
  east_x: string;
  north_y: string;
  projection: string;      // EPSG code for East/North CRS, e.g. "EPSG:32718"
  elevation_z: string;
  wgs84_lon: string;
  wgs84_lat: string;
  datetime: string;
  sample_type: string;
  geometry_source: GeometrySource;  // active geometry for plotting
}

const EMPTY_SPECIAL: SpecialCols = {
  id: "", east_x: "", north_y: "", projection: "",
  elevation_z: "", wgs84_lon: "", wgs84_lat: "", datetime: "", sample_type: "",
  geometry_source: "none",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSpecialRole(colName: string, sc: SpecialCols): ColumnRole | null {
  if (colName === sc.id)          return "sample_identifier";
  if (colName === sc.east_x)      return "coordinate_x";
  if (colName === sc.north_y)     return "coordinate_y";
  if (colName === sc.elevation_z) return "coordinate_z";
  if (colName === sc.wgs84_lon)   return "longitude_wgs84";
  if (colName === sc.wgs84_lat)   return "latitude_wgs84";
  if (colName === sc.datetime)    return "datetime";
  if (colName === sc.sample_type) return "sample_type_qaqc";
  return null;
}

function buildSpatialConfig(sc: SpecialCols): SpatialConfig | null {
  const gsource = sc.geometry_source;
  if (gsource === "none") return null;

  const hasXY = !!(sc.east_x && sc.north_y);
  const hasLL = !!(sc.wgs84_lon && sc.wgs84_lat);

  // Require at least one valid coordinate set for the active source
  if (gsource === "projected_xy" && !hasXY) return null;
  if (gsource === "wgs84_lonlat" && !hasLL) return null;
  if (!hasXY && !hasLL) return null;

  const preset = CRS_PRESETS.find(p => p.epsg === sc.projection);
  return {
    geometry_source: gsource,
    east_col:  sc.east_x  || null,
    north_col: sc.north_y || null,
    projected_epsg:      sc.projection || null,
    projected_crs_label: preset?.label ?? null,
    lon_col: sc.wgs84_lon || null,
    lat_col: sc.wgs84_lat || null,
  };
}

function deriveModuleAvailability(
  profiles: ImportedColumnProfile[],
  importFlags: Record<string, ImportFlag>,
  sc: SpecialCols,
): ModuleAvailability {
  const imported = profiles.filter(p => (importFlags[p.original_name] ?? p.import_flag ?? "yes") === "yes");
  const roles = new Set(imported.map(p => p.role));
  const hasNumeric = ["assay_element","assay_oxide","assay_compound","ratio_numeric",
    "index_numeric","calculated_numeric","physical_numeric"].some(r => roles.has(r as ColumnRole));
  const spatialConfig = buildSpatialConfig(sc);
  const hasMap = spatialConfig !== null;
  const needsProjection = sc.geometry_source === "projected_xy" && !!(sc.east_x && sc.north_y) && !sc.projection;
  const mapReady = hasMap && !needsProjection;
  const hasZ = !!sc.elevation_z;
  return {
    table:   true,
    charts:  hasNumeric,
    map:     mapReady,
    qaqc:    !!(sc.id && sc.sample_type),
    three_d: mapReady && hasZ,
  };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ImportWizard({ filePath, onImported, onCancel }: Props) {
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath;

  const [step, setStep]         = useState<Step>("preview");
  const [errorMsg, setErrorMsg] = useState("");
  const [preview, setPreview]   = useState<PreviewResult | null>(null);
  const [loading, setLoading]   = useState(true);

  // Step 1
  const [datasetName, setDatasetName] = useState(
    fileName.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ")
  );
  const [separator, setSeparator] = useState(",");
  const [customSep, setCustomSep] = useState("");

  // Step 2 — Special Columns
  const [specialCols, setSpecialCols] = useState<SpecialCols>(EMPTY_SPECIAL);

  // Step 2 — Column-level overrides
  const [importFlags,    setImportFlags]    = useState<Record<string, ImportFlag>>({});
  const [analyteOvr,     setAnalyteOvr]     = useState<Record<string, string | null>>({});
  const [unitOvr,        setUnitOvr]        = useState<Record<string, Unit | null>>({});
  const [aliasOvr,       setAliasOvr]       = useState<Record<string, string>>({});
  const [roleOvr,        setRoleOvr]        = useState<Record<string, ColumnRole>>({});
  const [sampleTypeValueMap, setSampleTypeValueMap] = useState<Record<string, string>>({});

  const isExcel  = /\.(xlsx|xls|xlsm)$/i.test(fileName);
  const activeSep = separator === "custom" ? customSep : separator;

  // ── Preview fetch ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isExcel && separator === "custom" && customSep.length !== 1) return;
    setLoading(true);
    setPreview(null);
    if (step === "error") setStep("preview");
    previewFile(filePath, 50, isExcel ? "," : activeSep)
      .then((r) => {
        setPreview(r);
        // Auto-populate special columns from detected roles + spatial pairs
        const profs  = r.column_profiles;
        const pairs  = r.spatial_detection.pairs;
        const projP  = pairs.find(p => !p.is_geographic) ?? null;
        const geoP   = pairs.find(p =>  p.is_geographic) ?? null;

        // Auto-detect geometry source: prefer projected if explicit CRS found, else geographic
        let detectedSource: GeometrySource = "none";
        if (projP && !geoP)       detectedSource = "projected_xy";
        else if (!projP && geoP)  detectedSource = "wgs84_lonlat";
        else if (projP && geoP)   detectedSource = "projected_xy"; // both found: default to projected, user can switch

        setSpecialCols({
          id:              profs.find(p => p.role === "sample_identifier")?.original_name ?? "",
          east_x:          projP ? projP.x_col : "",
          north_y:         projP ? projP.y_col : "",
          projection:      projP ? projP.crs   : "",
          elevation_z:     profs.find(p => p.role === "coordinate_z")?.original_name     ?? "",
          wgs84_lon:       geoP  ? geoP.x_col  : "",
          wgs84_lat:       geoP  ? geoP.y_col  : "",
          datetime:        profs.find(p => p.role === "date_attribute")?.original_name   ?? "",
          sample_type:     profs.find(p => p.role === "qaqc_attribute")?.original_name  ?? "",
          geometry_source: detectedSource,
        });
        // Auto-set no_import for ignorable columns
        const flags: Record<string, ImportFlag> = {};
        profs.forEach(p => { if (p.import_flag === "no_import") flags[p.original_name] = "no_import"; });
        setImportFlags(flags);

        // Auto-suggest sample-type value mapping from the detected column's
        // sample raw values (RF-10.1.2) — the user always reviews/overrides
        // every mapping in the wizard before importing, this is only a seed.
        const sampleTypeCol = profs.find(p => p.role === "qaqc_attribute")?.original_name;
        if (sampleTypeCol) {
          const colPreview = r.columns.find(c => c.name === sampleTypeCol);
          const seeded: Record<string, string> = {};
          (colPreview?.sample_values ?? []).forEach(raw => {
            const guess = guessSampleTypeCode(raw);
            if (guess) seeded[raw] = guess;
          });
          setSampleTypeValueMap(seeded);
        }
        setLoading(false);
      })
      .catch((e) => {
        setErrorMsg(String(e));
        setStep("error");
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, activeSep]);

  // ── Effective profiles (merge backend + user overrides + special cols) ──────

  const effectiveProfiles = useMemo<ImportedColumnProfile[]>(() => {
    if (!preview) return [];
    return preview.column_profiles.map(p => {
      const specialRole = getSpecialRole(p.original_name, specialCols);
      return {
        ...p,
        role:        specialRole ?? roleOvr[p.original_name] ?? p.role,
        import_flag: importFlags[p.original_name] ?? p.import_flag ?? "yes",
        analyte:     analyteOvr[p.original_name] !== undefined ? analyteOvr[p.original_name] : p.analyte,
        unit:        unitOvr[p.original_name]    !== undefined ? unitOvr[p.original_name]    : p.unit,
        alias:       aliasOvr[p.original_name]   ?? p.original_name,
      };
    });
  }, [preview, specialCols, importFlags, analyteOvr, unitOvr, aliasOvr, roleOvr]);

  const moduleAvailability = useMemo(
    () => deriveModuleAvailability(effectiveProfiles, importFlags, specialCols),
    [effectiveProfiles, importFlags, specialCols]
  );

  // ── Navigation ──────────────────────────────────────────────────────────────

  function goNext() {
    if (step === "preview")  setStep("columns");
    else if (step === "columns")  setStep("spatial");
    else if (step === "spatial")  setStep("validate");
  }
  function goBack() {
    if (step === "validate") setStep("spatial");
    else if (step === "spatial")  setStep("columns");
    else if (step === "columns")  setStep("preview");
  }

  // ── Import ──────────────────────────────────────────────────────────────────

  async function handleImport() {
    if (!preview) return;
    setStep("importing");
    try {
      const spatialConfig = buildSpatialConfig(specialCols);
      const columnMappings: ColumnMapping[] = preview.column_profiles.map(p => ({
        original_name:    p.original_name,
        import_flag:      importFlags[p.original_name] ?? p.import_flag ?? "yes",
        role_override:    getSpecialRole(p.original_name, specialCols) ?? roleOvr[p.original_name] ?? null,
        analyte_override: analyteOvr[p.original_name] ?? null,
        unit_override:    (unitOvr[p.original_name] ?? null) as Unit | null,
        alias:            aliasOvr[p.original_name] ?? null,
      }));
      const sampleTypeMapping: SampleTypeMappingInput | undefined = specialCols.sample_type
        ? { column: specialCols.sample_type, value_map: sampleTypeValueMap }
        : undefined;

      const result = await importFile({
        filePath,
        datasetName,
        separator: activeSep,
        spatialConfig,
        iogasDisplayCols: preview.spatial_detection.iogas_display_cols,
        columnMappings,
        sampleTypeMapping,
      });
      onImported(result.dataset);
    } catch (e) {
      setErrorMsg(String(e));
      setStep("error");
    }
  }

  // ── Validation for Import button ────────────────────────────────────────────

  const blockingErrors: string[] = useMemo(() => {
    const errs: string[] = [];
    const gs = specialCols.geometry_source;
    if (gs === "projected_xy") {
      if (!specialCols.east_x || !specialCols.north_y) {
        errs.push("Geometry Source es Projected X/Y pero faltan columnas East/X o North/Y.");
      } else if (!specialCols.projection) {
        errs.push("Se asignaron X/Y pero no se seleccionó proyección CRS (requerida para Projected X/Y).");
      }
    } else if (gs === "wgs84_lonlat") {
      if (!specialCols.wgs84_lon || !specialCols.wgs84_lat) {
        errs.push("Geometry Source es WGS84 Lon/Lat pero faltan columnas de Longitud o Latitud.");
      }
    }
    const importedAssay = effectiveProfiles.filter(
      p => ASSAY_ROLES.has(p.role) && (importFlags[p.original_name] ?? p.import_flag ?? "yes") === "yes"
    );
    importedAssay.forEach(p => {
      const unit = unitOvr[p.original_name] ?? p.unit;
      if (!unit) {
        errs.push(`${p.original_name}: columna assay sin unidad asignada. Asigne ppm, ppb o pct.`);
      }
    });
    if (effectiveProfiles.filter(p => (importFlags[p.original_name] ?? p.import_flag ?? "yes") === "yes").length === 0) {
      errs.push("No hay columnas marcadas para importar.");
    }
    return errs;
  }, [effectiveProfiles, importFlags, specialCols, unitOvr]);

  // ── Step labels ─────────────────────────────────────────────────────────────

  const STEPS = ["1. Preview", "2. Columns", "3. Spatial / CRS", "4. Validate"];
  const stepIdx = { preview:0, columns:1, spatial:2, validate:3, importing:-1, error:-1 }[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex flex-col w-[960px] max-h-[90vh] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Import Dataset</h2>
            <p className="text-xs text-zinc-500 mt-0.5 truncate max-w-lg">{fileName}</p>
          </div>
          <button onClick={onCancel} className="text-zinc-500 hover:text-zinc-200 text-lg leading-none px-1">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {loading && <LoadingState />}

          {!loading && step === "error" && <ErrorState message={errorMsg} />}

          {!loading && preview && step === "preview" && (
            <PreviewStep
              fileName={fileName}
              preview={preview}
              datasetName={datasetName}
              onNameChange={setDatasetName}
              isExcel={isExcel}
              separator={separator}
              customSep={customSep}
              onSepChange={setSeparator}
              onCustomSepChange={setCustomSep}
            />
          )}

          {!loading && preview && step === "columns" && (
            <ColumnsStep
              profiles={effectiveProfiles}
              allColumns={preview.columns}
              specialCols={specialCols}
              onSpecialChange={(k, v) => setSpecialCols(prev => ({ ...prev, [k]: v }))}
              importFlags={importFlags}
              onImportFlag={(col, flag) => setImportFlags(prev => ({ ...prev, [col]: flag }))}
              analyteOvr={analyteOvr}
              onAnalyte={(col, a) => setAnalyteOvr(prev => ({ ...prev, [col]: a }))}
              unitOvr={unitOvr}
              onUnit={(col, u) => setUnitOvr(prev => ({ ...prev, [col]: u }))}
              aliasOvr={aliasOvr}
              onAlias={(col, a) => setAliasOvr(prev => ({ ...prev, [col]: a }))}
              roleOvr={roleOvr}
              onRoleOvr={(col, r) => setRoleOvr(prev => ({ ...prev, [col]: r }))}
              moduleAvailability={moduleAvailability}
              sampleTypeValueMap={sampleTypeValueMap}
              onSampleTypeValueMapChange={(raw, code) =>
                setSampleTypeValueMap(prev => ({ ...prev, [raw]: code }))
              }
            />
          )}

          {!loading && preview && step === "spatial" && (
            <SpatialStep
              specialCols={specialCols}
              onProjectionChange={(epsg) => setSpecialCols(prev => ({ ...prev, projection: epsg }))}
            />
          )}

          {!loading && preview && step === "validate" && (
            <ValidateStep
              profiles={effectiveProfiles}
              importFlags={importFlags}
              specialCols={specialCols}
              moduleAvailability={moduleAvailability}
              blockingErrors={blockingErrors}
              totalRows={preview.total_rows}
              unitOvr={unitOvr}
            />
          )}

          {step === "importing" && <LoadingState label="Importando y guardando como Parquet…" />}
        </div>

        {/* Footer */}
        {!loading && step !== "importing" && step !== "error" && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-700 shrink-0">
            <div className="flex gap-2 text-xs text-zinc-500">
              {STEPS.map((label, i) => (
                <StepDot key={label} active={i === stepIdx} label={label} />
              ))}
            </div>
            <div className="flex gap-2">
              {(step === "columns" || step === "spatial" || step === "validate") && (
                <button onClick={goBack} className="px-4 py-1.5 text-xs rounded-md bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700">
                  Back
                </button>
              )}
              {step !== "validate" && (
                <button
                  onClick={goNext}
                  disabled={step === "preview" && !datasetName.trim()}
                  className="px-4 py-1.5 text-xs rounded-md bg-zinc-700 border border-zinc-600 text-zinc-200 hover:bg-zinc-600 disabled:opacity-40"
                >
                  {step === "preview"  ? "Next: Columns →"
                   : step === "columns" ? "Next: Spatial / CRS →"
                   : "Next: Validate →"}
                </button>
              )}
              {step === "validate" && (
                <button
                  onClick={handleImport}
                  disabled={!datasetName.trim() || blockingErrors.length > 0}
                  className="px-5 py-1.5 text-xs font-semibold rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Import Dataset
                </button>
              )}
            </div>
          </div>
        )}

        {step === "error" && (
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-zinc-700 shrink-0">
            <button onClick={onCancel} className="px-4 py-1.5 text-xs rounded-md bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Step 1: Preview ────────────────────────────────────────────────────────────

function PreviewStep({
  fileName, preview, datasetName, onNameChange,
  isExcel, separator, customSep, onSepChange, onCustomSepChange,
}: {
  fileName: string;
  preview: PreviewResult;
  datasetName: string;
  onNameChange: (v: string) => void;
  isExcel: boolean;
  separator: string;
  customSep: string;
  onSepChange: (v: string) => void;
  onCustomSepChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="mb-4">
        <label className="text-xs text-zinc-400 block mb-1">Dataset name</label>
        <input
          value={datasetName}
          onChange={e => onNameChange(e.target.value)}
          className="w-full px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-600 rounded-md text-zinc-100 focus:outline-none focus:border-blue-500"
        />
      </div>

      {!isExcel && (
        <div className="mb-4">
          <label className="text-xs text-zinc-400 block mb-1">Column separator</label>
          <div className="flex items-center gap-2 flex-wrap">
            {([
              { label: "Comma  ,", value: "," },
              { label: "Semicolon  ;", value: ";" },
              { label: "Tab  ⇥", value: "\t" },
              { label: "Pipe  |", value: "|" },
              { label: "Custom", value: "custom" },
            ] as const).map(opt => (
              <button
                key={opt.value}
                onClick={() => onSepChange(opt.value)}
                className={`px-3 py-1 text-xs rounded border transition-colors ${
                  separator === opt.value
                    ? "bg-blue-600 border-blue-500 text-white"
                    : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200"
                }`}
              >{opt.label}</button>
            ))}
            {separator === "custom" && (
              <input maxLength={1} value={customSep} onChange={e => onCustomSepChange(e.target.value)}
                placeholder="char"
                className="w-16 px-2 py-1 text-xs bg-zinc-800 border border-zinc-600 rounded text-zinc-100 font-mono text-center focus:outline-none focus:border-blue-500"
              />
            )}
          </div>
        </div>
      )}

      <div className="flex gap-4 mb-4 text-xs text-zinc-400">
        <span>Archivo: <span className="text-zinc-300">{fileName}</span></span>
        <span>{preview.total_rows.toLocaleString()} filas</span>
        <span>{preview.columns.length} columnas</span>
        <span>{preview.file_size_kb} KB</span>
        {isExcel && <span className="text-emerald-400">Excel</span>}
      </div>

      <div className="border border-zinc-700 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-zinc-800 text-zinc-400 text-left">
              <th className="px-3 py-2 font-medium">Columna</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium text-right">Nulls</th>
              <th className="px-3 py-2 font-medium">Valores muestra</th>
            </tr>
          </thead>
          <tbody>
            {preview.columns.map((col, i) => (
              <tr key={col.name} className={`border-t border-zinc-800 ${i % 2 === 0 ? "bg-zinc-900" : "bg-zinc-850"}`}>
                <td className="px-3 py-1.5 font-mono text-zinc-100 truncate max-w-[200px]">{col.name}</td>
                <td className="px-3 py-1.5"><TypeBadge dtype={col.dtype} /></td>
                <td className="px-3 py-1.5 text-right">
                  {col.null_count > 0
                    ? <span className="text-amber-400">{col.null_pct}%</span>
                    : <span className="text-zinc-600">0%</span>}
                </td>
                <td className="px-3 py-1.5 text-zinc-500 truncate max-w-[280px]">
                  {col.sample_values.slice(0, 3).join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Step 2: Columns ───────────────────────────────────────────────────────────

function SampleTypeValueMappingPanel({
  columnName, allColumns, valueMap, onChange,
}: {
  columnName: string;
  allColumns: ColumnPreview[];
  valueMap: Record<string, string>;
  onChange: (raw: string, code: string) => void;
}) {
  const sampleValues = allColumns.find(c => c.name === columnName)?.sample_values ?? [];

  return (
    <div className="mb-5 border border-zinc-700 rounded-lg p-4 bg-zinc-800/30">
      <h3 className="text-xs font-semibold text-zinc-300 mb-1 uppercase tracking-wide">
        Sample Type Value Mapping
      </h3>
      <p className="text-xs text-zinc-500 mb-3">
        Mapea los valores de "{columnName}" a los tipos estándar QAQC. Valores sin mapear se importan como S (Regular).
        Solo se muestra una muestra de hasta 5 valores distintos detectados.
      </p>
      {sampleValues.length === 0 ? (
        <p className="text-xs text-zinc-600">No se detectaron valores de muestra para esta columna.</p>
      ) : (
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {sampleValues.map((raw) => (
            <div key={raw} className="flex items-center gap-2">
              <span className="text-xs text-zinc-400 font-mono w-40 shrink-0 truncate" title={raw}>{raw}</span>
              <select
                value={valueMap[raw] ?? ""}
                onChange={e => onChange(raw, e.target.value)}
                className="flex-1 px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200 focus:outline-none focus:border-blue-500"
              >
                <option value="">— unmapped (defaults to S) —</option>
                {SAMPLE_TYPE_CODES.map(code => (
                  <option key={code} value={code}>{SAMPLE_TYPE_LABELS[code]}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ColumnsStep({
  profiles, allColumns, specialCols, onSpecialChange,
  importFlags, onImportFlag, analyteOvr, onAnalyte, unitOvr, onUnit,
  aliasOvr, onAlias, roleOvr, onRoleOvr, moduleAvailability,
  sampleTypeValueMap, onSampleTypeValueMapChange,
}: {
  profiles: ImportedColumnProfile[];
  allColumns: ColumnPreview[];
  specialCols: SpecialCols;
  onSpecialChange: (k: keyof SpecialCols, v: string) => void;
  importFlags: Record<string, ImportFlag>;
  onImportFlag: (col: string, f: ImportFlag) => void;
  analyteOvr: Record<string, string | null>;
  onAnalyte: (col: string, a: string | null) => void;
  unitOvr: Record<string, Unit | null>;
  onUnit: (col: string, u: Unit | null) => void;
  aliasOvr: Record<string, string>;
  onAlias: (col: string, a: string) => void;
  roleOvr: Record<string, ColumnRole>;
  onRoleOvr: (col: string, r: ColumnRole) => void;
  moduleAvailability: ModuleAvailability;
  sampleTypeValueMap: Record<string, string>;
  onSampleTypeValueMapChange: (raw: string, code: string) => void;
}) {
  const colNames = allColumns.map(c => c.name);
  const hasSampleId = !!specialCols.id;

  return (
    <div>
      {/* ── Module availability badges ── */}
      <div className="mb-4 flex gap-2 flex-wrap">
        {([
          { key: "table",   label: "Tabla" },
          { key: "charts",  label: "Gráficos" },
          { key: "map",     label: "Mapa" },
          { key: "qaqc",    label: "QAQC" },
          { key: "three_d", label: "3D" },
        ] as const).map(({ key, label }) => {
          const active = moduleAvailability[key];
          return (
            <span key={key} className={`px-2.5 py-1 text-xs rounded-full border font-medium ${
              active ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/30"
                     : "text-zinc-600 bg-zinc-800 border-zinc-700"
            }`}>
              {active ? "✓" : "✗"} {label}
            </span>
          );
        })}
      </div>

      {!hasSampleId && (
        <div className="mb-4 px-3 py-2.5 rounded-lg bg-amber-400/10 border border-amber-400/30 text-xs text-amber-300">
          No se detectó Sample ID. Se generarán IDs internos (ROW-000001…).
          QAQC quedará desactivado hasta asignar un identificador de muestra.
        </div>
      )}

      {/* ── Special Columns panel ── */}
      <div className="mb-5 border border-zinc-700 rounded-lg p-4 bg-zinc-800/30">
        <h3 className="text-xs font-semibold text-zinc-300 mb-3 uppercase tracking-wide">
          Special Columns / Coordenadas
        </h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {([
            { key: "id",          label: "ID (Sample)" },
            { key: "east_x",      label: "East / X" },
            { key: "north_y",     label: "North / Y" },
            { key: "elevation_z", label: "Elevation / Z" },
            { key: "wgs84_lon",   label: "WGS84 Longitude" },
            { key: "wgs84_lat",   label: "WGS84 Latitude" },
            { key: "datetime",    label: "Date / Time" },
            { key: "sample_type", label: "Sample Type / QAQC" },
          ] as { key: keyof SpecialCols; label: string }[]).map(({ key, label }) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-xs text-zinc-400 w-36 shrink-0">{label}</span>
              <select
                value={specialCols[key]}
                onChange={e => onSpecialChange(key, e.target.value)}
                className="flex-1 px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200 focus:outline-none focus:border-blue-500"
              >
                <option value="">— none —</option>
                {colNames.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          ))}
        </div>

        {/* Projection — enabled only when X/Y assigned */}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-zinc-400 w-36 shrink-0">East/North Projection</span>
          <select
            value={specialCols.projection}
            onChange={e => onSpecialChange("projection", e.target.value)}
            disabled={!specialCols.east_x || !specialCols.north_y}
            className="flex-1 px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200 focus:outline-none focus:border-blue-500 disabled:opacity-40"
          >
            <option value="">— select CRS —</option>
            {(["Geographic","Peru","WGS84 UTM South","WGS84 UTM North","Australia","South America"] as string[]).map(cat => {
              const presets = CRS_PRESETS.filter(p => p.category === cat);
              if (presets.length === 0) return null;
              return (
                <optgroup key={cat} label={cat}>
                  {presets.map(p => <option key={p.epsg} value={p.epsg}>{p.epsg} — {p.label}</option>)}
                </optgroup>
              );
            })}
          </select>
          {specialCols.east_x && specialCols.north_y && !specialCols.projection && (
            <span className="text-xs text-red-400">requerido</span>
          )}
        </div>
        {/* Geometry Source — shown when at least one coordinate set is assigned */}
        {(specialCols.east_x || specialCols.north_y || specialCols.wgs84_lon || specialCols.wgs84_lat) && (() => {
          const hasXY = !!(specialCols.east_x && specialCols.north_y);
          const hasLL = !!(specialCols.wgs84_lon && specialCols.wgs84_lat);
          const bothAvailable = hasXY && hasLL;
          return (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-700/60">
              <span className="text-xs text-zinc-300 w-36 shrink-0 font-medium">Geometry Source</span>
              {bothAvailable ? (
                <>
                  <select
                    value={specialCols.geometry_source}
                    onChange={e => onSpecialChange("geometry_source", e.target.value)}
                    className="flex-1 px-2 py-1 text-xs bg-zinc-800 border border-blue-500/50 rounded text-zinc-200 focus:outline-none focus:border-blue-400"
                  >
                    <option value="projected_xy">Projected X/Y</option>
                    <option value="wgs84_lonlat">WGS84 Longitude/Latitude</option>
                  </select>
                  <span className="text-xs text-amber-400">Ambos detectados — elige cuál usar</span>
                </>
              ) : (
                <span className={`text-xs px-2 py-0.5 rounded border font-medium ${
                  specialCols.geometry_source === "projected_xy"
                    ? "text-blue-300 bg-blue-400/10 border-blue-400/30"
                    : specialCols.geometry_source === "wgs84_lonlat"
                    ? "text-cyan-300 bg-cyan-400/10 border-cyan-400/30"
                    : "text-zinc-500 bg-zinc-800 border-zinc-700"
                }`}>
                  {specialCols.geometry_source === "projected_xy" ? "Projected X/Y"
                   : specialCols.geometry_source === "wgs84_lonlat" ? "WGS84 Longitude/Latitude"
                   : "None"}
                </span>
              )}
            </div>
          );
        })()}
      </div>

      {/* ── Sample Type value mapping (RF-10.1.2) ── */}
      {specialCols.sample_type && (
        <SampleTypeValueMappingPanel
          columnName={specialCols.sample_type}
          allColumns={allColumns}
          valueMap={sampleTypeValueMap}
          onChange={onSampleTypeValueMapChange}
        />
      )}

      {/* ── Column table ── */}
      <h3 className="text-xs font-semibold text-zinc-300 mb-2 uppercase tracking-wide">
        Column Name and Type / Analitos
      </h3>
      <div className="border border-zinc-700 rounded-lg overflow-hidden overflow-x-auto">
        <table className="text-xs" style={{ minWidth: 860 }}>
          <thead>
            <tr className="bg-zinc-800 text-zinc-400 text-left">
              <th className="px-2 py-2 font-medium w-[70px]">Import</th>
              <th className="px-2 py-2 font-medium w-[150px]">Columna</th>
              <th className="px-2 py-2 font-medium w-[110px]">Rol</th>
              <th className="px-2 py-2 font-medium w-[120px]">Analito</th>
              <th className="px-2 py-2 font-medium w-[80px]">Unidad</th>
              <th className="px-2 py-2 font-medium w-[130px]">Alias / Display</th>
              <th className="px-2 py-2 font-medium w-[65px]">Tipo</th>
              <th className="px-2 py-2 font-medium w-[50px] text-right">Nulls</th>
              <th className="px-2 py-2 font-medium">Valores muestra</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p, i) => {
              const flag = importFlags[p.original_name] ?? p.import_flag ?? "yes";
              const noImport = flag === "no_import";
              const isAssay = ASSAY_ROLES.has(p.role);
              const isSpecial = !!getSpecialRole(p.original_name, specialCols);
              const needsUnit = isAssay && !p.unit;
              return (
                <tr
                  key={p.original_name}
                  className={`border-t border-zinc-800 transition-opacity ${i % 2 === 0 ? "bg-zinc-900" : ""} ${noImport ? "opacity-40" : ""}`}
                >
                  {/* Import toggle */}
                  <td className="px-2 py-1.5">
                    <select
                      value={flag}
                      onChange={e => onImportFlag(p.original_name, e.target.value as ImportFlag)}
                      className="w-full px-1 py-0.5 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-300 focus:outline-none"
                    >
                      <option value="yes">Yes</option>
                      <option value="no_import">No Import</option>
                    </select>
                  </td>
                  {/* Column name */}
                  <td className="px-2 py-1.5 font-mono text-zinc-100 truncate max-w-[150px]" title={p.original_name}>
                    {p.original_name}
                  </td>
                  {/* Role */}
                  <td className="px-2 py-1.5">
                    {isSpecial ? (
                      <span className={`px-1.5 py-0.5 rounded border text-xs font-medium ${ROLE_COLORS[p.role] ?? ROLE_COLORS.unknown}`}>
                        {ROLE_LABELS[p.role] ?? p.role}
                      </span>
                    ) : (
                      <select
                        value={roleOvr[p.original_name] ?? ""}
                        onChange={e => { if (e.target.value) onRoleOvr(p.original_name, e.target.value as ColumnRole); }}
                        className="w-full px-1 py-0.5 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-300 focus:outline-none"
                      >
                        <option value="">
                          {ROLE_LABELS[p.role] ?? p.role}
                        </option>
                        {ALL_ROLES.filter(r => r !== p.role).map(r => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  {/* Analyte */}
                  <td className="px-2 py-1.5">
                    {isAssay ? (
                      <select
                        value={analyteOvr[p.original_name] !== undefined ? (analyteOvr[p.original_name] ?? "") : (p.analyte ?? "")}
                        onChange={e => onAnalyte(p.original_name, e.target.value || null)}
                        className="w-full px-1 py-0.5 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-300 focus:outline-none"
                      >
                        <option value="">—</option>
                        {ANALYTE_LIST.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                  {/* Unit */}
                  <td className="px-2 py-1.5">
                    {isAssay ? (
                      <select
                        value={unitOvr[p.original_name] !== undefined ? (unitOvr[p.original_name] ?? "") : (p.unit ?? "")}
                        onChange={e => onUnit(p.original_name, (e.target.value || null) as Unit | null)}
                        className={`w-full px-1 py-0.5 text-xs bg-zinc-800 border rounded text-zinc-300 focus:outline-none ${needsUnit ? "border-amber-500" : "border-zinc-700"}`}
                      >
                        <option value="">—</option>
                        <option value="ppm">ppm</option>
                        <option value="ppb">ppb</option>
                        <option value="pct">pct</option>
                      </select>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                    {p.raw_unit_token && !p.unit && (unitOvr[p.original_name] === undefined) && (
                      <div className="text-amber-500 text-xs mt-0.5" title="Token detectado, requiere asignación manual">
                        raw: {p.raw_unit_token}
                      </div>
                    )}
                  </td>
                  {/* Alias */}
                  <td className="px-2 py-1.5">
                    <input
                      value={aliasOvr[p.original_name] ?? p.original_name}
                      onChange={e => onAlias(p.original_name, e.target.value)}
                      className="w-full px-1.5 py-0.5 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-300 focus:outline-none focus:border-blue-500"
                    />
                  </td>
                  {/* Type */}
                  <td className="px-2 py-1.5"><TypeBadge dtype={p.data_type} /></td>
                  {/* Nulls */}
                  <td className="px-2 py-1.5 text-right">
                    {p.missing_count > 0
                      ? <span className="text-amber-400">{Math.round(p.missing_count / Math.max(p.valid_count + p.missing_count, 1) * 100)}%</span>
                      : <span className="text-zinc-600">0%</span>}
                  </td>
                  {/* Sample values */}
                  <td className="px-2 py-1.5 text-zinc-500 truncate max-w-[160px]">
                    {(p as unknown as { sample_values?: string[] }).sample_values?.slice(0, 3).join(", ")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Step 3: Spatial / CRS ─────────────────────────────────────────────────────

function SpatialStep({
  specialCols, onProjectionChange,
}: {
  specialCols: SpecialCols;
  onProjectionChange: (epsg: string) => void;
}) {
  const [catFilter, setCatFilter] = useState("All");
  const [search,    setSearch]    = useState("");

  const hasXY  = !!(specialCols.east_x && specialCols.north_y);
  const hasLL  = !!(specialCols.wgs84_lon && specialCols.wgs84_lat);
  const hasZ   = !!specialCols.elevation_z;
  const gs     = specialCols.geometry_source;

  const filtered = CRS_PRESETS.filter(p => {
    if (catFilter !== "All" && p.category !== catFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.epsg.toLowerCase().includes(q) || p.label.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div>
      {/* Summary — active geometry source */}
      <div className="mb-5 space-y-2 text-xs">
        {gs === "wgs84_lonlat" && hasLL && (
          <div className="px-3 py-2.5 rounded-lg bg-cyan-400/10 border border-cyan-400/30 text-cyan-300">
            Mapa activo usando WGS84 Longitude/Latitude.
            Longitude={specialCols.wgs84_lon}, Latitude={specialCols.wgs84_lat}, CRS=EPSG:4326.
          </div>
        )}
        {gs === "wgs84_lonlat" && !hasLL && (
          <div className="px-3 py-2.5 rounded-lg bg-red-400/10 border border-red-400/30 text-red-300">
            Geometry Source es WGS84 Lon/Lat pero faltan columnas de Longitud o Latitud.
            Regrese a Columns para asignar WGS84 Longitude + WGS84 Latitude.
          </div>
        )}
        {gs === "projected_xy" && hasXY && (
          <div className={`px-3 py-2.5 rounded-lg border text-xs ${
            specialCols.projection
              ? "bg-blue-400/10 border-blue-400/30 text-blue-300"
              : "bg-red-400/10 border-red-400/30 text-red-300"
          }`}>
            Mapa activo usando coordenadas proyectadas.
            X={specialCols.east_x}, Y={specialCols.north_y}
            {specialCols.projection
              ? `, CRS=${specialCols.projection} — ${CRS_PRESETS.find(p => p.epsg === specialCols.projection)?.label ?? ""}.`
              : " — proyección no asignada, seleccione abajo."}
          </div>
        )}
        {gs === "projected_xy" && !hasXY && (
          <div className="px-3 py-2.5 rounded-lg bg-red-400/10 border border-red-400/30 text-red-300">
            Geometry Source es Projected X/Y pero faltan columnas East/X o North/Y.
            Regrese a Columns para asignarlas.
          </div>
        )}
        {hasXY && hasLL && (
          <div className="px-3 py-2.5 rounded-lg bg-amber-400/10 border border-amber-400/30 text-amber-300">
            Se detectaron coordenadas proyectadas y WGS84 Lon/Lat.
            Geometría activa: <strong>{gs === "wgs84_lonlat" ? "WGS84 Longitude/Latitude" : "Projected X/Y"}</strong>.
            Para cambiar, vuelve a Columns → Geometry Source.
          </div>
        )}
        {hasZ && (
          <div className="px-3 py-2.5 rounded-lg bg-zinc-700/50 border border-zinc-600 text-zinc-300">
            Elevación / Z: {specialCols.elevation_z} — 3D activo
          </div>
        )}
        {gs === "none" && !hasXY && !hasLL && (
          <div className="px-3 py-2.5 rounded-lg bg-zinc-700/50 border border-zinc-600 text-zinc-400">
            No se asignaron columnas de coordenadas. Mapa no estará disponible.
            Regrese a Columns para asignar East/X + North/Y o Longitude + Latitude.
          </div>
        )}
      </div>

      {/* CRS Selector — shown when X/Y assigned and geometry source is projected_xy */}
      {hasXY && gs === "projected_xy" && (
        <div>
          <h3 className="text-xs font-semibold text-zinc-300 mb-3 uppercase tracking-wide">
            Proyección East/North
          </h3>
          <div className="flex gap-2 mb-3">
            <select
              value={catFilter}
              onChange={e => setCatFilter(e.target.value)}
              className="px-2 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200 focus:outline-none focus:border-blue-500"
            >
              {CRS_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por EPSG o nombre…"
              className="flex-1 px-3 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="border border-zinc-700 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
            {filtered.slice(0, 150).map(p => {
              const selected = p.epsg === specialCols.projection;
              return (
                <button
                  key={p.epsg}
                  onClick={() => onProjectionChange(p.epsg)}
                  className={`w-full text-left px-4 py-2 flex items-center justify-between transition-colors text-xs ${
                    selected
                      ? "bg-blue-600/20 border-l-2 border-blue-500"
                      : "hover:bg-zinc-800 border-l-2 border-transparent"
                  }`}
                >
                  <span className={selected ? "text-blue-300" : "text-zinc-300"}>{p.label}</span>
                  <span className="text-zinc-500 font-mono">{p.epsg}</span>
                </button>
              );
            })}
            {filtered.length > 150 && (
              <p className="px-4 py-2 text-xs text-zinc-500">
                {filtered.length - 150} más — refine la búsqueda
              </p>
            )}
            {filtered.length === 0 && (
              <p className="px-4 py-3 text-xs text-zinc-500">Sin resultados.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step 4: Validate ──────────────────────────────────────────────────────────

function ValidateStep({
  profiles, importFlags, specialCols, moduleAvailability, blockingErrors, totalRows, unitOvr,
}: {
  profiles: ImportedColumnProfile[];
  importFlags: Record<string, ImportFlag>;
  specialCols: SpecialCols;
  moduleAvailability: ModuleAvailability;
  blockingErrors: string[];
  totalRows: number;
  unitOvr: Record<string, Unit | null>;
}) {
  const imported   = profiles.filter(p => (importFlags[p.original_name] ?? p.import_flag ?? "yes") === "yes");
  const noImport   = profiles.filter(p => (importFlags[p.original_name] ?? p.import_flag ?? "yes") === "no_import");
  const elements   = imported.filter(p => p.role === "assay_element");
  const oxides     = imported.filter(p => p.role === "assay_oxide");
  const ratios     = imported.filter(p => ["ratio_numeric","index_numeric","calculated_numeric"].includes(p.role));
  const textAttrs  = imported.filter(p => p.role === "text_attribute");

  const warnings: string[] = [];
  [...elements, ...oxides].forEach(p => {
    const unit = unitOvr[p.original_name] ?? p.unit;
    if (!unit && p.raw_unit_token) {
      warnings.push(`${p.original_name}: token "${p.raw_unit_token}" detectado — asigne ppm, ppb o pct.`);
    }
  });

  const crsPreset = CRS_PRESETS.find(p => p.epsg === specialCols.projection);
  const spatialConfig = buildSpatialConfig(specialCols);

  return (
    <div className="space-y-4">
      {/* Summary grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-3">
          <h4 className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Resumen</h4>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-zinc-400">Filas totales</span><span className="text-zinc-200 font-mono">{totalRows.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Columnas importadas</span><span className="text-zinc-200 font-mono">{imported.length}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Columnas No Import</span><span className="text-zinc-500 font-mono">{noImport.length}</span></div>
          </div>
        </div>
        <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-3">
          <h4 className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Química</h4>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-zinc-400">Elementos</span><span className="text-emerald-400 font-mono">{elements.length}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Óxidos</span><span className="text-teal-400 font-mono">{oxides.length}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Ratios / Índices</span><span className="text-yellow-400 font-mono">{ratios.length}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Atributos texto</span><span className="text-zinc-400 font-mono">{textAttrs.length}</span></div>
          </div>
        </div>
      </div>

      {/* Column composition bar */}
      <ColumnCompositionChart imported={imported} />

      {/* Spatial / Geometry Source */}
      <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-3">
        <h4 className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Coordenadas</h4>
        {spatialConfig ? (
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded border font-medium text-xs ${
                spatialConfig.geometry_source === "projected_xy"
                  ? "text-blue-300 bg-blue-400/10 border-blue-400/30"
                  : "text-cyan-300 bg-cyan-400/10 border-cyan-400/30"
              }`}>
                {spatialConfig.geometry_source === "projected_xy" ? "Projected X/Y" : "WGS84 Lon/Lat"}
              </span>
            </div>
            {spatialConfig.geometry_source === "projected_xy" && (
              <>
                <div className="flex gap-4 text-zinc-400">
                  <span>X: <span className="text-zinc-200 font-mono">{spatialConfig.east_col}</span></span>
                  <span>Y: <span className="text-zinc-200 font-mono">{spatialConfig.north_col}</span></span>
                  {specialCols.elevation_z && <span>Z: <span className="text-zinc-200 font-mono">{specialCols.elevation_z}</span></span>}
                </div>
                <div className="text-zinc-400">CRS: <span className="text-zinc-200 font-mono">{spatialConfig.projected_epsg}</span>{crsPreset && ` — ${crsPreset.label}`}</div>
              </>
            )}
            {spatialConfig.geometry_source === "wgs84_lonlat" && (
              <div className="flex gap-4 text-zinc-400">
                <span>Longitude: <span className="text-zinc-200 font-mono">{spatialConfig.lon_col}</span></span>
                <span>Latitude: <span className="text-zinc-200 font-mono">{spatialConfig.lat_col}</span></span>
                {specialCols.elevation_z && <span>Z: <span className="text-zinc-200 font-mono">{specialCols.elevation_z}</span></span>}
                <span className="text-zinc-500">CRS: EPSG:4326</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">Sin coordenadas — Mapa no disponible.</p>
        )}
      </div>

      {/* Module badges */}
      <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-3">
        <h4 className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Módulos</h4>
        <div className="flex gap-3 flex-wrap">
          {([
            { key: "table",   label: "Tabla" },
            { key: "charts",  label: "Gráficos" },
            { key: "map",     label: "Mapa" },
            { key: "qaqc",    label: "QAQC" },
            { key: "three_d", label: "3D" },
          ] as const).map(({ key, label }) => {
            const active = moduleAvailability[key];
            let note = "";
            if (!active) {
              if (key === "qaqc")    note = "falta Sample ID o Sample Type";
              if (key === "three_d") note = "falta Z";
              if (key === "map")     note = "falta X/Y/CRS o Lon/Lat";
              if (key === "charts")  note = "sin columnas numéricas";
            }
            return (
              <div key={key} className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
                active ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/30"
                       : "text-zinc-600 bg-zinc-800 border-zinc-700"
              }`}>
                {active ? "✓" : "✗"} {label}
                {!active && note && <span className="text-zinc-700"> — {note}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="border border-amber-500/30 rounded-lg px-4 py-3 bg-amber-500/5">
          <h4 className="text-xs font-semibold text-amber-400 mb-2">Advertencias ({warnings.length})</h4>
          <ul className="space-y-1">
            {warnings.map((w, i) => <li key={i} className="text-xs text-amber-300 flex gap-2"><span>⚠</span>{w}</li>)}
          </ul>
        </div>
      )}

      {/* Blocking errors */}
      {blockingErrors.length > 0 && (
        <div className="border border-red-500/30 rounded-lg px-4 py-3 bg-red-500/5">
          <h4 className="text-xs font-semibold text-red-400 mb-2">Errores — bloquean importación ({blockingErrors.length})</h4>
          <ul className="space-y-1">
            {blockingErrors.map((e, i) => <li key={i} className="text-xs text-red-300 flex gap-2"><span>✗</span>{e}</li>)}
          </ul>
        </div>
      )}

      {blockingErrors.length === 0 && warnings.length === 0 && (
        <div className="border border-emerald-500/30 rounded-lg px-4 py-2.5 bg-emerald-500/5 text-xs text-emerald-300">
          ✓ Todo listo para importar.
        </div>
      )}
    </div>
  );
}

function ColumnCompositionChart({ imported }: { imported: ImportedColumnProfile[] }) {
  if (imported.length === 0) return null;

  const counts = new Map<ColumnRole, number>();
  imported.forEach(p => counts.set(p.role, (counts.get(p.role) ?? 0) + 1));
  // Fixed role order (ALL_ROLES) rather than sort-by-count, so a role's color/position
  // stays stable across different datasets.
  const segments = ALL_ROLES
    .filter(r => counts.has(r))
    .map(r => ({ role: r, count: counts.get(r)! }));

  return (
    <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-3">
      <h4 className="text-xs font-semibold text-zinc-400 mb-2.5 uppercase tracking-wide">
        Composición de columnas
      </h4>
      <div className="flex h-3 rounded-full overflow-hidden bg-zinc-900">
        {segments.map(({ role, count }, i) => {
          const pct = (count / imported.length) * 100;
          return (
            <div
              key={role}
              className={`h-full ${ROLE_BAR_COLORS[role] ?? "bg-zinc-500"} ${i > 0 ? "border-l border-zinc-900" : ""}`}
              style={{ width: `${pct}%` }}
              title={`${ROLE_LABELS[role]}: ${count} col. (${pct.toFixed(0)}%)`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5">
        {segments.map(({ role, count }) => (
          <div key={role} className="flex items-center gap-1.5 text-xs text-zinc-400">
            <span className={`w-2 h-2 rounded-full shrink-0 ${ROLE_BAR_COLORS[role] ?? "bg-zinc-500"}`} />
            {ROLE_LABELS[role]} <span className="text-zinc-600 font-mono">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function TypeBadge({ dtype }: { dtype: string }) {
  const styles: Record<string, string> = {
    numeric:  "text-blue-400 bg-blue-400/10",
    text:     "text-emerald-400 bg-emerald-400/10",
    boolean:  "text-purple-400 bg-purple-400/10",
    datetime: "text-amber-400 bg-amber-400/10",
    date:     "text-amber-400 bg-amber-400/10",
    mixed:    "text-orange-400 bg-orange-400/10",
    empty:    "text-zinc-600 bg-zinc-700/30",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${styles[dtype] ?? "text-zinc-400"}`}>
      {dtype}
    </span>
  );
}

function StepDot({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={active ? "text-blue-400 font-medium" : "text-zinc-600"}>{label}</span>
  );
}

function LoadingState({ label = "Cargando vista previa…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col gap-2 py-8">
      <p className="text-sm font-semibold text-red-400">Import failed</p>
      <p className="text-xs text-zinc-400 font-mono bg-zinc-800 rounded p-3 whitespace-pre-wrap break-all">{message}</p>
    </div>
  );
}
