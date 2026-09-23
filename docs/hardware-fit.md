# Hardware fit for local models

The hardware-fit panel answers one question: can this machine run a local Jev-compatible model,
and which one? It reads what the browser already exposes, compares it with the memory each local
model needs, and gives one verdict per model. The cloud API is always shown as the fallback.

Detection runs in your browser. Nothing is sent anywhere, and nothing is measured.

## What is read

Detection is passive. It only reads values the browser already exposes:

| Source | What we read | Notes |
|---|---|---|
| WebGL | `RENDERER` and `VENDOR`, or their unmasked versions from `WEBGL_debug_renderer_info` when that extension exists | We try a `webgl2` context first, then `webgl`, and release the context with `WEBGL_lose_context` right away. Nothing is drawn. |
| WebGPU | `navigator.gpu.requestAdapter()` → `adapter.info` (or the older `adapter.requestAdapterInfo()`) | Used only when WebGL gives no model name. If there is no adapter, the call fails, or it takes longer than 1.5 s, WebGPU counts as absent. |
| Navigator | `deviceMemory`, `hardwareConcurrency`, `userAgentData.platform` (or `platform`) | See the caveats below for `deviceMemory`. |

## What is not read or done

- **No benchmark of any kind.** There are no CPU or GPU micro-benchmarks, no shaders, no render
  passes and no timing loops. Other tools (canirun.ai, for example) time shaders or loops to guess
  memory bandwidth. We chose not to, so opening the panel never puts load on your machine.
- No network request. The GPU table ships with the app.
- WebGPU `limits` (for example `maxBufferSize`) are not used to guess VRAM. The link between
  those limits and real VRAM is too loose to base a verdict on.
- Detected values are never saved. Only the manual override is saved, in
  `Preferences.hardwareOverride`.

## How the renderer string is read

`parseRendererString` in `src/domain/hardware.ts` handles these common shapes:

- Chrome ANGLE on Windows: `ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11)`
  becomes vendor `nvidia`, model `NVIDIA GeForce RTX 5070`. The device id `(0x…)` and the
  `Direct3D…` suffix are removed.
- Chrome on macOS: `ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)` becomes `Apple M2 Pro`.
- Linux Mesa and proprietary drivers: `Mesa Intel(R) UHD Graphics 620 (KBL GT2)`,
  `AMD Radeon RX 6800 XT (navi21, LLVM …)` and `NVIDIA GeForce RTX 3080/PCIe/SSE2`. Driver details
  at the end, `(R)`/`(TM)` and `/PCIe/SSE2` are removed.
- Masked strings, which give no model: Safari's `Apple GPU`, Firefox's `…, or similar`, and
  generic names such as `Mozilla` or `WebKit WebGL`. The vendor is kept when the string shows it.
- Software renderers (SwiftShader, llvmpipe, Microsoft Basic Render) count as "no GPU".

## GPU table

The table in `src/domain/hardware.ts` (`GPU_TABLE`) is our own. It only lists models that have
the same VRAM in every version. Models sold with different VRAM sizes are left out on purpose,
and you pick the VRAM by hand for them.

| Family | Listed models (VRAM) | Left out on purpose |
|---|---|---|
| NVIDIA RTX 30 desktop | 3060 Ti (8), 3070 (8), 3070 Ti (8), 3080 Ti (12), 3090 (24), 3090 Ti (24) | 3050 (6/8), 3060 (8/12), 3080 (10/12) |
| NVIDIA RTX 40 desktop | 4060 (8), 4070 (12), 4070 SUPER (12), 4070 Ti (12), 4070 Ti SUPER (16), 4080 (16), 4080 SUPER (16), 4090 (24) | 4060 Ti (8/16) |
| NVIDIA RTX 50 desktop | 5060 (8), 5070 (12), 5070 Ti (16), 5080 (16), 5090 (32) | 5060 Ti (8/16) |
| NVIDIA laptop | 3060 (6), 3070 (8), 3070 Ti (8), 3080 Ti (16), 4050 (6), 4060 (8), 4070 (8), 4080 (12), 4090 (16), 5060 (8), 5070 (8), 5070 Ti (12), 5080 (16), 5090 (24) | 3050 Laptop (4/6), 3080 Laptop (8/16) |
| AMD RX 6000 | 6400 (4), 6600 (8), 6600 XT (8), 6650 XT (8), 6700 (10), 6700 XT (12), 6750 XT (12), 6800 (16), 6800 XT (16), 6900 XT (16), 6950 XT (16) | 6500 XT (4/8), laptop "M" parts |
| AMD RX 7000 | 7600 (8), 7600 XT (16), 7700 XT (12), 7800 XT (16), 7900 GRE (16), 7900 XT (20), 7900 XTX (24) | laptop "M" parts |
| AMD RX 9000 | 9070 (16), 9070 XT (16) | 9060 XT (8/16) |
| Intel Arc | A310 (4), A380 (6), A580 (8), A750 (8), A370M (4), A550M (8), A730M (12), A770M (16), B570 (10), B580 (12) | A770 (8/16), integrated Arc/UHD/Iris |
| Apple silicon | M1–M4, plus Pro, Max and Ultra (no M4 Ultra) | none; these use unified memory, see below |

Lookups use a normalized key, such as `nvidia rtx 4070 ti super` or `nvidia rtx 4070 laptop`.
That way `Laptop GPU`, `SUPER` and trademark marks in the string do not break the match.

## Tier thresholds

| Tier | Memory needed | Source |
|---|---|---|
| Kev 0.8B (`kev-0.8b`) | ~3 GB | working-set estimate |
| Kev 4B (`kev-4b`) | ~10 GB | Kev README: 4B fits a 32 GB Mac |
| JevK5 (`jevk5`) | ~10 GB | JevK5 README: ~9 GB of GPU memory in bf16, rounded up |
| Kev 9B (`kev-9b`) | ~20 GB | Kev README: 9B fits a 32 GB Mac |

"Available memory" means the VRAM on a separate GPU. On unified memory (Apple silicon) it means
**RAM minus a reserve**: `max(4 GB, 25 % of RAM)` stays with the OS and the browser. A 32 GB Mac
therefore has 24 GB available, which matches the Kev README.

Each tier gets one verdict:

| Verdict | Condition |
|---|---|
| `ok` (Fits) | needed ≤ 85 % of available memory |
| `tight` | needed ≤ available memory, but above 85 % |
| `no` (Won't fit) | needed > available memory |
| `unknown` | available memory is unknown, or the only RAM figure is the browser's capped "at least 8 GB" and the model does not fit in 8 GB |

The recommendation is the largest tier marked `ok`. If no tier is `ok`, it is the largest tier
marked `tight`. If no tier fits either way, it is the cloud API. When two tiers need the same
memory, the one listed later wins, so JevK5 is picked over Kev 4B. Every constant lives in
`src/domain/hardware.ts` (`LOCAL_TIERS`, `OK_HEADROOM`, `UNIFIED_RESERVE_FRACTION`,
`UNIFIED_MIN_RESERVE_GB`).

## Manual override

You can pick a GPU from the table, type a VRAM number, or do both. On Apple silicon, the number
you type is the machine's total unified memory. A typed number takes priority over the table
value. The override is saved in `Preferences.hardwareOverride` as `{ gpuId, vramGb }`. When it is
loaded, it is checked: an unknown id or an invalid number is dropped.

## Browser caveats

- **Firefox and Safari hide the GPU.** Firefox reports a sanitized "…, or similar" name. Safari
  reports `Apple GPU`. For both, the model is unknown, and you need the manual override for a verdict.
- **Chrome caps `deviceMemory` at 8** (and rounds it down to a power of two). A value of 8 is
  shown as "≥ 8 GB". It is never treated as the real amount, which matters most on Macs with
  unified memory.
- `deviceMemory` and WebGPU only exist in some browsers and on some platforms (secure context,
  Chromium). When either one is missing, that field is reported as unknown.
- Integrated GPUs on Windows and Linux (Intel UHD/Iris, AMD "Radeon Graphics") share system RAM,
  and the browser does not say how much. They get `unknown` until you enter a figure by hand.
