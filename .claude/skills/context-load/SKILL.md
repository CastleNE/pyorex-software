---
name: context-load
description: >
  Carga el contexto completo del proyecto en la sesión actual. Usar al inicio de
  una sesión larga de trabajo, antes de una revisión arquitectónica importante,
  o cuando quieras asegurarte de que el agente tiene todo el contexto necesario
  para tomar buenas decisiones.
context: fork
allowed-tools: Bash(cat *), Bash(ls *), Bash(head *), Bash(tail *), Bash(grep *)
---

# Context Load — PyOrex

Carga completa del contexto del proyecto para una sesión de trabajo productiva.

## Paso 1: Constitución y Estado Actual
```bash
cat CLAUDE.md
echo "---"
cat .claude/memory/project-state.md
```

## Paso 2: Lecciones Aprendidas Recientes
```bash
tail -60 .claude/memory/lessons-learned.md
```

## Paso 3: ADRs Activos
```bash
ls .claude/memory/adrs/
for f in .claude/memory/adrs/*.md; do
  echo "=== $f ==="
  head -8 "$f"
  echo ""
done
```

## Paso 4: Recursos Visuales Disponibles
```bash
ls .claude/resources/ui-mockups/ 2>/dev/null && echo "Mockups UI disponibles" || echo "Sin mockups aún"
ls .claude/resources/architecture/ 2>/dev/null && echo "Diagramas disponibles" || echo "Sin diagramas"
```

## Paso 5: Resumen de la Especificación del Producto
```bash
grep -n "^## " PYOREX_SPECS_v2.md | head -20
echo ""
echo "--- Criterios del MVP (Sección 13) ---"
grep -A 30 "^## 13\." PYOREX_SPECS_v2.md | head -35
```

## Reporte Final

Generar un resumen conciso:

```
## Contexto Cargado — PyOrex

**Fecha de sesión**: [fecha actual]
**Fase actual del proyecto**: [leer de project-state.md]
**Prioridades activas**: [leer de project-state.md]
**Bloqueos/riesgos activos**: [leer de project-state.md]
**Decisiones recientes**: [ADRs — estados y fechas]
**Recursos visuales**: [disponibles / no disponibles]

**Equipo disponible**:
- orchestrator (opus) — coordinador maestro
- chief-architect (opus) — gobernanza arquitectónica
- product-manager, plugin-architect, desktop-engineer,
  python-engineer, data-scientist, qa-architect (sonnet)

**Skills disponibles**:
- /arch-review, /security-review, /release-check
- /feature-plan, /context-load

**Listo para trabajar en**: [basado en fase y prioridades actuales]
```

