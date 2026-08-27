# Git Flow Cheatsheet

Quick reference for the `httpSession` branching model. Production is `main`, integration is `develop`. The git-flow CLI is wired locally; see `CONTRIBUTING.md` for the full workflow.

## Inspect the config

```bash
git flow config                    # show all git-flow settings
git config --get-regexp '^gitflow' # raw keys
```

Expected output:

```
gitflow.branch.master main
gitflow.branch.develop develop
gitflow.prefix.feature feature/
gitflow.prefix.release release/
gitflow.prefix.hotfix hotfix/
gitflow.prefix.support support/
gitflow.prefix.versiontag v
```

## Features (`feature/<slug>`)

Branch from `develop`, merge back into `develop`.

```bash
git flow feature start <slug>          # creates feature/<slug>
# …write code, commit with conventional commits…
git flow feature finish <slug>         # merges feature/<slug> into develop, deletes the branch

git flow feature finish -k <slug>      # keep the branch (e.g. for archival)
git flow feature finish -F <slug>      # fetch from origin first
git flow feature finish -r <slug>      # rebase onto develop before merge
```

## Releases (`release/<version>`)

Branch from `develop`, merge into `main` and `develop`, tag with `v<version>`.

```bash
git flow release start 0.2.0           # creates release/0.2.0
# …final QA, version bump, CHANGELOG regen…
git flow release finish 0.2.0          # merges to main + develop, tags v0.2.0

git flow release finish -m "release notes" 0.2.0   # use the supplied message
git flow release finish -p              # push branches and tags after finishing
git flow release finish -n              # skip the tag (e.g. when release-please manages tags)
```

## Hotfixes (`hotfix/<slug>`)

Branch from `main`, merge into `main` and `develop`, tag with `v<X.Y.(Z+1)>`.

```bash
git flow hotfix start <slug>           # creates hotfix/<slug>
# …fix the bug, bump patch version…
git flow hotfix finish <slug>          # merges to main + develop, tags the new patch version
```

## Support branches (`support/<slug>`)

Long-lived maintenance branches for old releases. Branched from a tagged commit.

```bash
git flow support start <slug> <base-tag>
```

## Worktrees (recommended)

```bash
# Integration baseline
git worktree add ../httpSession-develop develop

# New feature
git worktree add ../httpSession-<slug> feature/<slug>

# Hotfix
git worktree add ../httpSession-hotfix-<slug> hotfix/<slug>
```

Worktrees live **outside** the main repo directory so multiple branches stay usable in parallel.