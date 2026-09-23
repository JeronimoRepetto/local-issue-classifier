# In-browser Jev-compatible inference: feasibility study

Researched 2026-09-23. Every claim below is either quoted/paraphrased from a primary source with
its URL, computed from published numbers (marked **derived**), or explicitly marked
**assumption**/**could not verify**. Nothing here was run; no weights were downloaded.

## 1. Question and verdict

Can local-issue-classifier classify issues by running a Jev-compatible model (Kev or JevK5)
**inside the browser** via WebGPU/WASM, so a future user needs neither a TypeSafe API key nor a
self-hosted Jev-compatible server (the "local Python server" mode `docs/deployment.md` already
names as a plausible future backend, never built)? **Feasible with real limits, not feasible for
the product's current batched-state design as-is.**

The runtime question is settled: transformers.js v3 (ONNX Runtime Web) gives direct, unmediated
access to raw next-token logits from a single forward pass — exactly the primitive JevK5's
readout needs — over both WebGPU and WASM, for the Qwen3 family Kev/JevK5 are built on. The two
real obstacles are model-specific, not runtime-specific. First, Kev's readout is **not** a
next-token-logit softmax as this brief assumed; it is a custom "pointer head" scoring specific
hidden states, whose weights (`head.pt`) are not documented well enough to port without
reverse-engineering (§2, §4). Second, the app's batched mode builds states up to ~28,800 tokens,
and a naive (non-tiled) attention implementation over a state that long would need to materialize
attention-score matrices tens of gigabytes in size per layer (§3's numbers) — almost certainly
exceeding both consumer VRAM and current WebGPU per-buffer limits. Per-issue mode (a few thousand
tokens) does not have this problem. JevK5's simpler, confirmed readout mechanism and single merged
checkpoint make it the better first target; Kev's pointer head is a second, harder increment.

## 2. How Kev and JevK5 compute an answer

Both are fine-tunes of Alibaba's Qwen3.5 base models (Apache-2.0) and both brand their technique a
non-autoregressive, single-forward-pass probability readout — TypeSafe calls this "System One" for
its own closed Jev. **The two open clones use different mechanisms from each other**, and Kev's
differs from what this task's brief assumed.

### JevK5 — confirmed: softmax over option-letter next-token logits

`allebee/jevk5`'s `MODEL_CARD.md` (fetched from
`https://github.com/allebee/jevk5`, raw): *"SemIf's protocol (TheoLeeCJ/SemIf, MIT): a softmax
over the answer letters' next-token logits, divided by one calibration temperature."* The fitted
temperature is **1.532**, stored in `jevk5_config.json`, "fitted on teacher questions from three
domains that training never saw." This is a plain classification-style readout: run one forward
pass over the state+question, take the logits row at the final position, slice out the token ids
for the candidate option letters, divide by 1.532, softmax. Exactly the primitive
`const { logits } = await model(inputs)` in transformers.js gives you (§3).

- Base: `Qwen/Qwen3.5-4B` (HF API `base_model` field,
  `https://huggingface.co/api/models/alibiserikbay/JevK5`).
- Distribution: **merged**, not an adapter — `MODEL_CARD.md`: "Qwen3.5-4B with merged LoRA (rank
  16, attention projections)"; the HF file listing has one `model.safetensors`, no
  `adapter_config.json`.
- License: Apache-2.0 (HF API `license` field, plus a `LICENSE`+`NOTICE` pair in the GitHub repo).
- Hard cap, refuses rather than truncates: *"supports up to 16 options, and refuses inputs over
  16,384 tokens"* (MODEL_CARD.md).
- **Unresolved discrepancy (flagged, not asserted):** the HF API reports `model.safetensors` at
  4,205,751,296 bytes (~4.2 GB) tagged BF16. At 2 bytes/param that implies ~2.1B stored parameters
  for a model named and based on a nominal 4B/4.7B-parameter Qwen3.5-4B. This wasn't reconciled —
  see §6.
- A prior summarized fetch (not the raw file) also claimed a "JevK5-GGUF" repo and a "JevK5-2B"
  variant; neither appears in the raw README/MODEL_CARD text, and this looks like a
  summarization hallucination rather than a real artifact. **Do not treat those two as real.**

### Kev — confirmed: a custom pointer head over hidden states, not letter-logits

`jaredpalmer/kev`'s `PLAN.md` (raw, `https://raw.githubusercontent.com/jaredpalmer/kev/main/PLAN.md`)
describes a **pointer head**: it "scores each option's `</opt>` hidden state against the
question's `<decide>` hidden state. A softmax turns those scores into probabilities." Training
uses cross-entropy against the correct option. This means the answer is not read off the base
model's own vocabulary logits at all — it needs (a) the hidden states at two specific special-token
positions (`<decide>` and each `</opt>`) from a forward pass, and (b) a small separately-shipped
scoring module (`head.pt`) applied to those vectors. `head.pt`'s exact shape/math was not published
in enough detail to reimplement from the fetched sources — this is the single biggest engineering
risk in the whole plan (§4, §6).

- Base: `Qwen/Qwen3.5-0.8B-Base` / `-4B-Base` / presumably `-9B-Base` (HF model cards for the 0.8B
  and 4B variants, revisions `dc7cdfe2` / `1001bb4d`).
- Distribution: **LoRA adapter + head, not merged**. HF API JSON
  (`https://huggingface.co/api/models/jaredpalmer/kev-0.8b`, `.../kev-4b`) gives:
  - `kev-0.8b`: adapter r=16 (11.3M trainable params) — `adapter_config.json`,
    `adapter_model.safetensors`, `head.pt` — **~113 MB total**.
  - `kev-4b`: adapter r=16 (33.8M trainable params), applied to attention q/k/v/o and MLP
    gate/up/down projections plus the DeltaNet in/out projections — **~582 MB total**
    (581,871,494 bytes).
  - The base Qwen3.5 weights are **not** in these repos; the README says the user downloads the
    base separately and applies the adapter locally — a two-step assembly before there's a single
    deployable checkpoint (merging is a mechanical, well-documented PEFT `merge_and_unload()`
    step, so this is a real but small extra task, §5 T8).
- License: Apache-2.0 for Kev's code/adapters/head and for the Qwen3.5 bases (both stated
  explicitly in the README and model cards).
- Architecture (Qwen3.5, from PLAN.md — **verified, and directly relevant to §3's memory math**):
  a **hybrid** 32-layer stack, only **8 layers are full (quadratic) attention**; the other **24 are
  Gated DeltaNet**, a linear-attention variant whose per-layer state is a small fixed-size
  recurrent state instead of a KV cache that grows with context length. For the 4B: hidden dim
  2560, 16 query / 4 KV heads (GQA), 262,144-token native context, "Checkpoint Size 4.7B" (total
  parameters). For the 9B: hidden dim 4096, "Checkpoint Size 9.7B." No equivalent per-layer
  breakdown was published for the 0.8B variant — treat its exact KV-cache math as an
  **assumption/estimate** (§3).
- Calibration temperatures stored per checkpoint: 0.8B T=2.41, 4B≈2.14, 9B≈2.30 (from the
  model cards/PLAN.md fetch; not independently verified against the `head.pt` binary contents).
- Prompt template (token-level skeleton, PLAN.md): `<state> …state… <q> instructions <opt> option
  1 </opt> <opt> option 2 </opt> … <decide>`, five special delimiter tokens at ids 248049–248062
  in a 248,320-entry Qwen3.5 tokenizer vocab.
- Training/serving context: trained on ≤384 state tokens / ≤1,024 (state+one question); README
  states up to **8,192 tokens allowed for state+one question** when served — well under the
  ~28,800-token batched-state cap this app can build (§3).
- Benchmark: Kev-9B reports 0.852 accuracy / 0.237 Brier vs. Jev's own reported 0.857/0.211 on
  held-out data (README).
- The GitHub repo has no conversion/export directory and no GGUF/ONNX artifacts (verified from the
  repo's file listing: `modal_app.py`, `kev/`, `evals/`, `scripts/`, `space/`).
- Kev advertises a Hugging Face Spaces demo as "no install needed." **Could not verify** whether
  that Space runs client-side (WebGPU) or server-side — almost certainly the latter; its marketing
  copy is not evidence of browser execution and shouldn't be cited as such.

### What a runtime must expose, given the above

- For JevK5: raw logits at the last sequence position, for an arbitrary small set of token ids,
  before any sampling/decoding step. transformers.js gives this directly (§3).
- For Kev: raw **hidden states** (not just logits) at specific token positions from a forward
  pass, plus the ability to run an extra small custom scoring module (`head.pt`, ported to
  TypeScript/ONNX) over those vectors. This is a materially bigger ask than "expose logits" — most
  runtime comparisons (including this task's own framing) implicitly assume the JevK5-style
  mechanism, and that assumption does not hold for Kev.
- For TypeSafe's own closed Jev (context only, not a build target): `archerhume.com`'s
  reverse-engineering post (`https://archerhume.com/posts/jevs-architecture-unmasked`, fetched
  successfully) describes a third, simpler mechanism again — a direct linear readout `z = Wh + b`
  then softmax from hidden states, on an unknown/proprietary base model whose tokenizer most
  closely resembled Qwen's in the article's own re-test. This confirms the *category* (parallel,
  non-autoregressive, no generated text) is real across all three systems, but the exact math is
  three different implementations, not one shared one.

## 3. Runtime comparison

| Runtime | Raw logits/logprobs for last-position readout | WebGPU | WASM | Qwen3(.5) support | Conversion effort | Download size at ~q4 (concrete example) | License |
|---|---|---|---|---|---|---|---|
| **transformers.js v3** (on ONNX Runtime Web) | **Yes, confirmed directly**: docs quote `const { logits } = await model(inputs)` returning a raw `Tensor`; `forward()` bypasses `generate()`/sampling entirely ([docs](https://huggingface.co/docs/transformers.js/en/api/models)) | Yes (`device: 'webgpu'`) | Yes (default backend) | Yes, confirmed in the supported-models list | Optimum `optimum-cli export onnx`; many pre-converted models already under the `onnx-community` HF org | Not independently pulled for a Qwen3.5-sized model this session — see §6 | Apache-2.0 |
| **WebLLM / MLC-LLM** | Yes, confirmed via the low-level `LogitProcessor`/`forwardTokenAndSample()` API ([example](https://github.com/mlc-ai/web-llm/tree/main/examples/logit-processor)), which can read/force individual token logits pre-sampling. The higher-level OpenAI-style `logprobs`/`logit_bias` surface was not confirmed in the fetched README. | **Required — no WASM fallback** ("everything runs inside the browser... accelerated with WebGPU") | No | Supported in current releases (a prebuilt `mlc-ai/Qwen3-0.6B-q4f16_1-MLC` exists on HF), but the README text itself is stale and still only lists Qwen2 — flag the discrepancy | Needs `mlc_llm convert_weight` into MLC's own format, a separate pipeline from ONNX | **~335 MB** weight shards for Qwen3-0.6B at q4f16_1 (fetched HF file listing; repo total ~352 MB incl. tokenizer files) | Apache-2.0 |
| **ONNX Runtime Web** | Yes, but confirmed only **indirectly** (transformers.js's own docs state "Transformers.js uses ONNX Runtime to run models in the browser," and ORT's `InferenceSession.run()` returning named output tensors as-is is standard, well-documented ORT behavior, not something re-quoted from ORT's own web docs this session) | Yes (`webgpu`/`webnn` EPs listed) | Yes (`wasm`/`webnn` EPs listed) | N/A — a framework, not model-specific | N/A (transformers.js/Optimum are the practical path on top of it) | N/A | MIT (well-known, not re-fetched this session) |
| **wllama** (llama.cpp → WASM) | **Unconfirmed by primary source this session.** README/source (`createCompletion`, `createChatCompletion`, `createEmbedding`, token-id helpers) did not surface a logits-access method directly; a secondary (unverified) source claims a `getLogits(topK)` method and OpenAI-style `logprobs`/`top_logprobs` options on `createChatCompletion`. llama.cpp's own server does document `n_probs`/`logit_bias` at the C++ level, which is suggestive but not the same as confirming wllama's JS binding exposes it. | Yes, **since v3.1** via PR #215 — not CPU-only as an older assumption would have it | Yes (native WASM mode) | Depends entirely on GGUF-converting the base model (`convert_hf_to_gguf.py`); not framework-gated | GGUF conversion via llama.cpp's own converter | No concrete 1–4B-scale example found; docs only show toy models (`stories15M`) | MIT |

Cross-cutting notes:

- **Browser WebGPU rollout** (WebSearch, secondary/dated sources — cite with appropriate caution):
  as of November 2025, WebGPU ships by default in Chrome, Edge, Firefox and Safari. Firefox:
  Windows since Firefox 141 (~July 2025), macOS (Apple silicon) since Firefox 145; Linux/Android/
  Intel-Mac reported still in progress. Safari: shipped in Safari 26.0 (Sept 15, 2025) across
  macOS Tahoe/Sequoia/Sonoma and iOS/iPadOS/visionOS 26, on by default. A caniuse snapshot dated
  Feb 2026 (secondary source) puts global support at **~87% desktop / ~71% mobile**. This
  materially changes the "Firefox/Safari lag" assumption in the task brief: as of this research
  date it is largely resolved on desktop, with mobile/Linux/older-OS gaps remaining the main
  holes — a WASM fallback (transformers.js or wllama) is still worth keeping for those.
- **Given transformers.js is the only runtime confirmed to expose logits directly with both a
  WebGPU and WASM path, and confirmed Qwen3 support, it is the recommended runtime** (§4).
  WebLLM's WebGPU-only requirement and its own README lagging real Qwen3 support are secondary
  reasons against it as the primary path, though its `LogitProcessor` API is a legitimate fallback
  if ONNX export of Qwen3.5's hybrid DeltaNet layers turns out to be unsupported (§4's risks).

## 4. Recommended path

**Runtime: transformers.js v3 on ONNX Runtime Web, WebGPU with a WASM fallback.** Key reason: it
is the only runtime in §3 with a *directly quoted, primary-sourced* API for raw last-position
logits (`const { logits } = await model(inputs)`), it already supports Qwen3, and it degrades to
WASM instead of hard-failing when WebGPU is unavailable — unlike WebLLM.

### Step plan

**(a) Model export.** JevK5 first (merged single checkpoint, confirmed simple readout): export via
🤗 Optimum (`optimum-cli export onnx`) to ONNX, quantize to q4 (or start at q8/fp16 if q4 hits
accuracy or unsupported-op issues — see risks). Kev second: merge the LoRA adapter into its base
with PEFT's `merge_and_unload()` (a one-time, well-documented, mechanical Python step — this does
**not** by itself solve the pointer-head problem, it only produces a single exportable checkpoint
for the *base* Qwen3.5 forward pass; `head.pt` still needs a separate TypeScript/ONNX
reimplementation informed by inspecting its actual tensor shapes, since PLAN.md's prose
description isn't sufficient to reproduce it byte-for-byte).

**(b) Readout implementation.** For JevK5: reproduce `chat_template.jinja`'s prompt structure, map
each option letter to its token id(s) in the Qwen3.5 tokenizer, run one forward pass, slice
`logits` at the last position to those ids, divide by 1.532, softmax — a few dozen lines of
TypeScript. For Kev: extract hidden states at the `<decide>` and each `</opt>` position, port
whatever `head.pt` turns out to contain (likely a small bilinear or attention-style scoring
module — unconfirmed) into TS or a tiny second ONNX graph, run its softmax.

**(c) `createBrowserJevTransport()`.** Implement the existing `JevTransport` interface
(`src/adapters/jev/transport.ts`: `systemOne(body, signal)` → `JevHttpResult<SystemOneResponseBody>`,
`listModels(signal)`) entirely in-process — no `fetch`, no proxy. It answers the same
`SystemOneResponseBody` shape (`answers`, optional `usage`) that `classification.ts` already
validates, so nothing above the transport seam changes; this matches the architectural intent
already stated in `docs/deployment.md`'s "Local Jev-compatible providers" note (`JevTransport` is
"a single seam by design"). `usage.input_tokens`/`output_tokens` would need to be estimated locally
(there's no upstream API to report them) or simply omitted, since they're optional.

**(d) UI.** A "Run in browser" provider option alongside the existing key-based cloud provider,
gated by the hardware-fit tiers already defined in `lane/hardware`'s `src/domain/hardware.ts`
(`LOCAL_TIERS`: kev-0.8b 3 GB, kev-4b/jevk5 10 GB, kev-9b 20 GB) — those figures were themselves
derived from the same README working-set numbers this research re-confirms (e.g. "Kev-4B: ~9 GB
GPU memory for inference," from the kev-4b model card). Show model download progress via
transformers.js's/WebLLM's documented progress callbacks, and surface the browser's own storage
quota/eviction behavior instead of reinventing it: Chrome/Edge grant **60% of disk** to an origin
in both best-effort and persistent modes; Firefox grants the smaller of **10% of disk or 10 GiB**
best-effort, or up to **50% of disk (capped 8 TiB)** once `navigator.storage.persist()` is granted;
Safari grants up to **~60–80% of disk** for browser-app contexts (all from MDN's Storage quotas
and eviction criteria page, fetched directly). Eviction is LRU across origins, skips persisted
origins, and deletes an origin's data as a whole, not partially; Safari additionally purges
script-created data for origins with no user interaction in 7 days. A multi-gigabyte model download
is well within quota on any modern machine, but the UI should call
`navigator.storage.persist()` and handle the (rare) eviction case gracefully rather than assume the
cache is forever.

**(e) Validation.** An agreement harness comparing browser-model classifications against cloud Jev
on the same issue set, following the existing pattern in `scripts/compare-batching.mjs` (per-issue
mode only, given §3's memory analysis) — report per-dimension agreement and confidence, not just
exact match, since Jev's own scores are explicitly "weak in numerical calibration"
(`docs/jev-questions.md`).

### Risks, ranked

1. **Kev's readout is a custom pointer head, not a letter-logit softmax** (§2) — the single
   biggest risk. `head.pt`'s exact math isn't published in the sources fetched; without it, Kev
   cannot be ported faithfully, only approximated. JevK5 does not have this problem and should be
   the first (and possibly only, for a v1) local model.
2. **Batched-mode state size (~28,800 tokens) likely exceeds what a naive WebGPU attention
   implementation can hold.** Kev-4B's published architecture (hidden dim 2560, 16 attention
   heads, 8 full-attention layers) means a single full-attention layer's un-tiled attention-score
   matrix at 28,800 tokens is **28,800² × 16 heads × 2 bytes (fp16) ≈ 26.5 GB** (derived from the
   published head/hidden-dim numbers — this is *not* KV-cache memory, which is far smaller
   (§ below); it's the O(n²) score matrix a naive matmul+softmax+matmul attention kernel must
   materialize before it can be reduced). That is far beyond both typical consumer VRAM and current
   WebGPU per-buffer size limits, unless the runtime's WebGPU attention kernel is tiled/fused
   (flash-attention-style) so it never materializes the full matrix at once — this project did not
   confirm whether ONNX Runtime Web's WebGPU EP has such a kernel (§6, open question). **Per-issue
   mode is a completely different, much more tractable regime**: at ~4,000 tokens the same
   calculation gives ~512 MB per layer, plausibly tileable even without a fused kernel. This is the
   concrete evidence behind the "may force per-issue mode" caveat in this task's own brief — treat
   batched mode in-browser as unproven until measured, and per-issue mode as the realistic v1
   target.
3. **Qwen3.5's hybrid architecture (Gated DeltaNet linear-attention layers, 24 of 32) is a very
   recent op type.** Whether Optimum's ONNX exporter and ONNX Runtime Web's WebGPU EP support
   these ops today, or only the standard 8 full-attention layers, was not verified — this is a
   real, unresolved technical risk that could block export entirely and should be the very first
   thing the prototype (§5, T1) checks, ideally against a small plain (not fine-tuned) Qwen3.5
   checkpoint before spending any effort on Kev/JevK5 specifically.
4. **Exact readout fidelity.** Even once logits/hidden-states are reachable, matching the cloud
   API's output requires the identical prompt template, tokenizer behavior, and (for JevK5) the
   exact 1.532 temperature — any drift changes the resulting probabilities, and there is no
   published test suite to check against other than building one (§4(e)).
5. **First-load UX.** A multi-hundred-MB-to-several-GB one-time download (§3, §6) before the
   feature works at all; needs clear progress UI and a hardware-fit gate up front so a user isn't
   surprised by a multi-gigabyte download that then fails on their hardware.

## 5. Effort estimate and prototyping order

| Task | Description | Model | Why |
|---|---|---|---|
| T1 | Smallest experiment: load any small public Qwen3(.5) ONNX model in transformers.js, run one forward pass with WebGPU, read `logits` at the last position for an arbitrary token subset, and confirm the hybrid DeltaNet layers exported/ran at all. **Do this before touching Kev or JevK5 weights.** | Sonnet | Mechanical once the API is known; the risk is discovering an unsupported op, which is a fast fail/pass, not a design decision. |
| T2 | Export JevK5's merged checkpoint via Optimum to ONNX, quantize (q4, falling back to q8/fp16 if needed), and get it loading in transformers.js. | Opus | Architecture-sensitive: likely the first place an unsupported-op or quantization-accuracy problem shows up, needing judgment on how to work around it. |
| T3 | Implement JevK5's exact prompt template + option-letter token mapping + 1.532-temperature softmax readout in TypeScript, matching the `/v1/systemone` response shape. | Sonnet | Well-specified once §2's mechanism is confirmed; mostly translation. |
| T4 | Implement `createBrowserJevTransport()` against the existing `JevTransport` interface; wire it in behind a new "Run in browser" provider choice. | Sonnet | Matches an existing, well-documented seam (`transport.ts`); no new architecture. |
| T5 | Hardware-fit-gated UI: download progress, `navigator.storage.persist()`/quota handling, reusing `lane/hardware`'s tiers. | Sonnet | UI wiring against an already-designed domain module. |
| T6 | Agreement harness vs. cloud Jev, per-issue mode only, following `scripts/compare-batching.mjs`'s pattern. | Sonnet | Follows an existing script pattern. |
| T7 | Merge Kev's LoRA adapter into its base offline (PEFT `merge_and_unload()`), export to ONNX. | Sonnet | Mechanical, standard PEFT operation, well documented upstream. |
| T8 | Reverse-engineer and port Kev's pointer head (`head.pt`) — inspect its actual tensor shapes/state dict, reconstruct the scoring function, port to TS or a second small ONNX graph. | Opus | Genuine architecture/reverse-engineering judgment call with no full spec available; the highest-uncertainty task in the whole plan. |
| T9 | Investigate whether batched (multi-issue) states can ever run in-browser (tiled/flash attention availability in ORT Web's WebGPU EP), or whether to formally scope browser mode to per-issue only. | Opus | Depends on runtime internals not covered by this research; a scoping decision with product impact. |

Prototype T1 first, independent of Kev/JevK5 licensing or size: it is the cheapest possible test of
the riskiest unknown (§4 risk 3, Qwen3.5 op support), and it produces a real measured
tokens/second (or rather, prefill-latency) number this research could not find published anywhere —
see §6. Only after T1 passes does JevK5 (T2–T6) become worth the time; only after JevK5 ships does
Kev's harder pointer head (T7–T8) become worth attempting.

## 6. Open questions / could not verify

- **JevK5's file-size discrepancy** (§2): ~4.2 GB BF16 `model.safetensors` for a nominally
  4B/4.7B-parameter model implies ~2.1B stored parameters at 2 bytes/param. Not reconciled; could
  be a labeling artifact, a narrower effective dtype than the BF16 tag states, or something
  specific to how the hybrid architecture's DeltaNet layers are stored. Needs a direct look at
  `config.json`'s layer/hidden-size fields, which was not done this session.
- **Kev-0.8B's exact per-layer/head architecture** — not published in the sources fetched, so its
  KV-cache and attention-matrix memory figures (unlike Kev-4B's) could not be computed; only
  estimated to be smaller.
- **`head.pt`'s actual tensor shapes/format** — PLAN.md describes the pointer head in prose only;
  reimplementing it precisely needs inspecting the file itself (not done — no weights were
  downloaded, per this task's constraints).
- **Whether ONNX Runtime Web's WebGPU execution provider has a tiled/fused (flash-attention-style)
  attention kernel**, which determines whether §4 risk 2's ~26.5 GB naive-attention estimate is
  avoidable in practice. Not found in the fetched ORT Web docs; needs a direct source check.
- **wllama's actual logits/logprobs API surface** — plausible via analogy to llama.cpp's server
  (`n_probs`, `logit_bias`) but not confirmed by a primary-source quote from wllama's own
  README/source this session.
- **Whether Qwen3.5's Gated DeltaNet layers are supported by Optimum's ONNX exporter and by ONNX
  Runtime Web today** — the single most important unresolved technical question, and the first
  thing T1 should answer.
- **Concrete download size for a Qwen3.5-scale (4B) model converted to ONNX under
  `onnx-community`** — not independently fetched; only WebLLM's MLC-format Qwen3-0.6B (~335 MB)
  was confirmed with a real number.
- **Any published tokens/second or prefill-latency benchmark for WebGPU inference at the ~4,000–
  28,800-token context lengths this app actually needs** — none found. Given the readout is a
  single forward pass (prefill), not autoregressive decoding, published chat-model "tokens/second"
  benchmarks are not the relevant metric anyway; this needs direct measurement in the T1/T2
  prototypes rather than an estimate.
- **JevK5's claimed distillation lineage from "Qwen3.6-27B"** — appeared in one AI-summarized
  fetch, not corroborated in the raw README/MODEL_CARD text pulled directly; treat as unverified.
- Kev's Hugging Face Spaces demo's execution mode (client-side vs. server-side) — not fetched.

## Sources

- `https://github.com/jaredpalmer/kev` (README, PLAN.md via raw.githubusercontent.com)
- `https://huggingface.co/jaredpalmer/kev-0.8b`, `https://huggingface.co/jaredpalmer/kev-4b`
  (model cards + HF API JSON)
- `https://github.com/allebee/jevk5` (README, MODEL_CARD.md)
- `https://huggingface.co/alibiserikbay/JevK5` (model card + HF API JSON)
- `https://archerhume.com/posts/jevs-architecture-unmasked`
- `https://github.com/mlc-ai/web-llm` (README, `examples/logit-processor`)
- `https://huggingface.co/mlc-ai/Qwen3-0.6B-q4f16_1-MLC` (HF file listing)
- `https://huggingface.co/docs/transformers.js/en/api/models`
- `https://github.com/ngxson/wllama` (README, `src/wllama.ts`)
- `https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria`
- Internal: `docs/architecture.md`, `docs/deployment.md`, `docs/batching.md`,
  `docs/jev-questions.md`, `src/adapters/jev/transport.ts`, and `lane/hardware`'s
  `src/domain/hardware.ts` (read for existing conventions and tier figures; not modified).
