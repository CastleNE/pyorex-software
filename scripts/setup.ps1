# setup.ps1 -- PyOrex: instala todas las dependencias de desarrollo
# Ejecutar una sola vez en una nueva maquina Windows 10/11
# Uso: powershell -ExecutionPolicy Bypass -File scripts\setup.ps1

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PyOrex -- Setup de Desarrollo  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# -- 1. Node.js LTS -----------------------------------------------------------
Write-Host "[1/8] Verificando Node.js..." -ForegroundColor Yellow
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "  Instalando Node.js LTS via winget..." -ForegroundColor Gray
    winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
    Write-Host "  [OK] Node.js instalado" -ForegroundColor Green
} else {
    Write-Host "  [OK] Node.js ya instalado: $(node --version)" -ForegroundColor Green
}

# -- 2. pnpm ------------------------------------------------------------------
Write-Host "[2/8] Verificando pnpm..." -ForegroundColor Yellow
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "  Instalando pnpm..." -ForegroundColor Gray
    npm install -g pnpm
    Write-Host "  [OK] pnpm instalado" -ForegroundColor Green
} else {
    Write-Host "  [OK] pnpm ya instalado: $(pnpm --version)" -ForegroundColor Green
}

# -- 3. Rust (rustup) ---------------------------------------------------------
Write-Host "[3/8] Verificando Rust..." -ForegroundColor Yellow
if (-not (Get-Command rustc -ErrorAction SilentlyContinue)) {
    Write-Host "  Instalando Rust via winget (rustup)..." -ForegroundColor Gray
    winget install Rustlang.Rustup --silent --accept-package-agreements --accept-source-agreements
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
    & "$env:USERPROFILE\.cargo\bin\rustup" toolchain install stable
    Write-Host "  [OK] Rust instalado" -ForegroundColor Green
} else {
    Write-Host "  [OK] Rust ya instalado: $(rustc --version)" -ForegroundColor Green
}

# -- 4. Visual Studio Build Tools (requerido por Tauri en Windows) ------------
Write-Host "[4/8] Verificando Visual Studio Build Tools..." -ForegroundColor Yellow
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (-not (Test-Path $vswhere)) {
    Write-Host "  Instalando VS Build Tools (puede tardar varios minutos)..." -ForegroundColor Gray
    winget install Microsoft.VisualStudio.2022.BuildTools --silent `
        --override "--wait --quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended" `
        --accept-package-agreements --accept-source-agreements
    Write-Host "  [OK] VS Build Tools instalado" -ForegroundColor Green
} else {
    Write-Host "  [OK] VS Build Tools ya disponible" -ForegroundColor Green
}

# -- 5. Python 3.12 -----------------------------------------------------------
Write-Host "[5/8] Verificando Python 3.12+..." -ForegroundColor Yellow
$pythonCmd = $null
foreach ($cmd in @("python3.12", "python3", "python")) {
    try {
        $ver = & $cmd --version 2>$null
        if ($ver -match "3\.(1[2-9]|[2-9]\d)") {
            $pythonCmd = $cmd
            break
        }
    } catch { }
}

if (-not $pythonCmd) {
    Write-Host "  Instalando Python 3.12 via winget..." -ForegroundColor Gray
    winget install Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
    $pythonCmd = "python"
    Write-Host "  [OK] Python 3.12 instalado" -ForegroundColor Green
} else {
    Write-Host "  [OK] Python ya instalado: $(& $pythonCmd --version)" -ForegroundColor Green
}

# -- 6. Entorno virtual Python ------------------------------------------------
Write-Host "[6/8] Configurando entorno Python para analytics service..." -ForegroundColor Yellow
Push-Location "services\analytics"
if (-not (Test-Path ".venv")) {
    & $pythonCmd -m venv .venv
}
& ".venv\Scripts\python.exe" -m pip install --upgrade pip --quiet
& ".venv\Scripts\pip.exe" install -e ".[dev]" --quiet
Write-Host "  [OK] Entorno Python configurado" -ForegroundColor Green
Pop-Location

# -- 7. Node dependencies (pnpm install) --------------------------------------
Write-Host "[7/8] Instalando dependencias Node.js..." -ForegroundColor Yellow
pnpm install
Write-Host "  [OK] Dependencias Node.js instaladas" -ForegroundColor Green

# -- 8. Tauri CLI global -------------------------------------------------------
Write-Host "[8/8] Verificando Tauri CLI..." -ForegroundColor Yellow
if (-not (Get-Command tauri -ErrorAction SilentlyContinue)) {
    cargo install tauri-cli --version "^2.0" --locked
    Write-Host "  [OK] Tauri CLI instalado" -ForegroundColor Green
} else {
    Write-Host "  [OK] Tauri CLI ya disponible" -ForegroundColor Green
}

# -- Resumen ------------------------------------------------------------------
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Setup completado exitosamente         " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Proximos pasos (abrir una nueva terminal primero):" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Terminal 1 -- Tauri + Vite:"
Write-Host "    pnpm dev"
Write-Host ""
Write-Host "  Terminal 2 -- Python analytics service:"
Write-Host "    cd services\analytics"
Write-Host "    .venv\Scripts\python -m uvicorn app.main:app --port 5174 --reload"
Write-Host ""
