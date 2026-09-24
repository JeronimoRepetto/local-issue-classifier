// Single source of truth for the Kev setup commands shown in both
// LocalSetupGuide.vue (Settings → Classifier → Local server) and
// ProviderOnboardingCard.vue (Home's condensed local-setup summary), so the
// two can never drift apart the way Home's summary previously did (fixed
// kev-0.8b model regardless of hardware, missing --no-sync, no copy
// buttons — see docs/local-providers.md and this bugfix's report).
//
// Pure: no Vue, no fetch, no storage. `os` only changes the CUDA step (Apple
// Silicon needs none); everything else is identical across platforms, same
// as docs/local-providers.md already says. Kept in sync BY HAND with
// scripts/local-kev.mjs's CUDA_TORCH_INDEX_URL and its own command building.

export type KevOs = 'windows' | 'macos' | 'linux'

export interface KevCommandsOptions {
  /** A LocalTier id from domain/hardware.ts, e.g. 'kev-0.8b', 'kev-4b', 'kev-9b'. */
  model: string
  port: number
  os?: KevOs
  /** Include the repo shortcut (`pnpm local:kev`) — only meaningful when running from the repo's own dev server. */
  shortcut: boolean
}

export interface KevCommandStep {
  id: string
  label: string
  /** null for a note-only step (e.g. "CUDA not applicable on macOS"). */
  command: string | null
  note?: string
}

// CUDA wheel index (pytorch.org/get-started/locally, Windows+Linux, checked
// 2026-09-24 from https://download.pytorch.org/assets/quick-start-module.js).
// Keep in sync with scripts/local-kev.mjs's CUDA_TORCH_INDEX_URL.
export const CUDA_TORCH_INDEX_URL = 'https://download.pytorch.org/whl/cu130'

const NO_SYNC_NOTE =
  '`uv sync` installs a CPU-only torch. Run this once, inside the kev folder, to use the GPU instead. Always start with `--no-sync` afterwards, or uv will reinstall the CPU build.'

/** The ordered Kev commands: clone, sync, the OS-dependent CUDA step, the
 *  launch command (always with --no-sync — see docs/local-providers.md "Why
 *  --no-sync"), and finally the repo shortcut when `shortcut` is true. */
export function kevCommands({ model, port, os = 'windows', shortcut }: KevCommandsOptions): KevCommandStep[] {
  const steps: KevCommandStep[] = [
    { id: 'clone', label: 'Clone Kev', command: 'git clone https://github.com/jaredpalmer/kev.git && cd kev' },
    { id: 'sync', label: 'Install its dependencies', command: 'uv sync --extra serve' },
    os === 'macos'
      ? {
          id: 'cuda-note',
          label: 'GPU on macOS',
          command: null,
          note: 'Not applicable on macOS: Apple Silicon uses Metal (MPS) automatically.',
        }
      : {
          id: 'cuda',
          label: 'Optional: use an NVIDIA GPU',
          command: `uv pip install --python .venv torch torchvision --index-url ${CUDA_TORCH_INDEX_URL}`,
          note: NO_SYNC_NOTE,
        },
    {
      id: 'serve',
      label: 'Start the server',
      command: `uv run --no-sync --extra serve python -m kev.serve --run jaredpalmer/${model} --port ${port}`,
    },
  ]
  if (shortcut) {
    steps.push({
      id: 'shortcut',
      label: "Or use this repo's shortcut for the steps above",
      command: `pnpm local:kev --model ${model}`,
    })
  }
  return steps
}
