# ADR-0007: Sistema de diseño PyOrex v2 — tokens, temas e IBM Plex

**Estado**: Aceptado
**Fecha**: 2026-10-05
**Decidido por**: usuario (product owner) con desktop-engineer

## Contexto

La UI usaba clases Tailwind de color fijas (zinc / blue / sky, ~1 500 usos), solo tema oscuro, fuente del sistema y emoji como íconos. Los gráficos Plotly tenían la paleta oscura escrita a mano en cada componente. Se definió un sistema de diseño (identidad del logo: azul pizarra #2e4357 + teal #21baa0) con tema claro y oscuro, tipografía técnica, íconos propios y paletas de datos (Okabe–Ito, viridis, minerales de alteración).

## Decisión

1. **Tokens en `globals.css` (`@theme` de Tailwind 4)** con dos capas:
   - Semánticos (`bg-app`, `bg-panel`, `text-fg`, `text-muted`, `border-line`, `bg-accent-strong`, `text-warning`, `bg-min-illite`…), obligatorios en código nuevo.
   - **Alias transicionales**: las escalas `zinc`, `blue`, `sky`, `red`, `amber`, `emerald` se redefinen como variables de la paleta PyOrex que cambian con el tema. Así toda la app adopta el sistema y el tema claro sin reescribir cada componente.
2. **Tema oscuro por defecto**, claro opcional (`<html data-theme="light">`), persistido en `localStorage` y aplicado antes del primer render.
3. **IBM Plex Sans / Mono empaquetadas** en `src/assets/fonts` (offline-first, OFL).
4. **`ThemedPlot`** reemplaza la importación directa de `react-plotly.js`: resuelve los colores de los tokens y reescribe la paleta oscura antigua, sin tocar los builders ni sus tests de caracterización.
5. **`PxIcon`**: set de íconos SVG propio; las ventanas aceptan nombres de ícono.
6. **Espectrometría** es el primer módulo migrado por completo y sirve de referencia.

## Consecuencias

**Positivas**: un solo lugar para el color; tema claro para informes y proyector; exportaciones Plotly siguen el tema; contraste AA verificado en ambos temas; estado de los datos con colores semánticos coherentes.

**Negativas / deuda**:
- Los alias hacen que `bg-blue-600` ya no sea azul (es el teal de la marca). Es intencional pero sorprende: documentado en `design-system.md`. Hay que retirarlos migrando módulo por módulo.
- Las clases `text-white` sobre fondos neutros no cambian con el tema; revisar al migrar cada pantalla.
- El bundle crece unos 140 KB por las fuentes.

## Alternativas consideradas

- **Reescribir todas las clases a tokens de una vez**: demasiado riesgo y conflicto con trabajo en curso en Geoquímica.
- **Fuentes desde Google Fonts**: descartado por offline-first.
- **CSS variables directamente en Plotly**: Plotly no resuelve `var()`; de ahí ThemedPlot.
