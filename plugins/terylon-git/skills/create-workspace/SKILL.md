---
name: create-workspace
description: >-
  Use when starting feature work that needs isolation from the current checkout — creates an
  isolated git worktree on a new branch (Terylon `feat/<name>` convention, project-local
  `.claude/worktrees/`), or detects existing isolation / native worktree tooling first. Self-contained;
  pure git, no external dependencies.
allowed-tools: Bash(git *), Read, Grep, Glob
---

# create-workspace

Ensures feature work happens in an **isolated git worktree** on a new branch instead of in the
current checkout. It detects existing isolation, prefers any native worktree tooling, and falls
back to `git worktree add` into a project-local `.claude/worktrees/` directory — then optionally runs
setup and reports where to work. This skill is **self-contained**: it depends on nothing but git,
so it works in any Terylon product repo regardless of whether the superpowers plugin is installed.
It is inspired by the superpowers `using-git-worktrees` skill but reimplements the create flow with
Terylon conventions (the `feat/<name>` branch prefix) and the Claude-Code cwd-reset caveat baked in.

## Usage

```
/create-workspace "<name>" [--branch=<branch>] [--from=<base-ref>] [--into=<dir>] [--setup]
```

- `<name>` — **required**. Feature/workspace name; sanitized to a slug for the branch and directory.
- `--branch=<branch>` — override the branch name. Default: `feat/<slug>` (the Terylon convention).
- `--from=<base-ref>` — base ref to branch from. Default: the detected integration branch (see Step 1).
- `--into=<dir>` — parent directory for the worktree. Default: `.claude/worktrees`.
- `--setup` — run the repo's dependency setup after creating the worktree. Default: skip (no setup).

## Workflow

### Step 0 — Detect existing isolation (never nest)

Resolve the real git directories and current branch:

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
BRANCH=$(git branch --show-current)
```

Rules:

- **Submodule guard:** if `git rev-parse --show-superproject-working-tree` returns a path, this is a
  submodule, not a linked worktree — treat it as a normal repo and proceed.
- **Already isolated:** if `GIT_DIR != GIT_COMMON` (and it is **not** a submodule), you are already in
  a linked worktree. Report `Already in isolated workspace at <path> on branch <name>.` and **STOP** —
  do not create another worktree.
- **Else:** normal checkout → proceed to Step 1.

### Step 1 — Resolve inputs

- `<name>` → sanitize to a slug (lowercase, non-alphanumerics → `-`).
- **Branch:** `--branch` if given, else `feat/<slug>`.
- **Worktree path:** (`--into` or `.claude/worktrees`) + `/<slug>`.
- **Base ref:** `--from` if given, else detect the repo's integration branch:

```bash
BASE=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')
# fallback: first of main / master / develop that resolves; else current HEAD
```

If `origin/HEAD` is unset, fall back to the first of `main`, `master`, `develop` that resolves
(`git rev-parse --verify <ref>`); if none resolve, use the current `HEAD`. **Report the chosen base.**

### Step 2a — Native worktree tool first (preferred)

If the environment exposes a native worktree mechanism — a tool named like `EnterWorktree` /
`WorktreeCreate`, a `/worktree` command, or a `--worktree` flag — **use it** and skip to Step 3.
Native tooling manages placement, branch creation, and cleanup; running raw `git worktree add`
alongside it creates state the harness can't see. Do **not** run `git worktree add` when a native
tool is available.

**The native tool owns the branch name.** Pass it the name from Step 1, but expect it to normalize
that name to its own scheme — `feat/<slug>` may come back as `worktree-feat+<slug>`, because a tool
that encodes the branch into a directory name cannot keep a `/` in it.

**Take the name it returns and do not rename the branch.** Renaming desynchronizes the harness from
git: the tool still tracks the worktree under the name it created, so cleanup, and any later
`ExitWorktree`, operate on a branch that no longer exists. That is the same failure the paragraph
above warns about, arriving one step later.

The `feat/<slug>` convention therefore binds **Step 2b**, where the name is ours to choose. Under a
native tool, report the actual branch (Step 4) and rename at the end if it matters — after the
worktree is merged and gone, when nothing is tracking it any more.

### Step 2b — Git worktree fallback

Only when no native tool is available. The fallback places worktrees under **`.claude/worktrees/`** — the same root native worktree tooling (Step 2a) uses, so a repo lands its worktrees in one place regardless of which path created them.

- **Ignore safety (project-local only):** verify `.claude/worktrees/` is ignored before creating anything:

  ```bash
  git check-ignore -q .claude/worktrees/ 2>/dev/null
  ```

  **The trailing slash matters.** A `.gitignore` entry of `.claude/worktrees/` matches directories only, so
  `git check-ignore .claude/worktrees` (no slash) reports *not ignored* even when the entry is present —
  and the skill would then offer to add a line that is already there.

  If it is **not** ignored: add `.claude/worktrees/` to `.gitignore`, then commit that change. **Commit
  caveat:** committing requires the user's explicit consent — surface the `.gitignore` change and
  ask for the go-ahead rather than committing silently.

- **Create the worktree:**

  ```bash
  git worktree add .claude/worktrees/<slug> -b <branch> <base-ref>
  ```

- **Permission / sandbox fallback:** if `git worktree add` fails with a permission/sandbox error,
  tell the user the sandbox blocked worktree creation and that work continues in the current
  directory, then skip to the report.

### Step 3 — Optional setup (opt-in)

Only with `--setup` (or if the user explicitly asks): auto-detect and run the repo's setup —
`npm install` for `package.json`, `dotnet restore`/build for a `.sln`/`.csproj`, `pip install` /
`poetry install` for Python, `go mod download` for Go. Without the flag, **skip setup** — the right
default in large repositories. Never run a full baseline test suite unless explicitly asked.

### Step 4 — Report

Print:

```
Workspace ready: <path>  (as reported by the tool that created it)
Branch: <branch>  (base: <base-ref>)
Open it: git -C <path>  (see Common mistakes on cwd-reset)
```

Report the **actual** branch and path, not the ones from Step 1 — under a native tool (Step 2a) both
may differ from what was requested. A report that echoes the request instead of the result is how a
normalized branch name goes unnoticed until cleanup fails.

## Common mistakes

- **cwd-reset:** in Claude Code the shell working directory is reset to the repo root (where Claude
  Code launches) after each command, so `cd <worktree>` **does not persist** across Claude Code tool
  calls. The worktree lives under the repo root at `.claude/worktrees/<slug>`, so refer to it by that
  **repo-root-relative** path and run git with `git -C .claude/worktrees/<slug>` — never hardcode an
  absolute machine path or rely on a persisted `cd`.
- **Fighting native tooling:** never run `git worktree add` when a native worktree tool exists
  (Step 2a) — it creates state the harness can't track.
- **Renaming the branch a native tool created:** the normalized name (`worktree-feat+<slug>`) looks
  wrong against the `feat/<slug>` convention, and renaming it to match is the obvious next move. It
  is also the one that breaks cleanup — the tool still tracks the old name. Report the real name and
  leave it alone; the convention binds Step 2b, not Step 2a.
- **Nesting:** never create a worktree when Step 0 detected existing isolation — report and stop.
- **Skipping the ignore check:** the project-local `.claude/worktrees/` must be gitignored **before**
  creating it, or its contents pollute `git status`.
- **Forced setup:** don't run a full build or baseline test suite in large repositories unless
  `--setup` is passed or the user asks.

## Verification

- **Normal checkout create:** in a normal checkout, the skill creates `.claude/worktrees/<slug>` on branch
  `feat/<slug>` from the detected base; `git worktree list` shows the new worktree.
- **Already-isolated detection:** run from inside an existing linked worktree → the skill detects
  isolation (Step 0) and stops without creating a nested worktree.
- **Ignore safety:** in a repo where `.claude/worktrees/` is not yet ignored, the skill adds it to
  `.gitignore` and surfaces the change for commit (does not commit silently). Verify the check
  itself with `git check-ignore -q .claude/worktrees/` in a repo that *does* ignore it — it must exit 0.
  Without the trailing slash it exits 1 even when the entry is present, which is the failure this
  check is written to avoid.
- **Flags honored:** `--branch`, `--from`, `--into` are respected; without `--setup`, no dependency
  install runs.
- **No external writes:** the skill performs only local git operations; nothing is posted to ADO or
  any other service.
