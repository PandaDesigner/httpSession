# Contributing to httpSession

Thanks for your interest. This document explains how to set up a development environment, follow our workflow, and submit changes.

## Workflow (Git Flow)

The repo uses [git-flow](https://nvie.com/posts/a-successful-git-branching-model/) with `main` as the production branch and `develop` as the integration branch:

- `main` — production releases. Tagged with `vX.Y.Z`. Never commit directly.
- `develop` — integration. The base for every new `feature/*` branch.
- `feature/<slug>` — short-lived branches for new functionality. Branched from `develop`, merged back into `develop` via PR.
- `release/<version>` — release-candidate branches. Branched from `develop`, merged into both `main` and `develop`.
- `hotfix/<slug>` — urgent fixes for `main`. Branched from `main`, merged into both `main` and `develop`.
- `support/<slug>` — long-lived maintenance branches.

The git-flow CLI is wired (production = `main`, development = `develop`, prefixes `feature/`, `release/`, `hotfix/`, `support/`, tags `v`). Run `git flow config` to inspect.

## Daily flow with worktrees

Always work in an isolated local worktree. The worktree lives **outside** the main repo directory so both the integration branch and your feature branch stay usable in parallel:

```bash
# First-time setup
git worktree add ../httpSession-develop develop        # if develop is not already checked out
cd ../httpSession-develop && bun install

# Start a new feature
git flow feature start <slug>                          # branches feature/<slug> off develop
git worktree add ../httpSession-<slug> feature/<slug>  # optional: isolated worktree
cd ../httpSession-<slug> && bun install

# Finish a feature (locally)
git flow feature finish <slug>                         # merges feature/<slug> back into develop

# Open the PR against develop once CI is green
gh pr create --base develop --head feature/<slug>
```

## Releases

When `develop` has accumulated enough work for a release:

```bash
git flow release start 0.2.0                            # branches release/0.2.0 off develop
# bump the version, fix last-minute bugs, regenerate CHANGELOG, etc.
git flow release finish 0.2.0                           # merges release/0.2.0 into main + develop, tags v0.2.0
```

The first release (`v0.1.0`) is bootstrapped manually because release-please needs at least one tag to start tracking versions.

## Hotfixes

Urgent fixes that can't wait for a normal release flow:

```bash
git flow hotfix start <slug>                            # branches hotfix/<slug> off main
# fix the bug, bump patch version
git flow hotfix finish <slug>                           # merges hotfix/<slug> into main + develop, tags vX.Y.(Z+1)
```

## Testing & TDD

- Strict RED → GREEN → REFACTOR. Write the failing test first, watch it fail, then implement.
- Vitest (`bun run test:vitest`) for unit + integration tests with mocks.
- Bun test (`bun run test:bun`) for cross-runtime compatibility checks.
- Every commit must pass `bun run lint && bun run typecheck && bun run test`.

## Commit conventions

[Conventional Commits](https://www.conventionalcommits.org/) are mandatory. The `commit-msg` Husky hook enforces them locally; CI enforces them on PR titles. Allowed types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`, `style`, `revert`.

Examples:

```
feat(client): add cancellation propagation to transport
fix(state): freeze completion snapshot in FailureState
chore(deps): bump zod to 4.5.0
docs(readme): document error class hierarchy
```

## Local commands

```bash
bun install          # install deps
bun run lint         # biome check
bun run lint:fix     # biome check --write (auto-fix)
bun run typecheck    # tsc --noEmit
bun run test         # vitest + bun test
bun run test:coverage
```

## Code of Conduct

By participating, you agree to abide by the [Contributor Covenant](./CODE_OF_CONDUCT.md).

## Questions

Open a [discussion](https://github.com/USER/httpSession/discussions) or a [feature request](./.github/ISSUE_TEMPLATE/feature_request.md).