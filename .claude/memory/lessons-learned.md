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

