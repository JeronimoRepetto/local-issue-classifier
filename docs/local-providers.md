# Local providers (Kev, JevK5, Laya)

By default the app classifies with **Jev on the TypeSafe cloud**. It can instead use a
**local Jev-compatible server**: any server that answers TypeSafe's `POST /v1/systemone` request
shape. Three open-source projects do this today. A local server costs nothing per token, and the
issues never leave your machine or LAN.

| Project | License | Server | Default address | Model name |
|---------|---------|--------|-----------------|------------|
| [jaredpalmer/kev](https://github.com/jaredpalmer/kev) | Apache-2.0 | `python -m kev.serve` | `http://localhost:8009` | `kev-latest` |
| [allebee/jevk5](https://github.com/allebee/jevk5) | Apache-2.0 | `jevk5-serve` | `http://localhost:8090` | `alibiserikbay/JevK5` |
| [NandhaKishorM/laya](https://github.com/NandhaKishorM/laya) | Apache-2.0 | `laya-serve` | `http://localhost:8000` | `convaiinnovations/laya` |

To run a model with no server at all, see [In-browser inference](browser-inference.md)
(experimental: a small placeholder model for now).

All three are presets in Settings. The facts here come from each project's README (Kev, JevK5:
checked 2026-09-23; Laya: checked 2026-09-24, both the README and its `laya/serve.py` source).
Check them again before you rely on them.

This section is also built into the app: Settings → Classifier → **Local server** shows the same
steps and commands below, with copy buttons and an OS switch, in
[`LocalSetupGuide`](../src/components/ui/LocalSetupGuide.vue). Home's condensed onboarding card
shows the same Kev commands too — both read them from the same
[`kevCommands`](../src/domain/localCommands.ts) function, and Home picks the model from your
detected hardware instead of a fixed size.

## Prerequisites

- **Git** (to clone Kev; not needed for JevK5).
- **Python 3.12 or 3.13** for Kev; **pip** for JevK5.
- **uv** for Kev (manages Kev's Python environment). Install it if you don't have it:

  | OS | Install uv |
  |----|------------|
  | Windows | `winget install astral-sh.uv` |
  | macOS / Linux | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |

- An **NVIDIA GPU is optional**: without one, both servers run on the CPU (slow — see
  "CPU-only torch" under Troubleshooting). JevK5 needs about 9 GB of GPU memory in practice.

## One-click launcher

The easiest way to run Kev. Home's **On this computer** card offers it first; the manual commands
below are the fallback. Download the launcher for your OS
([`start-kev.ps1`](../scripts/start-kev.ps1) for Windows, [`start-kev.sh`](../scripts/start-kev.sh)
for macOS and Linux; the app serves both under `/launchers/`) and run it from the folder you saved
it to:

```powershell
# Windows (PowerShell 5.1 or 7). The bypass applies to this one run and changes no setting.
powershell -ExecutionPolicy Bypass -File .\start-kev.ps1 -Model kev-0.8b
```

```sh
# macOS / Linux
sh start-kev.sh --model kev-0.8b
```

It checks Git, Python 3.12–3.13 and uv, and offers to install uv (winget on Windows, the official
installer elsewhere) after asking. It clones Kev into `./.local/kev` if it is not there yet, and runs
`uv sync --extra serve` only when `.venv` is missing. On an NVIDIA machine (`nvidia-smi` present) it
installs the CUDA build of torch when `torch.cuda.is_available()` is false. Then it starts the
server with `uv run --no-sync`. It is idempotent: a second run just starts the server.

| Windows | macOS / Linux | Default | What |
|---------|---------------|---------|------|
| `-Model` | `--model` | `kev-0.8b` | `kev-0.8b`, `kev-4b` or `kev-9b` |
| `-Port` | `--port` | `8009` | Port to serve on |
| `-Dir` | `--dir` | `./.local/kev` | Where Kev is cloned or found |
| `-FastKernels` | `--fast-kernels` | off | Also install `causal-conv1d` and `flash-linear-attention`. Kev warns without them and uses slower kernels; they often fail to build on Windows, which is not fatal. |
| `-DryRun` | `--dry-run` | off | Print the plan and run nothing |

## Run Kev

The `sync` and `serve` commands below are the same on Windows, macOS and Linux (besides installing
uv, above, and the optional CUDA step). The clone step differs: macOS and Linux fold it into one
`&&` line; Windows splits it into two.

**macOS / Linux** (bash/zsh, which have always supported `&&`):

```sh
git clone https://github.com/jaredpalmer/kev.git && cd kev
uv sync --extra serve
uv run --no-sync --extra serve python -m kev.serve --run jaredpalmer/kev-0.8b --port 8009
```

**Windows** (PowerShell), as two separate lines instead of one `&&` line:

```powershell
git clone https://github.com/jaredpalmer/kev.git
cd kev
uv sync --extra serve
uv run --no-sync --extra serve python -m kev.serve --run jaredpalmer/kev-0.8b --port 8009
```

PowerShell 5.1 — the version Windows 10/11 ships and opens by default, unless PowerShell 7 was
installed separately — has no `&&` (or `||`) pipeline chain operator: typing the one-line
macOS/Linux form there is a syntax error. Confirmed against Microsoft's own docs (checked
2026-09-24): "Beginning in PowerShell 7, PowerShell implements the `&&` and `||` operators to
conditionally chain pipelines"
(<https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_pipeline_chain_operators>)
— i.e. `&&` did not exist before PowerShell 7. The in-app guide
([`LocalSetupGuide`](../src/components/ui/LocalSetupGuide.vue), via
[`kevCommands`](../src/domain/localCommands.ts)) already emits the right form for whichever OS its
toggle is set to.

Already have a Kev checkout from an earlier session? `pnpm local:kev --dir <path-to-kev>` skips the
clone and the sync (see "Or skip all three commands" below) — the in-app guide's shortcut line
shows the same hint, with a path example in your OS's own separator style.

- `--run` takes a Hub model id (`jaredpalmer/kev-0.8b`, `jaredpalmer/kev-4b`, `jaredpalmer/kev-9b`),
  a local checkpoint directory, or a revision (`jaredpalmer/kev-4b@qwen3`).
- The server binds to `127.0.0.1` and has no key by default. Set `KEV_API_KEY` to require
  `Authorization: Bearer <key>`, then type the same key in the app's optional **Server key** field.
- Besides `/v1/systemone`, Kev serves `GET /v1/models`, which the app's connection test uses.
- Kev's README notes that questions share the input text but cannot read each other's answers,
  which is also true of the TypeSafe API.

**Or skip all three commands**: from this repo, run `pnpm local:kev` (add `--model kev-4b` or
`--model kev-9b` to pick a bigger size, `--port` to change the port, `--cuda` to also run the CUDA
step below, `--sync` to force a re-sync of an existing `.venv`). It checks git/uv/Python, clones
Kev into `.local/kev` if it isn't there yet, installs its dependencies **only if `.venv` doesn't
exist yet** (or `--sync` is passed), then always launches with `uv run --no-sync` so an installed
CUDA torch build survives — see "Why `--no-sync`" under Troubleshooting. It prints a one-line
`GPU: available (torch <version>)` / `GPU: not available — pass --cuda …` notice before starting.
`Ctrl+C` stops the server. See `scripts/local-kev.mjs --help` for every option. If you already have
a Kev checkout from an earlier session, point `--dir` at it instead of letting the script clone a
new one.

### Optional: use an NVIDIA GPU (Windows, Linux)

`uv sync` installs a **CPU-only** build of torch (see "CPU-only torch" below). To use the GPU
instead, run this once inside the `kev` folder, after `uv sync`:

```sh
uv pip install --python .venv torch torchvision --index-url https://download.pytorch.org/whl/cu130
```

The index URL is PyTorch's current CUDA build for pip (`pytorch.org/get-started/locally`, OS,
Pip, CUDA — checked 2026-09-24 from `download.pytorch.org/assets/quick-start-module.js`; it also
offers `cu126` and `cu132`). Check the site again if this stops working — the offered CUDA
versions change over time. **Not applicable on macOS**: Apple Silicon uses Metal (MPS)
automatically, with no separate install.

**Always start Kev afterwards with `--no-sync`** (see "Run Kev" above and "Why `--no-sync`" under
Troubleshooting) — otherwise `uv run` re-syncs against Kev's lockfile and silently reinstalls the
CPU-only build, undoing this step.

### Which Kev size fits your GPU

| Model | Memory it needs (README) | Pick it when |
|-------|--------------------------|--------------|
| Kev-0.8B | fits in 4 GB of VRAM | small GPUs and laptops; expect lower agreement with Jev |
| Kev-4B | about 17 GB of GPU memory | a 24 GB card (for example an RTX 3090 or 4090) |
| Kev-9B | fits in 32 GB, including Apple Silicon with 32 GB of RAM | a 32 GB+ GPU or a 32 GB Mac |

The README quotes latency on data-center GPUs (L4 for 0.8B, L40S for 4B, H100 for 9B). A consumer
GPU is slower. [hardware-fit.md](hardware-fit.md) explains how the app checks what your machine can
run, and the same tiers back the Model size picker in the in-app guide.

## Run JevK5

JevK5 is Qwen3.5-4B with a LoRA adapter that answers the `/v1/systemone` shape. It **ships its own
server**, the same command on every OS:

```sh
pip install "jevk5[fast] @ git+https://github.com/allebee/jevk5@v0.2.0"
jevk5-serve --model alibiserikbay/JevK5 --port 8090
```

- It needs about 9 GB of GPU memory in bf16 (README).
- Its README example request has no `model` field. The app always sends one (the preset uses
  `alibiserikbay/JevK5`). If the server rejects it, set the model to whatever the server expects.
- The README does not mention `GET /v1/models`. The connection test still passes when that path
  answers 404, but it shows no model list.
- There is no `pnpm local:kev`-style shortcut for JevK5; run the two commands above yourself.

## Run Laya

Laya (`NandhaKishorM/laya`, Apache-2.0) is a small BERT-family classifier — not a generative LLM
like Kev or JevK5 — purpose-built to answer the same `choice`/`score`/`noul` decision primitives.
Its README states `laya.serve` "exposes the Router over HTTP on the same POST /v1/systemone wire
protocol as TypeSafe's hosted Jev API" and that "Laya's answer payload is already schema-identical
to what Jev returns", which is why no adapter changes were needed: `domain/classification.ts`
already reads `answers`/`usage` tolerantly and ignores fields it doesn't know about (Laya adds a
`routing` block explaining checkpoint selection).

```sh
pip install "laya[serve]"
```

`laya-serve` takes **no CLI flags at all** — confirmed from `laya/serve.py` — every setting is an
environment variable:

```sh
# macOS / Linux
LAYA_PORT=8000 laya-serve
```

```powershell
# Windows (PowerShell has no bash-style `VAR=value command` prefix)
$env:LAYA_PORT = 8000
laya-serve
```

| Variable | Default | Purpose |
|---|---|---|
| `LAYA_HOST` | `0.0.0.0` | Bind address |
| `LAYA_PORT` | `8000` | Bind port (this app's preset) |
| `LAYA_DEVICE` | auto | `cuda`, `cpu`, or `mps` |
| `LAYA_PRELOAD` | lazy | Load every checkpoint at startup instead of on first request |
| `LAYA_MODELS` | — | Comma-separated checkpoints to preload |
| `LAYA_API_KEY` | none | Bearer token authentication |

### Models

| Checkpoint | Encoder | Parameters | Context | Languages |
|---|---|---|---|---|
| `laya` (this preset's default) | ModernBERT-large | 421M | 512 tokens | English |
| `laya-multilingual` | mmBERT-base | 322M | 1,024 tokens (up to 8,192 via `max_len`, SDK only) | 100+ |
| `laya-typed-decisions` | ModernBERT-large | 421M | 1,024 tokens | English, fine-tuned |

Weights: `convaiinnovations/laya`, `convaiinnovations/laya-multilingual`,
`convaiinnovations/laya-typed-decisions` on the Hugging Face Hub. The app's Laya preset always
requests the flagship `convaiinnovations/laya` (English, 512-token) checkpoint; `laya-serve`'s
`_resolve_model()` maps a Hugging Face id like this to its router checkpoint name. Switching to
`laya-multilingual` or `laya-typed-decisions` today means editing the local provider's **model**
field by hand in Settings (there is no in-app picker for Laya's checkpoints yet, unlike Kev's
model-size picker).

### What is different from Kev and JevK5

- **No GPU required.** Laya (421M parameters) is small enough to run comfortably on a CPU;
  BENCHMARKS.md shows it running on a CPU-only laptop (Ryzen 9 6900HX) alongside GPU benchmarks
  (Tesla T4, NVIDIA GB10). Neither README nor BENCHMARKS.md publishes a RAM or VRAM figure, so this
  app makes no hardware-fit tier claim for it (unlike Kev's GB estimates and JevK5's ~9 GB figure)
  — it is simply always shown as CPU-friendly.
- **Much smaller context.** 512 tokens for the flagship model (1,024 for `laya-multilingual` /
  `laya-typed-decisions`), against the app's 12,000-token default per-issue size guard. The app
  gives this preset its own 512-token size-guard override (domain/provider.ts's
  `LocalPreset.maxStateTokens`, read by domain/jevState.ts's `buildIssueState`), so issue bodies and
  comments are trimmed hard before they reach it — more aggressively than for Kev or JevK5. An issue
  that still doesn't fit after every trimming step fails as "Issue too large even after trimming",
  same as any other provider.
- **Always one request per issue, never batched.** Its context is too small ever to carry a
  composite, multi-issue state, so this preset forces per-issue mode
  (domain/provider.ts's `LocalPreset.perIssueOnly`) regardless of the **Classification mode**
  preference under Advanced — the same hard rule the in-browser model already follows.
- **No documented `GET /v1/models`.** Only `POST /v1/systemone` and `GET /health` are documented
  (confirmed from `laya/serve.py`'s route table) — same situation as JevK5: the connection test
  still passes when that path answers 404, but shows no model list and no GPU/CPU device readout.
- **Latency.** The README's own benchmark: about 33 ms for one question on a Tesla T4 GPU (7.2
  ms/question when using the SDK's `predict_batch`, which this app's `/v1/systemone` HTTP path does
  not use — see "Batching" below). No CPU latency figure is published.
- **Unverified: CORS.** Unlike Kev (confirmed `CORSMiddleware`, `allow_origins=["*"]`) and JevK5
  (confirmed to send no CORS headers), Laya's README and `serve.py` say nothing about CORS. It was
  not started or tested for this task (no pip install, no run). Until someone confirms it, treat it
  like JevK5: assume **proxied**, not **direct**, and not supported from a hosted page.
- **Unverified: whether `/v1/systemone` accepts a batched request body at all.** The SDK's
  `predict_batch` groups multiple states client-side; the README's only documented HTTP example is
  a single `state`. This app never sends Laya a batch either way (see above), so this gap does not
  affect it, but do not assume the HTTP endpoint itself supports an array of states.

## Point the app at a local server

1. Start the server (see above) and `pnpm dev`.
2. In Settings, under **Classifier**, choose **Local server**.
3. Choose a preset, or type the base URL and the model. Only `localhost`, `127.x.x.x`, `[::1]` or a
   private LAN address (`10.x`, `172.16–31.x`, `192.168.x`, IPv6 `fc00::/7`) is accepted. Public
   hosts, other schemes (`javascript:`, `file:`), credentials in the URL, and `?`/`#` are refused.
4. The app checks the server on its own (see "Connection status" below). **Test connection** is a
   manual retry; it reports one of three results:
   - **direct**: the browser calls the server itself.
   - **proxied**: the browser calls `/jev-local` on the Vite server, which forwards the call.
   - **unreachable**: neither route answered. The app then points back at the setup guide above
     and asks whether the server is running on the expected port — see Troubleshooting below.

No TypeSafe key is needed for a local server. The cost estimate before a run shows **$0**. The
request count and the latency estimate still apply.

## Connection status

You don't have to click anything to find out whether a local server is up. The app probes it on
its own (one `GET /v1/models` per address, the same check as **Test connection**):

- **On load**: the configured local base URL, plus the Kev (`:8009`), JevK5 (`:8090`) and Laya
  (`:8000`) presets when the page runs on your machine. A hosted page probes only a local URL you
  configured.
- **When you select a local server**: choosing **On this computer** on Home, or **Local server**
  or a preset in Settings.
- **When you come back to Home**: only if the last check is at least 30 s old.

Results are cached for the session. There is no polling loop; nothing runs in the background. The
Home card and Settings show the live status: **Looking for a local server…**, then **Connected** or
**Not reachable on :8009**. **Test connection** stays as the manual retry.

## GPU or CPU

Kev's `GET /v1/models` reports, per model, the `device` it runs on (`cuda` or `cpu`) and its
`dtype`. The Home card, the Settings selector and the provider switch show it:

- **GPU**: "Running on GPU (cuda · bf16)" as an `info` callout (the switch shows `GPU (cuda · bf16)`).
- **CPU**: a `warning`, "Running on CPU and RAM — works, but slow (measured 0.8B: ≈470 ms vs
  ≈197 ms per request on GPU; 4B impractical on CPU)". If hardware detection found an NVIDIA GPU,
  the callout adds the exact CUDA torch step for your OS (the same one as "Run Kev" above). Only the
  NVIDIA driver is required: the torch wheels bundle the CUDA runtime, so there is no CUDA Toolkit
  to install. Restart the server with `--no-sync` afterwards.
- **No NVIDIA GPU detected**: before any server answers, an `info` callout says Kev will run on the
  CPU and RAM and recommends Kev 0.8B (about 4 GB of RAM). AMD GPUs accelerate only on Linux with
  ROCm; Apple Silicon accelerates automatically.

Neither JevK5's nor Laya's README documents these fields (Laya also has no documented
`GET /v1/models` at all — see "Run Laya" above). When a server leaves them out, nothing is shown.

## Switching from the analysis view

The classify bar (screen 3) carries a provider switch next to the Classify button, so you can pick
Jev, Kev, JevK5 or Laya without opening Settings: on your machine, opening the analysis view probes
every local preset once (one `GET /v1/models` per preset, cached for the session — reachable ones
show their first model name and, when the server reports it, its device), and disables whichever
preset it could not reach with that reason as a tooltip.

On a hosted page (e.g. local-issue-classifier.pages.dev) it never probes a preset you have not
explicitly set up in Settings — doing that unconditionally is what triggered Chrome's Local Network
Access prompt ("wants to access other apps and services on this device") the moment the analysis
view opened. There, every preset shows disabled with "Set up in Settings." as its reason; the one
preset you did configure in Settings keeps its normal reachable/unreachable readout, since choosing
it there already probed it (see "Connection status" above). The in-browser model's WebGPU check is
unaffected either way.

Selecting an available candidate there updates the same `Preferences.provider` the Settings selector
edits, so both stay in sync; re-running Classify with a different provider replaces every result and
the analysis header's "Classified by" line updates to match. The switch is disabled while a run is
active.

## CORS and the `/jev-local` proxy

A browser can only call a server on another origin when that server sends CORS headers. Kev's,
JevK5's and Laya's READMEs do not say whether they do, so the app handles both cases:

1. The first time it needs a server, the app sends `GET {baseUrl}/v1/models` with `mode: 'cors'`
   and a JSON `content-type`. That forces the same CORS preflight a classification POST triggers.
2. If the check gets any HTTP answer, the route is **direct**.
3. If it fails, the app retries through `/jev-local/v1/models`, naming the server in the
   `x-local-target` header. If the proxy answers, the route is **proxied**.
4. The route is cached in memory per base URL until the page reloads. An unreachable result is not
   cached, so the next call checks again.

The page's CSP allows direct calls only to `localhost`, `127.0.0.1` and `[::1]` over `http`. A LAN
address or an `https` local server therefore always goes through the proxy. See
[security.md](security.md#the-proxy-trust-boundary) for what the proxy does.

**Hosted pages.** A hosted build has no `/jev-local` proxy, so it reaches `http://localhost` directly
from your browser. That works with Kev, which answers with CORS `*`; JevK5 sends no CORS headers,
so it is not supported from a hosted page (run the app locally for it). Laya's CORS support is
undocumented and was not tested (see "Run Laya" above) — assume it behaves like JevK5 until
confirmed. There, Home hides the **On this computer** card and Settings labels the option
"Advanced: a Kev/JevK5/Laya server on your machine".

Local calls time out after 180 s instead of the cloud's 20 s, because a 4B model on a consumer GPU
is much slower than the TypeSafe API.

## Troubleshooting

**"Unreachable" in Test connection.**

- Is the server actually running? Check the terminal you started it in (or `pnpm local:kev`'s
  window) for errors, and that it printed something like "Uvicorn running on
  `http://127.0.0.1:8009`".
- Does the port match? The base URL's port (`8009` for Kev, `8090` for JevK5 by default) must be
  the same port the server actually bound to (`--port`).
- Is something else already using that port ("address already in use" / "port is already
  allocated" in the server's own error)? Either stop that process, or start the server on a
  different port (`--port 8010`, matching the app's base URL to it), or edit the app's base URL to
  match whatever port the server is really using.
- A firewall prompt the first time you start the server (Windows Defender, a corporate firewall)
  must be **allowed** for `localhost`/private-network access, or the browser's request never
  reaches it. A LAN address (not `localhost`) additionally needs the server to actually bind to
  `0.0.0.0` or the LAN interface, not only `127.0.0.1`.
- The app tries a direct call first and only falls back to the `/jev-local` proxy if that fails
  (see "CORS and the `/jev-local` proxy" above); "unreachable" means *both* failed, so a CORS
  problem alone would show as **proxied**, not **unreachable**.

**The model runs on the CPU and is very slow (or `/v1/models` reports `"device": "cpu"`).**

On Windows and Linux, `uv sync --extra serve` installs a CPU-only build of torch by default,
because Kev's `pyproject.toml` names no CUDA wheel index (confirmed 2026-09-23, see "Measured on
2026-09-23" below). Run the CUDA step under "Run Kev" above once, inside the `kev` folder, after
`uv sync`, then restart the server **with `--no-sync`** (see "Why `--no-sync`" right below — without
it, the very next launch reinstalls the CPU-only build). Not applicable on macOS (Apple Silicon
already uses Metal/MPS). JevK5 needs a real NVIDIA GPU in practice (~9 GB in bf16); it has not been
checked for a CPU-only fallback.

**Why `--no-sync`.**

`uv run --extra serve …` (without `--no-sync`) re-syncs the project environment against Kev's
lockfile *on every launch*, and that lockfile pins the CPU-only torch (no CUDA wheel index). This
is silent: installing the CUDA build once with `uv pip install …` (above) works and
`torch.cuda.is_available()` reports `True` — until the next `uv run` without `--no-sync`, which
reinstalls `torch` from the lockfile and undoes it, with no warning. Verified on 2026-09-24: after
installing the CUDA build, `uv run --extra serve python -m kev.serve …` silently downgraded torch
back to the CPU-only build; `uv run --no-sync --extra serve python -m kev.serve …` did not, and the
server reported `"device":"cuda"`. Always launch with `--no-sync` once a CUDA build is installed —
`pnpm local:kev` and the in-app guide's commands already do this. Pass `--sync` to `pnpm local:kev`
(or run a plain `uv sync --extra serve`) only when you deliberately want to re-sync (for example,
after Kev's lockfile changes), and re-run the CUDA step afterwards if you still want the GPU build.

**The first start takes a long time, or looks stuck.**

The first run downloads the base model into the Hugging Face cache (Kev-0.8B: about 1.7 GB plus a
63 MB adapter — bigger for Kev-4B/9B). This only happens once per model; watch the terminal for
download progress rather than assuming it hung.

## Batching on a small model

In batched mode ([batching.md](batching.md)) one request carries every selected issue in a single,
large state. A 4B model may be slow on such a long input, and may agree less with per-issue results
than Jev does. Measure it before relying on it: export an analysis and run the batching harness
against your local server.

```sh
JEV_BASE_URL=http://localhost:8009 JEV_MODEL=kev-latest node scripts/compare-batching.mjs analysis.json --limit 20
```

With `JEV_BASE_URL` set, `JEV_API_KEY` may be empty or unset. If your server requires a key, set it.
If batched agreement is poor, switch **Classification mode** to **One request per issue** under
Advanced.

## Measured on 2026-09-23 (Kev-0.8B, RTX 5070)

One end-to-end run of Kev-0.8B against this app, on Windows 11 with an RTX 5070 (12 GB) and
Python 3.13 through `uv` 0.12.7. It was a single functional check, not a benchmark: one smoke
request, one harness comparison, and one request through the proxy.

### Setup that worked

```sh
git clone --depth 1 https://github.com/jaredpalmer/kev.git kev-runtime && cd kev-runtime   # commit 2874258
uv sync --extra serve                                                  # 11.6 s, .venv is 1.8 GB
uv run --extra serve python -m kev.serve --run jaredpalmer/kev-0.8b --port 8009
```

- **The model ran on the CPU, not the GPU.** `uv sync` installs `torch 2.8.0+cpu` from PyPI on
  Windows, because Kev's `pyproject.toml` names no CUDA wheel index. `/v1/models` reported
  `"device": "cpu"`, `"backend": "torch"`, `"dtype": "float32"`. GPU memory did not change
  (1 930 MiB before, 1 931–1 950 MiB during and after, all of it the desktop). Running on the GPU
  needs a CUDA build of torch installed into Kev's environment; that was not tried.
- The first start downloaded the base model `Qwen/Qwen3.5-0.8B-Base` (1.7 GB) and the adapter
  `jaredpalmer/kev-0.8b` (63 MB) into the Hugging Face cache. From launch to "Uvicorn running" took
  about 40 s, download included. The server process used about 3.7 GB of RAM when idle.

### Smoke checks

| Check | Result |
|-------|--------|
| README example `POST /v1/systemone` (3 questions) | 200, the documented shape (`answers`, `usage`, `latency_ms`); `latency_ms` 470, 0.74 s wall time |
| `GET /v1/models` | 200; lists `kev-latest` and `jev-latest`, both serving `jaredpalmer/kev-0.8b` |
| CORS preflight (`OPTIONS`, `Origin: http://localhost:5204`) | 200, `access-control-allow-origin: *`, methods include `POST`, requested headers `content-type,authorization` allowed |
| `GET` with `Origin` | `access-control-allow-origin: *`, `access-control-expose-headers: x-typesafe-request-id` |
| `POST /jev-local/v1/systemone` on `pnpm dev` (port 5204) with `x-local-target: http://localhost:8009` | 200, `x-jev-local-proxy: upstream`, a valid answer |

**CORS finding:** Kev sends CORS headers for any origin (`CORSMiddleware` with
`allow_origins=["*"]` in `kev/serve.py`). A Kev server on `localhost` is therefore reached
**direct**. The `/jev-local` proxy still works against it, and it is what a LAN address uses
because of the CSP.

### Harness run

The analysis was built from the synthetic GitHub fixtures in `tests/fixtures/github/` with the
app's own mappers (`mapRepo`, `mapIssue`, `attachComments`, `buildProjectContext`,
`createAnalysis`): 4 issues (#7 with 8 comments, #6, #4 with 1 comment, #2), no real data.
`--plan` chose 1 request with the `standard` profile. The real run compared per-issue with that
one profile only (`--profiles standard`, no `--noise`), at the default concurrency of 4:

```text
mode              calls  tokens  secs  cmplx       crit  effort  kind  rel±  conf±
----------------  -----  ------  ----  ----------  ----  ------  ----  ----  -----
per-issue         4      3865    11.1  (baseline)
batched standard  1      3703    11.4  100%        100%  100%    25%   11.5  -0.02
```

No request failed, and Kev accepted the batched request (about 4 700 estimated tokens). The
whole harness took 23 s of wall time.

### What this does and does not tell us

It shows that the integration works end to end with a real local server: the app's request and
batched request shapes are accepted, the answers parse, a key is not needed, the direct route is
open because of CORS, and the proxy forwards correctly. It does **not** measure accuracy. The
agreement figures compare Kev-0.8B with itself in two request layouts, on 4 synthetic issues with
almost no content, and without a `--noise` row, so there is no noise level to read them against.
They say nothing about agreement with Jev on the TypeSafe cloud, and nothing about Kev-4B or
Kev-9B. The timings above are for CPU inference and do not show GPU speed for batching. A real
repository and the `--noise` baseline are still needed before drawing any conclusion about
batching on a small local model; the GPU speed-up itself is now measured below (single requests,
not batching).

## Measured on 2026-09-24 (Kev-0.8B, RTX 5070, CUDA)

Following up on the CPU-only run above: a CUDA build of torch was installed into Kev's `.venv`
(`uv pip install --python .venv torch torchvision --index-url https://download.pytorch.org/whl/cu130`
→ `torch 2.14.0+cu130`, `torch.cuda.is_available()` reports `True`), and the server was restarted
with `uv run --no-sync --extra serve python -m kev.serve --run jaredpalmer/kev-0.8b --port 8009`
(see "Why `--no-sync`" above — without it, this step silently reinstalls the CPU-only build).

| | CPU (2026-09-23) | GPU / CUDA (2026-09-24) |
|---|---|---|
| `/v1/models` `"device"` | `cpu` | `cuda` |
| `"dtype"` | `float32` | `bfloat16` |
| Latency per request | ~470 ms | ~197 ms |
| VRAM used (Kev-0.8B) | — | ~4.5 GB (RTX 5070, 12 GB) |

This is a single functional smoke check, not a benchmark: one request measured per device, on one
machine (Windows 11, RTX 5070 12 GB). It confirms the CUDA build is picked up and roughly halves
per-request latency for Kev-0.8B; it says nothing about Kev-4B/9B, batching throughput, or
agreement with Jev.
