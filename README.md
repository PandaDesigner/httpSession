# httpSession

> A typed, lifecycle-aware HTTP client for TypeScript runtimes — browsers, React Native, Node.js, and Bun.

[![CI](https://github.com/USER/httpSession/actions/workflows/ci.yml/badge.svg)](https://github.com/USER/httpSession/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/http-session)](https://www.npmjs.com/package/http-session)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

## TL;DR

`httpSession` wraps the native `fetch` API behind an explicit lifecycle state machine (`idle → pending → success | failure | cancelled`) and a discriminated `RequestCompletion<T>` result type. External data crosses a Zod boundary before it becomes trusted application data. Cancellation, timeout, and download progress are first-class — no event emitters, no flag soup.

## Install

```bash
bun add http-session
```

## Quick start

```ts
import { createHttpClient } from 'http-session'
import { z } from 'zod'

const User = z.object({ id: z.string(), name: z.string() })

const client = createHttpClient({
  baseUrl: 'https://api.example.com',
})

const result = await client
  .get('/users/1', { schema: User })
  .start()

if (result.status === 'success') {
  console.log(result.data.name) // trusted `User`
} else {
  console.error(result.error.code, result.error.message)
}
```

The default transport uses the platform `fetch` via `FetchStrategy`. Inject one explicitly when you need to mock it in tests, swap in a polyfill for React Native or older runtimes, or layer alternative strategies:

```ts
import { createHttpClient, FetchStrategy, HttpTransport } from 'http-session'

const client = createHttpClient({
  baseUrl: 'https://api.example.com',
  transport: new HttpTransport([new FetchStrategy(myFetchImpl)]),
})
```

## Cancellation

```ts
const request = client.get('/users/1', { schema: User })
const completion = request.start()

request.cancel() // → RequestCompletion failure with CancelledError
```

## Timeout

```ts
const client = createHttpClient({
  baseUrl: 'https://api.example.com',
  timeoutMs: 5_000,
  transport: new HttpTransport([new FetchStrategy()]),
})

await client.get('/slow', { schema: z.unknown() }).start()
// If the request exceeds 5s → TimeoutError (TIMEOUT)
```

## Download progress

`onProgress` fires after every body chunk with cumulative `loaded`, the optional `total` (from `Content-Length`), and the computed `percentage` when the total is known.

```ts
await client
  .get('/files/report.pdf', {
    schema: z.unknown(),
    onProgress: ({ loaded, total, percentage }) => {
      console.log(percentage ?? `${loaded} bytes`)
    },
  })
  .start()
```

Subscribers also see progress through `HttpRequest.subscribe(snapshot => ...)` — `snapshot.progress` is populated while the request is `pending`.

## Custom status policy

The default policy accepts `200...299`. Override it per request to accept additional ranges:

```ts
await client
  .get('/teapot', {
    schema: z.unknown(),
    statusPolicy: { accepts: (status) => status === 418 },
  })
  .start()
```

## API

| Export | Kind | Description |
|---|---|---|
| `createHttpClient` | function | Entry point — builds a client bound to a base URL and transport |
| `HttpClient` | interface | `get(path, options)` returning a fresh `HttpRequest<T>` |
| `HttpTransport` | class | Facade that picks a strategy by capability |
| `FetchStrategy` | class | Default strategy; delegates to platform `fetch` |
| `HttpRequest<T>` | class | Stateful request with `start()`, `cancel()`, `subscribe()` |
| `RequestCompletion<T>` | type | Discriminated union: success / failure |
| `RequestSnapshot<T>` | type | Immutable observer snapshot of lifecycle state |
| `TransferProgress` | type | Download progress event |
| `decodeWithSchema` | function | Public Zod boundary helper |
| `successfulStatusPolicy` | value | Default 2xx policy |
| Error classes | value | `HttpError`, `HttpStatusError`, `NetworkError`, `TimeoutError`, `CancelledError`, `DecodeError`, `InvalidRequestError`, `UnsupportedCapabilityError` |
| `HTTP_SESSION_VERSION` | const | Package version marker |

See `docs/superpowers/specs/2026-08-26-http-session-design.md` for the full architecture.

## Architecture

`HttpClient` creates an `HttpRequest<T>` stateful request. The request delegates network execution to a single `HttpTransport` facade, which selects a transport strategy and returns a `TransportResponse`. Runtime data crosses a Zod boundary before becoming trusted application data. State owns lifecycle transitions; transport strategies own execution behavior.

## First-slice scope

This first slice covers:

- Lifecycle states `idle`, `pending`, `success`, `failure`, `cancelled`.
- Discriminated `RequestCompletion<T>` with typed success and failure variants.
- Typed `HttpError` hierarchy (`HttpStatusError`, `NetworkError`, `TimeoutError`, `CancelledError`, `DecodeError`, `InvalidRequestError`, `UnsupportedCapabilityError`).
- Fetch strategy with injectable `fetch`.
- Cancellation via `request.cancel()`.
- Per-request and default `timeoutMs`.
- Per-request and default `headers` merging.
- Download progress through `onProgress` and lifecycle subscribers.
- Custom `statusPolicy` per request or per client.
- Zod-driven response decoding.

Out of scope for the first slice (follow-up plans):

- Upload progress (no portable upload events in `fetch`).
- Decorators / interceptor pipelines.
- Persisted sessions, cookies, retries, pagination.
- Advanced streaming processors.
- Real bundler integration (the `build` script is a placeholder).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Strict TDD, Conventional Commits, Git Flow with local worktrees.

## License

[MIT](./LICENSE) — Copyright (c) 2026 Pedro Fernandez.