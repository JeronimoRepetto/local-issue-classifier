#!/bin/sh
# local-issue-classifier - one-click Kev launcher for macOS and Linux
# (docs/local-providers.md "One-click launcher"). Checks git, Python 3.12-3.13
# and uv (offers to install uv with its official installer), clones
# jaredpalmer/kev into ./.local/kev when it is not there yet, runs
# `uv sync --extra serve` only when .venv is missing, installs the CUDA build of
# torch when an NVIDIA GPU is present and torch cannot see it, optionally the
# fast kernels, then starts the server with `uv run --no-sync`. Idempotent: a
# second run only starts the server.
#
#   sh start-kev.sh [--model kev-0.8b|kev-4b|kev-9b] [--port 8009]
#       [--dir ./.local/kev] [--fast-kernels] [--dry-run]
#
# --dry-run prints the plan and runs nothing. POSIX sh on purpose (no bashisms).
# Keep the commands in sync with src/domain/localCommands.ts (kevCommands,
# CUDA_TORCH_INDEX_URL) and scripts/start-kev.ps1.
#
# Test hooks (tests/launchers.test.ts): KEV_LAUNCHER_ASSUME_TOOLS (comma list of
# git, python, uv, nvidia-smi), KEV_LAUNCHER_ASSUME_PYTHON (a version, or "none")
# and KEV_LAUNCHER_ASSUME_CUDA ("true" or "false") replace the real detection.
set -eu

KEV_REPO='https://github.com/jaredpalmer/kev.git'
CUDA_INDEX_URL='https://download.pytorch.org/whl/cu130'
UV_INSTALL='curl -LsSf https://astral.sh/uv/install.sh | sh'

model='kev-0.8b'
port='8009'
dir="$(pwd)/.local/kev"
fast_kernels=0
dry_run=0

usage() {
  echo 'Usage: sh start-kev.sh [--model kev-0.8b|kev-4b|kev-9b] [--port 8009] [--dir ./.local/kev] [--fast-kernels] [--dry-run]'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --model) model="${2:?--model needs a value}"; shift 2 ;;
    --port) port="${2:?--port needs a value}"; shift 2 ;;
    --dir) dir="${2:?--dir needs a value}"; shift 2 ;;
    --fast-kernels) fast_kernels=1; shift ;;
    --dry-run) dry_run=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 2 ;;
  esac
done

case "$model" in
  kev-0.8b|kev-4b|kev-9b) ;;
  *) echo "--model must be kev-0.8b, kev-4b or kev-9b (got '$model')."; exit 2 ;;
esac
case "$port" in
  ''|*[!0-9]*) echo "--port must be a number (got '$port')."; exit 2 ;;
esac

CLONE_CMD="git clone $KEV_REPO"
SYNC_CMD='uv sync --extra serve'
CUDA_CMD="uv pip install --python .venv torch torchvision --index-url $CUDA_INDEX_URL"
KERNELS_CMD='uv pip install --python .venv causal-conv1d flash-linear-attention'
SERVE_CMD="uv run --no-sync --extra serve python -m kev.serve --run jaredpalmer/$model --port $port"

step() {
  printf '[%s] %s\n' "$1" "$2"
}

has_tool() {
  if [ -n "${KEV_LAUNCHER_ASSUME_TOOLS:-}" ]; then
    case ",$KEV_LAUNCHER_ASSUME_TOOLS," in
      *",$1,"*) return 0 ;;
      *) return 1 ;;
    esac
  fi
  command -v "$1" >/dev/null 2>&1
}

python_version() {
  if [ -n "${KEV_LAUNCHER_ASSUME_PYTHON:-}" ]; then
    if [ "$KEV_LAUNCHER_ASSUME_PYTHON" != 'none' ]; then echo "$KEV_LAUNCHER_ASSUME_PYTHON"; fi
    return 0
  fi
  for candidate in python3 python; do
    if command -v "$candidate" >/dev/null 2>&1; then
      "$candidate" --version 2>&1 | sed -n 's/^Python \([0-9][0-9.]*\).*/\1/p' | head -n 1
      return 0
    fi
  done
}

torch_sees_cuda() {
  if [ -n "${KEV_LAUNCHER_ASSUME_CUDA:-}" ]; then
    [ "$KEV_LAUNCHER_ASSUME_CUDA" = 'true' ]
    return
  fi
  [ -x "$dir/.venv/bin/python" ] || return 1
  "$dir/.venv/bin/python" -c 'import sys, torch; sys.exit(0 if torch.cuda.is_available() else 1)' >/dev/null 2>&1
}

in_kev() {
  echo ">> $1"
  (cd "$dir" && sh -c "$1")
}

echo 'Kev launcher'
echo "  model: $model  port: $port  dir: $dir"
if [ "$dry_run" -eq 1 ]; then echo 'Dry run: nothing will be run.'; fi

cloned=0
if [ -d "$dir/.git" ] || [ -f "$dir/pyproject.toml" ]; then cloned=1; fi
synced=0
if [ -d "$dir/.venv" ]; then synced=1; fi
problems=0

# git: only needed for the clone.
if has_tool git; then
  step ok 'git found'
elif [ "$cloned" -eq 1 ]; then
  step ok 'git not found, not needed: Kev is already cloned'
else
  step git 'git is required to clone Kev. Install it with your package manager (e.g. brew install git, sudo apt install git).'
  problems=$((problems + 1))
fi

# Python 3.12 or 3.13 (uv can also download a managed one for Kev's .venv).
py_version="$(python_version)"
case "$py_version" in
  '') step python 'Python 3.12 or 3.13 not found; uv will download a managed Python for Kev.' ;;
  3.12|3.12.*|3.13|3.13.*) step ok "Python $py_version found" ;;
  *) step python "Python $py_version found, but Kev needs 3.12 or 3.13; uv will download a managed one." ;;
esac

# uv, installed after a prompt when missing.
if has_tool uv; then
  step ok 'uv found'
elif [ "$dry_run" -eq 1 ]; then
  step uv "uv is missing; would ask, then run: $UV_INSTALL"
else
  printf 'uv is not installed. Install it now with "%s"? [y/N] ' "$UV_INSTALL"
  read -r answer || answer=''
  case "$answer" in
    y|Y|yes|YES) ;;
    *) step uv "uv is required. Install it with: $UV_INSTALL"; exit 1 ;;
  esac
  step uv "$UV_INSTALL"
  sh -c "$UV_INSTALL"
  PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
  export PATH
fi

if [ "$problems" -gt 0 ]; then
  if [ "$dry_run" -eq 1 ]; then echo 'Fix the items above before a real run.'; else exit 1; fi
fi

# Clone, once.
if [ "$cloned" -eq 1 ]; then
  step skip "clone: Kev is already in $dir"
else
  step clone "$CLONE_CMD \"$dir\""
  if [ "$dry_run" -eq 0 ]; then
    mkdir -p "$(dirname "$dir")"
    git clone "$KEV_REPO" "$dir"
  fi
fi

# Sync, only when .venv is missing (a later `uv sync` would reinstall the CPU-only torch).
if [ "$synced" -eq 1 ]; then
  step skip 'sync: .venv already exists'
else
  step sync "$SYNC_CMD"
  if [ "$dry_run" -eq 0 ]; then in_kev "$SYNC_CMD"; fi
fi

# CUDA torch on an NVIDIA GPU (only the driver is needed; the wheels bundle the
# CUDA runtime). macOS has no nvidia-smi: Apple Silicon uses Metal (MPS) as is.
if ! has_tool nvidia-smi; then
  step skip 'cuda: no NVIDIA GPU found (nvidia-smi); Kev runs on the CPU, or on Metal on Apple Silicon'
elif [ "$dry_run" -eq 1 ] && [ "$synced" -eq 0 ] && [ -z "${KEV_LAUNCHER_ASSUME_CUDA:-}" ]; then
  # A fresh `uv sync` always installs the CPU-only build.
  step cuda "$CUDA_CMD"
elif [ "$dry_run" -eq 1 ] && [ -z "${KEV_LAUNCHER_ASSUME_CUDA:-}" ]; then
  step cuda "would check torch.cuda.is_available(); if false: $CUDA_CMD"
elif torch_sees_cuda; then
  step skip 'cuda: torch already sees the GPU'
else
  step cuda "$CUDA_CMD"
  if [ "$dry_run" -eq 0 ]; then in_kev "$CUDA_CMD"; fi
fi

# Optional fast kernels (Kev warns without them and uses slower ones).
if [ "$fast_kernels" -eq 1 ]; then
  step kernels "$KERNELS_CMD"
  if [ "$dry_run" -eq 0 ]; then
    in_kev "$KERNELS_CMD" || echo 'The fast kernels did not install; Kev still runs with its slower kernels.'
  fi
else
  step skip 'fast kernels: off (pass --fast-kernels to install causal-conv1d and flash-linear-attention)'
fi

step serve "$SERVE_CMD"
if [ "$dry_run" -eq 1 ]; then exit 0; fi
echo "Starting Kev on http://localhost:$port - leave this terminal open; Ctrl+C stops it."
cd "$dir"
exec sh -c "$SERVE_CMD"
