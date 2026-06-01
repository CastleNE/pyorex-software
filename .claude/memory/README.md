# Sistema de Memoria — PyOrex

Los agentes leen y escriben aquí para acumular conocimiento entre sesiones.
Un agente sin memoria repite los mismos errores. Un agente con memoria aprende.

## Estructura

```
.claude/memory/
├── README.md              ← Este archivo
├── project-state.md       ← Estado actual (LEER SIEMPRE AL INICIAR UNA SESIÓN)
├── lessons-learned.md     ← Lecciones acumuladas — solo agregar, nunca editar
├── design-system.md       ← Patrones UI/UX aprobados
├── adrs/                  ← Architecture Decision Records
│   └── ADR-NNNN-*.md
└── domain/
    └── geochemistry.md    ← Conocimiento del dominio geoquímico industrial
```

## Protocolo de Uso

### Al INICIAR una sesión:
```bash
cat .claude/memory/project-state.md
# Si la tarea es arquitectónica, también:
ls .claude/memory/adrs/
cat .claude/memory/adrs/ADR-relevante.md
```

### Al TOMAR DECISIONES ARQUITECTÓNICAS:
1. Verificar si ya existe un ADR sobre el tema: `ls .claude/memory/adrs/`
2. Si no existe → crear `adrs/ADR-NNNN-nombre-corto.md`
3. Si existe → actualizar el ADR existente

### Al COMPLETAR trabajo significativo:
Actualizar `project-state.md` con lo que otro agente necesitaría saber.

### Al APRENDER algo valioso:
Agregar entrada al final de `lessons-learned.md` (nunca editar entradas existentes).

## Formato de ADR

```markdown
# ADR-NNNN: Título de la Decisión

**Estado**: Propuesto | Aceptado | Deprecado | Supersedido por ADR-XXXX
**Fecha**: YYYY-MM-DD
**Decidido por**: [agente o persona]

## Contexto
[Por qué esta decisión fue necesaria]

## Decisión
[Qué se decidió]

## Consecuencias
**Positivas**: [beneficios]
**Negativas**: [trade-offs aceptados]
**Riesgos**: [qué puede salir mal]

## Alternativas Consideradas
- [alternativa] → descartada porque [razón]
```

## Reglas de Mantenimiento

- **No borrar ADRs** — marcarlos como "Deprecado" o "Supersedido por ADR-XXXX"
- **project-state.md** — solo estado ACTUAL, no historia (la historia va en ADRs)
- **lessons-learned.md** — solo agregar al final, nunca editar entradas previas
- **geochemistry.md** — actualizar solo cuando un geoquímico confirme nueva información

