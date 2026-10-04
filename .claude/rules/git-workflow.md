# Git workflow

These rules apply to **every** git operation in this repository. They override default Claude Code behavior where they conflict.

> **Enforcement:** these rules are layered with `.claude/settings.json` (`permissions.deny`) and a `PreToolUse` hook at `.claude/hooks/git-guard.js`. The hook refuses **any push targeting `main`, from any branch** — otherwise a feature branch could run `git push origin HEAD:main` and bypass the pull request — plus force pushes without per-operation consent. While HEAD is on `main` it additionally refuses `Edit`/`Write` and `git commit`. The rules below remain the source of truth and model context; the hook is defence in depth.
>
> The hook resolves the branch from the directory the operation targets — the worktree holding the edited file, or `git -C <path>` when given — not from `CLAUDE_PROJECT_DIR`. That variable keeps pointing at the original checkout, so reading it made the guard see `main` and refuse every write inside a linked worktree that was correctly on a feature branch.
>
> The hook is Node.js; why is stated in `.claude/rules/scripting.md`.

## Hard rules

1. **Never commit to `main`.** `main` is the protected base branch. All work happens on a feature branch.
2. **Never push to `main` directly.** Changes reach `main` only through a pull request.
3. **Never create a commit without explicit user permission.** Staging files (`git add`) is fine; running `git commit` is not — wait for the user to say "commit it" (or equivalent) for each individual commit.
4. **Always work on a branch.** If the current branch is `main`, create a new branch (`git checkout -b feat/<slug>`) before making changes. If unsure what to name it, ask.

## Branch naming

- `feat/<slug>` — new functionality (a new plugin, skill, or agent)
- `fix/<slug>` — corrections to existing content
- `docs/<slug>` — documentation-only changes

The `create-workspace` skill in `terylon-git` uses the `feat/<slug>` convention by default.

## What "explicit permission" means

- A direct instruction like "commit it", "make a commit", "go ahead and commit", "commit and push".
- Permission for one commit is **not** permission for the next. Ask again.
- Approval of a *plan* that mentions commits is **not** permission to commit — the plan describes intent; the act still needs a green light.
- A user saying "looks good" about a diff is **not** permission to commit unless they also say to commit.

## What you may do without asking

- Read git state (`git status`, `git log`, `git diff`, `git branch`).
- Stage files (`git add`).
- Create branches (`git checkout -b`, `git switch -c`) — branching is cheap and reversible.
- Stash and unstash local changes when needed to keep the working tree clean.

## What requires explicit permission (each time)

- `git commit` (any form, including `--amend`).
- `git push` (any form, especially `--force` / `--force-with-lease`).
- `git merge`, `git rebase`, `git reset --hard`, `git revert`, `git cherry-pick`.
- Deleting branches (`git branch -d`, `git branch -D`, `git push --delete`).
- Tag creation or deletion.

## If asked to commit while on `main`

Refuse the commit, explain that `main` is protected by this rule, and offer to create a new branch first. Only after the branch exists and the user confirms, proceed.

## Plugin version bumps

Every commit that changes a plugin must bump that plugin's `plugin.json#version` — consumers only re-fetch when this field changes.

**Which digit moves is stated once, under *Versioning* in `plugins/CLAUDE.md`**, and is not repeated here.
