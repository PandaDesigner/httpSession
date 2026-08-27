# Contributing to httpSession

Thanks for your interest. This document explains how to set up a development environment, follow our workflow, and submit changes.

## Workflow

1. Fork the repo (external contributors) or create a feature branch (maintainers).
2. Create a **local worktree** for your work:

   ```bash
   git worktree add ../httpSession-<slug> -b feature/<slug>
   cd ../httpSession-<slug>
   bun install
   ```

3. Write tests first (RED), then the smallest passing implementation (GREEN), then refactor (REFACTOR). See `docs/superpowers/plans/` for example task briefs.
4. Commit using [Conventional Commits](https://www.conventionalcommits.org/) — the `commit-msg` Husky hook enforces this locally; CI enforces it on PR titles.
5. Open a PR using the [PR template](./.github/PULL_REQUEST_TEMPLATE.md).
6. Wait for CI green + a reviewer approval.

## Branch naming

- `feature/<slug>` — new functionality
- `fix/<slug>` — bug fix
- `chore/<slug>` — tooling, infra, refactors with no behavior change
- `docs/<slug>` — documentation only
- `perf/<slug>` — performance improvements

## Local commands

```bash
bun install          # install deps
bun run lint         # biome check
bun run lint:fix     # biome check --write (auto-fix)
bun run typecheck    # tsc --noEmit
bun run test         # vitest + bun test
bun run test:coverage
```

## Testing

- Vitest (`bun run test:vitest`) for unit + integration tests with mocks.
- Bun test (`bun run test:bun`) for cross-runtime compatibility checks — these run against the real Bun runtime and may hit network fixtures.
- Strict TDD: every behavior change ships with a test that fails without it.

## Commit conventions

Allowed types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`, `style`, `revert`.

Examples:

```
feat(client): add cancellation propagation to transport
fix(state): freeze completion snapshot in FailureState
chore(deps): bump zod to 4.5.0
docs(readme): document error class hierarchy
```

## Code of Conduct

By participating, you agree to abide by the [Contributor Covenant](./CODE_OF_CONDUCT.md).

## Questions

Open a [discussion](https://github.com/USER/httpSession/discussions) or a [feature request](./.github/ISSUE_TEMPLATE/feature_request.md).