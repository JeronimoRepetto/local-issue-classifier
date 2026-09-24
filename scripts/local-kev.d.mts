// Types for scripts/local-kev.mjs, so tests can import it under strict TypeScript.
export interface LocalKevArgs {
  model: 'kev-0.8b' | 'kev-4b' | 'kev-9b'
  port: number
  dir: string
  cuda: boolean
  help: boolean
}

export type ParseArgsResult = { ok: true; value: LocalKevArgs } | { ok: false; error: string }

export interface PlanStep {
  id: 'clone' | 'sync' | 'cuda' | 'serve'
  description: string
  command: string
  args: string[]
  cwd?: string
}

export interface PlanCommandsOptions {
  platform?: string
  dir: string
  model: string
  port: number
  cuda: boolean
  repoExists: boolean
}

export interface PrereqCheck {
  ok: boolean
  version: string | null
  hint: string
}

export interface PrereqResults {
  git: PrereqCheck
  uv: PrereqCheck
  python: PrereqCheck
}

export type SpawnSyncLike = (
  command: string,
  args?: readonly string[],
  options?: unknown,
) => { status: number | null; stdout?: string; stderr?: string; error?: Error }

export const CUDA_TORCH_INDEX_URL: string

export declare function parseArgs(argv: string[]): ParseArgsResult
export declare function uvInstallHint(platform?: string): string
export declare function cudaInstallCommand(platform?: string): string | null
export declare function planCommands(opts: PlanCommandsOptions): PlanStep[]
export declare function checkPrerequisites(spawnSyncFn: SpawnSyncLike, platform?: string): PrereqResults
