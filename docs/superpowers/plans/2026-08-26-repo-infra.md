# httpSession Repo Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the developer infrastructure (Biome, Husky, commitlint, GitHub Actions CI, release-please, Dependabot, docs, package metadata) on `main` as a series of atomic commits that each pass lint, typecheck, and tests. After completion, resume the core implementation (Tasks 4–7) on `feature/http-session-core` in its existing worktree.

**Architecture:** All tooling is wired through `package.json` scripts so a single `bun run lint && bun run typecheck && bun run test` gates every commit and PR. Conventional Commits are enforced locally (Husky + commitlint) and in CI (release-please depends on them). The first merge to `main` will trigger release-please to open a `chore: release 0.1.0` PR, but we do **not** merge it until core Tasks 4–7 land.

**Tech Stack:** Bun (>=1.1), Node 20, TypeScript 7, Biome 1.x, Husky 9, lint-staged 15, @commitlint/cli + @commitlint/config-conventional 19, Vitest 4, GitHub Actions, release-please 4.

**Spec:** `docs/superpowers/specs/2026-08-26-repo-infra-design.md`

**Copyright holder:** Pedro Fernandez (used in `LICENSE`).

## Global Constraints

- Conventional Commits are mandatory for every commit and PR title. Allowed types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`, `style`, `revert`.
- Every commit must pass `bun run lint && bun run typecheck && bun run test` from the repo root.
- Use Bun for all installs and scripts (`bun install`, `bun run …`). Never `npm install`.
- Never use `--no-verify` on `git commit` — hooks are part of the contract.
- Never commit `node_modules/`, `bun.lock` is allowed (and committed).
- Never create a commit with `Co-Authored-By:` or AI attribution lines.
- Use English for all code identifiers, file names, comments, commit messages, and documentation copy.
- Repo name (`httpSession`) and package name (`http-session`) are **intentionally different** — do not rename either.
- Use a local worktree for the implementation: `git worktree add ../httpSession-infra -b feature/repo-infra-and-cicd`. The worktree path is **outside** the existing `httpSession/.worktrees/` directory to keep both worktrees (core + infra) usable in parallel.

## File Structure

### Files created (this plan)

| Path | Purpose | Task |
|---|---|---|
| `.editorconfig` | cross-editor whitespace defaults | 1 |
| `.gitattributes` | line-ending + linguist rules | 1 |
| `biome.json` | lint + format rules | 1 |
| `.commitlintrc.json` | commit message policy | 1 |
| `.husky/pre-commit` | lint-staged runner | 1 |
| `.husky/commit-msg` | commitlint runner | 1 |
| `.github/workflows/ci.yml` | CI pipeline | 2 |
| `.github/workflows/release-please.yml` | release automation | 2 |
| `.github/workflows/codeql.yml` | security scanning | 2 |
| `.github/dependabot.yml` | weekly dependency updates | 2 |
| `README.md` | package front page | 3 |
| `CONTRIBUTING.md` | contribution guide | 3 |
| `RELEASE.md` | release process | 3 |
| `SECURITY.md` | vulnerability reporting | 3 |
| `CODE_OF_CONDUCT.md` | Contributor Covenant v2.1 | 3 |
| `LICENSE` | MIT license | 3 |
| `.github/CODEOWNERS` | ownership rules | 3 |
| `.github/PULL_REQUEST_TEMPLATE.md` | PR checklist | 3 |
| `.github/ISSUE_TEMPLATE/bug_report.md` | bug template | 3 |
| `.github/ISSUE_TEMPLATE/feature_request.md` | feature template | 3 |
| `tsconfig.build.json` | production tsconfig | 4 |
| `scripts/build.ts` | bun build driver (placeholder) | 4 |
| `tests/lint-config.test.ts` | smoke test for Biome config | 1 |
| `.worktrees-infra/` | **directory** — local worktree path, gitignored | 1 |

### Files modified (this plan)

| Path | Change | Task |
|---|---|---|
| `package.json` | add devDeps, scripts, engines, exports, files | 1, 4 |
| `tsconfig.json` | extend with strict, paths, noUncheckedIndexedAccess | 4 |
| `vitest.config.ts` | add path alias `@/*` → `src/*` | 4 |
| `.gitignore` | add `.worktrees-infra/`, `dist/`, `coverage/` | 1 |
| `src/index.ts` | update error imports after split | 5 |
| `src/core/http-request.ts` | update error import path | 5 |
| `src/core/request-state.ts` | update error import path | 5 |

### Files deleted (this plan)

None. We refactor `src/core/errors.ts` into `src/core/errors/index.ts` (and friends) but keep backward-compatible re-exports until Task 5's last step.

---

## Task 1: Bootstrap dev tooling (Biome, Husky, commitlint, lint-staged)

**Files:**
- Create: `.worktrees-infra/` (as empty dir; gitignored)
- Create: `biome.json`
- Create: `.commitlintrc.json`
- Create: `.editorconfig`
- Create: `.gitattributes`
- Create: `.husky/pre-commit`
- Create: `.husky/commit-msg`
- Create: `tests/lint-config.test.ts`
- Modify: `.gitignore` (add `.worktrees-infra/`, `dist/`, `coverage/`, `bun.lockb`)
- Modify: `package.json` (add devDeps and scripts)

**Interfaces:**
- Consumes: existing `package.json` shape (name, version, type:module, sideEffects:false)
- Produces: working `bun run lint` that fails on a deliberate lint error; working `git commit` that runs Husky + lint-staged + commitlint

### Step 1: Create the worktree

```bash
# From repo root
git fetch --all || true
git worktree add ../httpSession-infra -b feature/repo-infra-and-cicd
cd ../httpSession-infra
bun install
```

Verify: the new worktree has the same files as `main`. Stop and report if anything is missing.

### Step 2: Extend `.gitignore`

Replace the file's contents with:

```gitignore
.opencode
.worktrees/
.worktrees-infra/
# Local Pi runtime state
.atl/
# Build output
dist/
# Coverage reports
coverage/
# Bun binary lock (kept; bun.lock text lock is committed)
bun.lockb
```

Verify: `git diff .gitignore` shows only the added lines.

### Step 3: Install dev tooling

Run from the worktree root:

```bash
bun add -D @biomejs/biome@^1.9.4 husky@^9.1.7 lint-staged@^15.2.10 \
  @commitlint/cli@^19.6.1 @commitlint/config-conventional@^19.6.1
```

Verify: `bun pm ls` lists all five packages under `devDependencies`.

### Step 4: Add scripts and lint-staged config to `package.json`

Read `package.json`, then **merge** the following additions (preserve the existing fields exactly):

In `scripts`, add:

```json
"prepare": "husky",
"lint": "biome check .",
"lint:fix": "biome check --write .",
"format": "biome format --write .",
"lint-staged": "lint-staged"
```

Add a top-level `lint-staged` block (sibling of `scripts`):

```json
"lint-staged": {
  "*.{ts,tsx,js,jsx,json,jsonc}": [
    "biome check --write --no-errors-on-unmatched"
  ],
  "*.md": [
    "biome format --write --no-errors-on-unmatched"
  ]
}
```

Verify: `bun run lint` exits non-zero (the repo has no biome config yet) — that's expected, not a failure.

### Step 5: Write `biome.json`

Create `biome.json` with this exact content:

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": {
    "ignoreUnknown": false,
    "ignore": ["dist", "coverage", ".worktrees", ".worktrees-infra", ".opencode", ".atl", "bun.lock"]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf"
  },
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": { "noExplicitAny": "warn" },
      "style": { "useImportType": "warn", "useConst": "error" },
      "correctness": { "noUnusedVariables": "error", "noUnusedImports": "error" },
      "performance": { "noBarrelFile": "off" }
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "asNeeded",
      "trailingCommas": "all",
      "arrowParentheses": "always",
      "bracketSpacing": true
    }
  },
  "json": {
    "formatter": {
      "indentWidth": 2,
      "trailingCommas": "none"
    }
  },
  "help": { "enabled": true }
}
```

Verify: `bun run lint` still exits non-zero (we haven't formatted anything yet).

### Step 6: Write `.commitlintrc.json`

Create `.commitlintrc.json`:

```json
{
  "extends": ["@commitlint/config-conventional"],
  "rules": {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "chore",
        "docs",
        "refactor",
        "test",
        "perf",
        "build",
        "ci",
        "style",
        "revert"
      ]
    ],
    "subject-case": [2, "always", "lower-case"],
    "subject-max-length": [2, "always", 100],
    "header-max-length": [2, "always", 100],
    "body-max-line-length": [2, "always", 200]
  }
}
```

### Step 7: Write `.editorconfig`

Create `.editorconfig`:

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false

[Makefile]
indent_style = tab
```

### Step 8: Write `.gitattributes`

Create `.gitattributes`:

```gitattributes
* text=auto eol=lf

*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.ico binary
*.webp binary
*.woff binary
*.woff2 binary

bun.lock linguist-generated=true
dist/** linguist-generated=true
coverage/** linguist-generated=true
```

### Step 9: Wire Husky hooks

```bash
mkdir -p .husky
bunx husky init
```

This creates `.husky/pre-commit` with default content. **Replace** `.husky/pre-commit` with:

```sh
bunx lint-staged
```

Replace `.husky/commit-msg` with:

```sh
bunx --bun commitlint --edit "$1"
```

Make both executable:

```bash
chmod +x .husky/pre-commit .husky/commit-msg
```

Verify: `ls -la .husky/` shows both files as executable.

### Step 10: Write the lint smoke test

Create `tests/lint-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import biomeConfig from "../biome.json";

describe("biome config", () => {
  it("disables barrelling lint in core (we re-export on purpose)", () => {
    expect(biomeConfig.linter.rules.performance.noBarrelFile).toBe("off");
  });

  it("uses single quotes for JS/TS", () => {
    expect(biomeConfig.javascript.formatter.quoteStyle).toBe("single");
  });

  it("formats JSON without trailing commas", () => {
    expect(biomeConfig.json.formatter.trailingCommas).toBe("none");
  });
});
```

### Step 11: Auto-format the existing source tree

```bash
bun run lint:fix
```

This will reformat `src/`, `tests/`, and existing `.json` files in place. Review the diff to make sure no semantic changes snuck in.

### Step 12: Verify the full quality gate

Run all three commands; all must exit 0:

```bash
bun run lint
bun run typecheck
bun run test
```

Expected: all pass.

### Step 13: Smoke-test Husky locally

```bash
# Temporarily stage a bad commit message to confirm commitlint catches it
git add -A
git commit -m "this is not a conventional commit"
```

Expected: commit is **rejected** by the `commit-msg` hook with a commitlint error.

Then `git reset` the staged changes (do **not** commit yet):

```bash
git reset
```

### Step 14: Commit Task 1

```bash
git add -A
git commit -m "chore(repo): bootstrap lint, format, hooks, and editor tooling

- Add Biome for lint + format (single Rust tool, replaces ESLint/Prettier).
- Add Husky pre-commit (lint-staged runs Biome on staged files) and
  commit-msg (commitlint enforces Conventional Commits).
- Add commitlint config with @commitlint/config-conventional baseline.
- Add .editorconfig and .gitattributes for cross-editor/line-ending sanity.
- Extend .gitignore with dist/, coverage/, bun.lockb, .worktrees-infra/.
- Extend package.json with lint/format/lint-staged scripts and a
  lint-staged config.
- Add tests/lint-config.test.ts smoke test pinning the Biome config shape.
- Auto-format the existing source tree to match Biome's rules."
```

Verify: `git log --oneline -1` shows the new commit on `feature/repo-infra-and-cicd`.

---

## Task 2: Add GitHub Actions CI, release-please, codeql, and Dependabot

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release-please.yml`
- Create: `.github/workflows/codeql.yml`
- Create: `.github/dependabot.yml`
- Modify: `.gitignore` (add `.github/.cache/`)

**Interfaces:**
- Consumes: scripts from Task 1 (`bun run lint`, `bun run typecheck`, `bun run test`)
- Produces: three workflow files + Dependabot config that pass `actionlint` if available, otherwise parse visually

### Step 1: Write `.github/workflows/ci.yml`

Create the file with:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    name: Lint · Typecheck · Test
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Lint
        run: bun run lint

      - name: Typecheck
        run: bun run typecheck

      - name: Test (Vitest)
        run: bun run test:vitest

      - name: Test (Bun)
        run: bun run test:bun

      - name: Build smoke
        run: bun run build
```

### Step 2: Write `.github/workflows/release-please.yml`

```yaml
name: Release Please

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write
  id-token: write

concurrency:
  group: release-please-${{ github.ref }}
  cancel-in-progress: true

jobs:
  release-please:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: googleapis/release-please-action@v4
        id: release
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          release-type: node
          package-name: http-session

      - name: Publish to npm
        if: ${{ steps.release.outputs.release_created }}
        uses: JS-DevTools/npm-publish@v3
        with:
          token: ${{ secrets.NPM_TOKEN }}
          package: ./package.json
```

### Step 3: Write `.github/workflows/codeql.yml`

```yaml
name: CodeQL

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: "0 6 * * 1"

permissions:
  actions: read
  contents: read
  security-events: write

jobs:
  analyze:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      actions: read
      contents: read
      security-events: write
    strategy:
      fail-fast: false
      matrix:
        language: [typescript]
    steps:
      - uses: actions/checkout@v4

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: ${{ matrix.language }}

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3
        with:
          category: "/language:${{ matrix.language }}"
```

### Step 4: Write `.github/dependabot.yml`

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: "/"
    schedule:
      interval: weekly
      day: monday
      time: "09:00"
      timezone: "UTC"
    labels:
      - "dependencies"
      - "automated"
    grouping:
      patch-minor:
        applies-to: version-updates
        update-types:
          - minor
          - patch
      major:
        applies-to: version-updates
        update-types:
          - major
    open-pull-requests-limit: 5
    commit-message:
      prefix: "chore(deps)"
      prefix-development: "chore(deps-dev)"
      include: "scope"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: weekly
      day: monday
      time: "09:00"
      timezone: "UTC"
    labels:
      - "dependencies"
      - "automated"
    commit-message:
      prefix: "ci"
```

### Step 5: Extend `.gitignore`

Append to `.gitignore`:

```gitignore
# GitHub Actions caches
.github/.cache/
```

Verify: `git diff .gitignore` shows only the three new lines.

### Step 6: Validate YAML files

If `actionlint` is installed:

```bash
which actionlint && actionlint .github/workflows/*.yml
```

Otherwise, run a Python YAML parse to catch syntax errors:

```bash
bun run -e 'const yaml = require("yaml"); for (const f of ["ci","release-please","codeql"]) { try { yaml.parse(require("fs").readFileSync(`.github/workflows/${f}.yml`,"utf8")); console.log(f, "ok"); } catch(e) { console.error(f, "FAIL", e.message); process.exit(1);} }'
```

If neither tool is available, read each file by eye and confirm `jobs:` blocks have a `runs-on:` and at least one `steps:` entry.

### Step 7: Lint and typecheck

```bash
bun run lint
bun run typecheck
bun run test
```

All must pass. (Note: the `bun run build` step in CI will run Task 4's placeholder script — that's expected to print a message and exit 0.)

### Step 8: Commit Task 2

```bash
git add -A
git commit -m "ci: add GitHub Actions for CI, release-please, CodeQL, and Dependabot

- ci.yml: lint, typecheck, vitest, bun test, build smoke on push and PR.
- release-please.yml: automated changelog + npm publish on main pushes.
- codeql.yml: weekly TypeScript security scan.
- dependabot.yml: weekly npm + github-actions updates with grouped PRs.
- Extend .gitignore with .github/.cache/."
```

---

## Task 3: Add documentation, LICENSE, and GitHub templates

**Files:**
- Create: `README.md`
- Create: `CONTRIBUTING.md`
- Create: `RELEASE.md`
- Create: `SECURITY.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `LICENSE`
- Create: `.github/CODEOWNERS`
- Create: `.github/PULL_REQUEST_TEMPLATE.md`
- Create: `.github/ISSUE_TEMPLATE/bug_report.md`
- Create: `.github/ISSUE_TEMPLATE/feature_request.md`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: a complete doc set that renders on GitHub

### Step 1: Write `README.md`

Create `README.md`:

```markdown
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
```

Replace `USER` with the actual GitHub owner (will be filled in once the repo is pushed).

### Step 2: Write `CONTRIBUTING.md`

```markdown
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
```

### Step 3: Write `RELEASE.md`

```markdown
# Release Process

This project uses [release-please](https://github.com/googleapis/release-please) to automate versioning and publishing.

## How a release happens

1. Land PRs on `main` using [Conventional Commits](./CONTRIBUTING.md#commit-conventions).
2. release-please detects the commits since the last release tag and opens a **release PR** that:
   - Bumps `version` in `package.json` (semver: `feat` → minor, `fix` → patch, `BREAKING CHANGE` / `feat!` → major).
   - Regenerates `CHANGELOG.md`.
   - Updates the version constant in `src/index.ts`.
3. Review the release PR. Verify the changelog reads correctly and the version bump matches the changes.
4. Merge the release PR. release-please tags the commit and publishes to npm via the configured `NPM_TOKEN` secret.

## First release (0.1.0)

The first release is bootstrapped manually:

1. Verify the release PR title is `chore(main): release 0.1.0`.
2. Merge it.
3. Confirm the GitHub Release exists at `https://github.com/USER/httpSession/releases/tag/v0.1.0`.
4. Confirm the npm package is visible at `https://www.npmjs.com/package/http-session`.

## Rollback

If a release introduces a regression:

1. Open a `fix:` PR that reverts the regression.
2. Once merged, release-please will open a patch release PR.
3. Merge that patch release to ship the fix.

Do not delete tags or force-push to `main` — release-please trusts the linear history.
```

### Step 4: Write `SECURITY.md`

```markdown
# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| main branch | yes |
| older 0.x | best effort |

## Reporting a vulnerability

**Please do not file a public issue.** Use one of these private channels:

- GitHub Security Advisories: open a draft advisory at `https://github.com/USER/httpSession/security/advisories/new`.
- Email: `security@http-session.example` (placeholder — replace with a real monitored address before publishing).

We will acknowledge within **48 hours** and aim to ship a fix within **7 days** for high-severity issues.

## Scope

This package is a thin HTTP client over the platform `fetch`. The attack surface is:

- URL parsing and validation.
- Request body serialization.
- TLS / certificate handling — delegated to the platform.
- Zod parsing of untrusted responses.

If you find a vulnerability in any of these areas, please report it.
```

### Step 5: Write `CODE_OF_CONDUCT.md`

Use the canonical Contributor Covenant v2.1 — paste the text from `https://www.contributor-covenant.org/version/2/1/code_of_conduct/`. Replace the contact email placeholder with a real one before publishing.

### Step 6: Write `LICENSE`

Standard MIT text with:

```
Copyright (c) 2026 Pedro Fernandez
```

Replace the placeholder year with the current year if not 2026.

### Step 7: Write `.github/CODEOWNERS`

```
# CODEOWNERS — defaults to the repository owner for every path.
# Adjust as co-maintainers are added.

* @USER
```

### Step 8: Write `.github/PULL_REQUEST_TEMPLATE.md`

```markdown
## Summary

<!-- One or two sentences describing the change. -->

## Linked issues

<!-- Link to the issue(s) this PR closes: Closes #123 -->

## Type of change

- [ ] `feat` — new feature
- [ ] `fix` — bug fix
- [ ] `chore` — tooling, infra, no behavior change
- [ ] `docs` — documentation only
- [ ] `refactor` — code change that neither fixes a bug nor adds a feature
- [ ] `test` — adding or fixing tests
- [ ] `perf` — performance improvement

## Breaking change

- [ ] This PR includes a breaking change (call it out below)

<!-- If yes, describe the breaking change and migration steps. -->

## Checklist

- [ ] I followed strict TDD (test written before implementation, RED → GREEN → REFACTOR).
- [ ] `bun run lint` passes locally.
- [ ] `bun run typecheck` passes locally.
- [ ] `bun run test` passes locally (Vitest + Bun).
- [ ] Commit messages follow Conventional Commits.
- [ ] PR title follows Conventional Commits.
- [ ] Documentation updated (README, JSDoc, or relevant docs).

## Notes for reviewer

<!-- Anything the reviewer should pay extra attention to. -->
```

### Step 9: Write `.github/ISSUE_TEMPLATE/bug_report.md`

```markdown
---
name: Bug report
about: Report incorrect behavior or a crash
title: "[bug] "
labels: ["bug"]
---

## Describe the bug

A clear and concise description of what the bug is.

## Reproduction

<!-- Minimal code snippet or steps to reproduce. -->

```ts
// paste here
```

## Expected behavior

What you expected to happen.

## Actual behavior

What actually happens. Include error messages, stack traces, and screenshots if relevant.

## Environment

- `http-session` version: <!-- e.g. 0.1.0 -->
- Runtime: <!-- bun 1.x / node 20 / browser X / react-native Y -->
- OS: <!-- macOS / Linux / Windows -->

## Additional context

Anything else that might be relevant.
```

### Step 10: Write `.github/ISSUE_TEMPLATE/feature_request.md`

```markdown
---
name: Feature request
about: Propose a new feature or behavior change
title: "[feat] "
labels: ["enhancement"]
---

## Problem

<!-- What user-facing problem does this solve? -->

## Proposed solution

<!-- Describe the API or behavior you want. -->

## Alternatives considered

<!-- What other approaches did you weigh? Why this one? -->

## Breaking change?

- [ ] Yes (call out below)
- [ ] No

<!-- If yes, describe the migration. -->

## Additional context

<!-- Links to related issues, prior art, or external references. -->
```

### Step 11: Verify the doc set

```bash
bun run lint
```

Expected: passes. (Biome formats markdown if `files.includes` covers `.md` — adjust only if it complains.)

Then read each file by eye to confirm they render correctly on GitHub (headings, links, tables, fenced code blocks).

### Step 12: Commit Task 3

```bash
git add -A
git commit -m "docs(repo): add README, contributing docs, license, and GitHub templates

- README: package front page with quick start, API table, architecture link.
- CONTRIBUTING: Git Flow + worktrees workflow, conventional commits, TDD.
- RELEASE: how release-please versions and publishes.
- SECURITY: private reporting channels and SLA.
- CODE_OF_CONDUCT: Contributor Covenant v2.1.
- LICENSE: MIT, copyright 2026 Pedro Fernandez.
- GitHub templates: PR checklist, bug report, feature request.
- CODEOWNERS: owner-only defaults."
```

---

## Task 4: Extend package.json, tsconfig, and add build placeholder

**Files:**
- Modify: `package.json` (engines, exports, files, scripts)
- Modify: `tsconfig.json` (strict + noUncheckedIndexedAccess + path alias)
- Create: `tsconfig.build.json`
- Create: `scripts/build.ts`
- Modify: `vitest.config.ts` (add `@/*` alias)
- Modify: `.gitignore` (none expected)

**Interfaces:**
- Consumes: existing source under `src/`
- Produces: `bun run build` succeeds (placeholder output); TS resolves `@/...` imports; engines/exports/files are correct

### Step 1: Write `tsconfig.build.json`

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["**/*.test.ts", "tests/**", "scripts/**", ".worktrees-infra/**"]
}
```

### Step 2: Update `tsconfig.json`

Read the current file, then **merge** the following changes (preserve existing fields):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "moduleDetection": "force",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": false,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "allowImportingTsExtensions": false,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    },
    "types": ["bun"]
  },
  "include": ["src/**/*", "tests/**/*", "scripts/**/*", "vitest.config.ts"],
  "exclude": ["dist", "coverage", ".worktrees", ".worktrees-infra"]
}
```

Verify: `bun run typecheck` still passes.

### Step 3: Update `vitest.config.ts`

Read the current file, then ensure it includes the path alias. Final shape:

```ts
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/bun/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/index.ts"],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
```

Verify: `bun run test:vitest` passes.

### Step 4: Extend `package.json`

Read the current file and **merge** the following changes (preserve existing fields):

In `engines` (add):

```json
"engines": {
  "node": ">=20",
  "bun": ">=1.1.0"
}
```

Replace the `exports` block with:

```json
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js",
    "default": "./dist/index.js"
  },
  "./package.json": "./package.json"
}
```

Add a `files` field:

```json
"files": ["dist", "README.md", "LICENSE", "CHANGELOG.md"]
```

Add to `scripts`:

```json
"build": "bun run scripts/build.ts"
```

Verify: `bun run build` runs the placeholder script (next step).

### Step 5: Write `scripts/build.ts`

```ts
/**
 * Build driver.
 *
 * For now this just confirms the toolchain is wired and exits 0. A real
 * `bun build --target=bun --outdir=dist ./src/index.ts` invocation lands
 * in Task 6 once `HttpClient` exists and we have something worth bundling.
 */

const ok = (msg: string) => console.log(`\x1b[32m✓\x1b[0m ${msg}`);

ok("build: placeholder ok (real bundling lands in Task 6)");
ok("src/index.ts: " + (await Bun.file("src/index.ts").exists() ? "found" : "MISSING"));
```

Verify: `bun run build` prints the two `✓` lines and exits 0.

### Step 6: Full quality gate

```bash
bun run lint
bun run typecheck
bun run test
bun run build
```

All must pass.

### Step 7: Commit Task 4

```bash
git add -A
git commit -m "chore(package): extend package metadata, tsconfig, and build script

- package.json: engines (Node >=20, Bun >=1.1), exports map pointing at
  dist/, files whitelist for npm publish, build script.
- tsconfig.json: strict + noUncheckedIndexedAccess + verbatimModuleSyntax
  + @/* path alias.
- tsconfig.build.json: production shape emitting declarations and source
  maps into dist/.
- scripts/build.ts: placeholder driver; real bun build lands in Task 6.
- vitest.config.ts: @/* alias and coverage thresholds (90/90/85/90)."
```

---

## Task 5: Split errors module into `core/errors/` directory

**Files:**
- Create: `src/core/errors/index.ts` (barrel)
- Create: `src/core/errors/codes.ts` (shared `HttpErrorCode` union)
- Create: `src/core/errors/base.ts` (`HttpError` class)
- Create: `src/core/errors/http-status.ts` (`HttpStatusError`)
- Create: `src/core/errors/network.ts` (`NetworkError`)
- Create: `src/core/errors/timeout.ts` (`TimeoutError`)
- Create: `src/core/errors/cancellation.ts` (`CancelledError`)
- Create: `src/core/errors/decode.ts` (`DecodeError`)
- Create: `src/core/errors/invalid-request.ts` (`InvalidRequestError`)
- Create: `src/core/errors/unsupported.ts` (`UnsupportedCapabilityError`)
- Delete: `src/core/errors.ts` (replaced by the directory)
- Modify: `src/index.ts` (imports update automatically if barrel re-exports)
- Modify: `src/core/http-request.ts` (import path)
- Modify: `src/core/request-state.ts` (import path, if any)
- Create: `tests/core/errors.test.ts`

**Interfaces:**
- Consumes: existing `src/core/errors.ts` (single file with all error classes)
- Produces: same public exports from `src/core/errors/index.ts`; no behavior change

### Step 1: Write `src/core/errors/codes.ts`

```ts
export type HttpErrorCode =
  | "http_status"
  | "network"
  | "timeout"
  | "cancelled"
  | "decode"
  | "invalid_request"
  | "unsupported_capability";
```

### Step 2: Write `src/core/errors/base.ts`

```ts
import type { HttpErrorCode } from "./codes";

export interface HttpErrorOptions extends ErrorOptions {
  readonly code: HttpErrorCode;
  readonly status?: number;
  readonly cause?: unknown;
  readonly responseHeaders?: Readonly<Record<string, string>>;
}

export class HttpError extends Error {
  readonly code: HttpErrorCode;
  readonly status?: number;
  readonly responseHeaders?: Readonly<Record<string, string>>;

  constructor(message: string, options: HttpErrorOptions) {
    super(message, options);
    this.name = "HttpError";
    this.code = options.code;
    if (options.status !== undefined) this.status = options.status;
    if (options.responseHeaders !== undefined) this.responseHeaders = options.responseHeaders;
  }
}
```

### Step 3: Write `src/core/errors/http-status.ts`

```ts
import { HttpError, type HttpErrorOptions } from "./base";

export interface HttpStatusErrorOptions extends Omit<HttpErrorOptions, "code"> {}

export class HttpStatusError extends HttpError {
  constructor(message: string, options: HttpStatusErrorOptions) {
    super(message, { ...options, code: "http_status" });
    this.name = "HttpStatusError";
  }
}
```

### Step 4: Write `src/core/errors/network.ts`

```ts
import { HttpError, type HttpErrorOptions } from "./base";

export class NetworkError extends HttpError {
  constructor(message: string, options?: Omit<HttpErrorOptions, "code">) {
    super(message, { code: "network", ...(options ?? {}) });
    this.name = "NetworkError";
  }
}
```

### Step 5: Write `src/core/errors/timeout.ts`

```ts
import { HttpError, type HttpErrorOptions } from "./base";

export class TimeoutError extends HttpError {
  constructor(message: string, options?: Omit<HttpErrorOptions, "code">) {
    super(message, { code: "timeout", ...(options ?? {}) });
    this.name = "TimeoutError";
  }
}
```

### Step 6: Write `src/core/errors/cancellation.ts`

```ts
import { HttpError, type HttpErrorOptions } from "./base";

export class CancelledError extends HttpError {
  constructor(message: string, options?: Omit<HttpErrorOptions, "code">) {
    super(message, { code: "cancelled", ...(options ?? {}) });
    this.name = "CancelledError";
  }
}
```

### Step 7: Write `src/core/errors/decode.ts`

```ts
import { HttpError, type HttpErrorOptions } from "./base";

export class DecodeError extends HttpError {
  constructor(message: string, options: Omit<HttpErrorOptions, "code">) {
    super(message, { ...options, code: "decode" });
    this.name = "DecodeError";
  }
}
```

### Step 8: Write `src/core/errors/invalid-request.ts`

```ts
import { HttpError, type HttpErrorOptions } from "./base";

export class InvalidRequestError extends HttpError {
  constructor(message: string, options?: Omit<HttpErrorOptions, "code">) {
    super(message, { code: "invalid_request", ...(options ?? {}) });
    this.name = "InvalidRequestError";
  }
}
```

### Step 9: Write `src/core/errors/unsupported.ts`

```ts
import { HttpError, type HttpErrorOptions } from "./base";

export class UnsupportedCapabilityError extends HttpError {
  constructor(message: string, options: Omit<HttpErrorOptions, "code">) {
    super(message, { ...options, code: "unsupported_capability" });
    this.name = "UnsupportedCapabilityError";
  }
}
```

### Step 10: Write `src/core/errors/index.ts`

```ts
export type { HttpErrorCode } from "./codes";
export type { HttpErrorOptions } from "./base";
export { HttpError } from "./base";
export { HttpStatusError } from "./http-status";
export type { HttpStatusErrorOptions } from "./http-status";
export { NetworkError } from "./network";
export { TimeoutError } from "./timeout";
export { CancelledError } from "./cancellation";
export { DecodeError } from "./decode";
export { InvalidRequestError } from "./invalid-request";
export { UnsupportedCapabilityError } from "./unsupported";
```

### Step 11: Delete the old `src/core/errors.ts`

```bash
git rm src/core/errors.ts
```

### Step 12: Update import paths

Read each file and rewrite any imports of `./errors` to `./errors/index` (or just `./errors` — TS module resolution handles either, but consistency matters). Files to inspect:

- `src/core/http-request.ts`
- `src/core/request-state.ts`
- Any other file that imports `./errors`

### Step 13: Update `src/index.ts` if needed

The barrel `src/index.ts` already imports from `./core/errors`. Verify it still works with the directory layout:

```bash
grep -n "errors" src/index.ts
```

If it imports `./core/errors`, change to `./core/errors/index` for clarity. Otherwise leave as-is.

### Step 14: Write `tests/core/errors.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  CancelledError,
  DecodeError,
  HttpError,
  HttpStatusError,
  InvalidRequestError,
  NetworkError,
  TimeoutError,
  UnsupportedCapabilityError,
  type HttpErrorCode,
} from "../../src/core/errors";

describe("HttpError hierarchy", () => {
  it("each subclass carries its stable code", () => {
    const cases: ReadonlyArray<[HttpError, HttpErrorCode]> = [
      [new HttpStatusError("boom", { status: 500 }), "http_status"],
      [new NetworkError("net"), "network"],
      [new TimeoutError("slow"), "timeout"],
      [new CancelledError("nope"), "cancelled"],
      [new DecodeError("zod", { cause: new Error("z") }), "decode"],
      [new InvalidRequestError("bad url"), "invalid_request"],
      [new UnsupportedCapabilityError("xhr", { cause: new Error("x") }), "unsupported_capability"],
    ];
    for (const [err, code] of cases) {
      expect(err.code).toBe(code);
      expect(err).toBeInstanceOf(HttpError);
    }
  });

  it("preserves the cause chain", () => {
    const root = new Error("root");
    const wrapped = new NetworkError("net", { cause: root });
    expect(wrapped.cause).toBe(root);
  });

  it("HttpStatusError carries status metadata", () => {
    const e = new HttpStatusError("boom", {
      status: 418,
      responseHeaders: { "x-test": "1" },
    });
    expect(e.status).toBe(418);
    expect(e.responseHeaders).toEqual({ "x-test": "1" });
  });
});
```

### Step 15: Run the full quality gate

```bash
bun run lint
bun run typecheck
bun run test
bun run build
```

All must pass. If Biome complains about a barrel in `src/core/errors/index.ts`, the `noBarrelFile` rule is already disabled in `biome.json` — if it still warns, confirm the `biome.json` from Task 1 is intact.

### Step 16: Commit Task 5

```bash
git add -A
git commit -m "refactor(core): split errors module into core/errors/ directory

- One file per error class plus a shared codes union and HttpError base.
- src/core/errors/index.ts re-exports the full public surface so
  existing imports keep working.
- Remove the monolithic src/core/errors.ts.
- Add tests/core/errors.test.ts covering stable codes, cause chain
  preservation, and HttpStatusError metadata.
- No behavior change: every error class exposes the same constructor
  signature and the same code as before."
```

---

## Final Step: Open the PR

After all five tasks land on `feature/repo-infra-and-cicd`:

```bash
git push -u origin feature/repo-infra-and-cicd
gh pr create \
  --title "chore(infra): repo tooling, CI/CD, docs, and package metadata" \
  --body-file - <<'PR_BODY'
## Summary

Lands the developer infrastructure for the `httpSession` package as specified in `docs/superpowers/specs/2026-08-26-repo-infra-design.md`:

- Biome (lint + format), Husky, lint-staged, commitlint
- GitHub Actions CI, release-please, CodeQL, Dependabot
- README, CONTRIBUTING, RELEASE, SECURITY, CODE_OF_CONDUCT, LICENSE
- PR and issue templates, CODEOWNERS
- Extended `package.json` (engines, exports, scripts) and `tsconfig`
- Split `src/core/errors.ts` into `src/core/errors/` directory

## Linked

- Spec: `docs/superpowers/specs/2026-08-26-repo-infra-design.md`

## Breaking change

None. Public API surface is unchanged. `src/core/errors.ts` is replaced by `src/core/errors/index.ts` (same exports); existing import paths keep working.

## Next steps after merge

1. resume core implementation on `feature/http-session-core` (Tasks 4–7).
2. Once Tasks 4–7 land, merge the release-please `chore(main): release 0.1.0` PR.
PR_BODY
```

---

## Self-Review Notes (read me before executing)

- **Spec coverage:** Sections 1–10 of the spec are covered: tooling (Task 1), CI/CD (Task 2), docs (Task 3), package metadata (Task 4), errors split (Task 5). release-please configuration lives in Task 2 (per spec section 4.1). Dependabot in Task 2 (spec 4.2). Quality gates in Task 1 (spec 3). Conventional Commits enforcement in Task 1 (spec 3.3).
- **Type consistency:** `HttpErrorCode` union and `HttpErrorOptions` shape are introduced in Task 5 and re-used by every concrete error class — same names as the existing `src/core/errors.ts`. No renaming.
- **No placeholders:** every file ships with full content. `bun run build` is a real script (not a TBD) — it just prints ok lines until Task 6 lands the real bundler.
- **YAGNI:** no Renovate, no Codecov upload, no matrix builds, no Deno. All deferred to "out of scope" in the spec.
- **Risk acknowledged:** Task 1 Step 13 deliberately triggers a Husky failure to prove the hook works. The executor MUST `git reset` after that step — do not commit that bad message.
