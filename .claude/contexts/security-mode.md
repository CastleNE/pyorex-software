# Contexto: Modo Security

Cargar este archivo cuando se trabaje en cualquier feature que involucre:
datos externos, IPC bridge, plugin system, multi-tenancy, o antes de un release.

> Última auditoría completa: `security-audit-2026-06-04.md` — 2026-06-04

## Estado de Superficies de Ataque (post-fix 2026-06-04)

| Superficie | Riesgo principal | Estado |
|-----------|-----------------|--------|
| File Import (CSV/Excel) | Formula injection, path traversal, zip bomb | **MEDIO** — ✅ File size limit 500 MB implementado; ⚠️ sin data_only=True, sin sanitización de fórmulas |
| IPC Tauri ↔ Python | JSON-RPC method injection, param pollution | **MEDIO** — ✅ Whitelist implícita (METHOD_REGISTRY); ⚠️ sin validación en bridge Rust |
| FastAPI endpoints | Sin TrustedHostMiddleware, docs expuesto, CORS amplio | **BAJO** — ✅ TrustedHostMiddleware activo, docs_url=None en prod, allow_methods=["GET","POST"] |
| Tauri capabilities | shell:default excesivo, fs:default sin scope | **ALTO** — ⚠️ shell:default y fs:default sin restricción de scope (pendiente) |
| Storage (dataset_id) | Path traversal via dataset_id | **BAJO** — ✅ validate_dataset_id() implementado en storage.py y kml_export.py |
| KML export (output_dir) | Path traversal via output_dir del cliente | **BAJO** — ✅ output_dir eliminado; siempre usa EXPORTS_DIR managed |
| Plugin System | Acceso cross-tenant, exfiltración de datos | **N/A** — No implementado (Fase 4); diseño prescrito correcto |
| Multi-tenant storage | Cross-tenant data leak | **PENDIENTE** — No implementado (Fase 3); sistema actual single-tenant |
| asteval expressions | Code injection en índices personalizados | **N/A** — asteval declarado pero no hay código que lo use aún |
| Dependencias | CVEs en polars, numpy, @tauri-apps | **MEDIO** — polars>=0.20.0 muy viejo; sin pip-audit ejecutado |
| UUID en bridge Rust | PRNG predecible en IDs de request | **BAJO** — ✅ uuid crate v4 criptográfico implementado |
| open_in_explorer | Path arbitrario pasado a explorer.exe | **BAJO** — ✅ Validación de existencia de path antes de invocar |

## Vulnerabilidades Pendientes (dependen de fases futuras)

### MEDIA — data_only=True para Excel (Fase 2)
`pl.read_excel()` usa fastexcel (Rust, más seguro) pero no garantiza `data_only` para fórmulas cacheadas de openpyxl.
Evaluar cuando se soporte openpyxl explícitamente como engine alternativo.

### PENDIENTE — Aislamiento multi-tenant (Fase 3)
Sin `tenant_id` en queries ni en paths de almacenamiento. Implementar junto con autenticación.
Patrón prescrito: `get_tenant_data_dir()` con sanitización en security-engineer.md.

### PENDIENTE — Sandboxing de plugins (Fase 4)
Definir cómo se aísla código Python de plugins de terceros: subprocess, importlib, restricciones de módulos.
La capability enforcement del manifest es correcta; falta el runtime sandboxing.

## Reglas de oro (aplicar en toda feature nueva)

1. NUNCA `eval()` → usar `asteval` con symtable sanitizado
2. NUNCA f-string en SQL → parámetros `?` siempre
3. NUNCA confiar en `dataset_id` del cliente → validar `^[a-zA-Z0-9\-_]{1,64}$`
4. NUNCA path join sin resolver y verificar que está dentro del data dir
5. SIEMPRE `TrustedHostMiddleware` activo en FastAPI
6. SIEMPRE filtrar por `tenant_id` en queries de datos (cuando multi-tenant se implemente)
7. SIEMPRE `data_only=True` al leer Excel con openpyxl
8. NUNCA exponer `str(exc)` completo en RPC error responses

## Patrones de mitigación prescriptos (pendientes de implementar)

```python
# 1. validate_dataset_id — agregar en storage.py y kml_export.py
import re
DATASET_ID_PATTERN = re.compile(r'^[a-zA-Z0-9\-_]{1,64}$')

def validate_dataset_id(dataset_id: str) -> str:
    if not DATASET_ID_PATTERN.match(dataset_id):
        raise ValueError(f"dataset_id inválido: {dataset_id!r}")
    return dataset_id

# 2. safe_data_path — agregar en storage.py
def safe_data_path(base_dir: Path, filename: str) -> Path:
    resolved = (base_dir / filename).resolve()
    if not str(resolved).startswith(str(base_dir.resolve())):
        raise ValueError(f"Path traversal detectado: {filename}")
    return resolved

# 3. validate_file_size — agregar en importer.py
MAX_FILE_SIZE_MB = 500
def validate_file_size(filepath: Path) -> None:
    size_mb = filepath.stat().st_size / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise ValueError(f"Archivo demasiado grande: {size_mb:.1f} MB (máx {MAX_FILE_SIZE_MB} MB)")

# 4. sanitize_cell_value — agregar en importer.py
FORMULA_CHARS = {'=', '+', '-', '@', '\t', '\r'}
def sanitize_cell_value(value: str) -> str:
    if value and value[0] in FORMULA_CHARS:
        return "'" + value
    return value

# 5. ALLOWED_RPC_METHODS — reemplazar dict check implícito en rpc.py
ALLOWED_RPC_METHODS = frozenset({
    "health.ping",
    "data.preview", "data.import", "data.list", "data.rows",
    "data.delete", "data.export_kml",
})
```

```python
# 6. TrustedHostMiddleware + CORS restrictivo — main.py
from fastapi.middleware.trustedhost import TrustedHostMiddleware

app = FastAPI(
    title="PyOrex Analytics Engine",
    version="0.1.0",
    docs_url=None,       # Deshabilitar Swagger en producción
    redoc_url=None,
)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost"])
app.add_middleware(
    CORSMiddleware,
    allow_origins=["tauri://localhost", "http://localhost:1420", "http://127.0.0.1:1420"],
    allow_methods=["POST"],    # Solo POST para RPC
    allow_headers=["Content-Type"],
    allow_credentials=False,
)
```

```json
// 7. Tauri capabilities mínimas — capabilities/default.json
{
  "identifier": "default",
  "description": "Default capabilities for PyOrex — minimum privilege",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:window:allow-start-dragging",
    "dialog:allow-open",
    "fs:allow-read-text-file",
    "fs:allow-write-text-file"
  ]
}
```

## Cuándo invocar al agente security-engineer

- Antes de implementar cualquier endpoint que reciba archivos o dataset_id
- Al diseñar el sistema de plugins y su sandboxing
- Al implementar la autenticación local y roles
- Al implementar el aislamiento multi-tenant en Parquet/SQLite
- Antes de cada release (checklist de seguridad completo)
- Si se agrega una dependencia nueva con superficie de ataque (parsers, crypto, network)
- Al implementar asteval para expresiones geoquímicas personalizadas

## Comandos de auditoría

```powershell
# Auditar dependencias npm
cd apps/desktop; pnpm audit --audit-level=high

# Auditar dependencias Python
cd services/analytics; pip install pip-audit; pip-audit

# Revisar Tauri capabilities configuradas
cat apps/desktop/src-tauri/capabilities/default.json

# Verificar versiones instaladas vs declaradas
cd services/analytics; pip list | grep -E "polars|numpy|pyarrow|fastapi"
```
