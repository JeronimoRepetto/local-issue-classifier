# local-issue-classifier - one-click Kev launcher for Windows (docs/local-providers.md
# "One-click launcher"). Checks git, Python 3.12-3.13 and uv (offers to install uv
# with winget), clones jaredpalmer/kev into .\.local\kev when it is not there yet,
# runs `uv sync --extra serve` only when .venv is missing, installs the CUDA build
# of torch when an NVIDIA GPU is present and torch cannot see it, optionally the
# fast kernels, then starts the server with `uv run --no-sync`. Idempotent: a
# second run only starts the server.
#
#   powershell -ExecutionPolicy Bypass -File .\start-kev.ps1 [-Model kev-0.8b|kev-4b|kev-9b]
#       [-Port 8009] [-Dir .\.local\kev] [-FastKernels] [-DryRun]
#
# -DryRun prints the plan and runs nothing. Windows PowerShell 5.1-compatible on
# purpose: no pipeline-chain or null-coalescing operators, ASCII only. Keep the
# commands in sync with src/domain/localCommands.ts (kevCommands,
# CUDA_TORCH_INDEX_URL) and scripts/start-kev.sh.
#
# Test hooks (tests/launchers.test.ts): KEV_LAUNCHER_ASSUME_TOOLS (comma list of
# git, python, uv, nvidia-smi), KEV_LAUNCHER_ASSUME_PYTHON (a version, or "none")
# and KEV_LAUNCHER_ASSUME_CUDA ("true" or "false") replace the real detection.

[CmdletBinding()]
param(
    [string]$Model = 'kev-0.8b',
    [int]$Port = 8009,
    [string]$Dir = (Join-Path (Join-Path (Get-Location) '.local') 'kev'),
    [switch]$FastKernels,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$KevRepo = 'https://github.com/jaredpalmer/kev.git'
$CudaIndexUrl = 'https://download.pytorch.org/whl/cu130'
$Models = @('kev-0.8b', 'kev-4b', 'kev-9b')

$CloneCommand = "git clone $KevRepo"
$SyncCommand = 'uv sync --extra serve'
$CudaCommand = "uv pip install --python .venv torch torchvision --index-url $CudaIndexUrl"
$KernelsCommand = 'uv pip install --python .venv causal-conv1d flash-linear-attention'
$ServeCommand = "uv run --no-sync --extra serve python -m kev.serve --run jaredpalmer/$Model --port $Port"
$UvInstallCommand = 'winget install --id astral-sh.uv -e'

function Write-Step([string]$Tag, [string]$Text) {
    Write-Host ("[{0}] {1}" -f $Tag, $Text)
}

function Get-Assumed([string]$Name) {
    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrEmpty($value)) { return $null }
    return $value
}

function Test-Tool([string]$Name) {
    $assumed = Get-Assumed 'KEV_LAUNCHER_ASSUME_TOOLS'
    if ($null -ne $assumed) { return (($assumed -split ',') -contains $Name) }
    return ($null -ne (Get-Command $Name -ErrorAction SilentlyContinue))
}

function Get-PythonVersion {
    $assumed = Get-Assumed 'KEV_LAUNCHER_ASSUME_PYTHON'
    if ($null -ne $assumed) {
        if ($assumed -eq 'none') { return $null }
        return $assumed
    }
    $ErrorActionPreference = 'Continue'
    foreach ($candidate in @('py', 'python')) {
        if ($null -eq (Get-Command $candidate -ErrorAction SilentlyContinue)) { continue }
        try {
            $output = (& $candidate --version 2>&1 | Out-String)
            if ($output -match 'Python (\d+\.\d+(\.\d+)?)') { return $Matches[1] }
        } catch {
            continue
        }
    }
    return $null
}

function Test-SupportedPython([string]$Version) {
    return ($Version -match '^3\.(12|13)(\.|$)')
}

# Native tools write progress to stderr; in Windows PowerShell 5.1 a redirected
# stderr line becomes an error record, so these helpers relax the preference
# locally and check the exit code instead.
function Invoke-Native([string]$Command, [string]$WorkDir) {
    $ErrorActionPreference = 'Continue'
    Write-Host ">> $Command"
    Push-Location $WorkDir
    try {
        & cmd.exe /d /c $Command
        if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code ${LASTEXITCODE}: $Command" }
    } finally {
        Pop-Location
    }
}

function Test-TorchCuda([string]$KevDir) {
    $assumed = Get-Assumed 'KEV_LAUNCHER_ASSUME_CUDA'
    if ($null -ne $assumed) { return ($assumed -eq 'true') }
    $ErrorActionPreference = 'Continue'
    $python =Join-Path $KevDir '.venv\Scripts\python.exe'
    if (-not (Test-Path $python)) { return $false }
    & $python -c "import sys, torch; sys.exit(0 if torch.cuda.is_available() else 1)" 2>$null
    return ($LASTEXITCODE -eq 0)
}

if ($Models -notcontains $Model) {
    Write-Host "-Model must be kev-0.8b, kev-4b or kev-9b (got '$Model')."
    exit 2
}

Write-Host 'Kev launcher'
Write-Host ("  model: {0}  port: {1}  dir: {2}" -f $Model, $Port, $Dir)
if ($DryRun) { Write-Host 'Dry run: nothing will be run.' }

$cloned = (Test-Path (Join-Path $Dir '.git')) -or (Test-Path (Join-Path $Dir 'pyproject.toml'))
$synced = Test-Path (Join-Path $Dir '.venv')
$problems = 0

# git: only needed for the clone.
if (Test-Tool 'git') {
    Write-Step 'ok' 'git found'
} elseif ($cloned) {
    Write-Step 'ok' 'git not found, not needed: Kev is already cloned'
} else {
    Write-Step 'git' 'git is required to clone Kev. Install it with: winget install --id Git.Git -e'
    $problems++
}

# Python 3.12 or 3.13 (uv can also download a managed one for Kev's .venv).
$pythonVersion = Get-PythonVersion
if ($null -eq $pythonVersion) {
    Write-Step 'python' 'Python 3.12 or 3.13 not found; uv will download a managed Python for Kev.'
} elseif (Test-SupportedPython $pythonVersion) {
    Write-Step 'ok' "Python $pythonVersion found"
} else {
    Write-Step 'python' "Python $pythonVersion found, but Kev needs 3.12 or 3.13; uv will download a managed one."
}

# uv, installed after a prompt when missing.
if (Test-Tool 'uv') {
    Write-Step 'ok' 'uv found'
} elseif ($DryRun) {
    Write-Step 'uv' "uv is missing; would ask, then run: $UvInstallCommand"
} else {
    $answer = Read-Host "uv is not installed. Install it now with '$UvInstallCommand'? [y/N]"
    if ($answer -notmatch '^(y|yes)$') {
        Write-Step 'uv' "uv is required. Install it with: $UvInstallCommand"
        exit 1
    }
    Write-Step 'uv' $UvInstallCommand
    Invoke-Native $UvInstallCommand (Get-Location).Path
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}

if ($problems -gt 0) {
    if ($DryRun) {
        Write-Host 'Fix the items above before a real run.'
    } else {
        exit 1
    }
}

# Clone, once.
if ($cloned) {
    Write-Step 'skip' "clone: Kev is already in $Dir"
} else {
    Write-Step 'clone' "$CloneCommand `"$Dir`""
    if (-not $DryRun) {
        $parent = Split-Path -Parent $Dir
        if ($parent -and -not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent | Out-Null }
        & git clone $KevRepo $Dir
        if ($LASTEXITCODE -ne 0) { throw 'git clone failed' }
    }
}

# Sync, only when .venv is missing (a later `uv sync` would reinstall the CPU-only torch).
if ($synced) {
    Write-Step 'skip' 'sync: .venv already exists'
} else {
    Write-Step 'sync' $SyncCommand
    if (-not $DryRun) { Invoke-Native $SyncCommand $Dir }
}

# CUDA torch on an NVIDIA GPU (only the driver is needed; the wheels bundle the CUDA runtime).
if (-not (Test-Tool 'nvidia-smi')) {
    Write-Step 'skip' 'cuda: no NVIDIA GPU found (nvidia-smi); Kev runs on the CPU'
} elseif ($DryRun -and -not $synced -and $null -eq (Get-Assumed 'KEV_LAUNCHER_ASSUME_CUDA')) {
    # A fresh `uv sync` always installs the CPU-only build.
    Write-Step 'cuda' $CudaCommand
} elseif ($DryRun -and $null -eq (Get-Assumed 'KEV_LAUNCHER_ASSUME_CUDA')) {
    Write-Step 'cuda' "would check torch.cuda.is_available(); if false: $CudaCommand"
} elseif (Test-TorchCuda $Dir) {
    Write-Step 'skip' 'cuda: torch already sees the GPU'
} else {
    Write-Step 'cuda' $CudaCommand
    if (-not $DryRun) { Invoke-Native $CudaCommand $Dir }
}

# Optional fast kernels (Kev warns without them and uses slower ones).
if ($FastKernels) {
    Write-Step 'kernels' $KernelsCommand
    if (-not $DryRun) {
        try {
            Invoke-Native $KernelsCommand $Dir
        } catch {
            Write-Host 'The fast kernels did not install (they often need a build toolchain on Windows); Kev still runs with its slower kernels.'
        }
    }
} else {
    Write-Step 'skip' 'fast kernels: off (pass -FastKernels to install causal-conv1d and flash-linear-attention)'
}

Write-Step 'serve' $ServeCommand
if ($DryRun) { exit 0 }
Write-Host "Starting Kev on http://localhost:$Port - leave this window open; Ctrl+C stops it."
Invoke-Native $ServeCommand $Dir
