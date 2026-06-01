# Conocimiento del Dominio: Geoquímica Industrial

> Referencia para agentes en features analíticas.
> Actualizar solo cuando un geoquímico senior del sector confirme la información.
> Última actualización: 2026-06-01 — análisis de ioGAS v7.3 (referencia de competencia)

## Alcance del Dominio

PyOrex cubre **dos subdominios** de geoquímica industrial:

| Subdominio | Usuarios | Variables típicas | Referencia |
|-----------|----------|-------------------|------------|
| **O&G (Petróleo y Gas)** | Geoquímicos de producción | C1-C5, H2S, CO2, GOR, API, biomarcadores | PYOREX_SPECS_v2.md (foco actual) |
| **Geoquímica de Exploración/Minería** | Geoquímicos de exploración | SiO2, Al2O3, Fe2O3, CaO, MgO, elementos traza (Cu, Au, Zn...), REE | ioGAS v7.3 (referencia competencia) |

**Decisión pendiente (product-manager + chief-architect)**: ¿el MVP cubre solo O&G o también exploración minera?
Ver `.claude/resources/ui-mockups/Analysis.png` y `calculations.png` para ver el alcance de ioGAS.

---

## MÓDULO O&G: Índices Geoquímicos

### Biblioteca Estándar MVP (RF-04-TER)

| Índice | Fórmula | Interpretación | Aplicación |
|--------|---------|----------------|------------|
| Razón de Bernard | C1 / (C2 + C3) | > 1000: biogénico; < 100: termogénico | Origen del gas |
| Razón de humedad | (C2+C3+C4+C5) / C1 | < 5%: gas seco; > 5%: gas húmedo | Madurez del gas |
| iC4/nC4 | iC4 / nC4 | Indicador de madurez térmica | Madurez |
| iC5/nC5 | iC5 / nC5 | Origen y migración del gas | Origen |
| GOR | Qgas / Qoil | Gas-Oil Ratio | Caracterización yacimiento |
| API gravity | 141.5/SG - 131.5 | < 10: extra pesado; > 40: ligero | Clasificación crudo |
| Índice de Peng | C1 / (C1 + C2) | Tipo de sistema petrolero | Exploración |
| Ts/Tm | Ts / Tm | Biomarcadores de madurez térmica | Madurez |
| C2/C3 | C2 / C3 | Correlación de fluidos | Correlación |
| nC4/iC4 | nC4 / iC4 | Biodegradación | Alteración |

### Variables O&G Comunes

| Variable | Descripción | Unidades |
|----------|-------------|----------|
| C1, C2, C3, nC4, iC4, nC5, iC5 | Componentes del gas | % molar o ppm |
| CO2, N2, H2S | Gases no-hidrocarburo | % molar |
| SG | Specific Gravity del crudo | adimensional |
| Ts, Tm | Trisnorhopanos (biomarcadores) | ppm |
| Qgas, Qoil | Caudales de producción | MCF/d, BPD |

---

## MÓDULO EXPLORACIÓN/MINERÍA: Features de ioGAS (alcance futuro o MVP ampliado)

> Estas features están en el software de referencia ioGAS v7.3.
> Ver capturas en `.claude/resources/ui-mockups/` para detalles visuales.

### Índices de Alteración Hidrotermal (ioGAS → Calculation tab)
Vistos en `calculations.png`:
- ACNI Index
- Carbonate Alteration Index (CAI)
- Carbonate Carbonate Pyrite Index (CCPI)
- Chlorite Carbonate Pyrite Index (CCPF2, CCPF-Ferrous/Fe)
- Ishikawa Alteration Index (AI)
- MODI, Porphyry Index (MPIs), Muscovite Saturation Index (MSI)
- Feldspar Saturation Index (FSI), Potassium Sulphide Index (KSI)
- Potassium Volatile Index (KVI), Sericite Index (SRNI)
- Sodium Sulphide Index (SSI), Sodium Volatile Index (NVI)

### Spider/REE Diagrams (ioGAS → Spider tab)
Vistos en `spider.png` — diagramas multielementos normalizados a un estándar:

| Normalization Standard | Uso |
|------------------------|-----|
| **Chondrite** (Sun & McDonough 1989) | REE pattern — el más usado en petrología |
| **Primitive Mantle** | Comparación con composición mantélica |
| **MORB** (Mid-Ocean Ridge Basalt) | Ambiente tectónico oceánico |
| **OIB** (Ocean Island Basalt) | Vulcanismo intraplaca |
| **Upper/Lower Crust** | Composición cortical |
| **Sedimentary** (PAAS) | Rocas sedimentarias |
| **CRM** | Certificate Reference Materials |
| User-defined | Estándares personalizados |

**Implementación**: graficar log(elemento/estándar) vs elementos ordenados por número atómico.

### Diagramas de Clasificación de Rocas — IUGS (ioGAS → Diagram tab)
Vistos en `Diagram.png`:

| Diagrama | Clasificación |
|----------|--------------|
| **TAS** (Total Alkali Silica) | Rocas volcánicas (IUGS) |
| **QAPF** | Rocas plutónicas (IUGS) |
| **AFM** | Ambiente tectónico (Kuno) |
| **Jensen Plot** | Komatiitas/basaltos/andesitas |
| **Winchester & Floyd** | Discriminación tectónica (Nb/Y vs Zr/Y) |
| **Piper Diagram** | Agua (ya en spec PYOREX_SPECS_v2.md) |
| **Stiff Diagram** | Agua (ya en spec) |
| **Ternary** | Composición (ya en spec) |
| Major Elements / Trace Elements / Water Chemistry | Varios subdiagramas |

### Análisis Estructural (ioGAS → Structure tab)
Vistos en `Structure.png`:
- **Stereonet** — proyección estereográfica de datos estructurales (buzamiento, rumbo)
- **Rose Plot** — dirección preferencial de estructuras
- **Alpha-Beta Conversion** — conversión de ángulos en sondeos a coordenadas geográficas

### Análisis Avanzados (ioGAS → Analysis tab)
Vistos en `Analysis.png`:
- Statistics, Frequency, CrossTab, Correlation Matrix, Regression
- Centred Log Ratio (CLR) — transformación para datos composicionales
- Anomaly Assessment (DFA)
- **AutoClassing, CART, PCA, SOM, Clustering, t-SNE** — ML/estadística
- Wavelet Tessellation, Recurrence Plot

---

## Diagramas Geoquímicos O&G (ya en spec)

### Diagrama de Piper
- **Uso**: clasificación de agua de formación por iones mayoritarios
- **Variables**: Ca²⁺, Mg²⁺, Na⁺+K⁺ + HCO₃⁻+CO₃²⁻, SO₄²⁻, Cl⁻
- **Implementación**: `services/analytics/analysis/geochemical/diagrams.py`

### Diagrama de Stiff
- **Uso**: comparación visual de composición química de múltiples muestras de agua
- **Variables**: mismos iones que Piper

### Diagrama Ternario
- **Uso**: 3 componentes que sumen ~100% (ej. C1-C2-C3)

---

## Tipos de Valores Faltantes (RF-04-CUA)

| Tipo | Tratamiento |
|------|-------------|
| `BELOW_LOD` | Imputar con LOD/2 |
| `NOT_ANALYZED` | **Excluir muestra** |
| `MISSING` | Imputar con mediana |

Valores centinela comunes: -9999, -999, 0 (cuando no puede ser cero), "ND", "NA", "<LOD"

---

## Características Estadísticas de Datos de Campo

1. **Distribución log-normal** — frecuente en concentraciones → considerar transformación log antes de PCA
2. **Outliers genuinos e importantes** — en geoquímica un outlier puede ser la muestra más valiosa. NUNCA eliminar automáticamente. Siempre reportar al usuario.
3. **Unidades heterogéneas** — estandarización obligatoria antes de análisis multivariante
4. **LOD variable** — capturar LOD por columna en el wizard de importación
5. **Datos composicionales** — suman 100% → considerar CLR transform antes de PCA (para geoquímica de roca)

---

## Validaciones Estadísticas Obligatorias (RF-04)

| Test | Umbral | Si falla |
|------|--------|----------|
| Test de Bartlett (PCA/FA) | p < 0.05 | Alertar: correlaciones insuficientes |
| KMO (PCA/FA) | KMO > 0.5 | < 0.5: BLOQUEAR; 0.5-0.6: advertir |
| VIF (PCA/FA) | VIF < 10 | Alerta de multicolinealidad severa |
| Silueta promedio (K-means) | > 0.3 | Advertir: clustering débil |
| Coeficiente cofenético (jerárquico) | > 0.75 | Advertir: baja representatividad |
| Varianza explicada (FA) | > 70% | Recomendar ajuste de variables |

---

## Contexto del Sector

- **Software de referencia**: ioGAS v7.3 de IMDEX — ver capturas en `.claude/resources/ui-mockups/`
- **Usuarios**: geoquímicos con 5-15 años de experiencia, expertos en su dominio, moderados en informática
- **Pain point principal**: pasar datos entre Excel, SPSS/R, ioGAS y herramientas de graficado
- **Ambiente típico**: campo sin internet, Windows 10/11, 8-16 GB RAM
- **Volúmenes típicos**: 50-5000 muestras, 5-50 variables por dataset
- **Regulatorio**: análisis deben ser auditables con trazabilidad completa

