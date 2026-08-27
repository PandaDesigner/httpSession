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
3. Confirm the GitHub Release exists at `https://github.com/PandaDesigner/httpSession/releases/tag/v0.1.0`.
4. Confirm the npm package is visible at `https://www.npmjs.com/package/http-session-core`.

## Rollback

If a release introduces a regression:

1. Open a `fix:` PR that reverts the regression.
2. Once merged, release-please will open a patch release PR.
3. Merge that patch release to ship the fix.

Do not delete tags or force-push to `main` — release-please trusts the linear history.