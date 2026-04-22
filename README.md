# Document Processing System

Asynchronous document processing system with a REST API, real-time WebSocket updates, and a
fully local, open-source AI engine (a from-scratch multi-layer perceptron combined with a
TextRank extractive summarizer). It ingests `.txt` files from a configurable directory,
processes them in batches, extracts statistics (word / line / character counts, top words),
generates per-document and aggregated summaries, and exposes everything through a clean
REST + WebSocket API and a live dashboard.

---

## 1. Stack

| Layer | Technology |
| --- | --- |
| API | **NestJS 10 + TypeScript** with class-validator DTOs, Swagger/OpenAPI, Helmet, URI versioning |
| Async processing | **BullMQ** on Redis, worker with cooperative pause/stop |
| Database | **PostgreSQL 16** via **Prisma 5** ORM |
| Real-time | **Socket.IO** gateway (`process:status`, `process:progress`, `process:log`, …) |
| AI engine | MLP from scratch + TextRank — no external API, no native deps, fully auditable |
| Logging | **pino / nestjs-pino** (JSON in prod, pretty in dev) |
| Frontend | **React 18 + Vite + TailwindCSS + @tanstack/react-query + socket.io-client** |
| Packaging | **Docker** (multi-stage `Dockerfile`s + `docker-compose.yml`) |

---

## 2. Repository layout

```
.
├── backend/                  # NestJS API + workers + AI engine
├── frontend/                 # React dashboard (Vite + Tailwind)
├── sample-data/              # Example text files used as default input
├── docs/
│   ├── API_DOCS.md           # REST + WebSocket reference
│   ├── ARCHITECTURE.md       # Design decisions and module boundaries
│   └── postman-collection.json
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 3. Quick start (Docker — recommended)

Requires Docker Desktop 4.x or Docker Engine + Compose v2.

```bash
cp .env.example .env
docker compose up --build
```

Then open:

- **Dashboard** — http://localhost:5173
- **Swagger UI** — http://localhost:3000/docs
- **Health** — http://localhost:3000/api/v1/health

On first start the backend automatically:

1. Waits for Postgres and Redis to be healthy.
2. Runs `prisma migrate deploy` to create the schema.
3. Boots the AI engine (loads the MLP weights and runs a brief in-memory fine-tune).
4. Listens for API + WebSocket traffic.

Sample `.txt` files are mounted read-only from `./sample-data` and used by default when you
start a process without specifying `inputDirectory`.

---

## 4. Quick start (local, no Docker for the app)

You need Node 20+ and Postgres + Redis reachable from your machine.

The easiest way to get Postgres + Redis is still Docker:

```bash
cp .env.example .env                 # root .env, used by docker-compose
docker compose up -d postgres redis
```

Then run the backend and frontend locally (so Prisma CLI, hot reload and debuggers
work natively on your host):

```bash
# Backend
cd backend
cp .env.example .env                 # backend/.env — points to localhost:5432 / localhost:6379
npm install
npx prisma migrate dev               # creates the schema and a versioned migration
npm run start:dev                    # http://localhost:3000/docs

# Frontend (in another shell)
cd frontend
npm install
npm run dev                          # http://localhost:5173
```

> Note: there are **two** `.env` files on purpose:
> - **Root `.env`** is consumed by `docker-compose.yml`. Its hostnames (`postgres`,
>   `redis`) refer to container network names.
> - **`backend/.env`** is consumed by Prisma CLI and NestJS when you run the backend
>   directly on your host. Its hostnames are `localhost`.
>
> Both are ignored by git; only the two `.env.example` templates are versioned.

Adjust `DOCUMENTS_INPUT_DIR` in `backend/.env` if you want to point at a different folder
of `.txt` files (defaults to `../sample-data`).

---

## 5. Using the system

### 5.1 From the dashboard

1. Go to http://localhost:5173.
2. Fill in the "Start new analysis" form (all fields optional) and click **Start process**.
3. Click on a process to see progress, live activity logs (via WebSockets), aggregated
   results, and pause / resume / stop controls.

### 5.2 From curl

```bash
# Start
curl -X POST http://localhost:3000/api/v1/process/start \
  -H "Content-Type: application/json" \
  -d '{ "name": "demo", "batchSize": 5 }'

# List
curl http://localhost:3000/api/v1/process/list

# Status / results / logs
curl http://localhost:3000/api/v1/process/status/<PROCESS_ID>
curl http://localhost:3000/api/v1/process/results/<PROCESS_ID>
curl http://localhost:3000/api/v1/process/logs/<PROCESS_ID>?limit=50
```

Every endpoint is fully documented in [`docs/API_DOCS.md`](docs/API_DOCS.md) and at
`/docs` (Swagger UI). A ready-to-import collection lives at
[`docs/postman-collection.json`](docs/postman-collection.json).

---

## 6. Design highlights

A deeper write-up lives in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). The highlights:

- **State machine + optimistic locking.** Transitions (`PENDING`, `RUNNING`, `PAUSED`,
  `STOPPED`, `COMPLETED`, `FAILED`) use Prisma `updateMany` with a
  `where: { status: <expected> }` clause. Two concurrent requests cannot both succeed,
  eliminating the classic "stop vs finish" race.
- **BullMQ worker + cooperative cancellation.** Heavy work lives in a queue. The worker
  checks the process status between batches and between documents, so pause and stop take
  effect promptly without any thread kill. This keeps the database consistent even under
  heavy load.
- **Bounded parallelism inside a batch.** The worker spawns `min(concurrency, batchSize)`
  concurrent async tasks per batch sharing a cursor. Concurrency is configurable
  (`WORKER_CONCURRENCY`).
- **Local AI engine.** Instead of calling a remote model, the `ai` module combines a
  classical **TextRank** extractive summarizer with a **multi-layer perceptron** implemented
  from scratch (forward pass, backprop, deterministic RNG). It is fast, portable (no native
  binaries), and completely offline.
- **Uniform API envelope.** A global interceptor wraps every success response in a
  `{ success, statusCode, timestamp, data }` envelope, and a global filter produces a
  matching error shape. The frontend relies on this consistency.
- **Structured logs + activity log table.** Pino writes JSON logs in production and
  human-readable logs in development. Each process also gets an append-only `ActivityLog`
  table that is surfaced in the UI via WebSockets in real time.
- **Versioned API.** `/api/v1/...` lets the API evolve without breaking clients.
- **Strict input validation.** `ValidationPipe` with `whitelist` + `forbidNonWhitelisted`
  rejects any unknown field. Environment variables are validated on boot.

---

## 7. Testing

### 7.1 Unit tests (fast, no infrastructure required)

```bash
cd backend
npm test              # runs jest against src/**/*.spec.ts
```

Coverage includes:

- `mlp.spec.ts` — verifies the MLP actually learns XOR (end-to-end backpropagation test)
  and that serialization round-trips are exact.
- `ai.service.spec.ts` — smoke-tests the AI pipeline end to end.
- `tokenizer.spec.ts` — edge cases in tokenization, sentence splitting, top-N selection.

### 7.2 E2E tests (require Postgres + Redis)

```bash
# make sure Postgres + Redis are up (docker compose up -d postgres redis)
cd backend
npm run test:e2e
```

### 7.3 Manual integration

Import `docs/postman-collection.json` into Postman or Insomnia, set the `baseUrl` variable,
and drive the full lifecycle: start → pause → resume → stop → results.

---

## 8. Environment variables

See `.env.example`. The most important ones:

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://docprocessor:…@postgres:5432/document_processing` | Postgres DSN used by Prisma. |
| `REDIS_HOST` / `REDIS_PORT` | `redis` / `6379` | BullMQ connection. |
| `WORKER_CONCURRENCY` | `4` | Max documents processed in parallel per batch. |
| `BATCH_SIZE` | `5` | Documents per batch. |
| `DOCUMENTS_INPUT_DIR` | `/app/sample-data` | Default input directory for `process/start`. |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin(s), comma-separated. |
| `LOG_LEVEL` | `info` | pino log level. |

---

## 9. License

MIT.
