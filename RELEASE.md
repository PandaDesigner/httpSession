# Release Process

This project uses [release-please](https://github.com/googleapis/release-please) to automate versioning and publishing. Releases flow `develop` → `main`; hotfixes flow `main` → `develop`. See [`CONTRIBUTING.md`](./CONTRIBUTING.md#branch-rules-tldr) for the high-level rule.

## The two directions

### Releases: `develop` → `main`

1. Land `feat:` / `fix:` / `BREAKING CHANGE:` commits on `develop` (via PR or fast-forward).
2. Open a PR from `develop` into `main`. **release-please is triggered by `push:main`** (see `.github/workflows/release-please.yml`), so the push to `main` is what starts the release flow — not the PR itself.
3. release-please detects the commits since the last release tag and opens a **release PR** that:
   - Bumps `version` in `package.json` (semver: `feat` → minor, `fix` → patch, `BREAKING CHANGE` / `feat!` → major).
   - Regenerates `CHANGELOG.md`.
   - Updates the version constant in `src/index.ts`.
4. Review the release PR. Verify the changelog reads correctly and the version bump matches the changes.
5. Merge the release PR into `develop`. Force-push `develop` back to `main` (or open a sync PR) so the release commit lands on `main`.
6. The next `push:main` re-runs release-please. It detects that the release PR was merged, creates the `vX.Y.Z` tag and the GitHub Release on the merged commit, and runs `JS-DevTools/npm-publish` (which requires the `NPM_TOKEN` secret or a manual `npm publish` from local).

### Hotfixes: `main` → `develop`

For urgent fixes that cannot wait for the regular release cycle:

1. Branch a `hotfix/<slug>` off `main`.
2. Commit the fix with a `fix:` prefix, push to `main`, and merge.
3. Back-merge `main` into `develop` so the integration branch carries the fix:
   ```bash
   git checkout develop
   git merge --ff-only origin/main
   git push origin develop
   ```
4. release-please opens a patch release PR against `develop`; merge it and force-push `develop` to `main` to trigger the tag + publish.

## First release (0.1.0)

The first release is bootstrapped manually because release-please needs at least one tag to start tracking versions:

1. Verify the release PR title is `chore(main): release 0.1.0`.
2. Merge it.
3. Confirm the GitHub Release exists at `https://github.com/PandaDesigner/httpSession/releases/tag/v0.1.0`.
4. Confirm the npm package is visible at `https://www.npmjs.com/package/http-session-core`.

## Rollback

If a release introduces a regression:

1. Open a `fix:` PR that reverts the regression. **Hotfix direction**: land it on `main` first, then sync back to `develop`.
2. Once merged, release-please will open a patch release PR.
3. Merge that patch release to ship the fix.

Do not delete tags or force-push to `main` — release-please trusts the linear history.
