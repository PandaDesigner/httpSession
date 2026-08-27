# httpSession

> A typed, lifecycle-aware HTTP client for TypeScript runtimes — browsers, React Native, Node.js, and Bun.

[![CI](https://github.com/USER/httpSession/actions/workflows/ci.yml/badge.svg)](https://github.com/USER/httpSession/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/http-session)](https://www.npmjs.com/package/http-session)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

## TL;DR

`httpSession` wraps the native `fetch` API behind an explicit lifecycle state machine (`idle → pending → success | failure | cancelled`) and a discriminated `RequestCompletion<T>` result type. External data crosses a Zod boundary before it becomes trusted application data. Cancellation, timeout, and upload/download progress are first-class — no event emitters, no flag soup.

## Install

```bash
bun add http-session
```

## Quick start

```ts
import { HttpClient } from "http-session";
import { z } from "zod";

const User = z.object({ id: z.string(), name: z.string() });

const client = new HttpClient();
const result = await client
  .get("https://api.example.com/users/1")
  .decode(User);

if (result.status === "success") {
  console.log(result.data.name);
} else {
  console.error(result.error.code, result.error.message);
}
```

## API

| Export | Kind | Description |
|---|---|---|
| `HttpClient` | class | Entry point — builds `HttpRequest` instances |
| `HttpRequest<T>` | class | Stateful request with `start()` / `cancel()` |
| `RequestCompletion<T>` | type | Discriminated union: success / failure / cancelled |
| `RequestSnapshot<T>` | type | Immutable observer snapshot of lifecycle state |
| `TransferProgress` | type | Upload/download progress event |
| Error classes | value | `HttpError`, `HttpStatusError`, `NetworkError`, `TimeoutError`, `CancelledError`, `DecodeError`, `InvalidRequestError`, `UnsupportedCapabilityError` |
| `HTTP_SESSION_VERSION` | const | Package version marker |

See `docs/superpowers/specs/2026-08-26-http-session-design.md` for the full architecture.

## Architecture

`HttpClient` creates an `HttpRequest<T>` stateful request. The request delegates network execution to a single `HttpTransport` facade, which selects a transport strategy and returns a terminal `RequestCompletion<T>`. Runtime data crosses a Zod boundary before becoming trusted application data. State owns lifecycle transitions; transport strategies own execution behavior.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Strict TDD, Conventional Commits, Git Flow with local worktrees.

## License

[MIT](./LICENSE) — Copyright (c) 2026 Pedro Fernandez.