// Single source of truth for the Kev setup commands shown in both
// LocalSetupGuide.vue (Settings → Classifier → Local server) and
// ProviderOnboardingCard.vue (Home's condensed local-setup summary), so the
// two can never drift apart the way Home's summary previously did (fixed
// kev-0.8b model regardless of hardware, missing --no-sync, no copy
// buttons — see docs/local-providers.md and this bugfix's report).
//
// Pure: no Vue, no fetch, no storage. `os` changes: the uv-install command,
// whether the clone step is folded with `cd kev` (macOS/Linux) or split into
// two separate lines (Windows — see the PowerShell note below), the CUDA
// step (skipped on macOS, which needs Metal instead), and the `--dir`
// reuse-hint's example path separator. Everything else is identical across
// platforms, same as docs/local-providers.md already says. Kept in sync BY
// HAND with scripts/local-kev.mjs's CUDA_TORCH_INDEX_URL and its own command
// building.
//
// Windows note: PowerShell 5.1 — the default shell on Windows 10/11 unless
// PowerShell 7 was installed separately — has no `&&` pipeline chain
// operator. Verified against Microsoft's own docs (WebFetch,
// https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_pipeline_chain_operators,
// checked 2026-09-24): "Beginning in PowerShell 7, PowerShell implements the
// `&&` and `||` operators to conditionally chain pipelines" — i.e. `&&` did
// not exist before PowerShell 7. So the Windows clone step below is split
// into two separate, individually copyable lines (`clone`, then `cd`)
// instead of one `git clone ... && cd kev` line, which would silently fail
// (a syntax error) in the PowerShell 5.1 prompt most Windows users still get
// by default. macOS/Linux ship bash/zsh, which have always supported `&&`.

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

/** The small OS toggle shown next to the commands (LocalSetupGuide and
 *  ProviderOnboardingCard both render the same three options). */
export const KEV_OS_OPTIONS: { value: KevOs; label: string }[] = [
  { value: 'windows', label: 'Windows' },
  { value: 'macos', label: 'macOS' },
  { value: 'linux', label: 'Linux' },
]

// CUDA wheel index (pytorch.org/get-started/locally, Windows+Linux, checked
// 2026-09-24 from https://download.pytorch.org/assets/quick-start-module.js).
// Keep in sync with scripts/local-kev.mjs's CUDA_TORCH_INDEX_URL.
export const CUDA_TORCH_INDEX_URL = 'https://download.pytorch.org/whl/cu130'

const NO_SYNC_NOTE =
  '`uv sync` installs a CPU-only torch. Run this once, inside the kev folder, to use the GPU instead. Always start with `--no-sync` afterwards, or uv will reinstall the CPU build.'

const UV_INSTALL: Record<KevOs, string> = {
  windows: 'winget install astral-sh.uv',
  macos: 'curl -LsSf https://astral.sh/uv/install.sh | sh',
  linux: 'curl -LsSf https://astral.sh/uv/install.sh | sh',
}

/** Copy-pasteable critical-information text shared by LocalSetupGuide.vue and
 *  ProviderOnboardingCard.vue, both rendered through `UiCallout` there. Kept
 *  here (rather than duplicated in each component) for the same reason the
 *  commands themselves are: the two surfaces must never drift apart. */
export const KEV_PREREQS_NOTE = 'Git, Python 3.12 or 3.13, and uv.'
export const KEV_GPU_OPTIONAL_NOTE =
  'An NVIDIA GPU is optional; without one Kev runs on the CPU and RAM — works, but slow (measured: 0.8B ≈470 ms vs ≈197 ms per request on GPU; the 4B is impractical on CPU).'
export const KEV_UNSUPPORTED_NOTE =
  "Won't work: an unsupported Python version (Kev needs 3.12 or 3.13), or uv not installed — install/upgrade them first."

/** OS-appropriate example path for the `--dir` reuse hint below. */
function dirHintExample(os: KevOs): string {
  return os === 'windows' ? 'C:\\path\\to\\kev' : '/path/to/kev'
}

/** The ordered Kev commands: install uv, clone (split into two lines on
 *  Windows — see the PowerShell note above), sync, the OS-dependent CUDA
 *  step, the launch command (always with --no-sync — see
 *  docs/local-providers.md "Why --no-sync"), and finally the repo shortcut
 *  (with a --dir reuse hint) when `shortcut` is true. */
export function kevCommands({ model, port, os = 'windows', shortcut }: KevCommandsOptions): KevCommandStep[] {
  const steps: KevCommandStep[] = [
    { id: 'uv-install', label: 'Install uv (skip if you already have it)', command: UV_INSTALL[os] },
  ]

  if (os === 'windows') {
    steps.push(
      { id: 'clone', label: 'Clone Kev', command: 'git clone https://github.com/jaredpalmer/kev.git' },
      { id: 'cd', label: 'Enter the Kev folder', command: 'cd kev' },
    )
  } else {
    steps.push({
      id: 'clone',
      label: 'Clone Kev',
      command: 'git clone https://github.com/jaredpalmer/kev.git && cd kev',
    })
  }

  steps.push({ id: 'sync', label: 'Install its dependencies', command: 'uv sync --extra serve' })

  steps.push(
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
  )

  steps.push({
    id: 'serve',
    label: 'Start the server',
    command: `uv run --no-sync --extra serve python -m kev.serve --run jaredpalmer/${model} --port ${port}`,
  })

  if (shortcut) {
    steps.push({
      id: 'shortcut',
      label: "Or use this repo's shortcut for the steps above",
      command: `pnpm local:kev --model ${model}`,
      note: `Already have a Kev checkout? Add \`--dir ${dirHintExample(os)}\` to reuse it (skips clone and sync).`,
    })
  }
  return steps
}

/** Reads the OS from the browser: `navigator.userAgentData.platform` first
 *  (Chromium's structured, non-deprecated API), falling back to the older
 *  `navigator.userAgent` string; an unrecognized or missing value defaults to
 *  linux. Takes a plain object instead of the global `navigator` so it stays
 *  pure and testable — callers (ProviderOnboardingCard.vue) pass the real
 *  `navigator` at the call site. */
export interface NavigatorLike {
  userAgentData?: { platform?: string }
  userAgent?: string
}

export function detectOs(nav: NavigatorLike | null | undefined): KevOs {
  const platform = nav?.userAgentData?.platform?.toLowerCase() ?? ''
  if (platform.includes('win')) return 'windows'
  if (platform.includes('mac')) return 'macos'
  if (platform.includes('linux')) return 'linux'

  const ua = nav?.userAgent?.toLowerCase() ?? ''
  if (ua.includes('win')) return 'windows'
  if (ua.includes('mac')) return 'macos'
  if (ua.includes('linux') || ua.includes('android')) return 'linux'

  return 'linux'
}

// ── One-click launchers (docs/local-providers.md "One-click launcher") ──
// scripts/start-kev.ps1 and scripts/start-kev.sh, served under /launchers/ by
// server/launcherAssets.ts. They run the same steps as kevCommands() above
// (check tools, clone, sync once, CUDA torch on NVIDIA, serve with --no-sync).

export interface KevLauncher {
  /** File name the browser saves. */
  file: string
  /** Path relative to the app's base URL. */
  path: string
  label: string
  /** How to run it from the folder it was saved to. */
  run: string
}

const OS_NAMES: Record<KevOs, string> = { windows: 'Windows', macos: 'macOS', linux: 'Linux' }

export function kevLauncher({ os, model }: { os: KevOs; model: string }): KevLauncher {
  const label = `Download launcher for ${OS_NAMES[os]}`
  if (os === 'windows') {
    // A downloaded .ps1 is blocked by the default execution policy; the bypass
    // applies to this one run only and changes no setting.
    return {
      file: 'start-kev.ps1',
      path: 'launchers/start-kev.ps1',
      label,
      run: `powershell -ExecutionPolicy Bypass -File .\start-kev.ps1 -Model ${model}`,
    }
  }
  return { file: 'start-kev.sh', path: 'launchers/start-kev.sh', label, run: `sh start-kev.sh --model ${model}` }
}
