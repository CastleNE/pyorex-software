---
name: security-review
description: >
  Auditoría de seguridad enfocada en el sistema de plugins, IPC y sandboxing.
  Usar antes de publicar un plugin, al exponer nuevos endpoints IPC, o
  periódicamente para revisar el estado de seguridad del sistema.
context: fork
allowed-tools: Bash(find *), Bash(cat *), Bash(grep -r *)
---

# Security Review — PyOrex

## Paso 1: Contexto de Seguridad
```bash
cat .claude/memory/project-state.md | grep -A 5 "Seguridad\|security\|riesgo"
```

## Paso 2: Auditoría de Plugin Sandboxing

```bash
# Buscar accesos a filesystem sin capability fs:read/fs:write
grep -r "fs\.\|readFile\|writeFile\|path\." plugins/ --include="*.ts" 2>/dev/null | grep -v "test\|spec"

# Buscar peticiones de red sin capability network
grep -r "fetch\|axios\|http\.\|https\." plugins/ --include="*.ts" 2>/dev/null | grep -v "test\|spec"

# Buscar acceso a process/globals sin declarar
grep -r "process\.\|global\.\|window\.__" plugins/ --include="*.ts" 2>/dev/null
```
Verificar que cada acceso tiene la capability correspondiente en el manifest del plugin.

## Paso 3: Revisión de Endpoints IPC Expuestos

```bash
find packages/ipc-contracts -name "*.json" 2>/dev/null | xargs cat 2>/dev/null
```
Verificar:
- ¿Expone datos sensibles innecesariamente?
- ¿Los schemas validan y sanitizan inputs? (Pydantic en el lado Python)
- ¿Hay endpoints susceptibles a path traversal o injection?

## Paso 4: Permisos y Capabilities de Plugins

```bash
find plugins -name "manifest.json" 2>/dev/null | xargs cat 2>/dev/null
```
Señal de alerta: plugins con capabilities excesivas respecto a su función declarada.

## Paso 5: Credenciales y Datos Sensibles

```bash
# Buscar credenciales hardcodeadas
grep -r "password\|secret\|api_key\|token\|credential" . \
  --include="*.ts" --include="*.py" --include="*.json" \
  --exclude-dir=node_modules --exclude-dir=.git \
  --exclude-dir=.claude 2>/dev/null | grep -iv "test\|example\|placeholder\|todo"
```

## Paso 6: Evaluador de Expresiones (índices geoquímicos)

```bash
# Verificar que NO se usa eval() directo para índices personalizados
grep -r "eval(" services/analytics/ --include="*.py" 2>/dev/null
grep -r "exec(" services/analytics/ --include="*.py" 2>/dev/null
# Debe aparecer SOLO asteval, no eval/exec directos
grep -r "asteval\|aeval" services/analytics/ --include="*.py" 2>/dev/null | head -5
```

## Paso 7: Aislamiento Multi-tenant

```bash
# Verificar que las rutas de datos incluyen tenant_id
grep -r "tenant_id\|APPDATA" apps/desktop/src-tauri/ 2>/dev/null | head -10
# Verificar cifrado de credenciales
grep -r "AES\|encrypt\|cipher" apps/desktop/src-tauri/ 2>/dev/null | head -5
```

## Paso 8: Actualizar Memoria si se Encuentran Patrones

```bash
# Si se encuentra una clase de vulnerabilidad recurrente → agregar a lessons-learned.md
```

## Reporte de Seguridad

```
## Reporte de Seguridad — PyOrex

**Fecha**: [fecha]

### Hallazgos por Severidad

**CRÍTICO** (fix inmediato): [ninguno / lista]
**ALTO** (fix en este sprint): [ninguno / lista]
**MEDIO** (fix en próximo sprint): [ninguno / lista]
**BAJO / INFORMATIVO**: [ninguno / lista]

### Resumen Ejecutivo
[2-3 oraciones sobre el estado general de seguridad]

### Acciones Requeridas
1. [acción concreta con archivo y línea si aplica]
```

