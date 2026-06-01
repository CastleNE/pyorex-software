---
name: release-check
description: >
  Checklist completo pre-release para PyOrex. Invocar cuando se vaya
  a crear un nuevo release o tag de versión. Verifica tests, build, versionado,
  changelog, criterios MVP y compatibilidad de plugins antes de publicar.
context: fork
allowed-tools: Bash(pnpm *), Bash(git *), Bash(find *), Bash(cat *), Bash(grep *)
---

# Release Check — PyOrex

## Paso 1: Contexto del Release
```bash
cat .claude/memory/project-state.md | head -30
git log --oneline -10 2>/dev/null
```

## Paso 2: Tests
```bash
pnpm test --run 2>/dev/null || echo "pnpm no disponible — verificar manualmente"
```
Todos los tests deben pasar. Si alguno falla, DETENER aquí.

## Paso 3: Verificación de Tipos
```bash
pnpm typecheck 2>/dev/null || echo "Verificar TypeScript manualmente"
```
Zero errores de TypeScript.

## Paso 4: Build de Producción
```bash
pnpm build:tauri 2>/dev/null || echo "Verificar build manualmente"
```

## Paso 5: Versionado Sincronizado

```bash
# Versión en package.json raíz
grep '"version"' package.json 2>/dev/null | head -1

# Versión en Cargo.toml de Tauri
grep "^version" apps/desktop/src-tauri/Cargo.toml 2>/dev/null

# Versión en pyproject.toml del servicio Python
grep "^version" services/analytics/pyproject.toml 2>/dev/null
```
Las tres versiones deben coincidir con el tag que se va a crear.

## Paso 6: CHANGELOG
```bash
head -60 CHANGELOG.md 2>/dev/null || echo "CHANGELOG.md no encontrado"
```
Debe haber una sección para la versión actual con cambios documentados.

## Paso 7: Criterios del MVP (Sección 13 de PYOREX_SPECS_v2.md)

Si este es el primer release del MVP, verificar manualmente:
```bash
grep -A 40 "^## 13\." PYOREX_SPECS_v2.md
```
Los 11 criterios deben estar completados.

## Paso 8: Contratos IPC Versionados
```bash
# Confirmar que no hay contratos sin número de versión
find packages/ipc-contracts -name "*.json" 2>/dev/null | grep -v "v[0-9]" | head -10
```
No deben haber contratos sin número de versión (`.v1.json`, `.v2.json`, etc.).

## Paso 9: Plugin Compliance
```bash
# Verificar que todos los core plugins tienen sus tests
find plugins -name "*.test.ts" 2>/dev/null | head -20
```

## Reporte Pre-Release

```
## Release Check — v[versión]

| Check | Estado | Notas |
|-------|--------|-------|
| Tests pasando | ✅/❌ | |
| TypeScript sin errores | ✅/❌ | |
| Build exitoso | ✅/❌ | |
| Versiones sincronizadas | ✅/❌ | |
| CHANGELOG actualizado | ✅/❌ | |
| Criterios MVP | ✅/❌/N/A | |
| Contratos IPC versionados | ✅/❌ | |
| Plugin compliance | ✅/❌ | |

**Veredicto**: ✅ LISTO PARA RELEASE / ❌ BLOQUEADO — [razón]
```

