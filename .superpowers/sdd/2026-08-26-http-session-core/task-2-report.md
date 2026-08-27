# Task 2 Report: Typed completion and error model

## Status
DONE

## Commit
- `feat: add typed request completions` (see git HEAD).

## Implemented
- Added `HttpResponseMetadata` with response status, status text, and headers.
- Added the discriminated `RequestCompletion<T>` success/failure union.
- Added `HttpError` and all requested expected-failure subclasses.
- Assigned stable codes to each error subtype and preserved `ErrorOptions.cause`.
- Added HTTP status metadata (`status`, `statusText`, `body`) to `HttpStatusError`.
- Exported all runtime classes and public types from `src/index.ts` while retaining `HTTP_SESSION_VERSION`.

## TDD Evidence
- RED: `bunx vitest run tests/core/request-completion.test.ts` failed because the requested error constructors were unavailable.
- GREEN: Added the minimal metadata, completion, and error contracts; focused tests passed.
- REFACTOR: Added stable code typing, subtype names, capability metadata, and test coverage for all requested error classes; focused tests remained green.

## Verification
- `bun run typecheck` — PASS
- `bunx vitest run tests/core/request-completion.test.ts` — PASS (3 tests)
- `git diff --check` — PASS

## Concerns
- None.
