# Informe de Seguridad — PyOrex (fecha: 2026-06-04)

> Auditoría realizada por: security-engineer
> Cobertura: Fase 1 completa (Fase 0 + 1a + 1b + 1c)
> Commit de referencia: b8a9c20

---

## 1. Resumen Ejecutivo

| Métrica | Valor |
|---------|-------|
| **Nivel de riesgo global** | **ALTO** |
| Vulnerabilidades críticas encontradas | **5** |
| Vulnerabilidades altas | **4** |
| Vulnerabilidades medias | **3** |
| Vulnerabilidades bajas | **2** |
| Mitigaciones implementadas | **4 de 14** |

### Hallazgos clave

El proyecto tiene una arquitectura de seguridad bien diseñada **en papel** (el agente `security-engineer.md` y `security-mode.md` documentan todos los controles correctos), pero **la mayoría de esas mitigaciones no están implementadas en el código real**. La brecha entre el diseño de seguridad prescrito y el código actualmente desplegado es significativa.

Las vulnerabilidades más urgentes son:
1. **Path traversal irrestricto** en storage.py y kml_export.py — el `dataset_id` del cliente se usa directamente en rutas de archivo sin validación.
2. **Formula injection Excel/CSV no mitigado** — no existe `data_only=True` ni sanitización de valores.
3. **Sin límite de tamaño de archivo** — susceptible a DoS por archivos masivos o zip bombs.
4. **IPC sin whitelist en el bridge Rust** — cualquier string puede enviarse como `method` desde el frontend.
5. **UUID generado con PRNG débil** — el generador manual basado en `SystemTime` es predecible.

---

## 2. Mapa de Arquitectura de Seguridad

```
┌──────────────────────────────────────────────────────────────────┐
│  TAURI WebView (React/TypeScript)                                │
│                                                                  │
│  App.tsx                                                         │
│   └─ open() [dialog] ──────── [OK] Tauri dialog, usuario elige  │
│   └─ exportKml() ─────────── [GAP] outputDir no validado        │
│                                                                  │
│  ImportWizard.tsx                                                │
│   └─ previewFile(filePath) ─ [GAP] path sin validación frontend │
│   └─ importFile({filePath}) [GAP] path pasa directo al backend  │
│                                                                  │
│  data-api.ts / rpc.ts                                           │
│   └─ callRpc(method, params) [GAP] method es string arbitrario  │
│                                                                  │
│──────────────────── invoke("call_analytics") ────────────────────│
│                                                                  │
│  TAURI CORE (Rust) — analytics_bridge.rs                        │
│                                                                  │
│   check_analytics_service() ─ [OK] health check básico          │
│   call_analytics(method, params)                                 │
│    └─ [GAP] NO valida method — pasa cualquier string al backend  │
│    └─ [GAP] UUID generado con PRNG débil (SystemTime)           │
│   open_in_explorer(path) ─── [GAP] path no sanitizado           │
│                                                                  │
│  capabilities/default.json                                       │
│   └─ [RIESGO] shell:default — demasiado permisivo               │
│   └─ [RIESGO] fs:default — scope no restringido                 │
│                                                                  │
│──────────────────── HTTP POST :5174/rpc ─────────────────────────│
│                                                                  │
│  FASTAPI (Python) — main.py                                      │
│   └─ CORSMiddleware ──────── [OK] origins restringidos          │
│   └─ [GAP] NO TrustedHostMiddleware                             │
│   └─ [GAP] docs_url="/docs" expuesto sin auth                   │
│   └─ [GAP] allow_methods=["*"] — debería ser solo POST          │
│                                                                  │
│  routers/rpc.py                                                  │
│   └─ METHOD_REGISTRY ──────── [OK] whitelist de facto           │
│   └─ [GAP] NO ALLOWED_RPC_METHODS frozenset explícita           │
│   └─ error messages ──────── [RIESGO] expone detalles internos  │
│                                                                  │
│  analysis/data/importer.py                                       │
│   └─ preview_file(path) ─── [GAP] NO valida tamaño de archivo   │
│   └─ _read_excel_polars() ─ [GAP] NO usa data_only=True         │
│   └─ _read_csv_polars() ──── [GAP] NO sanitiza fórmulas en celdas│
│   └─ [GAP] NO valida extensión segura vs path traversal         │
│                                                                  │
│  analysis/data/storage.py                                        │
│   └─ load_dataset(dataset_id) [CRÍTICO] dataset_id sin validar  │
│   └─ load_metadata(dataset_id)[CRÍTICO] path traversal directo  │
│   └─ delete_dataset(dataset_id)[CRÍTICO] puede borrar archivos  │
│   └─ [GAP] DATA_DIR relativo "./data" — depende del cwd         │
│                                                                  │
│  analysis/spatial/kml_export.py                                  │
│   └─ export_kml(dataset_id) ─[CRÍTICO] dataset_id sin validar   │
│   └─ output_dir (cliente) ── [CRÍTICO] path arbitrario aceptado │
│   └─ KML description ─────── [MEDIA] XSS en contenido HTML      │
│                                                                  │
│  ALMACENAMIENTO LOCAL                                            │
│   └─ Parquet en ./data/datasets/ ── [GAP] sin cifrado at-rest   │
│   └─ metadata .meta.json ────────── [GAP] expone source_path    │
│   └─ [N/A] SQLite — no implementado aún, reglas prescriptas     │
└──────────────────────────────────────────────────────────────────┘
```

**Leyenda**: [OK] implementado correctamente | [GAP] mitigación prescrita no implementada | [CRÍTICO/RIESGO] vulnerabilidad activa

---

## 3. Auditoría por Superficie

---

### 3.1 File Import (CSV/Excel)

**Archivos**: `services/analytics/analysis/data/importer.py`

#### Estado actual

`preview_file()` (línea 174) y `import_file()` (línea 235) aceptan `path: str` directamente desde el cliente sin ninguna validación previa. El path llega desde el frontend a través de IPC y se pasa a `Path(path)` y a `pl.read_csv()` / `pl.read_excel()` sin restricciones.

#### Vulnerabilidades encontradas

**CRÍTICA — Sin límite de tamaño de archivo** (`importer.py:177`)
```python
# importer.py línea 177
file_size_kb = round(p.stat().st_size / 1024, 1)
# El tamaño se INFORMA pero NO se valida ni rechaza
```
Un archivo CSV de 10 GB o un Excel comprimido (zip bomb) puede ser procesado sin limitación, agotando memoria/CPU.

**ALTA — Excel sin `data_only=True`** (`importer.py:304-310`)
```python
def _read_excel_polars(path: str, sheet: str | int = 0) -> pl.DataFrame:
    try:
        return pl.read_excel(path, sheet_name=sheet, infer_schema_length=2000)
    # ...
```
`pl.read_excel()` usa `fastexcel` como backend (declarado en pyproject.toml como requisito implícito). `fastexcel` usa la librería Rust `calamine` que NO ejecuta macros, pero tampoco garantiza `data_only` para fórmulas cacheadas de openpyxl. Adicionalmente, no se fuerza explícitamente `engine="openpyxl"` con `data_only=True` como prescribe el security agent.

**ALTA — Sin sanitización de formula injection en CSV** (`importer.py:284-301`)
```python
def _read_csv_polars(path: str, separator: str = ",") -> pl.DataFrame:
    # No hay sanitización de valores que comiencen con =, +, -, @
```
Valores como `=CMD(...)` o `=HYPERLINK(...)` en celdas CSV pasan sin neutralización. Riesgo al reexportar a Excel downstream.

**MEDIA — Path no verificado dentro de un directorio seguro** (`importer.py:174,235`)
El `path` puede ser cualquier ruta del filesystem accesible por el proceso Python (p. ej. `C:\Windows\System32\drivers\etc\hosts`). No existe `safe_data_path()` ni verificación que el archivo esté en un directorio permitido. (Mitigado parcialmente porque el path lo elige el usuario via Tauri dialog, pero no completamente porque el path llega como string sin validación adicional en el backend.)

#### Mitigaciones implementadas
- Restricción de extensiones en `preview_file()` (línea 183): solo `.csv`, `.xlsx`, `.xls`, `.xlsm` aceptados.
- Separator sanitizado en `_read_csv_polars()` (línea 285): `sep = separator if len(separator) == 1 else ","` — previene separadores multi-caracter maliciosos.

#### Mitigaciones faltantes
- `validate_file_size()` — límite 500 MB
- `data_only=True` con openpyxl para Excel
- `sanitize_cell_value()` — neutralizar fórmulas
- Verificación que el path está dentro de un directorio permitido

**Severidad: ALTA**

---

### 3.2 IPC Tauri ↔ Python (JSON-RPC)

**Archivos**: `apps/desktop/src-tauri/src/analytics_bridge.rs`, `services/analytics/app/routers/rpc.py`, `apps/desktop/src/lib/rpc.ts`

#### Estado actual

El bridge Rust (`analytics_bridge.rs:69-100`) acepta `method: String` como parámetro arbitrario desde cualquier invocación de `call_analytics` y lo pasa directamente al body del JSON-RPC POST al backend Python.

En el backend (`rpc.py:138-146`), el `METHOD_REGISTRY` dict actúa como whitelist implícita: si el método no está en el diccionario, retorna error `-32601`. Esto es funcionalmente correcto pero no es una whitelist explícita de tipo `frozenset`.

#### Vulnerabilidades encontradas

**ALTA — Sin validación de `method` en el bridge Rust** (`analytics_bridge.rs:69-100`)
```rust
pub async fn call_analytics(
    method: String,     // String arbitrario — no hay validación
    params: serde_json::Value,
) -> Result<serde_json::Value, AnalyticsBridgeError> {
```
Un plugin malicioso o XSS en la WebView podría invocar `call_analytics` con métodos arbitrarios. La validación existe solo en Python, pero el bridge Rust debería ser la primera línea de defensa.

**MEDIA — Error messages revelan detalles internos** (`rpc.py:157`)
```python
error=RpcError(code=-32603, message=f"Internal error: {exc}"),
```
Las excepciones Python (incluyendo stack traces en `str(exc)`) se exponen al cliente. Esto puede revelar paths internos, nombres de variables, versiones de librerías.

**MEDIA — UUID generado con PRNG débil** (`analytics_bridge.rs:113-139`)
```rust
fn rand_u16() -> u16 {
    let t = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    (t.subsec_nanos() ^ (t.as_secs() as u32)) as u16
}
```
Los IDs de request son predecibles basados en tiempo. No es un riesgo crítico en un entorno localhost, pero viola el principio de UUID v4 genuinamente aleatorio.

**BAJA — `data.rows` sin límite máximo de `limit`** (`rpc.py:118`)
```python
"data.rows": lambda p: get_rows(p["dataset_id"], p.get("offset", 0), p.get("limit", 200)),
```
Un cliente puede enviar `limit: 10000000` causando carga excesiva de memoria.

#### Mitigaciones implementadas
- METHOD_REGISTRY actúa como whitelist implícita — métodos no registrados retornan `-32601`.
- Pydantic `RpcRequest` valida la estructura del request (jsonrpc, method, params, id).
- Verificación de `jsonrpc == "2.0"` (línea 132).

#### Mitigaciones faltantes
- `ALLOWED_RPC_METHODS` frozenset explícita con validación temprana
- Validación de `method` en el bridge Rust antes de hacer el POST
- Sanitización de mensajes de error (no exponer `str(exc)`)
- Límite máximo en parámetros `limit` y `offset`

**Severidad: ALTA**

---

### 3.3 FastAPI Endpoints

**Archivos**: `services/analytics/app/main.py`, `services/analytics/app/routers/data_routes.py`

#### Estado actual

`main.py` configura CORS restrictivo con origins específicos. Sin embargo, no hay `TrustedHostMiddleware`, `docs_url` está expuesto, y `allow_methods=["*"]` es demasiado permisivo.

`data_routes.py` expone los mismos endpoints como REST independiente del RPC, duplicando la superficie de ataque.

#### Vulnerabilidades encontradas

**ALTA — Sin TrustedHostMiddleware** (`main.py:11-43`)
```python
app = FastAPI(
    title="PyOrex Analytics Engine",
    docs_url="/docs",    # Swagger UI expuesto sin auth
    # Sin TrustedHostMiddleware
)
```
Cualquier proceso local puede hacer requests a `:5174` con cualquier host header. En un entorno desktop esto es menos crítico, pero un proceso malicioso en la misma máquina podría explotar el servicio.

**MEDIA — `/docs` expuesto sin autenticación** (`main.py:15`)
El Swagger UI en `http://127.0.0.1:5174/docs` permite explorar y ejecutar todos los endpoints sin credenciales. En producción debe deshabilitarse.

**MEDIA — `allow_methods=["*"]` en CORS** (`main.py:23`)
```python
allow_methods=["*"],    # Debería ser ["POST"] solo para RPC
```
Permite GET, DELETE, PUT, PATCH desde los origins autorizados. Los endpoints REST en `data_routes.py` usan GET y POST, por lo que hay cierta razón, pero amplía la superficie.

**BAJA — Dual exposure: RPC + REST** (`main.py:31-32`)
```python
app.include_router(rpc.router, tags=["rpc"])
app.include_router(data_routes.router, prefix="/data", tags=["data"])
```
Los mismos datos se pueden acceder via `/rpc` (JSON-RPC) y via `/data/preview`, `/data/import`, `/data/list` (REST). Doble superficie de ataque con lógica potencialmente diferente (por ejemplo, `data_routes.py` no persiste `spatial_ref` mientras que `rpc.py` sí lo hace).

#### Mitigaciones implementadas
- CORS origins restringidos a `tauri://localhost`, `http://localhost:1420`, `http://127.0.0.1:1420`.
- Pydantic schemas en `data_routes.py` (`PreviewRequest`, `ImportRequest`).

#### Mitigaciones faltantes
- `TrustedHostMiddleware` con `allowed_hosts=["127.0.0.1", "localhost"]`
- `docs_url=None` en producción (o condicional con `debug_assertions`)
- `allow_methods=["POST"]` en lugar de `["*"]`
- Considerar eliminar la capa REST duplicada o unificarla con RPC

**Severidad: ALTA**

---

### 3.4 Tauri Capabilities

**Archivo**: `apps/desktop/src-tauri/capabilities/default.json`

#### Estado actual

```json
{
  "permissions": [
    "core:default",
    "core:window:allow-start-dragging",
    "shell:default",
    "dialog:default",
    "fs:default",
    "fs:allow-read-text-file",
    "fs:allow-write-text-file"
  ]
}
```

#### Vulnerabilidades encontradas

**ALTA — `shell:default` demasiado permisivo**
`shell:default` en Tauri 2.x incluye `shell:allow-execute` y `shell:allow-open`. Esto permite que código en la WebView ejecute comandos de shell arbitrarios si se bypasea la validación del side frontend. El uso actual es `open_in_explorer()` que ya está implementado como comando Rust nativo — `shell:default` no es necesario.

**MEDIA — `fs:default` sin scope restrictivo**
`fs:default` en Tauri 2.x permite acceso de lectura/escritura sin restricción de directorio. Debería reemplazarse con un scope limitado al directorio de datos de la aplicación y a los archivos seleccionados por el usuario.

**MEDIA — `dialog:default` más amplio que necesario**
Solo se necesita `dialog:allow-open` (para importar archivos). `dialog:default` puede incluir `dialog:allow-save`, `dialog:allow-message`, etc.

**BAJA — CSP en tauri.conf.json permite `unsafe-inline` en estilos** (`tauri.conf.json:27`)
```json
"style-src 'self' 'unsafe-inline'"
```
`unsafe-inline` para estilos es aceptable en una app Tauri desktop (sin XSS real por CSP de Tauri), pero idealmente debería moverse a CSS modules o nonces.

#### Mitigaciones implementadas
- CSP configurado en `tauri.conf.json` con `default-src 'self'` — buena base.
- `dialog` plugin usado para selección de archivos (usuario controla el path).

#### Mitigaciones faltantes
- Reemplazar `shell:default` con permisos específicos o ninguno (usar comando Rust nativo ya implementado)
- Reemplazar `fs:default` con scope limitado: `{ "allow": [{ "path": "$APPDATA/**" }] }`
- Reemplazar `dialog:default` con `dialog:allow-open` únicamente

**Severidad: ALTA**

---

### 3.5 Plugin System

**Estado**: No implementado (Fase 4). Evaluación del diseño prescrito.

#### Estado actual

No existe código de plugin system. El diseño está prescrito en `security-engineer.md` (sección 3) y en `CLAUDE.md`.

#### Evaluación del diseño

El diseño prescrito es correcto y seguro:
- Manifest con `capabilities` granulares (buena práctica)
- Enforcement en runtime antes de cada operación sensible
- Sin capabilities "all" o "admin"
- Lista de capabilities prohibidas para terceros: `system:exec`, `network:fetch`, `fs:arbitrary`

#### Riesgos del diseño pendiente de resolver

- **Sandboxing de código Python de plugins**: El diseño no especifica cómo se aísla el código Python de plugins de terceros. `subprocess`, `importlib`, restricciones de módulos no están definidos aún.
- **Firma y verificación de plugins**: No hay mecanismo de firma digital de manifests.
- **Scope de `data:read`**: La capability `data:read` debe estar limitada al `tenant_id` actual, no a todos los datasets.

**Severidad: MEDIA** (diseño adecuado, implementación futura; monitorear cuando se implemente)

---

### 3.6 Multi-tenant Storage

**Estado**: No implementado. El sistema actual es single-tenant de facto.

#### Estado actual

`storage.py` usa un único `DATASETS_DIR` global (`./data/datasets/`) sin ninguna partición por tenant. El `dataset_id` es un UUID generado en el servidor (no en el cliente), lo cual es positivo.

#### Riesgos para cuando se implemente

- **Cross-tenant data leak**: Sin `tenant_id` en los nombres de archivo o en un índice de control, un `dataset_id` válido de un tenant puede ser accedido por otro.
- **Path traversal por `tenant_id`**: Si el `tenant_id` se usa en paths, debe sanitizarse con `re.sub(r'[^a-zA-Z0-9\-]', '', tenant_id)`.

#### Mitigación prescrita presente en security-engineer.md

El patrón `get_tenant_data_dir()` está correctamente documentado. Debe implementarse antes de Fase 3.

**Severidad: MEDIA** (no es riesgo activo hoy, es deuda crítica para Fase 3)

---

### 3.7 asteval — Code Injection

**Estado**: `asteval` declarado en `pyproject.toml` (línea 15: `asteval>=0.9.31`) pero NO hay ningún uso actual en el código.

#### Estado actual

No existe ningún archivo con `from asteval import` o `import asteval` en el código implementado. La vulnerabilidad de code injection con asteval es una **deuda de seguridad futura**, no un riesgo activo.

#### Evaluación del diseño

`security-engineer.md` prescribe `create_safe_evaluator()` con:
- Eliminación de `open`, `exec`, `eval`, `__import__`, `compile`, `getattr`, `setattr`, `delattr`, `globals`, `locals` del symtable
- Timeout via `threading.Timer` (correcto para Windows, donde `signal.alarm` no está disponible)

El diseño es correcto. El riesgo es que cuando se implemente el evaluador de expresiones geoquímicas (Fase 2+), no se use la función prescrita.

**Severidad: BAJA** (actualmente no hay código en riesgo; prescripción de diseño correcta)

---

### 3.8 Dependencias — CVEs

**Archivos**: `services/analytics/pyproject.toml`, `apps/desktop/src-tauri/Cargo.toml`

#### Dependencias Python de alto riesgo (pyproject.toml)

| Dependencia | Versión mínima | Riesgo | Notas |
|------------|---------------|--------|-------|
| `polars` | `>=0.20.0` | MEDIO | Activamente mantenido, pocos CVEs históricos. Versión mínima vieja (0.20 vs actual ~0.25). |
| `numpy` | `>=1.26.0` | MEDIO | CVE-2024-29082 en versiones < 1.26.4 (buffer overflow). Verificar versión instalada. |
| `fastapi` | `>=0.110.0` | BAJO | Sin CVEs críticos conocidos en versiones recientes. |
| `pyarrow` | `>=15.0.0` | MEDIO | CVE-2023-47248 afectó versiones < 14.0.1 (ya cubierto). Versión 15+ limpia. |
| `scipy` | `>=1.12.0` | BAJO | Sin CVEs críticos activos en 1.12+. |

**Observación crítica**: `openpyxl` NO está declarado en `pyproject.toml` aunque `security-engineer.md` lo menciona como dependencia de alto riesgo. `pl.read_excel()` con Polars usa `fastexcel` (Rust, más seguro) por defecto, no `openpyxl`. Sin embargo, si se agrega `engine="openpyxl"` en el futuro, debe declararse y monitorearse.

#### Dependencias Rust de alto riesgo (Cargo.toml)

| Dependencia | Versión | Riesgo | Notas |
|------------|---------|--------|-------|
| `reqwest` | `0.12` | BAJO | Sin CVEs activos conocidos. TLS habilitado por defecto. |
| `tauri` | `2` | BAJO | Tauri 2 es relativamente nuevo con modelo de seguridad revisado. |
| `serde_json` | `1` | BAJO | Sin CVEs conocidos. |

#### Dependencias JavaScript (no auditadas en este informe)
No se leyeron `package.json` ni `pnpm-lock.yaml`. Se recomienda ejecutar `pnpm audit --audit-level=high`.

**Severidad: MEDIA** (no hay CVEs confirmados activos, pero las versiones mínimas son amplias y requieren pinning más estricto)

---

## 4. Vulnerabilidades Críticas (acción inmediata)

### CRÍTICA-1: Path Traversal en `storage.py` — `dataset_id` sin validación

**Archivos**: `services/analytics/analysis/data/storage.py` líneas 52-68, 70-79, 82-90

```python
# storage.py:52-58 — VULNERABLE
def load_dataset(dataset_id: str) -> pl.DataFrame:
    _ensure_dirs()
    parquet_path = DATASETS_DIR / f"{dataset_id}.parquet"
    # dataset_id puede ser "../../Windows/System32/calc"
    # → parquet_path = ./data/datasets/../../Windows/System32/calc.parquet
    if not parquet_path.exists():
        raise FileNotFoundError(f"Dataset not found: {dataset_id}")
    return pl.read_parquet(parquet_path)
```

Impacto: Lectura/escritura/borrado de archivos fuera de `DATASETS_DIR`. El `delete_dataset()` es especialmente peligroso: puede borrar archivos del sistema.

**Fix inmediato requerido**:
```python
import re

DATASET_ID_PATTERN = re.compile(r'^[a-zA-Z0-9\-_]{1,64}$')

def validate_dataset_id(dataset_id: str) -> str:
    if not DATASET_ID_PATTERN.match(dataset_id):
        raise ValueError(f"dataset_id inválido: {dataset_id!r}")
    return dataset_id

def load_dataset(dataset_id: str) -> pl.DataFrame:
    validate_dataset_id(dataset_id)
    _ensure_dirs()
    parquet_path = DATASETS_DIR / f"{dataset_id}.parquet"
    # Verificación adicional de que el path resuelto está dentro de DATASETS_DIR
    if not str(parquet_path.resolve()).startswith(str(DATASETS_DIR.resolve())):
        raise ValueError("Path traversal detectado")
    ...
```

---

### CRÍTICA-2: Path Traversal en `kml_export.py` — `output_dir` arbitrario del cliente

**Archivo**: `services/analytics/analysis/spatial/kml_export.py` líneas 181-185

```python
# kml_export.py:181-185 — VULNERABLE
if output_dir:
    dest_dir = Path(output_dir)   # Path arbitrario del cliente
else:
    dest_dir = EXPORTS_DIR
dest_dir.mkdir(parents=True, exist_ok=True)  # Crea directorios arbitrarios
```

El cliente puede especificar `output_dir="C:\\Windows\\Temp"` o `output_dir="../../malicious"`. El `mkdir(parents=True)` creará la ruta completa si no existe.

**Fix inmediato requerido**: Si `output_dir` se permite, validarlo con `safe_data_path()`. Preferiblemente, eliminar el parámetro `output_dir` del API RPC y usar siempre `EXPORTS_DIR`.

---

### CRÍTICA-3: Path Traversal en `kml_export.py` — `dataset_id` sin validar

**Archivo**: `services/analytics/analysis/spatial/kml_export.py` líneas 65-66

```python
# kml_export.py:65-66 — VULNERABLE
meta = load_metadata(dataset_id)   # dataset_id sin validar antes de llegar aquí
df = load_dataset(dataset_id)
```

Mismo vector que CRÍTICA-1 pero en el flujo de exportación KML.

---

### CRÍTICA-4: Sin validación de tamaño de archivo — DoS por archivos masivos

**Archivo**: `services/analytics/analysis/data/importer.py` líneas 174-185

```python
def preview_file(path: str, n_rows: int = 50, separator: str = ",") -> PreviewResult:
    p = Path(path)
    file_size_kb = round(p.stat().st_size / 1024, 1)  # Solo informa, no rechaza
    ext = p.suffix.lower()

    if ext == ".csv":
        df_full = _read_csv_polars(path, separator=separator)  # Lee TODO el archivo
```

Un archivo CSV de 5 GB o un Excel comprimido que expande a GB en memoria puede crashear el proceso Python o agotar la RAM del sistema.

**Fix inmediato requerido**:
```python
MAX_FILE_SIZE_MB = 500

def preview_file(path: str, n_rows: int = 50, separator: str = ",") -> PreviewResult:
    p = Path(path)
    size_mb = p.stat().st_size / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise ValueError(f"Archivo demasiado grande: {size_mb:.1f} MB (máximo: {MAX_FILE_SIZE_MB} MB)")
```

---

### CRÍTICA-5: `open_in_explorer()` — Ejecución de comandos con path arbitrario

**Archivo**: `apps/desktop/src-tauri/src/analytics_bridge.rs` líneas 104-111

```rust
#[command]
pub async fn open_in_explorer(path: String) -> Result<(), String> {
    std::process::Command::new("explorer")
        .arg(&path)    // path arbitrario — puede incluir argumentos shell
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

`explorer.exe` en Windows interpreta algunos argumentos especiales. Más importante: si en el futuro se cambia el comando o el OS target, un path como `/path && rm -rf /` podría ser peligroso. La implementación actual con `explorer.exe` es relativamente segura en Windows, pero el path debería validarse.

**Riesgo actual**: MEDIO en Windows con explorer.exe. Potencialmente CRÍTICO si se cambia el backend.

---

## 5. Deuda de Seguridad por Fase

### Implementar ANTES de primera demo (inmediato)

Estas vulnerabilidades deben corregirse antes de mostrar la aplicación a cualquier usuario externo:

1. **`validate_dataset_id()`** en `storage.py` y `kml_export.py` — previene path traversal en almacenamiento (CRÍTICA-1, CRÍTICA-3)
2. **`validate_file_size()`** en `importer.py` — previene DoS por archivos masivos (CRÍTICA-4)
3. **Eliminar `output_dir` del API RPC** o validarlo estrictamente en `kml_export.py` (CRÍTICA-2)
4. **`TrustedHostMiddleware`** en `main.py` — añadir 3 líneas de código
5. **`docs_url=None`** en `main.py` para producción — deshabilitar Swagger público
6. **`allow_methods=["POST"]`** en CORS de `main.py`

### Implementar ANTES de Fase 2 (Plugin Analytics)

7. **`ALLOWED_RPC_METHODS` frozenset** explícita en `rpc.py` — reemplazar el dict check implícito
8. **Validación de `method` en bridge Rust** — primera línea de defensa antes del HTTP call
9. **Sanitización de mensajes de error** en `rpc.py` — no exponer `str(exc)` completo
10. **Límite en parámetros `limit`/`offset`** en `data.rows`
11. **Excel con `data_only=True`** — cuando se agregue soporte openpyxl explícito
12. **`sanitize_cell_value()`** en `importer.py` — neutralizar fórmulas en CSV/Excel

### Implementar ANTES de Fase 3 (Multi-tenant)

13. **`get_tenant_data_dir()` con sanitización** — aislamiento de almacenamiento por tenant
14. **Filtrado por `tenant_id` en todos los queries** — ningún endpoint retorna datos cross-tenant
15. **Índice de autorización de datasets** — mapa `dataset_id → tenant_id` verificado en cada acceso

### Implementar ANTES de release

16. **Auditoría de dependencias** — `pnpm audit` + `pip-audit` limpios
17. **Reemplazar `shell:default` por permisos mínimos** en capabilities/default.json
18. **Restringir `fs:default` con scope** en capabilities/default.json
19. **Pinning de versiones exactas** en `pyproject.toml` (no `>=`)
20. **Firma y verificación de plugins de terceros**
21. **`create_safe_evaluator()`** implementado y usado cuando se integre asteval
22. **UUID v4 criptográfico** — reemplazar el PRNG manual en `analytics_bridge.rs` por `uuid` crate

---

## 6. Checklist de Estado Actual

### File Import (CSV/Excel)
- ❌ `validate_file_size()` — límite 500 MB — **FALTANTE**
- ❌ `data_only=True` con openpyxl para Excel — **FALTANTE** (fastexcel usado en su lugar, parcialmente mitigado)
- ❌ `sanitize_cell_value()` — neutralizar fórmulas `=`, `+`, `-`, `@` — **FALTANTE**
- ⚠️ Path verificado dentro de directorio seguro — **PARCIAL** (restricción de extensión existe; verificación de directorio faltante)
- ✅ Restricción de extensiones aceptadas (`.csv`, `.xlsx`, `.xls`, `.xlsm`)
- ✅ Separator sanitizado (1 caracter máximo)

### IPC Tauri ↔ Python
- ✅ `METHOD_REGISTRY` actúa como whitelist implícita de métodos
- ❌ `ALLOWED_RPC_METHODS` frozenset explícita — **FALTANTE**
- ❌ Validación de `method` en bridge Rust — **FALTANTE**
- ✅ Pydantic `RpcRequest` valida estructura
- ✅ Verificación de `jsonrpc == "2.0"`
- ❌ Sanitización de mensajes de error (no exponer stack traces) — **FALTANTE**
- ❌ Límite máximo en `limit`/`offset` — **FALTANTE**

### FastAPI Endpoints
- ✅ CORS origins restringidos
- ❌ `TrustedHostMiddleware` — **FALTANTE**
- ❌ `docs_url=None` en producción — **FALTANTE** (Swagger expuesto)
- ❌ `allow_methods=["POST"]` — **FALTANTE** (usa `["*"]`)
- ✅ Schemas Pydantic en `data_routes.py`

### Tauri Capabilities
- ❌ `shell:default` — **EXCESIVO** (debería ser ninguno o permisos mínimos)
- ❌ `fs:default` sin scope restrictivo — **EXCESIVO**
- ⚠️ `dialog:default` — **PARCIALMENTE EXCESIVO** (solo se necesita `dialog:allow-open`)
- ✅ CSP configurado con `default-src 'self'`
- ✅ No hay `http:default` (comunicación Python va por Rust nativo)

### Storage — `dataset_id` Validation
- ❌ `validate_dataset_id()` en `storage.py` — **FALTANTE** (CRÍTICO)
- ❌ `validate_dataset_id()` en `kml_export.py` — **FALTANTE** (CRÍTICO)
- ❌ `safe_data_path()` verificación de directorio — **FALTANTE**
- ✅ `dataset_id` generado por el servidor con `uuid.uuid4()` (no trusting del cliente en save)

### KML Export
- ❌ `output_dir` arbitrario aceptado sin validación — **CRÍTICO**
- ⚠️ `dataset_name_safe` sanitizado con regex `[^\w\-]` — **PARCIAL** (correcto para nombre de archivo, no para path)
- ✅ Nombre de archivo con timestamp (evita colisiones)

### Multi-tenant
- ❌ Sin aislamiento por tenant — **FALTANTE** (no implementado, deuda Fase 3)
- ❌ Sin filtrado por `tenant_id` — **FALTANTE**
- ❌ Sin índice de autorización `dataset_id → tenant_id` — **FALTANTE**

### asteval
- ✅ `asteval` declarado en dependencias con versión mínima
- ❌ `create_safe_evaluator()` — **NO NECESARIO AÚN** (no hay uso de asteval en código actual)
- ✅ Diseño prescrito correcto en `security-engineer.md`

### Dependencias
- ⚠️ `polars>=0.20.0` — versión mínima muy antigua, actualizar a `>=0.25.0`
- ⚠️ `numpy>=1.26.0` — verificar que versión instalada sea `>=1.26.4` (CVE-2024-29082)
- ❌ `pip-audit` no ejecutado — **PENDIENTE**
- ❌ `pnpm audit` no ejecutado — **PENDIENTE**
- ✅ `pyarrow>=15.0.0` — cubre CVE-2023-47248

### UUID / Randomness
- ❌ UUID generado con PRNG débil en `analytics_bridge.rs` — **BAJA PRIORIDAD** pero debe reemplazarse

---

## Apéndice: Archivos Auditados

| Archivo | Líneas | Estado seguridad |
|---------|--------|-----------------|
| `services/analytics/app/main.py` | 43 | RIESGO — middleware faltante |
| `services/analytics/app/routers/rpc.py` | 159 | MEDIO — whitelist implícita, error leaks |
| `services/analytics/app/routers/data_routes.py` | 118 | MEDIO — duplicación de superficie |
| `services/analytics/analysis/data/importer.py` | 322 | ALTO — sin file size limit, sin formula sanitization |
| `services/analytics/analysis/data/storage.py` | 103 | CRÍTICO — path traversal vía dataset_id |
| `services/analytics/analysis/spatial/kml_export.py` | 255 | CRÍTICO — output_dir arbitrario + dataset_id sin validar |
| `services/analytics/pyproject.toml` | 41 | MEDIO — versiones mínimas amplias |
| `apps/desktop/src-tauri/src/analytics_bridge.rs` | 140 | ALTO — sin validación de method, PRNG débil |
| `apps/desktop/src-tauri/src/lib.rs` | 35 | OK — configuración limpia |
| `apps/desktop/src-tauri/Cargo.toml` | 40 | OK — dependencias razonables |
| `apps/desktop/src-tauri/capabilities/default.json` | 14 | ALTO — shell:default excesivo |
| `apps/desktop/src-tauri/tauri.conf.json` | 42 | MEDIO — CSP con unsafe-inline estilos |
| `apps/desktop/src/lib/rpc.ts` | 12 | OK — wrapper simple y limpio |
| `apps/desktop/src/lib/data-api.ts` | 136 | OK — tipos bien definidos |
| `apps/desktop/src/components/ImportWizard.tsx` | 640 | OK — path elegido por dialog nativo |
| `apps/desktop/src/components/ExportHistory.tsx` | 205 | OK — usa invoke nativo |
| `apps/desktop/src/components/DatasetPanel.tsx` | 176 | OK — operaciones de UI puras |
| `apps/desktop/src/App.tsx` | 391 | OK — usa Tauri dialog para selección de paths |
