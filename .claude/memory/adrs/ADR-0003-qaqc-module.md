# ADR-0003: Modulo QAQC como Plugin Core en Fase 1

**Estado**: Aceptado
**Fecha**: 2026-06-01
**Decidido por**: product-manager + chief-architect

## Contexto

El usuario identifico que PyOrex no tenia contemplado el Control de Calidad Analitico
(QAQC), que es una funcionalidad critica en el workflow geoquimico diario. Los
geoquimicos validan blancos, duplicados y CRMs en cada lote de analisis. Sin QAQC
integrado, el flujo vuelve a Excel para esta validacion.

ioGAS v7.3 (referencia) tiene rudimentos de QAQC en su "Data Doctor" pero no un modulo
dedicado con cartas de control, reglas de Westgard, ni integracion automatica con los
analisis estadisticos. Es una oportunidad de diferenciacion.

## Decision

1. **QAQC se implementa como plugin core** (`core-qaqc`) en Fase 1, junto al Data Manager
2. **Se integra en el wizard de importacion**: paso adicional para mapear tipos de muestra
3. **Los flags QAQC excluyen muestras automaticamente** de analisis multivariante
4. **Biblioteca de CRMs** es por tenant, reutilizable entre proyectos
5. **Contratos IPC**: `qaqc.calculate`, `qaqc.control_chart`, `qaqc.report`, `qaqc.crm_library.*`

## Consecuencias

**Positivas**:
- Diferenciador real vs ioGAS v7.3 — PyOrex tiene QAQC integrado, ioGAS no
- Cumple requerimientos JORC/NI43-101 para proyectos mineros
- Los analisis estadisticos son automaticamente mas confiables (muestras QAQC excluidas)
- Auditabilidad completa: cada analisis registra cuantas muestras QAQC fueron excluidas

**Negativas**:
- Aumenta la complejidad del wizard de importacion (1 paso adicional)
- Requiere que el usuario configure correctamente los tipos de muestra
- Si el usuario no tiene CRMs, el modulo opera solo con blancos y duplicados (subset de funcionalidad)

**Riesgos**:
- El emparejamiento automatico de duplicados puede fallar si el dataset no sigue convencion → mitigado con emparejamiento manual como fallback
- Los umbrales por defecto pueden no ser apropiados para todos los laboratorios → todos son configurables

## Especificacion Completa

Ver: docs/RF-10-QAQC.md
Ver: .claude/memory/domain/qaqc.md

## Plugin: core-qaqc

Capabilities: `data:read`, `data:write`, `analytics:read`, `ui:panel`, `reports:generate`

Modulo Python:
```
services/analytics/analysis/qaqc/
├── blanks.py          # blancos: deteccion contaminacion
├── duplicates.py      # duplicados: calculo %RPD, %RSD
├── crm.py             # CRM: calculo %Recovery
├── control_charts.py  # Shewhart + reglas Westgard
└── report.py          # reporte QAQC exportable
```
