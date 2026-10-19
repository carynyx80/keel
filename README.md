# Keel

**Keel is a code-comprehension workbench.** Point a room of AI agents at your own repository, or at an undocumented open-source dependency you rely on. You get back architecture maps, cited answers, ports to other languages, recovered specs and onboarding tours.

The name comes from the keel of a ship: the hidden structure the whole hull is built on. Recovering that structure is what Keel does.

Keel only analyzes code you have the right to analyze: your own repos, public open-source repos, or a zip you upload.

## Modules

All five modules run on one shared engine (see [Architecture](#architecture)).

| Module | What it does | Output |
|---|---|---|
| **Cartograph** | Maps module boundaries, the dependency graph, and public surface vs. internals. Drafts a README. | Interactive 3D graph, two Mermaid diagrams (one computed from imports, one recovered by the agents), and a Markdown README |
| **Interrogator** | Answers questions about the code, e.g. "Where is auth enforced?" or "What breaks if I delete X?". | Chat transcript. Every claim has a clickable `file:line` citation, and citations are checked against the index. |
| **Porter** | Recovers a module's contract from its source and tests, then re-implements it in another language. Runs both versions on the same contract cases. | Ported code, a diff, and an equivalence report (score plus a per-case table) |
| **Spec Recovery** | Rebuilds the missing design doc. | `openapi.yaml` (structure-checked), an ER diagram, and a business-rules list with the lines that enforce each rule |
| **Narrator** | Writes an ordered onboarding tour: "start here, then follow the request to here". | Step-by-step walkthrough with run, read and quiz checkpoints. Downloadable as `ONBOARDING.md`. |

The **Demo repo** button loads `demo-repo/` (`harbor-api`), a small undocumented berth-booking API that ships with the app. Once it's ingested, Cartograph starts on its own, so the whole flow can be tested in about 30 seconds without supplying anything.

## Run locally

```bash
npm install
cp .env.example .env.local   # then set OPENAI_API_KEY
npm run dev                  # http://localhost:3000
```

Requires Node 20 or later. The one environment variable that matters:

| Variable | Required | Notes |
|---|---|---|
| `OPENAI_API_KEY` | yes, for agent modules | Read only on the server and never sent to the browser. Without it, ingest and the 3D map still work, and the agent modules show a clear "no API key" error. |
| `OPENAI_MODEL` | no | Defaults to `gpt-5.5`. Set it to any chat model your key can use that supports structured outputs. |
| `ANTHROPIC_API_KEY` | no | Alternative provider. Used only when `OPENAI_API_KEY` is unset; the agents then run on Claude (`KEEL_MODEL`, default `claude-opus-5-5`). |

To force the 2D fallback renderer, open `/?render=2d`.

## Architecture

```
            ┌───────────── one shared engine (lib/engine) ─────────────┐
 source ──▶ │ Ingest ─▶ Index ─▶ Dispatch ─▶ Synthesize ─▶ Stream (SSE) │ ──▶ UI + 3D scene
 demo/git/  │ caps      imports   planner      module-       progress,   │
 zip        │ /tmp      symbols   → readers    specific      findings,   │
            │           chunks    (bounded     output        deltas,     │
            │           vectors   concurrency)               results     │
            └───────────────────────────────────────────────────────────┘
```

1. **Ingest** (`lib/engine/ingest.ts`) takes one of three sources:
   - the bundled demo
   - a public Git URL, shallow-cloned into `/tmp` with `isomorphic-git` (no `git` binary needed on Vercel)
   - an uploaded zip

   It skips vendored and binary files and applies the size caps listed under [Known limits](#known-limits).
2. **Index** (`lib/engine/indexer.ts`) does five things:
   - resolves imports for JS/TS, Python, Go, Ruby, Java/Kotlin and Rust
   - extracts symbols and routes with regexes
   - splits files into 60-line chunks with overlap
   - builds the dependency graph, collapsing low-degree files into directory nodes once a repo passes 220 nodes
   - builds a retrieval index

   Each warm server instance caches indexes per repo, so modules don't re-index.
3. **Dispatch** (`lib/engine/dispatch.ts`):
   - A **planner** agent sees the file tree, the import graph and the retrieval hits, and picks up to 5–8 line-range slices.
   - **Reader** agents (4 at a time) each study one slice. They return structured findings with file and line references, and those references are clamped to real line ranges.
4. **Synthesize** (`lib/modules/*.ts`): a **synthesizer** agent merges the findings into that module's output format, using JSON-schema structured outputs. Porter adds a **verifier** step.
5. **Stream** (`lib/engine/stream.ts`): every stage emits Server-Sent Events, so the UI fills in while the job runs:
   - the activity log and reader findings
   - the Interrogator's answer, token by token
   - Porter's case results, one at a time
   - Narrator's tour steps

   The 3D scene pulses the files that agents are reading (amber) and the files they cite (teal).

Agents call OpenAI's Chat Completions API through the `openai` SDK (`lib/engine/llm.ts`), streaming, with strict JSON-schema structured outputs and `reasoning_effort` per agent role. The same file can run the agents on Claude instead when only `ANTHROPIC_API_KEY` is set.

### The 3D stage

- Built with React Three Fiber and drei. Files are instanced icosahedrons sized by line count and colored by module. Dependencies are line segments. The layout is a 3D force simulation (`d3-force-3d`) that clusters modules on a sphere.
- **Adaptive:**
  - An empty session shows a slowly rotating keel wireframe.
  - Ingest fills in the real graph.
  - Agent reads and citations make nodes pulse.
  - Hovering a node highlights its neighbors.
  - Clicking a node moves the camera to it and opens an action card.
- **Degrades gracefully:**
  - The 2D canvas renderer takes over when WebGL is missing, on low-power devices (≤ 2 cores or ≤ 2 GB device memory), with data saver on, or when the WebGL context is lost or crashes.
  - `prefers-reduced-motion` stops the drift and the pulse animation.
  - Graphs over 220 nodes are collapsed (level of detail).

## Known limits

These are the real limits. Where something can't run inside a Vercel function, Keel says so in the UI instead of faking it.

| Limit | Value | Why |
|---|---|---|
| Upload size | 3 MB zip | Vercel caps request bodies at 4.5 MB, and base64 adds 33%. |
| Checkout size | 40 MB of source | Larger repos are rejected with a message. |
| Indexed text | 600 files / 4 MB / 200 KB per file | Above this, files are truncated and the UI flags it. |
| Clone timeout | 45 s | A larger repo should be uploaded as a zip of the folder you care about. |
| Job duration | `maxDuration = 300` s per module run | Needs Vercel Fluid Compute, the default for new projects. Typical runs take 1–3 minutes. A job that gets cut off shows a "connection closed before the job finished" error. |
| Private repos | not cloned | Upload them as a zip instead. |
| Index cache | per warm instance | On a cold start, the client sends the repo source again and Keel re-indexes it, usually in under a second. Each zip run re-uploads the zip. |
| Retrieval | sparse vectors (feature-hashed TF-IDF over code-aware tokens) | Keeps Keel free of any external database and of a second paid embeddings call per run. `VectorStore` is an interface (`lib/engine/vector.ts`), so a hosted embedding store can be dropped in later. |
| Porter equivalence | **executed** only for JS/TS → TypeScript/JavaScript | Both the original and the port run in a constrained `node:vm` context: no `process`, no fs, network or Node built-ins, in-repo relative imports only, and a 1 s timeout per call. Outputs are compared structurally. |
| Porter equivalence | **model-traced** for Python, Go and Rust targets, or non-JS sources | Those languages can't run inside a Vercel Node function. A verifier agent traces the port by hand against the original's *executed* outputs, and the report labels the result as an estimate. |
| Porter file size | ≤ 600 lines per module | Keeps one run within the time limit. |
| Sandbox | `node:vm` is not a security boundary | On Vercel, the function's own micro-VM is the real isolation. Only port code you trust (your own, or the demo). |
| Static analysis | regex-based import and symbol extraction | Fast and works across languages, but dynamic imports and unusual aliasing can be missed. |

## Deploy to Vercel

1. Push this folder to a Git repo, or deploy it directly with `npx vercel`.
2. In the Vercel project, go to **Settings → Environment Variables** and add `OPENAI_API_KEY` for Production (and Preview if you use it).
3. Redeploy. The build command is `npm run build`, which bundles `demo-repo/` into `lib/demo/bundle.generated.ts` first.
4. Check `/api/health`. It returns `{ "hasApiKey": true, "provider": "openai", "model": "…" }` once the key is set.

## Project layout

```
app/                    Next.js App Router: page + API routes (ingest, run/[module], file, health)
components/scene/       3D stage (R3F), 2D fallback, force layout
components/modules/     The five module panels
lib/engine/             Shared engine: ingest, indexer, vector store, llm, dispatch, sandbox, diff, SSE
lib/modules/            Module pipelines: cartograph, interrogator, porter, spec, narrator
demo-repo/              Bundled sample repo (harbor-api); its tests run with `node --test test/*.test.js`
```
