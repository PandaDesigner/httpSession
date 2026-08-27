# httpSession Design

## Purpose

`httpSession` is a TypeScript HTTP package inspired by the safety and lifecycle clarity of Swift's `URLSession`, while remaining idiomatic across browsers, React Native, Node.js, and Bun.

The package provides explicit request state, typed failures, runtime response validation, cancellation, progress reporting, pagination, streaming, retries, caching, cookies, and storage integration without coupling the core to a UI framework or runtime-specific global APIs.

## Public API

`HttpClient` creates live `HttpRequest<T>` objects. A request exposes lifecycle state and progress before producing a terminal `RequestCompletion<T>`.

```ts
const request = client.get("/users", {
  schema: usersSchema,
});

const unsubscribe = request.subscribe(({ state, progress }) => {
  renderProgress(state, progress);
});

const completion = await request.start();
unsubscribe();

if (completion.status === "success") {
  renderUsers(completion.data);
} else {
  renderError(completion.error);
}
```

`RequestCompletion<T>` is a discriminated union:

```ts
type RequestCompletion<T> =
  | {
      status: "success";
      data: T;
      response: HttpResponseMetadata;
    }
  | {
      status: "failure";
      error: HttpError;
    };
```

Failures are explicit values at the public boundary. Unexpected programming errors may still throw; expected request failures do not.

## Request Lifecycle

The request lifecycle is independent from its terminal completion:

```text
idle -> pending -> success
                -> failure
                -> cancelled
```

State objects enforce permitted operations and transitions. They do not select transports or implement infrastructure behavior.

Each state notification is an immutable snapshot containing:

- lifecycle state;
- upload and download progress when available;
- the latest terminal completion when applicable.

Subscriptions are framework-agnostic. React and React Native integrations can be added later as separate adapters.

## Progress

Upload and download progress share a common model:

```ts
interface TransferProgress {
  direction: "upload" | "download";
  loaded: number;
  total?: number;
  percentage?: number;
}
```

`percentage` exists only when a reliable non-zero total is known. Consumers must support indeterminate progress.

Download progress is implemented through response streams when supported. Upload progress uses the XHR strategy in environments where XHR exposes progress events. A requested capability that is unavailable produces a typed `UnsupportedCapabilityError`; the library does not silently report false progress.

Chunking limits peak memory and enables incremental processing. CPU-heavy decoding cannot be assumed to be non-blocking merely because the network request is asynchronous; processors may yield cooperatively or be delegated to a consumer-provided worker adapter.

## Transport Architecture

The public infrastructure boundary is a single `HttpTransport` facade. It delegates execution to a selected `TransportStrategy`:

```text
HttpTransport
  -> FetchStrategy
  -> XhrStrategy
```

Fetch is the default strategy. XHR is selected when upload progress is required and supported. Strategy selection is based on explicit request capabilities and runtime capability detection, never on lifecycle state.

Transport contracts use platform-neutral request, response, progress, and cancellation types. Runtime-specific globals remain inside adapters.

## Validation and Decoding

All external response bodies enter the boundary as `unknown`. Zod 4 schemas validate data with `safeParse()` before it becomes trusted `T`.

Validation failures become typed `DecodeError` completions containing normalized issue information. Raw Zod exceptions do not leak through the public API.

Empty responses, text, binary data, JSON, and streaming bodies use explicit body decoders. A `204` response never attempts JSON decoding.

## Error Model

All expected failures derive from `HttpError` and preserve their cause when available:

- `InvalidRequestError` — invalid URL, method, headers, or body configuration;
- `NetworkError` — connection, DNS, or transport failure;
- `TimeoutError` — configured deadline exceeded;
- `CancelledError` — explicit consumer cancellation;
- `HttpStatusError` — non-accepted HTTP status with response metadata and decoded error body when possible;
- `DecodeError` — invalid or unsupported response content;
- `UnsupportedCapabilityError` — requested progress, streaming, storage, or cookie capability unavailable in the current runtime;
- `RetryExhaustedError` — retry policy exhausted, preserving the last failure.

HTTP status classification is semantic: informational, successful, redirection, client error, and server error. The default success policy accepts `200...299`; callers may inject a different status policy.

## Decorators and Strategies

Decorators add orthogonal behavior around request execution:

- cache;
- cookie coordination;
- retry and backoff;
- request deduplication;
- logging, metrics, and tracing.

Strategies define replaceable policies such as transport selection, retry timing, status acceptance, decoding, and authentication. Decorators compose capabilities; strategies decide algorithms. Neither responsibility belongs to request State objects.

## Pagination and Streaming

Pagination and streaming remain distinct:

- pagination follows server-defined page, offset, cursor, or link semantics;
- streaming consumes one response incrementally with backpressure-aware iteration.

Pagination is exposed through an async iterable so consumers can process pages progressively or collect them deliberately. Streaming exposes decoded chunks through an async iterable and supports cancellation.

Neither feature accumulates an unbounded response in memory by default.

## Cookies, Cache, and Storage

The core never directly imports `localStorage`, `sessionStorage`, browser cookie APIs, or React Native storage libraries.

Storage is represented by an injected asynchronous contract with adapters for:

- in-memory storage;
- browser `sessionStorage`;
- browser `localStorage`;
- consumer-provided React Native or server persistence.

Browser storage adapters isolate synchronous Web Storage access behind the asynchronous boundary. Cache entries include freshness metadata and support invalidation.

Cookie behavior is adapter-driven. Browser implementations respect `credentials`, CORS, `SameSite`, `Secure`, and `HttpOnly` restrictions. The library never claims access to `HttpOnly` cookie values. Node.js and Bun cookie jars require an injected adapter.

## Concurrency and Main-Thread Safety

The request pipeline supports cancellation and bounded concurrency. Streaming processors use backpressure and avoid unnecessary copies. Large CPU-bound parsing or transformations can use a worker adapter where the runtime supports one.

The package does not imply that Fetch alone prevents main-thread blocking. Network I/O is asynchronous; decoding and transformation costs remain explicit.

## Package Boundaries

The initial package is organized by responsibility:

```text
src/
  core/          # client, request lifecycle, completion, errors
  transport/     # facade, capabilities, Fetch and XHR strategies
  validation/    # Zod decoding boundary
  progress/      # transfer progress model and notifications
  pagination/    # async page traversal
  streaming/     # chunk readers and processors
  decorators/    # cache, cookies, retry, deduplication, observability
  storage/       # storage contracts and runtime adapters
  policies/      # status, retry, backoff, authentication
```

Public exports are curated through package entry points. Internal classes are not exported accidentally.

## Testing Strategy

Development follows strict RED -> GREEN -> REFACTOR TDD.

- Vitest is the primary unit, contract, and integration runner.
- Bun's test runner executes an additional compatibility suite.
- Transport strategies share behavioral contract tests.
- State transition tests verify legal and illegal operations.
- Progress tests cover determinate and indeterminate transfers.
- Fake timers make timeout, retry, and backoff deterministic.
- Mock streams test cancellation, chunk boundaries, and backpressure.
- Storage and decorator tests verify composition without runtime globals.
- Runtime matrices cover browser-like, Node.js, Bun, and React Native-compatible boundaries.

Tests assert observable behavior rather than private implementation details.

## Initial Delivery Scope

The first implementation slice establishes:

1. package tooling and public entry point;
2. `HttpRequest`, lifecycle State objects, and `RequestCompletion`;
3. typed error hierarchy;
4. the `HttpTransport` facade and Fetch strategy;
5. Zod 4 JSON validation;
6. cancellation, timeout, and download progress;
7. Vitest and Bun compatibility suites.

XHR upload progress, decorators, persistence, pagination, streaming processors, and advanced retry policies follow as isolated slices after the core contracts are stable. Their interfaces are accounted for now, but their implementations are not forced into the first slice.

## Non-Goals

- Recreating Swift syntax in TypeScript.
- Coupling the core to React, React Native hooks, or a specific state manager.
- Hiding runtime capability differences.
- Treating every HTTP status code as a separate State class.
- Buffering arbitrarily large payloads by default.
- Using type assertions as runtime validation.
