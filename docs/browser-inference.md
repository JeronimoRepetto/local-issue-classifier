# In-browser inference (experimental, phase A)

The **In this browser** provider classifies issues with a small model that runs inside the page,
on WebGPU (or WebAssembly as a slow fallback). There is nothing to install, no key and no server:
the weights are downloaded once from the Hugging Face Hub and kept by the browser.

> **Phase A is a runtime spike.** The model it ships, `onnx-community/Qwen3-0.6B-ONNX`, is a small
> generic model. It is **not** Jev, JevK5 or Kev, and its answers are **placeholders**: they prove
> the pipeline works end to end, not that the classifications are right. Real answers need
> JevK5 (or Kev) weights exported to ONNX — see [Phase B](#phase-b-export-jevk5-to-onnx).

## Quick path

1. Settings → **Classifier** → **In this browser (experimental)** (or the third card on Home,
   shown only when WebGPU is available).
2. **Download model**: about 579 MB on WebGPU (928 MB for the WebAssembly fallback), with a
   progress bar. Later visits load it from the browser cache.
3. **Classify** as usual. The run goes one issue at a time; the cost estimate is 0.

## How it works

| Step | What happens | Code |
|---|---|---|
| Load | transformers.js v3 (ONNX Runtime Web) loads the tokenizer and the ONNX weights: `q4f16` on WebGPU, `q4` on WebAssembly. A failed WebGPU load retries on WebAssembly. | `src/adapters/browser/browserModel.ts` |
| Prompt | One prompt per question, built exactly as JevK5 builds it: a fixed system instruction, then `{"evidence": state, "criterion": instructions, "options": [{"letter": "A", …}]}` in Qwen's chat template with thinking off. | `src/adapters/browser/readout.ts` |
| Forward pass | The prompt is prefilled in 256-token chunks with the KV cache carried over; only the last position's logits are read, for the option letters only. | `browserModel.ts` → `logitsAt` |
| Readout | `softmax(logits / 1.532)` (JevK5's calibration temperature). Score: expected value over the ordered levels. Choice: the most likely option. `confidence` = the largest probability, as JevK5's own `answer()` does. | `readout.ts` → `toAnswer` |
| Answer | The same `/v1/systemone` JSON the HTTP transport returns, so `toClassification` and everything above it is unchanged. `usage.input_tokens` is the real prompt token count. | `src/adapters/browser/browserJevTransport.ts` |

The protocol is JevK5's (`allebee/jevk5`, `jevk5/prompt.py` and `jevk5/runtime.py`, which follow
SemIf, `TheoLeeCJ/SemIf`, MIT). The prompt JSON uses Python's `json.dumps` separators and a Python
`repr` for structured Score levels, byte for byte, so a real JevK5 export reads the same tokens.
Letters run A–Z (26 options); JevK5 itself stops at 16.

## Limits

| Limit | Why |
|---|---|
| **Per-issue only** | A batched state (up to ~28k tokens) needs attention buffers far beyond a browser's GPU limits. The transport refuses one with `BrowserBatchUnsupportedError` ("browser mode supports per-issue states only"); `useClassifier` always runs this provider per issue. |
| **One issue at a time** | Concurrency is forced to 1: a second forward pass would only compete for the same GPU. |
| **Placeholder answers** | Qwen3-0.6B is untrained for this task. Do not act on its scores. |
| **WebAssembly is slow** | Without WebGPU the model runs on the CPU; expect tens of seconds per issue or more. |

## Browser support

- WebGPU: current Chrome, Edge, and (per the feasibility study's sources, late 2025) Firefox on
  Windows and Safari 26. The app asks `navigator.gpu.requestAdapter()`; no benchmark runs.
- Without WebGPU the provider still works on WebAssembly, with a "slow" warning. The Home card only
  offers the browser option when WebGPU is available.
- Without either, the provider reports **unsupported** and never downloads.

## Storage

- transformers.js stores every downloaded file in the **Cache API** (`transformers-cache`), keyed by
  its Hub URL. Settings → **Local data** shows "Downloaded model: N MB" with a **Remove** action;
  the provider panel has **Remove downloaded model** too (`src/adapters/browser/modelCache.ts`).
- The cache counts toward the site's storage quota (Chrome/Edge: up to 60% of the disk per origin;
  Firefox: 10% of the disk or 10 GiB best-effort; see MDN "Storage quotas and eviction criteria").
  The browser may evict it under storage pressure, together with the rest of the site's data,
  unless persistent storage was granted (the app asks once, on the first saved analysis). After an
  eviction the next load simply downloads the files again.
- "Clear all local data" does not remove the model; use the Remove action.

## Security and CSP

| Directive | Value | Why |
|---|---|---|
| `script-src` | `'self' 'wasm-unsafe-eval'` | ONNX Runtime Web compiles its WebAssembly binary; `'wasm-unsafe-eval'` allows that and nothing else (no `'unsafe-eval'`). |
| `connect-src` | adds `https://huggingface.co https://*.hf.co https://cdn-lfs.huggingface.co` | The Hub answers `/resolve/` with a redirect to its download CDN. On 2026-09-24 the q4f16 weights redirected to `https://us.aws.cdn.hf.co/xet-bridge-us/…`; `*.hf.co` covers the regional hosts, `cdn-lfs.huggingface.co` the older LFS host. |

No worker is created (ONNX Runtime runs single-threaded without cross-origin isolation), so no
`worker-src` change is needed. ONNX Runtime's `.mjs` loader and `.wasm` binary are served by this app
under `/ort/` (`server/ortAssets.ts`: a dev middleware plus two emitted build assets), never from a
CDN; `browserModel.ts` points `env.backends.onnx.wasm.wasmPaths` there. The build also contains a
hashed copy of the same `.wasm` (Vite follows ONNX Runtime's own `new URL(…, import.meta.url)`); the
smoke check confirmed only the `/ort/` copy is fetched. transformers.js is imported lazily, so its
~900 kB chunk loads only when this provider is used.

## Model choice

Checked on the Hub on 2026-09-24:

| Repo | Weights | Verdict |
|---|---|---|
| `onnx-community/Qwen3-0.6B-ONNX` | `onnx/model_q4f16.onnx` 569 789 750 B, `onnx/model_q4.onnx` 919 096 585 B, plus `tokenizer.json` 9 117 040 B and three small JSON files | **Chosen**: the smallest Qwen3-family export tagged `transformers.js`, architecture `qwen3` (supported by transformers.js 3.8.1). |
| `onnx-community/Qwen3.5-0.8B-ONNX` | multi-file `qwen3_5` export (vision encoder, embeddings, decoder), q4 decoder 485 MB | Not used: tagged `image-text-to-text`, not `transformers.js`; the `qwen3_5` architecture is not in transformers.js v3. |

## Smoke check

One run, 2026-09-24, `node scripts/browser-smoke.mjs` against `vite --port 5220`: headless Edge
(`--headless=new --enable-unsafe-webgpu`), one page load, then the browser was killed by PID. It
classifies ONE synthetic fixture issue (`tests/fakes/typicalIssues.ts`, state ≈ 3 500 estimated
tokens) with the five questions, through the same code the app uses.

| Measure | Value |
|---|---|
| Backend | WebGPU (available in headless mode on this machine) |
| Download + load (cold cache) | 14.0 s |
| Time to first answer (page start → first question) | 17.3 s |
| Per-question forward pass | 3.27 s, 2.20 s, 2.21 s, 2.26 s, 2.20 s (≈ 2 200–2 300 prompt tokens each) |
| Total for one issue | 26.2 s |
| Cached afterwards | 578 917 626 B (matches the listed download exactly) |
| Files fetched | 4 config/tokenizer files + `model_q4f16.onnx` from the Hub; `/ort/ort-wasm-simd-threaded.jsep.{mjs,wasm}` from the app |

The result had the right shape and passed `toClassification`; the values themselves are
placeholders (e.g. complexity "low" with 0.99 confidence). This is one functional check, not a
benchmark.

## Phase B: export JevK5 to ONNX

**Run only with the user's explicit consent**: it downloads ~4.2 GB of weights and needs a machine
with a lot of RAM. Nothing below has been run.

1. **Check support first.** JevK5 is a Qwen3.5-4B fine-tune (`model_type` `qwen3_5`, hybrid Gated
   DeltaNet + attention layers). transformers.js v3 does not know `qwen3_5`; v4 does load the
   `onnx-community/Qwen3.5-*` exports. Before exporting, load `onnx-community/Qwen3.5-0.8B-ONNX`
   with transformers.js v4 and confirm the `logitsAt` path works on its decoder. If it does not, stop.
2. **Environment** (Python 3.11+): `pip install "optimum[onnxruntime]" transformers accelerate`,
   plus whatever the Qwen3.5 exporter needs (onnx-community's Qwen3.5 exports were not made with
   stock `optimum-cli`; check their model card for the exporter before relying on step 3).
3. **Export** (fp32 first):
   `optimum-cli export onnx --model alibiserikbay/JevK5 --task text-generation-with-past jevk5-onnx/`
   Keep `jevk5_config.json` (temperature 1.532) next to the output.
4. **Quantize to q4 / q4f16** with ONNX Runtime's `MatMulNBitsQuantizer` (block size 32, symmetric),
   producing `onnx/model_q4.onnx` and `onnx/model_q4f16.onnx`; weights over 2 GB go to external
   data (`*.onnx_data`, which transformers.js loads with `use_external_data_format`).
5. **Validate** on a few issues against the JevK5 Python server (`jevk5-serve`, same prompt): the
   letter probabilities should match to a few decimals. Then run the agreement harness pattern of
   `scripts/compare-batching.mjs`, per-issue mode only.
6. **Publish** the folder to a Hub repo (`config.json`, tokenizer files, `onnx/`), add an entry to
   `BROWSER_MODELS` in `src/domain/provider.ts` with its repo id, download sizes and
   `placeholder: false`, and pick it in Settings. The browser provider stores `{ kind: 'browser',
   modelId }`, so any repo id with the same file layout works.

Estimates (not measured): the fp32 export of a 4B model needs ~32 GB of RAM (16 GB of weights plus
export overhead) and 30–60 minutes on a desktop CPU; the q4 output is ~2.5–3 GB, so the browser
download grows about 5×, and a consumer GPU needs ~4–5 GB free for it.

**Kev-0.8B** is a harder second step: merge its LoRA adapter into `Qwen/Qwen3.5-0.8B-Base`
(PEFT `merge_and_unload()`), export as above, and reimplement its **pointer head** (`head.pt`),
which scores hidden states at the `<decide>` and `</opt>` tokens instead of reading letter logits.
That needs the hidden states from the forward pass (a different `logitsAt`) and a port of `head.pt`
after inspecting its tensor shapes; its exact math is not published.
