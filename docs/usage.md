# Usage Guide

Comprehensive examples for `httpSession`. Looking for the API surface? See [README.md](../README.md) and the type definitions in [`src/index.ts`](../src/index.ts). Looking for the architecture? See [`docs/superpowers/specs/2026-08-26-http-session-design.md`](./superpowers/specs/2026-08-26-http-session-design.md).

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Anatomy of a request](#anatomy-of-a-request)
- [HTTP methods](#http-methods)
- [Headers](#headers)
- [Query parameters](#query-parameters)
- [Request bodies](#request-bodies)
- [Schemas and validation](#schemas-and-validation)
- [Status policies](#status-policies)
- [Timeouts](#timeouts)
- [Cancellation](#cancellation)
- [Download progress](#download-progress)
- [Lifecycle subscriptions](#lifecycle-subscriptions)
- [Error handling](#error-handling)
- [Reading decode errors](#reading-decode-errors)
- [Multiple clients](#multiple-clients)
- [Custom transports](#custom-transports)
- [Testing with a mocked fetch](#testing-with-a-mocked-fetch)
- [Runtimes](#runtimes)
- [Troubleshooting](#troubleshooting)

## Install

```bash
bun add http-session-core    # or npm install / pnpm add / yarn add
```

`httpSession` has one runtime dependency: [`zod`](https://zod.dev) (^4.4.3). Everything else uses platform globals (`fetch`, `Headers`, `ReadableStream`, `AbortController`).

## Quick start

```ts
import { createHttpClient } from 'http-session-core'
import { z } from 'zod'

const User = z.object({ id: z.string(), name: z.string() })

const client = createHttpClient({ baseUrl: 'https://api.example.com' })

const result = await client.get('/users/1', { schema: User }).start()

if (result.status === 'success') {
  console.log(result.data) // { id: '1', name: 'Ada' }
} else {
  console.error(result.error.code, result.error.message)
}
```

`createHttpClient` defaults to a single `FetchStrategy` backed by `globalThis.fetch`. Inject one explicitly when you need to mock, polyfill, or layer alternative strategies.

## Anatomy of a request

Every call follows the same shape:

```ts
const completion = await client
  .get(path, options) // builds an HttpRequest<T>
  .start() // runs the request, resolves to RequestCompletion<T>
```

| Stage | Returns | Notes |
|---|---|---|
| `client.get(path, options)` | `HttpRequest<T>` | Lazy. Does not run anything. |
| `request.start()` | `Promise<RequestCompletion<T>>` | Idempotent: calling `start()` twice on the same request returns the same in-flight promise. |
| `request.cancel()` | `void` | Settles the in-flight promise with a `CancelledError` completion. |

The path is resolved against the client's `baseUrl` with `new URL(path, baseUrl)`. Absolute URLs are accepted:

```ts
await client.get('https://api.other.com/v1/x', { schema: ... }).start()
```

## HTTP methods

The default method is `GET`. Override with `options.method`:

```ts
await client.post('/users', { schema: User, body: JSON.stringify(payload) }).start()
await client.put('/users/1', { schema: User, body: JSON.stringify(payload) }).start()
await client.patch('/users/1', { schema: User, body: JSON.stringify(payload) }).start()
await client.delete('/users/1', { schema: z.unknown() }).start()
```

## Headers

Default headers go on the client; per-request headers override them.

```ts
const client = createHttpClient({
  baseUrl: 'https://api.example.com',
  defaultHeaders: {
    authorization: 'Bearer ...',
    'x-tenant': 'acme',
  },
})

await client.get('/users/1', {
  schema: User,
  headers: { authorization: 'Bearer rotated-token' }, // overrides default
})
```

Both accept any `HeadersInit` (`Headers`, `Record<string, string>`, or `[string, string][]`).

## Query parameters

Build them into the path. `httpSession` doesn't parse or template them for you — that's a deliberate boundary so the package never makes decisions about serialization that you can't override.

```ts
const params = new URLSearchParams({ page: '2', limit: '50' })
await client.get(`/users?${params}`, { schema: UserList }).start()
```

For a small wrapper, encode them yourself:

```ts
const qs = (q: Record<string, string | number | boolean>) =>
  '?' + new URLSearchParams(
    Object.fromEntries(Object.entries(q).map(([k, v]) => [k, String(v)])),
  ).toString()

await client.get(`/users${qs({ page: 2, limit: 50 })}`, { schema: UserList }).start()
```

## Request bodies

Pass anything `fetch` accepts: strings, `FormData`, `Blob`, `URLSearchParams`, `ReadableStream`, or `null`.

```ts
// JSON body — string
await client.post('/users', {
  schema: User,
  body: JSON.stringify({ name: 'Ada' }),
  headers: { 'content-type': 'application/json' },
})

// Form data
const form = new FormData()
form.append('file', blob, 'avatar.png')
await client.post('/upload', { schema: z.unknown(), body: form }).start()
```

`httpSession` does not auto-stringify or set a `content-type` for you. Owning that boundary lets you stream binary bodies, send raw text, or integrate with form encoders without fighting the package.

## Schemas and validation

The Zod schema is the trust boundary. External data starts as `unknown`, becomes `T` only after a successful parse.

```ts
const User = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  role: z.enum(['admin', 'member']),
})

const result = await client.get('/users/1', { schema: User }).start()

if (result.status === 'success') {
  result.data.email // typed as string, not string | undefined
}
```

On schema rejection, the completion is a typed `failure` with a `DecodeError`:

```ts
if (result.status === 'failure' && result.error.code === 'DECODE_ERROR') {
  console.error('Invalid response shape')
}
```

The underlying `ZodError` is preserved as `error.cause`; normalized issues live on `error.issues` (readonly `{ path, code, message }[]`).

## Status policies

The default policy accepts `200...299`. Override per-request or per-client:

```ts
// Per request: 418 is a teapot, not a failure
await client.get('/teapot', {
  schema: z.unknown(),
  statusPolicy: { accepts: (status) => status === 418 },
})

// Per client: accept anything 2xx plus 3xx redirects
const client = createHttpClient({
  baseUrl: 'https://api.example.com',
  defaultStatusPolicy: { accepts: (status) => status >= 200 && status < 400 },
})
```

Non-accepted statuses short-circuit before parsing. The completion carries an `HttpStatusError` with `status`, `statusText`, and the raw body attached.

## Timeouts

Set a default at the client or override per-request:

```ts
const client = createHttpClient({
  baseUrl: 'https://api.example.com',
  timeoutMs: 5_000,
})

await client.get('/slow', {
  schema: z.unknown(),
  timeoutMs: 30_000, // overrides the default for this one
})
```

When the deadline expires, the request resolves to a typed `failure` with `TimeoutError` (`code === 'TIMEOUT'`). The underlying fetch is aborted via `AbortController`.

## Cancellation

Cancel before the request completes; the in-flight promise settles with `CancelledError`:

```ts
const request = client.get('/users/1', { schema: User })
const promise = request.start()

request.cancel()

const completion = await promise
// completion.status === 'failure', completion.error.code === 'CANCELLED'
```

`cancel()` is a no-op if the request has already settled. Calling `cancel()` before `start()` aborts the controller early so the request never leaves `idle`.

For UI workflows, attach cancellation to your component's teardown:

```ts
useEffect(() => {
  const request = client.get('/users/1', { schema: User })
  request.start().then(setUser)
  return () => request.cancel()
}, [userId])
```

## Download progress

`onProgress` fires after every body chunk with cumulative `loaded`, optional `total` (from `Content-Length`), and `percentage` when the total is known.

```ts
await client.get('/files/report.pdf', {
  schema: z.unknown(),
  onProgress: ({ loaded, total, percentage }) => {
    if (percentage !== undefined) {
      bar.value = percentage
    } else {
      bar.indeterminate = true
      bar.loaded = loaded
    }
  },
}).start()
```

The same events surface through `HttpRequest.subscribe(snapshot => ...)` — `snapshot.progress` is populated while the request is `pending`.

Indeterminate progress (no `Content-Length`) is fully supported: `total` and `percentage` are `undefined`, but `loaded` still ticks.

## Lifecycle subscriptions

`HttpRequest` is observable. Subscribe before starting to see every transition:

```ts
const request = client.get('/users/1', { schema: User })

const unsubscribe = request.subscribe((snapshot) => {
  console.log(snapshot.state) // 'idle' | 'pending' | 'success' | 'failure' | 'cancelled'
  if (snapshot.progress) {
    console.log('progress', snapshot.progress.loaded, snapshot.progress.total)
  }
  if (snapshot.completion) {
    console.log('terminal', snapshot.completion)
  }
})

await request.start()
unsubscribe()
```

The subscriber fires once immediately on attach (with the current snapshot), then again on every transition or progress event. The snapshot is frozen — mutating it throws.

## Error handling

Every error class exposes a stable `code` and a `cause`:

| Class | `code` | When |
|---|---|---|
| `HttpStatusError` | `HTTP_STATUS_ERROR` | Response status rejected by the status policy |
| `NetworkError` | `NETWORK_ERROR` | Underlying fetch rejected (DNS, TLS, abort not from cancel/timeout, etc.) |
| `TimeoutError` | `TIMEOUT` | Deadline expired before completion |
| `CancelledError` | `CANCELLED` | `request.cancel()` called |
| `DecodeError` | `DECODE_ERROR` | Zod schema rejected the parsed body |
| `BinaryBodyError` | `BINARY_BODY` | Response body looks binary/compressed (e.g. dev proxy stripped `Content-Encoding`) |
| `InvalidRequestError` | `INVALID_REQUEST` | URL or path is malformed |
| `UnsupportedCapabilityError` | `UNSUPPORTED_CAPABILITY` | No transport strategy supports the requested capabilities |

Branch on `code`, never on `instanceof`, so subclasses can be swapped without breaking consumers:

```ts
if (result.status === 'failure') {
  switch (result.error.code) {
    case 'HTTP_STATUS_ERROR':
      return showError(result.error.status) // typed number
    case 'DECODE_ERROR':
      return showError('The server sent an unexpected shape')
    case 'TIMEOUT':
      return retry()
    default:
      return showGenericError(result.error)
  }
}
```

## Reading decode errors

A `DecodeError` exposes two parallel surfaces:

- `error.message` — a single human sentence: `"Response decoding failed: N issue(s)"`. Useful for a toast or a generic log line.
- `error.issues` — a normalized `readonly { path, code, message }[]` array with **one entry per leaf failure**, ready for structured logging or rendering form-field-level errors.

`error.message` is misleading for Zod 4 unions: `z.union([A, B])` collapses to a single `invalid_union` issue in Zod 4's raw output, so a wrongly-shaped payload would report `"Response decoding failed: 1 issue(s)"` even though two (or more) schemas actually failed. The package flattens those unions before exposing `issues`, so consumers always see one entry per branch failure.

Use the `formatDecodeError` helper to render the issues without re-inventing the flattening logic:

```ts
import { formatDecodeError } from 'http-session-core'

if (result.error.code === 'DECODE_ERROR') {
  console.error('[api] schema rejected:\n' + formatDecodeError(result.error))
}
```

`formatDecodeError(error)` returns one line per issue shaped as `  - [<code>] <dot.path or '<root>'>: <message>`, e.g.:

```
  - [invalid_type] id: expected number, received string
  - [invalid_union] <root>: invalid input
  - [too_small] items.0.qty: Number must be greater than 0
```

If `issues` is missing or empty (defensive case, shouldn't happen for `DecodeError`s produced by this package), it returns `(no issues attached)`.

## Multiple clients

Build one client per base URL, per auth scheme, or per feature area. There is no global state:

```ts
const api = createHttpClient({
  baseUrl: 'https://api.example.com',
  defaultHeaders: { authorization: `Bearer ${token}` },
})

const uploads = createHttpClient({
  baseUrl: 'https://uploads.example.com',
  timeoutMs: 60_000, // uploads need longer deadlines
})
```

If you need a shared header that depends on per-request state (e.g. a token refresh), construct the client lazily or use a small factory:

```ts
const buildClient = (token: string) =>
  createHttpClient({
    baseUrl: 'https://api.example.com',
    defaultHeaders: { authorization: `Bearer ${token}` },
  })
```

## Custom transports

The default `HttpTransport` uses `FetchStrategy` (a single strategy backed by `globalThis.fetch`). Override when you need to:

1. Mock `fetch` in tests.
2. Polyfill `fetch` for React Native, older browsers, or Node < 18.
3. Layer strategies with capability-based fallback.

```ts
import { createHttpClient, FetchStrategy, HttpTransport } from 'http-session-core'

// Inject a custom fetch implementation
const client = createHttpClient({
  baseUrl: 'https://api.example.com',
  transport: new HttpTransport([new FetchStrategy(myFetchImpl)]),
})

// Layer strategies: try fetch first, fall back to a custom adapter
const client2 = createHttpClient({
  baseUrl: 'https://api.example.com',
  transport: new HttpTransport([
    new FetchStrategy(),
    new MyAdapterStrategy(),
  ]),
})
```

The first strategy whose `capabilities` cover the request wins. See [`src/transport/`](../src/transport/) for the contract if you want to write your own.

## Testing with a mocked fetch

Inject a `vi.fn()` (Vitest) or `spyOn` (Jest) as the fetch implementation. The package never touches `globalThis.fetch` in tests that inject a transport:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createHttpClient, FetchStrategy, HttpTransport } from 'http-session-core'
import { z } from 'zod'

it('decodes a user', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ id: '1', name: 'Ada' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  )

  const client = createHttpClient({
    baseUrl: 'https://example.test',
    transport: new HttpTransport([new FetchStrategy(fetchMock)]),
  })

  const User = z.object({ id: z.string(), name: z.string() })
  const result = await client.get('/users/1', { schema: User }).start()

  expect(result.status).toBe('success')
  expect(fetchMock).toHaveBeenCalledWith(
    'https://example.test/users/1',
    expect.objectContaining({ method: 'GET' }),
  )
})
```

For Bun's test runner, the same pattern works with `mock()` instead of `vi.fn()`.

## Runtimes

`httpSession` works in:

| Runtime | Status | Notes |
|---|---|---|
| Modern browsers (Chrome, Firefox, Safari, Edge) | full | Native `fetch`, `ReadableStream`, `AbortController`. |
| Node.js >= 18 | full | Native `fetch` shipped with Node 18+. |
| Bun | full | Native `fetch`. Verified by the bundled Bun test suite. |
| React Native | works | May need a `fetch` polyfill depending on your RN version. Inject via `FetchStrategy`. |

The package does not import any runtime-specific globals at module load. Every platform primitive (`fetch`, `Headers`, `ReadableStream`, `AbortController`, `URL`) is read through a transport or inside an executor — never at the top level of a module. That keeps `httpSession` tree-shakeable and SSR-safe.

## Troubleshooting

### Dev proxies stripping `Content-Encoding`

Symptom: `result.error.code === 'BINARY_BODY'` (since v1.2.0) or, in older versions, `result.error.code === 'DECODE_ERROR'` with a message about `"expected object, received string"`. The body you receive starts with bytes like `28 b5 2f fd` (zstd), `1f 8b` (gzip), or a wall of random-looking characters.

Cause: a development proxy (Metro in Expo dev mode, `http-proxy-middleware`, Vite's proxy middleware, Charles, mitmproxy, etc.) stripped the upstream `Content-Encoding` header before forwarding the response. The client expected the body to already be decompressed but instead received the raw compressed bytes; `JSON.parse` then choked on them.

Wrong fix — strip `Content-Encoding` in the proxy and call it a day:

```ts
// proxy.ts — DO NOT do this
self.onfetch = async (event) => {
  const response = await event.preloadResponse
  if (!response) return
  const headers = new Headers(response.headers)
  headers.delete('content-encoding') // ← leaves the client reading raw bytes
  event.respondWith(new Response(response.body, { ...response, headers }))
}
```

Right fix — only strip `Content-Length` (which lies after transparent decompression) and let the browser/runtime decompress:

```ts
// proxy.ts — correct
self.onfetch = async (event) => {
  const response = await event.preloadResponse
  if (!response) return
  const headers = new Headers(response.headers)
  headers.delete('content-length') // ← only strip the misleading length
  event.respondWith(new Response(response.body, { ...response, headers }))
}
```

If you control neither the proxy nor the upstream, ask the package to be tolerant by switching to `z.unknown()` for that endpoint and decoding the bytes yourself.

### HTML error pages disguised as JSON

CDN challenges (Cloudflare's `cf-mitigated: challenge` interstitial), nginx 502/503 pages, ingress controller error pages, and authentication gateways all return `200 OK` with a `text/html` body. `parseAsJson` surfaces the raw text to your schema, and Zod fails it with `DECODE_ERROR`. The fix is usually at the proxy / CDN layer, not in the consumer: forward the original status code so `HttpStatusError` (or your status policy) catches it.

### `parseAsJson` silent fallback

When the body fails `JSON.parse` but doesn't look binary, `parseAsJson` returns the raw string to the schema. That lets Zod produce a meaningful `DECODE_ERROR` instead of a less-typed "JSON parse failed" error. The trade-off: if the body is *almost* JSON (e.g. an HTML page that begins with `<!doctype`), you'll see `DECODE_ERROR: expected object, received string` with the schema in `error.issues`.

To tell apart a real schema mismatch from "the body isn't even JSON", check the shape of `error.issues`:

- A schema mismatch produces a tight, specific `invalid_type` / `invalid_format` issue at the offending path.
- An HTML/disguised-JSON body produces one generic issue at `<root>` (e.g. `invalid_type` with `expected: object, received: string`).

Since v1.2.0, bodies that look genuinely compressed or binary short-circuit *before* the schema and surface as `BinaryBodyError` (`code === 'BINARY_BODY'`) with a hex dump of the first bytes — branch on that code first.