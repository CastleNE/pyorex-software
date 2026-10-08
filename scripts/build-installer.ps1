# build-installer.ps1 -- PyOreX: genera el instalador de Windows (.exe, NSIS)
# Requisitos: haber corrido scripts\setup.ps1 una vez (Node, pnpm, Rust, VS Build Tools, Python 3.12 + .venv).
# Uso (desde la raiz del repo):  powershell -ExecutionPolicy Bypass -File scripts\build-installer.ps1
# Opciones: -SkipTests  (no corre pytest/vitest)
param([switch]$SkipTests)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Step($n, $text) { Write-Host ""; Write-Host "[$n] $text" -ForegroundColor Yellow }
function Ok($text) { Write-Host "  [OK] $text" -ForegroundColor Green }

$py = Join-Path $root "services\analytics\.venv\Scripts\python.exe"
if (-not (Test-Path $py)) { throw "No existe services\analytics\.venv. Corre primero scripts\setup.ps1" }

Step "1/6" "Dependencias del motor (Python)"
Push-Location "services\analytics"
& $py -m pip install --upgrade pip --quiet
& $py -m pip install -e ".[dev]" pyinstaller --quiet
Ok "pip install"
Pop-Location

if (-not $SkipTests) {
  Step "2/6" "Pruebas (pytest y vitest)"
  Push-Location "services\analytics"; & $py -m pytest -q; if ($LASTEXITCODE -ne 0) { throw "pytest fallo" }; Pop-Location
  pnpm install
  pnpm --filter @pyorex/desktop exec vitest run; if ($LASTEXITCODE -ne 0) { throw "vitest fallo" }
  Ok "pruebas"
} else { Step "2/6" "Pruebas omitidas (-SkipTests)"; pnpm install }

Step "3/6" "Empaquetando el motor con PyInstaller"
Push-Location "services\analytics"
if (Test-Path "build") { Remove-Item -Recurse -Force "build" }
if (Test-Path "dist\pyorex-engine") { Remove-Item -Recurse -Force "dist\pyorex-engine" }
& $py -m PyInstaller pyorex-engine.spec --noconfirm
if ($LASTEXITCODE -ne 0) { throw "PyInstaller fallo" }
$engine = Join-Path (Get-Location) "dist\pyorex-engine\pyorex-engine.exe"
& $engine --check --data-dir (Join-Path $env:TEMP "pyorex-check")
if ($LASTEXITCODE -ne 0) { throw "El motor empaquetado no arranca (--check)" }
Ok "motor en dist\pyorex-engine"

Step "4/6" "Prueba de humo del motor empaquetado"
& $py scripts\smoke_engine.py $engine
if ($LASTEXITCODE -ne 0) { throw "La prueba de humo del motor fallo" }
Pop-Location
Ok "importar, perfil, TAS, mapa + IDW, seccion + DEM"

Step "5/6" "Construyendo la app de escritorio e instalador (Tauri + NSIS)"
pnpm --filter @pyorex/desktop exec tauri build
if ($LASTEXITCODE -ne 0) { throw "tauri build fallo" }

Step "6/6" "Listo"
$out = Get-ChildItem "apps\desktop\src-tauri\target\release\bundle\nsis\*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Write-Host ""
Write-Host "Instalador: $($out.FullName)" -ForegroundColor Cyan
Write-Host ("Tamano: {0:N0} MB" -f ($out.Length / 1MB))
Write-Host "Nota: sin firma digital, Windows SmartScreen mostrara 'Editor desconocido' (Mas informacion -> Ejecutar de todas formas)."
explorer.exe (Split-Path $out.FullName)
