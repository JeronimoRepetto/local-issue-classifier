# Local providers (Kev, JevK5)

By default the app classifies with **Jev on the TypeSafe cloud**. It can instead use a
**local Jev-compatible server**: any server that answers TypeSafe's `POST /v1/systemone` request
shape. Two open-source projects do this today. A local server costs nothing per token, and the
issues never leave your machine or LAN.

| Project | License | Server | Default address | Model name |
|---------|---------|--------|-----------------|------------|
| [jaredpalmer/kev](https://github.com/jaredpalmer/kev) | Apache-2.0 | `python -m kev.serve` | `http://localhost:8009` | `kev-latest` |
| [allebee/jevk5](https://github.com/allebee/jevk5) | Apache-2.0 | `jevk5-serve` | `http://localhost:8090` | `alibiserikbay/JevK5` |

Both are presets in Settings. The facts here come from each project's README (checked 2026-09-23).
Check them again before you rely on them.

## Run Kev

```sh
git clone https://github.com/jaredpalmer/kev.git && cd kev
uv sync --extra serve
uv run --extra serve python -m kev.serve --run jaredpalmer/kev-4b --port 8009
```

- `--run` takes a Hub model id (`jaredpalmer/kev-0.8b`, `jaredpalmer/kev-4b`, `jaredpalmer/kev-9b`),
  a local checkpoint directory, or a revision (`jaredpalmer/kev-4b@qwen3`).
- The server binds to `127.0.0.1` and has no key by default. Set `KEV_API_KEY` to require
  `Authorization: Bearer <key>`, then type the same key in the app's optional **Server key** field.
- Besides `/v1/systemone`, Kev serves `GET /v1/models`, which the app's connection test uses.
- Kev's README notes that questions share the input text but cannot read each other's answers,
  which is also true of the TypeSafe API.

### Which Kev size fits your GPU

| Model | Memory it needs (README) | Pick it when |
|-------|--------------------------|--------------|
| Kev-0.8B | fits in 4 GB of VRAM | small GPUs and laptops; expect lower agreement with Jev |
| Kev-4B | about 17 GB of GPU memory | a 24 GB card (for example an RTX 3090 or 4090) |
| Kev-9B | fits in 32 GB, including Apple Silicon with 32 GB of RAM | a 32 GB+ GPU or a 32 GB Mac |

The README quotes latency on data-center GPUs (L4 for 0.8B, L40S for 4B, H100 for 9B). A consumer
GPU is slower. [hardware-fit.md](hardware-fit.md) explains how the app checks what your machine can
run.

## JevK5

JevK5 is Qwen3.5-4B with a LoRA adapter that answers the `/v1/systemone` shape. It **ships its own
server**:

```sh
pip install "jevk5[fast] @ git+https://github.com/allebee/jevk5@v0.2.0"
jevk5-serve --model alibiserikbay/JevK5 --port 8090
```

- It needs about 9 GB of GPU memory in bf16 (README).
- Its README example request has no `model` field. The app always sends one (the preset uses
  `alibiserikbay/JevK5`). If the server rejects it, set the model to whatever the server expects.
- The README does not mention `GET /v1/models`. The connection test still passes when that path
  answers 404, but it shows no model list.

## Point the app at a local server

1. Start the server (see above) and `pnpm dev`.
2. In Settings, under **Classifier**, choose **Local server**.
3. Choose a preset, or type the base URL and the model. Only `localhost`, `127.x.x.x`, `[::1]` or a
   private LAN address (`10.x`, `172.16–31.x`, `192.168.x`, IPv6 `fc00::/7`) is accepted. Public
   hosts, other schemes (`javascript:`, `file:`), credentials in the URL, and `?`/`#` are refused.
4. Click **Test connection**. It reports one of three results:
   - **direct**: the browser calls the server itself.
   - **proxied**: the browser calls `/jev-local` on the Vite server, which forwards the call.
   - **unreachable**: neither route answered.

No TypeSafe key is needed for a local server. The cost estimate before a run shows **$0**. The
request count and the latency estimate still apply.

## CORS and the `/jev-local` proxy

A browser can only call a server on another origin when that server sends CORS headers. Kev's and
JevK5's READMEs do not say whether they do, so the app handles both cases:

1. The first time it needs a server, the app sends `GET {baseUrl}/v1/models` with `mode: 'cors'`
   and a JSON `content-type`. That forces the same CORS preflight a classification POST triggers.
2. If the check gets any HTTP answer, the route is **direct**.
3. If it fails, the app retries through `/jev-local/v1/models`, naming the server in the
   `x-local-target` header. If the proxy answers, the route is **proxied**.
4. The route is cached in memory per base URL until the page reloads. An unreachable result is not
   cached, so the next call checks again.

The page's CSP allows direct calls only to `localhost`, `127.0.0.1` and `[::1]` over `http`. A LAN
address or an `https` local server therefore always goes through the proxy. See
[deployment.md](deployment.md) for what the proxy does.

Local calls time out after 180 s instead of the cloud's 20 s, because a 4B model on a consumer GPU
is much slower than the TypeSafe API.

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
Kev-9B. The timings are for CPU inference and do not show GPU speed. A real repository, the
`--noise` baseline and a CUDA build of torch are needed before drawing any conclusion about
batching on a small local model.
