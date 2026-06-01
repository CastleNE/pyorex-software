---
name: arch-review
description: >
  Revisión arquitectónica completa del código o diseño actual contra los principios
  de PyOrex. Usar antes de hacer merge, al finalizar una feature, o cuando
  se sospeche que algo viola los principios del proyecto.
context: fork
allowed-tools: Bash(git diff *), Bash(git log *), Bash(find *), Bash(cat *), Bash(grep -r *)
---

# Arch Review — PyOrex

## Paso 1: Leer Estado Actual y ADRs Relevantes
```bash
cat .claude/memory/project-state.md
ls .claude/memory/adrs/
```

## Paso 2: Obtener Cambios a Revisar
```bash
git diff --name-only HEAD~1 2>/dev/null || echo "Sin historial git — revisar archivos modificados manualmente"
git diff HEAD~1 2>/dev/null | head -200
```

## Paso 3: Verificar Cada Regla Arquitectónica

### Regla 1 — Zero business logic en UI
```bash
# Buscar transformaciones de datos, cálculos o lógica en componentes React
grep -r "\.filter\|\.map\|\.reduce\|\.sort" apps/desktop/src/components/ --include="*.tsx" 2>/dev/null | grep -v "node_modules"
grep -r "\.filter\|\.map\|\.reduce" apps/desktop/src/components/ --include="*.ts" 2>/dev/null | grep -v "node_modules"
```
⚠️ Señales de alerta: cálculos, transformaciones de datos, condicionales de negocio en componentes

### Regla 2 — IPC exclusivamente via Plugin API
```bash
# Buscar invoke() directo en componentes (no en stores)
grep -r "invoke(" apps/desktop/src/components/ --include="*.tsx" 2>/dev/null
grep -r "invoke(" apps/desktop/src/components/ --include="*.ts" 2>/dev/null
```
⚠️ Señal: `invoke()` en archivos de `/components/` (debería estar solo en stores)

### Regla 3 — Contratos IPC versionados
```bash
# Verificar que los nuevos IPC contracts tienen schema en ipc-contracts
find packages/ipc-contracts -name "*.json" 2>/dev/null | head -20
```
⚠️ Señal: uso de `invoke('metodo')` sin schema correspondiente en ipc-contracts

### Regla 4 — Plugins declaran capabilities
```bash
# Revisar manifests de plugins
find plugins -name "manifest.json" 2>/dev/null | xargs grep -l "capabilities" 2>/dev/null
find plugins -name "manifest.json" 2>/dev/null | xargs cat 2>/dev/null
```
⚠️ Señal: acceso a filesystem, red o UI sin capability declarada en el manifest

### Regla 5 — Sin acoplamiento entre módulos
```bash
# Buscar importaciones cruzadas entre apps/services/plugins
grep -r "from.*\/services\/" apps/ --include="*.ts" --include="*.tsx" 2>/dev/null
grep -r "from.*\/apps\/" services/ --include="*.py" 2>/dev/null
grep -r "from.*\/plugins\/" apps/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "packages/"
```
⚠️ Señal: imports de rutas hermanas entre módulos (solo se puede importar de `/packages/`)

### Regla 6 — Motor estadístico incluye métricas de calidad
```bash
# Verificar que los endpoints de análisis tienen campos de calidad en el response
grep -r "kmo\|bartlett\|silhouette\|quality_metrics" services/analytics/ --include="*.py" 2>/dev/null | head -20
```
⚠️ Señal: endpoint de PCA/clustering/FA sin métricas de calidad en la response

## Paso 4: Actualizar Memoria si se Detectan Patrones

Si se encontró un patrón de error recurrente:
```bash
# Agregar entrada a lessons-learned.md
```

## Paso 5: Reporte Final

```
## Reporte de Revisión Arquitectónica

**Fecha**: [fecha]
**Archivos revisados**: [lista]

### Resultado por Regla
| Regla | Estado | Hallazgos |
|-------|--------|-----------|
| Zero business logic en UI | ✅/❌ | [detalle] |
| IPC via Plugin API | ✅/❌ | [detalle] |
| Contratos IPC versionados | ✅/❌ | [detalle] |
| Capabilities declaradas | ✅/❌ | [detalle] |
| Sin acoplamiento entre módulos | ✅/❌ | [detalle] |
| Métricas de calidad en análisis | ✅/❌/N/A | [detalle] |

### Veredicto Final
✅ APROBADO / ⚠️ APROBADO CON CONDICIONES / ❌ BLOQUEADO — [razón]

### Acciones Requeridas
- [ ] [acción concreta con archivo y línea si aplica]
```

