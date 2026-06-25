# Contexto: Modo QAQC

Cargar este archivo cuando se trabaje en el Plugin QAQC (ADR-0003).

## Objetivo del Plugin QAQC
Implementar control de calidad analítico: blancos, duplicados (%RPD), materiales de referencia certificados (%Recovery), y cartas de control Shewhart.

## Tipos de muestra QAQC (del ImportWizard)
- SAMP: muestra real
- BLANK: blanco de campo/laboratorio (verifica contaminacion)
- DUP: duplicado (verifica precision -> %RPD)
- STD/CRM: material de referencia certificado (verifica exactitud -> %Recovery)
- SPIKE: muestra adicionada

## Formulas clave
# %RPD: abs(a - b) / ((a + b) / 2) * 100
# %Recovery: (measured / certified) * 100
# Shewhart UCL = mean + 3*std | LCL = mean - 3*std

## Criterios de aceptacion (configurables)
- %RPD < 20% -> aceptable
- %Recovery 85-115% -> aceptable; 70-130% -> advertencia
- Blancos < LOD -> aceptable

## Reglas
- Los flags QAQC nunca bloquean la importacion, solo generan alertas
- Cada dataset con tipos QAQC genera reporte automatico
- Los flags se persisten en metadatos del dataset (Parquet + JSON)

## ADR de referencia: .claude/memory/adrs/ADR-0003-qaqc-module.md
## Rutas relevantes
- apps/desktop/src/components/ImportWizard.tsx (paso Sample Type)
- services/analytics/analysis/data/storage.py
- services/analytics/app/routers/rpc.py
