# httpSession Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a testable first core of `httpSession` with explicit lifecycle state, terminal completions, typed errors, Fetch execution, Zod decoding, cancellation, timeout, and download progress.

**Architecture:** `HttpClient` creates an `HttpRequest<T>` stateful request. The request delegates network execution to the single `HttpTransport` facade, which selects a transport strategy and returns a terminal `RequestCompletion<T>`. Runtime data crosses a Zod boundary before becoming trusted application data.

**Tech Stack:** TypeScript, Bun, Vitest, Zod 4, native Fetch, package exports for ESM.

**Spec:** `docs/superpowers/specs/2026-08-26-http-session-design.md`

## Global Constraints

- Support browsers, React Native, Node.js, and Bun without importing runtime-specific globals at module initialization.
- Use Zod 4 `safeParse()` for runtime validation; external data starts as `unknown`.
- Expected request failures return `RequestCompletion<T>` and do not throw.
- State owns lifecycle transitions; Strategy owns execution behavior.
- Follow strict RED -> GREEN -> REFACTOR TDD.
- Run the primary suite with Vitest and a compatibility suite with Bun.
- The default accepted HTTP status range is `200...299`.
- Keep XHR upload progress, decorators, persistence, pagination, and advanced streaming processors outside this first slice.

---

### Task 1: Package foundation and dual-runner smoke test

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/index.ts`
- Create: `tests/smoke.test.ts`

**Interfaces:**
- Produces: ESM package entry point `src/index.ts` and test commands `test`, `test:vitest`, `test:bun`, and `typecheck`.

- [ ] **Step 1: Write the failing smoke test**

```ts
import { describe, expect, it } from "vitest";
import { HTTP_SESSION_VERSION } from "../src/index";

describe("httpSession", () => {
  it("exposes its package version marker", () => {
    expect(HTTP_SESSION_VERSION).toBe("0.1.0");
  });
});
```

- [ ] **Step 2: Create package configuration and install dependencies**

Use `package.json` with `type: "module"`, `sideEffects: false`, an ESM export for `./src/index.ts`, and scripts:

```json
{
  "name": "http-session",
  "version": "0.1.0",
  "type": "module",
  "sideEffects": false,
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "bun run test:vitest && bun run test:bun",
    "test:vitest": "vitest run",
    "test:bun": "bun test tests/bun",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": { "zod": "^4.4.3" },
  "devDependencies": {
    "typescript": "^7.0.2",
    "vitest": "^4.1.10"
  }
}
```

Run: `bun install && bun run test:vitest`

Expected: FAIL because `src/index.ts` does not exist.

- [ ] **Step 3: Add the minimal entry point**

```ts
export const HTTP_SESSION_VERSION = "0.1.0" as const;
```

- [ ] **Step 4: Add a Bun compatibility smoke test and verify all checks**

Create `tests/bun/smoke.test.ts`:

```ts
import { expect, test } from "bun:test";
import { HTTP_SESSION_VERSION } from "../../src/index";

test("loads the ESM entry point in Bun", () => {
  expect(HTTP_SESSION_VERSION).toBe("0.1.0");
});
```

Run: `bun run typecheck && bun test && bun run test:vitest`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock tsconfig.json vitest.config.ts src/index.ts tests
git commit -m "chore: initialize httpSession package"
```

---

### Task 2: Typed completion and error model

**Files:**
- Create: `src/core/http-response-metadata.ts`
- Create: `src/core/request-completion.ts`
- Create: `src/core/errors.ts`
- Create: `tests/core/request-completion.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Produces: `HttpResponseMetadata`, `RequestCompletion<T>`, `HttpError`, `InvalidRequestError`, `NetworkError`, `TimeoutError`, `CancelledError`, `HttpStatusError`, `DecodeError`, and `UnsupportedCapabilityError`.

- [ ] **Step 1: Write failing completion tests**

```ts
import { describe, expect, it } from "vitest";
import { HttpStatusError, type RequestCompletion } from "../../src";

describe("RequestCompletion", () => {
  it("narrows successful data", () => {
    const completion: RequestCompletion<number> = {
      status: "success",
      data: 42,
      response: { status: 200, statusText: "OK", headers: new Headers() },
    };

    expect(completion.status === "success" && completion.data).toBe(42);
  });

  it("preserves HTTP failure metadata", () => {
    const error = new HttpStatusError(404, "Not Found", { message: "missing" });
    expect(error.status).toBe(404);
    expect(error.body).toEqual({ message: "missing" });
  });
});
```

- [ ] **Step 2: Run the test to verify RED**

Run: `bunx vitest run tests/core/request-completion.test.ts`

Expected: FAIL because the public types do not exist.

- [ ] **Step 3: Implement the minimal discriminated union and error hierarchy**

Use this terminal contract:

```ts
export type RequestCompletion<T> =
  | { readonly status: "success"; readonly data: T; readonly response: HttpResponseMetadata }
  | { readonly status: "failure"; readonly error: HttpError };
```

Every subclass must set a stable `code` and preserve `cause`; `HttpStatusError` additionally exposes `status`, `statusText`, and `body`.

- [ ] **Step 4: Export and verify**

Run: `bun run typecheck && bunx vitest run tests/core/request-completion.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core src/index.ts tests/core/request-completion.test.ts
git commit -m "feat: add typed request completions"
```

---

### Task 3: Lifecycle State machine and subscriptions

**Files:**
- Create: `src/core/request-state.ts`
- Create: `src/core/http-request.ts`
- Create: `src/progress/transfer-progress.ts`
- Create: `tests/core/http-request-state.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `RequestCompletion<T>`.
- Produces: `RequestStateName`, `RequestSnapshot<T>`, `TransferProgress`, and `HttpRequest<T>` with `state`, `subscribe()`, `start()`, and `cancel()`.

- [ ] **Step 1: Write failing state-transition tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { HttpRequest, NetworkError } from "../../src";

describe("HttpRequest lifecycle", () => {
  it("notifies idle, pending, and success snapshots", async () => {
    const execute = vi.fn().mockResolvedValue({
      status: "success",
      data: 7,
      response: { status: 200, statusText: "OK", headers: new Headers() },
    });
    const request = new HttpRequest(execute);
    const states: string[] = [];

    request.subscribe(snapshot => states.push(snapshot.state));
    await request.start();

    expect(states).toEqual(["idle", "pending", "success"]);
  });

  it("returns the same in-flight promise when started twice", async () => {
    const execute = vi.fn().mockResolvedValue({
      status: "failure",
      error: new NetworkError("failed"),
    });
    const request = new HttpRequest(execute);
    expect(request.start()).toBe(request.start());
  });
});
```

- [ ] **Step 2: Run the test to verify RED**

Run: `bunx vitest run tests/core/http-request-state.test.ts`

Expected: FAIL because `HttpRequest` does not exist.

- [ ] **Step 3: Implement explicit State objects and immutable snapshots**

Define states `IdleState`, `PendingState`, `SuccessState`, `FailureState`, and `CancelledState`. `HttpRequest.start()` may transition from idle only; a second call while pending returns the existing promise. `subscribe()` immediately emits the current snapshot and returns an idempotent unsubscribe function.

- [ ] **Step 4: Verify transitions and types**

Run: `bun run typecheck && bunx vitest run tests/core/http-request-state.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core src/progress src/index.ts tests/core/http-request-state.test.ts
git commit -m "feat: model request lifecycle states"
```

---

### Task 4: Transport facade and Fetch strategy

**Files:**
- Create: `src/transport/transport-types.ts`
- Create: `src/transport/transport-strategy.ts`
- Create: `src/transport/fetch-strategy.ts`
- Create: `src/transport/http-transport.ts`
- Create: `tests/transport/fetch-strategy.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Produces: `TransportRequest`, `TransportResponse`, `TransportStrategy`, `FetchStrategy`, and `HttpTransport.execute(request, context)`.
- `context` contains an `AbortSignal` and a progress callback.

- [ ] **Step 1: Write failing Fetch behavior tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { FetchStrategy } from "../../src";

describe("FetchStrategy", () => {
  it("maps a native Response into a transport response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"id":1}', { status: 200, headers: { "content-type": "application/json" } }),
    );
    const strategy = new FetchStrategy(fetchMock);
    const response = await strategy.execute(
      { url: "https://example.test/users/1", method: "GET", headers: new Headers() },
      { signal: new AbortController().signal, onProgress: vi.fn() },
    );

    expect(response.status).toBe(200);
    expect(await response.body.text()).toBe('{"id":1}');
  });
});
```

- [ ] **Step 2: Run the test to verify RED**

Run: `bunx vitest run tests/transport/fetch-strategy.test.ts`

Expected: FAIL because `FetchStrategy` does not exist.

- [ ] **Step 3: Implement the facade and injected Fetch strategy**

`FetchStrategy` receives `fetch` through its constructor so tests and runtimes control the implementation. `HttpTransport` accepts strategy candidates and selects the first whose capability predicate supports the request.

- [ ] **Step 4: Verify**

Run: `bun run typecheck && bunx vitest run tests/transport/fetch-strategy.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/transport src/index.ts tests/transport/fetch-strategy.test.ts
git commit -m "feat: add fetch transport strategy"
```

---

### Task 5: Zod decoder and HTTP status policy

**Files:**
- Create: `src/validation/zod-decoder.ts`
- Create: `src/policies/status-policy.ts`
- Create: `tests/validation/zod-decoder.test.ts`
- Create: `tests/policies/status-policy.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Produces: `decodeWithSchema<T>(schema: z.ZodType<T>, input: unknown): RequestCompletion<T>`, `StatusPolicy`, and `successfulStatusPolicy`.

- [ ] **Step 1: Write failing validation tests**

```ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { decodeWithSchema, successfulStatusPolicy } from "../../src";

describe("Zod response boundary", () => {
  const schema = z.object({ id: z.number().int().positive() });

  it("accepts valid unknown data", () => {
    expect(decodeWithSchema(schema, { id: 1 })).toMatchObject({ status: "success", data: { id: 1 } });
  });

  it("returns DecodeError for invalid data", () => {
    const completion = decodeWithSchema(schema, { id: "1" });
    expect(completion.status).toBe("failure");
    if (completion.status === "failure") expect(completion.error.code).toBe("DECODE_ERROR");
  });

  it("accepts only 2xx by default", () => {
    expect([199, 200, 299, 300].map(successfulStatusPolicy.accepts)).toEqual([false, true, true, false]);
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `bunx vitest run tests/validation tests/policies`

Expected: FAIL because the decoder and policy do not exist.

- [ ] **Step 3: Implement `safeParse` decoding and semantic status classification**

Normalize Zod issues to readonly `{ path: PropertyKey[]; code: string; message: string }[]`. Keep the raw Zod error as `cause`, not as the public error surface.

- [ ] **Step 4: Verify**

Run: `bun run typecheck && bunx vitest run tests/validation tests/policies`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/validation src/policies src/index.ts tests/validation tests/policies
git commit -m "feat: validate responses with zod"
```

---

### Task 6: HttpClient execution, cancellation, and timeout

**Files:**
- Create: `src/core/http-client.ts`
- Create: `src/core/request-options.ts`
- Create: `tests/core/http-client.test.ts`
- Modify: `src/core/http-request.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `HttpTransport`, `StatusPolicy`, Zod schemas, `HttpRequest<T>`, and typed errors.
- Produces: `createHttpClient(config)` and `HttpClient.get<T>(path, options): HttpRequest<T>`.

- [ ] **Step 1: Write failing end-to-end core tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createHttpClient, HttpTransport, FetchStrategy } from "../../src";

describe("HttpClient", () => {
  it("returns validated data through RequestCompletion", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"id":1}', { status: 200 }));
    const client = createHttpClient({
      baseUrl: "https://example.test",
      transport: new HttpTransport([new FetchStrategy(fetchMock)]),
    });

    const completion = await client.get("/users/1", {
      schema: z.object({ id: z.number() }),
    }).start();

    expect(completion).toMatchObject({ status: "success", data: { id: 1 } });
  });

  it("returns TimeoutError when the deadline expires", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const client = createHttpClient({
      baseUrl: "https://example.test",
      timeoutMs: 10,
      transport: new HttpTransport([new FetchStrategy(fetchMock as typeof fetch)]),
    });
    const completionPromise = client.get("/slow", { schema: z.unknown() }).start();
    await vi.advanceTimersByTimeAsync(10);
    const completion = await completionPromise;

    expect(completion.status).toBe("failure");
    if (completion.status === "failure") expect(completion.error.code).toBe("TIMEOUT");
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run the tests to verify RED**

Run: `bunx vitest run tests/core/http-client.test.ts`

Expected: FAIL because `createHttpClient` does not exist.

- [ ] **Step 3: Implement the minimal orchestration pipeline**

Resolve paths with `new URL(path, baseUrl)`, create one `AbortController` per start, map explicit cancellation to `CancelledError`, map deadline aborts to `TimeoutError`, reject non-accepted statuses with `HttpStatusError`, parse JSON as `unknown`, and decode through Zod.

- [ ] **Step 4: Verify full primary suite**

Run: `bun run typecheck && bun run test:vitest`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core src/index.ts tests/core/http-client.test.ts
git commit -m "feat: execute typed HTTP requests"
```

---

### Task 7: Download progress and Bun compatibility contracts

**Files:**
- Create: `src/progress/read-with-progress.ts`
- Create: `tests/progress/download-progress.test.ts`
- Create: `tests/bun/request-completion.test.ts`
- Modify: `src/transport/fetch-strategy.ts`
- Modify: `src/core/http-client.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `TransferProgress`, Fetch response streams, and `RequestCompletion<T>`.
- Produces: download notifications with `loaded`, optional `total`, and optional `percentage`.

- [ ] **Step 1: Write failing streamed-progress test**

```ts
import { describe, expect, it, vi } from "vitest";
import { readWithProgress } from "../../src/progress/read-with-progress";

describe("download progress", () => {
  it("reports cumulative bytes and percentage", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3, 4]));
        controller.close();
      },
    });
    const onProgress = vi.fn();
    const bytes = await readWithProgress(stream, 4, onProgress);

    expect([...bytes]).toEqual([1, 2, 3, 4]);
    expect(onProgress).toHaveBeenLastCalledWith({
      direction: "download", loaded: 4, total: 4, percentage: 100,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify RED**

Run: `bunx vitest run tests/progress/download-progress.test.ts`

Expected: FAIL because `readWithProgress` does not exist.

- [ ] **Step 3: Implement bounded chunk collection and progress notifications**

Read through `ReadableStreamDefaultReader`, accumulate byte chunks, emit after each chunk, concatenate once at completion, and release the reader lock in `finally`. If no stream exists, fall back to `arrayBuffer()` without fabricating intermediate progress.

- [ ] **Step 4: Add Bun contract coverage**

Create a Bun test that builds a client with an injected Fetch strategy, validates a Zod payload, and asserts the same `RequestCompletion` shape used by Vitest.

- [ ] **Step 5: Document the first-slice API and run every gate**

Document installation, one validated GET example, lifecycle subscription, cancellation, timeout, determinate/indeterminate progress, and the first-slice limitations.

Run: `bun run typecheck && bun run test:vitest && bun run test:bun`

Expected: every command exits successfully.

- [ ] **Step 6: Commit**

```bash
git add src tests README.md
git commit -m "feat: report download progress"
```

---

## Completion Gate

Before declaring the core slice complete:

1. Run `bun run typecheck`.
2. Run `bun run test:vitest`.
3. Run `bun run test:bun`.
4. Confirm the public entry point exports only supported contracts.
5. Confirm the implementation contains no direct module-level access to browser, Node.js, Bun, or React Native globals.
6. Compare the delivered behavior with `docs/superpowers/specs/2026-08-26-http-session-design.md` and record deferred capabilities as separate follow-up plans rather than partial implementations.
