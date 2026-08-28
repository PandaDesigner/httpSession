# Contributing to httpSession

Thanks for your interest. This document explains how to set up a development environment, follow our workflow, and submit changes.

## Branch rules (TL;DR)

The repository has exactly two long-lived branches and a strict rule about how code moves between them:

- **`main`** — production releases. Tagged with `vX.Y.Z`. Receives code from `develop`, never the other way around.
- **`develop`** — integration. The base for every new `feature/*` branch. Receives hotfixes back from `main`.

The two rules:

1. **Releases flow `develop` → `main`.** Every `feat:` / `fix:` / `BREAKING CHANGE:` commit lands on `develop` first; a release PR then promotes `develop` into `main`, which triggers release-please to tag and publish.
2. **Hotfixes flow `main` → `develop`.** Only for urgent fixes that cannot wait for a normal release cycle. The hotfix is committed directly on `main`, then `main` is fast-forwarded back into `develop` so the integration branch carries the fix.

There is no other direction. `main` is never branched off into a long-lived side branch; `develop` is never branched off `main`.

```
                    develop ────────► main
                       │                │
                  feat / fix         release-please
                       │                │
                       │                ▼
                       │            vX.Y.Z tag
                       │                │
                       └◄───────────────┘
                       (hotfix sync)
```

## Workflow (Git Flow)

The repo uses [git-flow](https://nvie.com/posts/a-successful-git-branching-model/) with `main` as the production branch and `develop` as the integration branch, driven by release-please:

- `main` — production releases. Tagged with `vX.Y.Z`. Receives code from `develop` (releases) or directly via a hotfix.
- `develop` — integration. The base for every new `feature/*` branch.
- `feature/<slug>` — short-lived branches for new functionality. Branched from `develop`, merged back into `develop` via PR.
- `hotfix/<slug>` — urgent fixes for `main`. Branched from `main`, merged back into `main` and then synced into `develop`.

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

## Releases (`develop` → `main`)

When `develop` has accumulated enough work for a release:

```bash
# 1. Open a PR from develop to main with the features you want to ship.
gh pr create --base main --head develop

# 2. release-please detects the feat:/fix: commits since the last tag and
#    opens a release PR against develop with the version bump + CHANGELOG.

# 3. Review the release PR, then merge it. This squashes the release PR into
#    develop. Force-push develop to main (or use a sync PR) so the release
#    commit lands on main — that push triggers release-please to tag the
#    commit and create the GitHub Release on the next workflow run.
git push origin develop:main

# 4. Confirm vX.Y.Z exists at https://github.com/PandaDesigner/httpSession/releases
#    and that npm view http-session-core version reports the new version.
```

The first release (`v0.1.0`) is bootstrapped manually because release-please needs at least one tag to start tracking versions.

## Hotfixes (`main` → `develop`)

Urgent fixes that can't wait for a normal release flow. The hotfix is committed **directly on `main`** and then back-merged into `develop` so the integration branch carries the fix:

```bash
git checkout main
# Make the fix using a hotfix/<slug> branch or directly on main for trivial cases
git checkout -b hotfix/<slug>
# ... commit the fix using a fix: prefix ...
git checkout main && git merge --no-ff hotfix/<slug>
git push origin main

# Back-merge into develop so the integration branch carries the fix:
git checkout develop
git merge --ff-only origin/main
git push origin develop

# release-please will detect the fix: commit on main, open a patch release
# PR against develop, and after the merge tag vX.Y.(Z+1) and publish.
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

Open a [discussion](https://github.com/PandaDesigner/httpSession/discussions) or a [feature request](./.github/ISSUE_TEMPLATE/feature_request.md).