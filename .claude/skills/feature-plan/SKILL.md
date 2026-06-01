---
name: feature-plan
description: >
  Planifica e inicia el diseño completo de una nueva feature de PyOrex.
  Guía el proceso desde requisitos hasta diseño arquitectónico y estrategia de tests.
  Usar al inicio de cualquier feature significativa para asegurar que todos los
  especialistas la revisaron antes de implementar.
context: fork
allowed-tools: Bash(cat *), Bash(ls *), Bash(grep *)
---

# Feature Plan — PyOrex

Ejecuta un planning estructurado para una nueva feature.

## Paso 1: Contexto del Proyecto
```bash
cat .claude/memory/project-state.md
ls .claude/resources/ui-mockups/ 2>/dev/null && echo "Mockups disponibles" || echo "Sin mockups"
```

## Paso 2: Documento de la Feature

Completar antes de continuar:

```markdown
## Feature: [Nombre]

### Descripción
[Qué hace en 2-3 oraciones]

### Usuario objetivo
- [ ] Geoquímico de Campo (Usuario Principal)
- [ ] Analista de Producción
- [ ] Administrador de Tenant
- [ ] Desarrollador de Plugin

### Motivación
[Pain point que resuelve]

### Fuera del alcance de esta feature
[Qué NO hace — prevenir scope creep]

### Fase del roadmap
[Fase 0 / 1 / 2 / 3 / 4]
```

## Paso 3: User Stories con Criterios de Aceptación

Definir al menos:
- US principal (happy path)
- US de error/edge case principal
- Criterio de reproducibilidad si involucra análisis estadístico

Usar el formato del agent `product-manager`.

## Paso 4: Revisión Arquitectónica

Invocar `chief-architect` con:
- Descripción de la feature
- Módulos afectados
- Propuesta de diseño (si existe)

Preguntas que debe responder:
- ¿Es un plugin nuevo o extensión de uno existente?
- ¿Necesita nuevo contrato IPC? ¿Qué método y versión?
- ¿Afecta el Plugin API o el core?

## Paso 5: Revisión Estadística (si aplica)

Si la feature involucra análisis estadístico o ML, invocar `data-scientist`:
- ¿Qué algoritmos se necesitan?
- ¿Qué validaciones pre-análisis son obligatorias?
- ¿Qué métricas de calidad debe incluir el resultado?

## Paso 6: Diseño de Contratos IPC

Para cada nueva comunicación TypeScript → Python:
```json
{
  "method": "analytics.[feature-name]",
  "version": "v1",
  "path": "packages/ipc-contracts/[dominio]/[feature].v1.json",
  "request_fields": ["dataset_id", "variables", "..."],
  "response_fields": ["result_data", "quality_metrics", "warnings", "..."]
}
```

## Paso 7: Estrategia de Tests

Invocar `qa-architect` con los criterios de aceptación para definir:
- Contract tests necesarios
- Unit tests por módulo
- Escenario E2E principal (flujo del usuario)

## Paso 8: Documento de Diseño Final

```markdown
## Diseño: [Feature Name]

**Veredicto chief-architect**: ✅/⚠️/❌
**Veredicto data-scientist**: ✅/N/A
**ADR creado**: ADR-XXXX / ninguno

### IPC Contracts nuevos
- `[method.name].v1` → `ipc-contracts/[dominio]/[nombre].v1.json`

### Implementación por módulo
- **desktop-engineer**: [componentes y stores a crear]
- **python-engineer**: [endpoints y lógica Python]
- **plugin-architect**: [si se necesita nuevo plugin o capability]

### Estrategia de Tests
- Contract tests: [lista de schemas a validar]
- Unit tests críticos: [funciones/módulos clave]
- E2E scenario: [flujo del usuario a cubrir con Playwright]

### Definition of Done
- [ ] Contract tests verdes
- [ ] Unit tests > 80% coverage en lógica nueva
- [ ] E2E happy path verde
- [ ] ✅ de chief-architect
- [ ] ✅ de data-scientist (si aplica)
```

## Paso 9: Actualizar project-state.md

```bash
# Agregar la feature a la sección correspondiente de project-state.md
# con estado "En diseño" → "En desarrollo" → "Completado"
```

