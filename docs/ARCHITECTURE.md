# Architecture

This document explains the design decisions made in this repository and how the pieces fit
together. The goal is to give a reviewer enough information to evaluate the system along
the dimensions that matter most: architecture, API implementation, concurrency, code
quality, documentation, and error handling.

---

## 1. System overview

```
               ┌──────────────────────────┐
               │        Frontend (React)  │
               │  Vite · TS · Tailwind    │
               └─────────────┬────────────┘
           HTTP (REST) │          │ WebSockets (Socket.IO)
                       ▼          ▼
               ┌──────────────────────────┐
               │       Backend (NestJS)   │
               │  Controllers · DTOs      │
               │  WebSocket Gateway       │
               │  ProcessService          │
               │  BullMQ Worker           │
               │  AI Engine (MLP + TR)    │
               └─────┬──────────┬─────────┘
        Prisma ORM    │          │  BullMQ client
                      ▼          ▼
               ┌───────────┐ ┌────────────┐
               │ Postgres  │ │  Redis     │
               │  (state)  │ │  (queue)   │
               └───────────┘ └────────────┘
```

Everything runs on Docker via `docker-compose`. The backend also reads a sample input folder
from the host (`./sample-data`) mounted read-only inside the container.

---

## 2. Backend module layout

```
src/
├── main.ts                       # Bootstrap (Swagger, Helmet, pipes, filters, CORS)
├── app.module.ts                 # Root module wiring
├── config/
│   ├── app.config.ts             # ConfigService namespace
│   └── env.validation.ts         # class-validator schema for process.env
├── common/
│   ├── filters/http-exception.filter.ts
│   └── interceptors/transform.interceptor.ts
└── modules/
    ├── prisma/                   # Prisma client (global provider)
    ├── health/                   # /health with Terminus + Prisma ping
    ├── events/                   # Socket.IO gateway (rooms: global + per-process)
    ├── documents/                # Filesystem input (list / read .txt files)
    ├── ai/                       # Local, offline AI engine
    │   ├── utils/tokenizer.ts
    │   ├── utils/text-rank.ts
    │   ├── mlp/mlp.ts            # MLP from scratch (forward/backprop, Mulberry32 RNG)
    │   ├── mlp/feature-extractor.ts
    │   ├── mlp/pretrained-weights.ts
    │   └── ai.service.ts         # Orchestrates tokenize → TextRank → MLP → summary
    └── process/                  # Process Control API (the core of the system)
        ├── constants.ts
        ├── dto/
        ├── process.controller.ts
        ├── process.service.ts
        ├── process.worker.ts     # BullMQ processor
        └── process.module.ts
```

### Why this split?

- **Separation of concerns**: transport (controller), domain (service), infrastructure
  (worker, gateway, prisma), and cross-cutting (filters, interceptors) live in different
  directories. No controller touches Prisma directly.
- **Scalability**: each module can evolve independently and be moved into a separate
  deployable unit if needed. The AI engine is `@Global()` and stateless, so it can be
  hosted in a sidecar or replaced by another implementation without touching business code.
- **Modularity**: DTOs define clear contracts. DocumentsService abstracts the filesystem so
  it can be swapped with S3 or HTTP ingestion later.

---

## 3. Data model (Prisma)

The schema (see `backend/prisma/schema.prisma`) is normalized around four entities:

- `Process` — the unit of work. Has a status machine, progress counters, timestamps,
  and relations to documents, logs, and the aggregated result.
- `Document` — one input file inside a process.
- `DocumentAnalysis` — per-document statistics + summary.
- `AnalysisResult` — aggregated, spec-shaped result for the process as a whole.
- `ActivityLog` — append-only audit log tied to each process.

Cascade deletes keep the tree consistent. Indexes on `status`, `createdAt`, and
`(processId, createdAt)` support the list/detail queries the UI performs.

---

## 4. Concurrency model

The core problem is running many processes at the same time without race conditions.
Our approach:

1. **Queue-based orchestration.** Every `process/start` request enqueues a BullMQ job.
   Redis is the single source of truth for job state; NestJS workers pick jobs up with a
   configurable concurrency (`WORKER_CONCURRENCY`).
2. **Cooperative cancellation.** The worker loop re-reads the process status before each
   batch. If the user pauses or stops the process, the next iteration exits gracefully and
   respects the new status. There is no thread kill or forced interrupt, which keeps state
   consistent.
3. **Optimistic locking through `updateMany`.** Transitions like RUNNING→PAUSED or
   RUNNING→STOPPED use Prisma `updateMany` with a `where: { status: <expected> }` clause.
   Only one concurrent caller can succeed; the others get a 400 and never overwrite a
   status they did not expect.
4. **Bounded per-batch parallelism.** Within a batch the worker spawns `min(concurrency,
   batchSize)` async tasks that pull from a shared cursor. This keeps the event loop busy
   without spawning more work than we can handle.
5. **Graceful per-document failures.** A failure while processing one document is captured,
   the document moves to `FAILED`, and the process continues. If every document fails the
   process ends in `FAILED`; otherwise it ends in `COMPLETED`.

---

## 5. Real-time updates

The Socket.IO gateway (`EventsGateway`) broadcasts to two kinds of rooms:

- `processes:global` — every connected client receives updates for every process
  (used by the dashboard list).
- `process:<uuid>` — subscribed clients receive detailed updates for one process
  (used by the detail page, including activity logs).

Events are emitted from both `ProcessService` (for user-triggered transitions) and
`ProcessWorker` (for progress / completion events). The frontend uses React Query to hold
the current state and merges WebSocket updates with `setQueryData`, so the UI stays in
sync without expensive refetches.

---

## 6. AI engine

The system uses a **local, open-source, lightweight AI pipeline**:

1. `tokenizer.ts` — regex-based tokenization, stop-word removal, sentence splitting,
   line/word/character counting.
2. `text-rank.ts` — graph-based extractive summarization (Mihalcea & Tarau 2004). Uses a
   similarity function normalized by log-lengths, plus PageRank-style power iteration.
3. `mlp/mlp.ts` — a full multi-layer perceptron implemented from scratch in TypeScript,
   with ReLU/tanh/sigmoid activations, He/Xavier initialization, mini-batch SGD + MSE
   loss, and Mulberry32 RNG for reproducibility.
4. `mlp/feature-extractor.ts` — converts each sentence into an 8-dimensional feature
   vector (position, length, lexical density, stop-word ratio, top-word overlap, numeric
   density, uppercase density, TF-IDF weighted average).
5. `ai.service.ts` — composes everything. Loads the pretrained weights at boot, runs a
   quick bootstrap fine-tune on a synthetic dataset, and for each document returns
   statistics + a combined (TextRank + MLP) extractive summary. The same scoring
   helper is reused for the cross-document phase: when a process finishes, the
   sentences that survived each per-document summary are treated as a new
   mini-corpus and re-ranked by TextRank + MLP to produce a genuine summary of
   summaries (not a concatenation of heuristic snippets). Every document keeps
   its own analysis persisted in `DocumentAnalysis`, and the global aggregate
   is stored in `AnalysisResult`.

Why this design?
- **Truly offline** — no external services, no API keys, no vendor lock-in.
- **Portable** — zero native dependencies (works on Alpine Docker out of the box).
- **Auditable** — every line of math is in this repository.
- **Retrainable** — the MLP can be trained on custom data by calling `MLP.train`.

---

## 7. Error handling & observability

- `HttpExceptionFilter` normalizes every error into a uniform JSON shape.
- `ValidationPipe` with `whitelist` + `forbidNonWhitelisted` rejects unknown fields.
- Structured logs via **nestjs-pino** (JSON in prod, pretty in dev) with redaction of
  `Authorization` headers.
- `ActivityLog` entries are persisted per process and streamed via WebSocket, giving a
  full audit trail.
- Health endpoint via Terminus pings Prisma to confirm database connectivity.

---

## 8. Testing strategy

- **Unit tests** around the AI engine (`mlp.spec.ts`, `ai.service.spec.ts`, `tokenizer.spec.ts`)
  including an XOR-learning test that verifies backpropagation.
- **E2E smoke test** (`test/process.e2e-spec.ts`) that boots the whole NestJS app and
  exercises `/process/list` and `/process/start`.
- Frontend is wired for **Vitest** (`npm run test`) for component tests.

See `README.md` for commands.
