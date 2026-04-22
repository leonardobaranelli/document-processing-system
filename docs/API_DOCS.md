# API Documentation

Interactive Swagger UI is always available at **`http://localhost:3000/docs`** when the backend
is running. This file is the permanent, human-readable reference.

All endpoints are versioned under the `/api/v1` prefix. Every successful response is wrapped in
a uniform envelope:

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2024-01-15T10:32:00.000Z",
  "data": { "...": "..." }
}
```

Errors follow a symmetric shape:

```json
{
  "success": false,
  "statusCode": 400,
  "path": "/api/v1/process/stop/abc",
  "method": "POST",
  "timestamp": "2024-01-15T10:32:00.000Z",
  "error": "BadRequestException",
  "message": "Process cannot be stopped from its current state.",
  "details": null
}
```

---

## Process Control API

### `POST /api/v1/process/start`

Create a new analysis process and enqueue it for execution.

Body (all fields optional):

| Field | Type | Description |
| --- | --- | --- |
| `name` | string (≤120) | Human-readable label for the process. |
| `inputDirectory` | string (≤1024) | Absolute or relative directory with `.txt` files. Defaults to `DOCUMENTS_INPUT_DIR`. |
| `batchSize` | integer 1..100 | Number of files per batch. Defaults to `BATCH_SIZE`. |

Responses:

- `201 Created` — process created and queued (`data` is a `ProcessResponse`).
- `400 Bad Request` — invalid payload or no `.txt` files found.

### `POST /api/v1/process/stop/{id}`

Stop a process that is `PENDING`, `RUNNING`, or `PAUSED`.

Responses:

- `200 OK` — stopped.
- `400 Bad Request` — process is already `COMPLETED`, `FAILED`, or `STOPPED`.
- `404 Not Found` — unknown id.

### `POST /api/v1/process/pause/{id}`

Pause a `RUNNING` process. Returns the updated `ProcessResponse`.

### `POST /api/v1/process/resume/{id}`

Resume a `PAUSED` process. Returns the updated `ProcessResponse`.

### `GET /api/v1/process/status/{id}`

Return the current state of a process (`ProcessResponse`).

### `GET /api/v1/process/list`

List every process in descending creation order. Returns `ProcessResponse[]`.

### `GET /api/v1/process/results/{id}`

Return aggregated results for a finished process.

Responses:

- `200 OK` — returns `ProcessResults`.
- `400 Bad Request` — process has no results yet.
- `404 Not Found` — unknown id.

### `GET /api/v1/process/logs/{id}?limit=100`

Return up to `limit` (default 100, max 1000) activity log entries for the process in
descending chronological order.

---

## Schemas

### `ProcessResponse`

```json
{
  "process_id": "f6b5c3c4-2a39-4c63-9b35-0f4b4e8b37a2",
  "status": "RUNNING",
  "name": "Monthly contracts batch",
  "progress": {
    "total_files": 10,
    "processed_files": 3,
    "failed_files": 0,
    "percentage": 30
  },
  "started_at": "2024-01-15T10:30:00.000Z",
  "estimated_completion": "2024-01-15T10:32:00.000Z",
  "completed_at": null,
  "stopped_at": null,
  "paused_at": null,
  "error_message": null,
  "results": null
}
```

### `ProcessResults`

```json
{
  "total_words": 1500,
  "total_lines": 75,
  "total_characters": 9123,
  "most_frequent_words": ["the", "of", "and", "to", "a"],
  "files_processed": ["doc1.txt", "doc2.txt", "doc3.txt"],
  "global_summary": "Extractive summary combining TextRank and MLP-scored sentences."
}
```

### `ProcessStatus` values

- `PENDING` — process created, not yet started.
- `RUNNING` — workers are actively processing batches.
- `PAUSED` — user paused the process between batches.
- `COMPLETED` — all documents analyzed successfully.
- `FAILED` — every document failed.
- `STOPPED` — user stopped the process before completion.

---

## Health

### `GET /api/v1/health`

Returns the liveness/readiness information provided by NestJS Terminus. Useful for
Kubernetes/Docker health checks.

---

## Real-time updates (WebSocket)

A Socket.IO server is exposed on the **same origin** as the REST API (default:
`ws://localhost:3000`). It uses the default namespace.

### Rooms

- `processes:global` — every client is automatically joined on connection. Receives updates
  for every process.
- `process:<uuid>` — send `process:subscribe` with `{ processId }` to join; `process:unsubscribe`
  to leave.

### Server → client events

| Event | Payload | Meaning |
| --- | --- | --- |
| `process:created` | `ProcessResponse` | A new process was created. |
| `process:status` | `ProcessResponse` | Status transitioned (RUNNING / PAUSED / STOPPED / …). |
| `process:progress` | `ProcessResponse` | Progress percentage or counts changed. |
| `process:log` | `{ id, level, event, message, createdAt }` | New activity log entry. |
| `process:completed` | `ProcessResponse` | Process finished successfully. |
| `process:failed` | `ProcessResponse` | Process finished with all documents failed. |
| `process:stopped` | `ProcessResponse` | Process was stopped by the user. |

### Client → server events

| Event | Payload | Behavior |
| --- | --- | --- |
| `process:subscribe` | `{ processId }` | Join the per-process room. Ack: `{ ok: true }`. |
| `process:unsubscribe` | `{ processId }` | Leave the per-process room. Ack: `{ ok: true }`. |

---

## Postman / Insomnia collection

A minimal collection is included at `docs/postman-collection.json`. Import it into Postman or
Insomnia to call every endpoint with one click. Adjust the `baseUrl` collection variable if
you run the backend on a non-default port.
