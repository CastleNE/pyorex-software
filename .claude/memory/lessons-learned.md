# Lecciones Aprendidas — PyOrex

> Solo agregar entradas al final. Nunca editar entradas existentes.
> Formato: ## YYYY-MM-DD — [Contexto breve]

---

## Formato de Entrada

```
## YYYY-MM-DD — [Contexto]

**Situación**: [qué pasó o qué se intentó]
**Lección**: [qué se aprendió]
**Cómo aplicar**: [en qué situaciones futuras ayuda esta lección]
**Agente que la registró**: [nombre del agente]
```

---

## 2026-06-01 — Setup inicial del equipo de agentes

**Situación**: Primera configuración del stack de agentes Claude Code para PyOrex.
Se revisó la especificación técnica RF-04* del motor estadístico.

**Lección**: Los requerimientos estadísticos del motor analítico (KMO, Bartlett, MinCovDet,
cofenético, etc.) son demasiado especializados para que un ingeniero de software genérico
los implemente correctamente. Un agente `data-scientist` dedicado es esencial para este proyecto.

**Cómo aplicar**: Siempre invocar `data-scientist` ANTES de que `python-engineer` implemente
cualquier algoritmo estadístico. La especificación estadística debe estar definida primero.

**Agente**: orchestrator

---

## 2026-06-01 — Configuracion de entorno Windows para Tauri

**Situación**: Setup del stack de desarrollo en Windows 11. Varios problemas encontrados y resueltos.

**Lección 1 — Encoding en PowerShell 5.1**: Scripts .ps1 guardados en UTF-8 sin BOM son leídos como Windows-1252. El byte 0x93 (tercer byte de ✓ en UTF-8) es U+201C en Windows-1252 (comilla tipográfica), lo que rompe los delimitadores de strings. **Solución**: usar solo ASCII en scripts .ps1 para PowerShell 5.1.

**Lección 2 — Execution Policy**: `pnpm.ps1` requiere que la política de ejecución permita scripts locales. Solución: `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`. El cambio aplica a nuevas terminales, no a la terminal actual.

**Lección 3 — Tauri requiere íconos para compilar en Windows**: El build script de tauri-build falla si no existe `icons/icon.ico`. Se puede generar con PowerShell + System.Drawing para desarrollo. Para producción usar `pnpm tauri icon source.png`.

**Lección 4 — Primera compilación Rust tarda ~5 minutos**: Compilar todas las dependencias de Tauri (webview2, wry, tao, etc.) tarda la primera vez. Las siguientes son incrementales y rápidas. No es un error.

**Cómo aplicar**: Documentar estos pasos en el onboarding de nuevos desarrolladores. El script setup.ps1 ya los automatiza.

**Agente**: orchestrator

---

## 2026-06-01 — Análisis del software de referencia ioGAS v7.3

**Situación**: El usuario subió 12 capturas de ioGAS v7.3 (IMDEX) a `.claude/resources/ui-mockups/`.
Incluye capturas de todos los módulos: Home, File, Data, Analysis, Calculation, Graph, Diagram, Structure, Map, Spider, Help, más una versión dark-theme modernizada.

**Lección 1 — Gap de dominio**: El spec actual (PYOREX_SPECS_v2.md) cubre O&G geoquímica pero ioGAS v7.3 cubre también geoquímica de exploración/minería con features adicionales críticas: Spider/REE diagrams, Rock Classification (IUGS), Structural Analysis, índices de alteración hidrotermal. El alcance del MVP debe clarificarse.

**Lección 2 — UI layout**: La versión dark-theme modernizada (la captura más valiosa) muestra claramente el layout objetivo: split view (tabla izquierda 35% / visualización derecha 65%), Quick Stats en footer del panel de datos, tab bar para cambiar tipo de vista. Este patrón está documentado en design-system.md.

**Lección 3 — Diferenciadores vs competencia**: ioGAS tiene ribbon UI clásico de Windows y flujo de trabajo fragmentado. La oportunidad de PyOrex es: arquitectura moderna (Tauri vs Win32), análisis con validación estadística automática (algo que ioGAS NO hace), plugin system abierto, y el layout modernizado.

**Cómo aplicar**: Antes de implementar cualquier pantalla o feature analítica, revisar si ioGAS ya tiene esa feature (validación del mercado) y si hay una versión más moderna/mejor en la captura dark-theme. Desktop-engineer debe leer `resources/ui-mockups/Captura de pantalla 2026-06-01 150132.png` antes de diseñar cualquier componente de layout.

**Agente**: orchestrator

---

## 2026-06-04 — Patrones de orquestación multi-agente: repo affaan-m/ecc

**Situación**: Se revisó el repo https://github.com/affaan-m/ecc (Everything Claude Code — 63 agentes, 251 skills, 79 comandos). Se extrajeron patrones aplicables a PyOrex.

**Lección 1 — PreCompact hook para memoria automática**: Claude Code soporta un hook `PreCompact` cuya salida se inyecta en el prompt de compactación. Configurado en `.claude/settings.json`, permite que el estado del proyecto sobreviva la compactación automáticamente. Implementar leyendo `project-state.md` en el hook.

**Lección 2 — Contextos por modo de trabajo**: ECC usa `.claude/contexts/` con archivos específicos por modo (dev.md, research.md, review.md). Aplicado a PyOrex: `analytics-mode.md` y `qaqc-mode.md` creados. Cargar el contexto del modo antes de trabajar en esa área — evita tener que re-explicar reglas del dominio.

**Lección 3 — No usar instrucciones negativas**: Agregar pases de limpieza separados en lugar de instrucciones como "no hagas X". Un agente separado de cleanup (de-sloppify) que nunca escribió el código original elimina el sesgo del autor. Aplicar: después de implementar una feature, invocar un pase de revisión con contexto limpio.

**Lección 4 — Compactación manual en hitos, no automática**: No dejar que la compactación ocurra a mitad de una sesión de debugging. Hacer `/compact` manualmente al terminar una subfase o antes de empezar algo nuevo. La compactación a mitad de trabajo puede perder contexto crítico de errores activos.

**Lección 5 — Separar implementador de revisor**: El agente que implementa nunca debe ser el mismo que revisa. En PyOrex: `python-engineer` implementa → `data-scientist` valida la corrección estadística → `qa-architect` revisa calidad. Contextos separados eliminan el sesgo.

**Lección 6 — Pipeline secuencial para features complejas**: Para features de análisis, el patrón es:
```
data-scientist (especificación) → python-engineer (implementación) → data-scientist (validación) → qa-architect (tests)
```
Cada agente opera con contexto fresco, no hereda el contexto del anterior.

**Cómo aplicar**:
- Al iniciar trabajo en analytics/qaqc: cargar `.claude/contexts/analytics-mode.md` o `qaqc-mode.md`
- Al terminar una subfase: hacer `/compact` manual antes de la siguiente
- Features estadísticas: SIEMPRE consultar data-scientist antes de que python-engineer implemente

**Agente**: orchestrator

---

## 2026-06-03 — Integración de repo científico externo: k-dense-ai/scientific-agent-skills

**Situación**: El usuario compartió el repo https://github.com/k-dense-ai/scientific-agent-skills (142 skills MIT para agentes científicos). Se revisó y extrajeron patrones útiles para el motor analítico de PyOrex.

**Lección 1 — pingouin sobre scipy para tests estadísticos**: pingouin calcula effect sizes (Cohen's d, η², r) y 95% CI automáticamente en cada test. Para reportes geoquímicos auditables, esto es obligatorio. scipy.stats solo da p-value — insuficiente para análisis científico riguroso.

**Lección 2 — Okabe-Ito como paleta estándar**: La paleta Okabe-Ito (`#E69F00, #56B4E9, #009E73, ...`) es el estándar colorblind-safe para publicaciones científicas. Nunca usar jet/rainbow en datos geoquímicos.

**Lección 3 — Polars lazy por defecto para datasets > 10k filas**: `scan_parquet` + chain de expresiones + `.collect()` al final es 10-100x más rápido que eager. El patrón está documentado en python-engineer.md.

**Lección 4 — pyproject.toml debe declarar todo lo instalado**: En esta sesión se descubrió que pingouin, matplotlib y seaborn habían sido instalados en el venv pero NO declarados en pyproject.toml. Si alguien hace `pip install -e .` desde cero, pierde esas dependencias. Regla: toda instalación manual debe ir seguida de actualizar pyproject.toml.

**Cómo aplicar**: 
- Antes de implementar análisis estadístico → usar pingouin
- Al instalar un paquete nuevo → actualizar pyproject.toml en la misma sesión
- Skills más útiles del repo para PyOrex: statistical-analysis, statsmodels, scikit-learn, exploratory-data-analysis, geomaster

**Agente**: orchestrator

---

## 2026-07-14 — Verificar UI de Tauri sin compilar Rust, y trampa de PowerShell background jobs

**Situación**: Se necesitaba verificar visualmente un cambio de navegación en `apps/desktop/src`
en una máquina nueva sin Node/Rust instalados. Compilar Tauri completo (`pnpm dev`) tarda
~5 min la primera vez (ver lección de 2026-06-01). Además, `Start-Job` de PowerShell
lanzado desde una tool call moría apenas terminaba esa tool call — el proceso hijo no
sobrevive al proceso padre que lo lanzó.

**Lección 1 — Verificar UI sin Tauri**: `pnpm --filter @pyorex/desktop vite:dev` levanta
solo Vite (sin Rust) y sirve la misma UI en `http://localhost:5173`. Para features que
son puramente de frontend (no dependen de comandos Tauri nativos), esto es suficiente y
~20x más rápido que `pnpm dev`.

**Lección 2 — Screenshot sin instalar nada**: Microsoft Edge ya viene instalado en
Windows 10/11. `msedge.exe --headless=new --disable-gpu --window-size=1440,900
--screenshot=out.png http://localhost:5173/` genera un PNG del render real sin necesidad
de instalar Playwright/Puppeteer ni descargar Chromium (~150MB). Útil para verificación
visual rápida en cualquier máquina Windows.

**Lección 3 — `Start-Job` no sirve para procesos de larga duración desde tool calls**:
cada llamada a la herramienta PowerShell es un proceso nuevo; un `Start-Job` lanzado ahí
muere cuando esa llamada termina. Para dejar un servidor corriendo entre llamadas, usar
`Start-Process` con un proceso verdaderamente desacoplado (ej. `cmd.exe /c pnpm ...`
con `-WindowStyle Hidden` y `-RedirectStandardOutput/-RedirectStandardError` a archivos de
log) — y recordar que `Start-Process -FilePath` debe apuntar a un `.exe` real: los shims
de `pnpm`/`npm` en Windows son `.cmd`, no ejecutables Win32 válidos para `-FilePath`
directo, hay que envolverlos en `cmd.exe /c`.

**Lección 4 — Verificar múltiples estados de una SPA sin navegación por URL**: si el nav
activo vive en un store (Zustand) sin reflejarse en la URL, se puede editar temporalmente
el valor default del store, dejar que Vite HMR recompile, y tomar el screenshot — cada
invocación de Edge headless es un proceso nuevo que re-lee el store desde cero, así que
no hace falta simular clicks. Revertir el default al terminar.

**Cómo aplicar**: para cualquier cambio de UI en `apps/desktop` que no toque código Rust,
usar `vite:dev` + Edge headless como ciclo de verificación rápido antes de pedir un
`pnpm dev` completo.

**Agente**: desktop-engineer

---

## 2026-06-01 — Diseño del sistema de memoria

**Situación**: Se evaluó cómo hacer que los agentes "aprendan" entre sesiones en Claude Code.

**Lección**: Los agentes de Claude Code no tienen memoria nativa entre sesiones. La memoria
debe implementarse como archivos que los agentes lean y escriban explícitamente. El valor
está en que los agentes tienen instrucciones EXPLÍCITAS de leer estos archivos al iniciar —
sin esa instrucción, la memoria no se usa.

**Cómo aplicar**: Todo agente nuevo debe tener un "Protocolo de Memoria" con instrucciones
concretas de qué archivos leer al iniciar y cuándo escribir. Sin esa sección, el sistema
de memoria no funciona.

**Agente**: orchestrator

