# Working on the marketplace itself

Changing a skill and wanting to run it before it reaches `main`. The mechanism is one field — the `ref` a consumer tracks — overridden in a file that is never committed.

## Point a local checkout at your branch

Override `ref` in your **local** `.claude/settings.local.json`. It is gitignored; never commit it.

**A feature branch exists only on Azure DevOps** — GitHub receives `main` and release tags, nothing else (see *How `main` reaches GitHub* in [`flows/change-to-consumer-repo.md`](../flows/change-to-consumer-repo.md)). So the override names the Azure DevOps remote rather than the public URL, and fetching it uses your git credential for Azure DevOps. The URL is not written here, because the organisation is not published; `git remote get-url origin` in your clone prints it.

```json
{
  "extraKnownMarketplaces": {
    "terylon": {
      "source": {
        "source": "git",
        "url": "<the Azure DevOps remote: run  git remote get-url origin>",
        "ref": "feat/<your-branch>"
      },
      "autoUpdate": true
    }
  }
}
```

```
.claude/settings.json        committed, shared    ref: main
        │
        ▼  overridden by
.claude/settings.local.json  gitignored, yours    ref: feat/<your-branch>
```

**Bump the version on the branch too.** The consumer-side fetch compares `plugin.json#version` and nothing else, so a branch whose version matches `main` installs nothing new — even though the ref is different. Which digit to move is stated under *Versioning* in [`plugins/CLAUDE.md`](../../plugins/CLAUDE.md).

## The cycle

```
  edit in a worktree on feat/<slug>
        │
  bump plugins/<slug>/.claude-plugin/plugin.json#version
        │
  commit + push the branch          (consent per commit; the guard blocks main)
        │
  /plugin marketplace update        in the repository testing it
        │
  run the skill
        │
        └── wrong? edit, bump patch, push, update again
```

`autoUpdate: true` refreshes in the background, but during development the explicit `/plugin marketplace update` is what makes the timing predictable.

## What the guard refuses

`.claude/hooks/git-guard.js` runs on every tool call and is defence in depth behind [`.claude/rules/git-workflow.md`](../../.claude/rules/git-workflow.md):

| Attempt | Result |
|---|---|
| `Edit` / `Write` / `git commit` while HEAD is on `main` | refused |
| **Any** push targeting `main`, from any branch — including `git push origin HEAD:main` | refused |
| A force push without per-operation consent | refused |
| Everything else | allowed |

The hook resolves the branch from **the directory the operation targets** — the worktree holding the edited file, or the path given to `git -C` — not from `CLAUDE_PROJECT_DIR`. That variable keeps pointing at the original checkout, so reading it made the guard see `main` and refuse every write inside a linked worktree that was correctly on a feature branch.

## Worktrees

Feature work belongs in an isolated worktree under `.claude/worktrees/`, which is gitignored. Create one with the `create-workspace` skill rather than by hand: it detects existing isolation instead of nesting, prefers native worktree tooling when the harness provides it, and checks the ignore entry before creating anything.

**A native worktree tool owns the branch name.** It may normalise `feat/<slug>` into something like `worktree-feat+<slug>`, because a directory name cannot contain a `/`. **Take the name it returns and do not rename the branch** — the tool still tracks the worktree under the name it created, so renaming desynchronises cleanup and any later exit from the worktree. The `feat/<slug>` convention binds the manual fallback, where the name is ours to choose.

## Before you finish a change

| Check | Why |
|---|---|
| The version is bumped in **every** plugin the change touched | a consumer fetches per plugin; a bumped port with an unbumped adapter ships half a change |
| Every dependency diagram is redrawn if an edge moved | the diagrams are drawn in the root `CLAUDE.md`, the root `README.md`, `plugins/CLAUDE.md` and **every** plugin `README.md` |
| `grep` for any renamed component across the diagrams | a diagram that no longer matches is worse than none, because it is believed |
| The knowledge base still tells the truth | [`.claude/rules/docs-sync.md`](../../.claude/rules/docs-sync.md) — `grep -rn "<path you changed>" docs/` |

## Gotchas

**A stale `settings.local.json` is invisible.** It is gitignored, it outranks the committed settings, and a `ref` left pointing at a branch that merged months ago produces a repository that silently never updates. It is the most common cause of [`runbooks/consumer-did-not-get-the-update.md`](../runbooks/consumer-did-not-get-the-update.md) cause C.

**Testing from a branch does not test the merge.** The consumer path is `main` — a change that works from `feat/<slug>` and was never re-checked after merging has only been tested on a ref nobody tracks.

**The repository runs on Windows and natively on Debian.** Scripts are LF, paths are case-sensitive, hooks are Node with no dependencies, and PowerShell is invoked as `pwsh` — `powershell` does not exist on Debian.

## Where it lives

| File | Role |
|---|---|
| `.claude/hooks/git-guard.js` | the `PreToolUse` guard — branch resolution from the target directory, and the push refusals |
| `.claude/rules/git-workflow.md` | the branch, consent, bump and naming rules the hook backs up |
| `.claude/rules/scripting.md` | Node for hooks, `pwsh` never `powershell`, Allman braces, cross-platform constraints |
| `.claude/rules/markdown.md` | frontmatter, drawing rules, and *Every orienting document carries the dependency graph* |
| `plugins/terylon-git/skills/create-workspace/SKILL.md` | `create-workspace` — isolation detection, native-tool preference, the ignore check |
| `plugins/CLAUDE.md` | *Versioning*, and the checklist for adding a plugin |
| `.gitignore` | `.claude/worktrees/`, `docs/terylon/`, `docs/superpowers/` |
