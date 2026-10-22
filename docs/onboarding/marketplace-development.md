# Working on the marketplace itself

Changing a skill and wanting to run it before it reaches `main`. The mechanism is one field — the `ref` a consumer tracks — overridden in a file that is never committed.

## Point a local checkout at your branch

Override `ref` in your **local** `.claude/settings.local.json`. It is gitignored; never commit it.

**A feature branch lives in the same public GitHub repository as `main`**, so the override changes only the `ref`, never the URL, and fetching it needs no credential. Push the branch first; a branch that exists only in your clone cannot be installed. Working from a fork, name your fork in place of `janecekvit/terylon-marketplace`.

```json
{
  "extraKnownMarketplaces": {
    "terylon": {
      "source": {
        "source": "git",
        "url": "https://github.com/janecekvit/terylon-marketplace.git",
        "ref": "feat/<your-branch>"
      },
      "autoUpdate": true
    }
  }
}
```

Keep the `.git` suffix: `marketplace add` records a github.com URL with it appended, and refuses an entry that names the URL without it (measured; the root `CLAUDE.md` records it under *Testing*). For a one-off session, the same branch installs without touching any settings file:

```text
/plugin marketplace add janecekvit/terylon-marketplace#feat/<your-branch>
```

**Add with exactly the `ref` the settings declare.** When `.claude/settings.json` or `settings.local.json` declares `terylon` at one ref and you add `janecekvit/terylon-marketplace#<another-ref>`, the add is refused with *"its source doesn't match its extraKnownMarketplaces entry"* — the same message as the missing `.git` suffix, for a different cause. Found when a session added a feature branch while the committed settings still declared `main`. Either add `#<the declared ref>`, or change the declaration first and then add.

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
| **Any** push targeting `main`, from any branch — including `git push origin HEAD:main`, however the refspec is quoted and behind any chain separator, `&` included | refused |
| A force push without per-operation consent | refused |
| Everything else | allowed |

Two consequences of those rows surprise people, and neither has an override, because the hook runs before any permission prompt:

| Symptom | Cause | Do |
|---|---|---|
| a `Write` to a **gitignored** path — a note under `docs/terylon/`, a scratch file — is refused | the guard refuses every `Edit` and `Write` while HEAD is on `main`; it does not ask whether git would track the file | work from a branch or a worktree, even for files that will never be committed |
| the **first** push of a new, empty repository's `main` is refused | every push targeting `main` is refused, and an empty repository has no other branch to open a pull request from | that one push is the operator's, by hand, outside the session |

Both were found while the repository moved to GitHub: the first by a session writing its plan while still on `main`, the second on the first push to the new repository.

The hook resolves the branch from **the directory the operation targets** — the worktree holding the edited file, or the path given to `git -C` — not from `CLAUDE_PROJECT_DIR`. That variable keeps pointing at the original checkout, so reading it made the guard see `main` and refuse every write inside a linked worktree that was correctly on a feature branch.

## Worktrees

Feature work belongs in an isolated worktree under `.claude/worktrees/`, which is gitignored. Create one with the `create-workspace` skill rather than by hand: it detects existing isolation instead of nesting, prefers native worktree tooling when the harness provides it, and checks the ignore entry before creating anything.

**A native worktree tool owns the branch name.** It may normalise `feat/<slug>` into something like `worktree-feat+<slug>`, because a directory name cannot contain a `/`. **Take the name it returns and do not rename the branch** — the tool still tracks the worktree under the name it created, so renaming desynchronises cleanup and any later exit from the worktree. The `feat/<slug>` convention binds the manual fallback, where the name is ours to choose.

## Parallel agents in one repository

Several agents, each in its own worktree of the same clone, is the usual way the marketplace is built now. The worktrees share more than their names suggest.

| Symptom | Cause | Do |
|---|---|---|
| an agent's `git stash pop` brings back another agent's changes, or its own stash is gone | **the stash belongs to the repository, not the worktree**: every worktree of one clone pushes to and pops from the same `refs/stash` | never stash in a worktree that parallel agents share; commit to your branch, or keep the change in the working tree |
| a pull request body, plan or note an agent wrote to a scratch file holds another agent's text | two agents chose the same fixed name in a shared directory, and the later write won | name every scratch file per worktree or per task — `$TEMP/<branch>-pr-body.md`, never `$TEMP/pr-body.md` |
| every merge after the first conflicts in the root `CLAUDE.md` | parallel pull requests each added a line to the same block — the *Structure* tree is the usual one — and each is based on the `main` before the others merged | resolve as the **union** of both sides, keeping every line; merge in an order that lets each later branch merge `main` once; and prefer one pull request per area of the tree, so two branches rarely touch the same block |

The stash and the scratch file were found when one agent's pull request body was clobbered by a parallel agent's; the `CLAUDE.md` conflicts on the first day several branches were open at once. `.claude/rules/git-workflow.md` permits stashing in general; this section is the exception to it.

## When a pull request is blocked

| Symptom | Cause | Do |
|---|---|---|
| the version check (`versions.yml`) fails on a plugin you raised, saying its version is not above the base's | the check reads each plugin's version **at the pull request's base SHA — the tip of `main`** — not at the merge base, so a raise that merged to `main` after you branched outranks yours | merge `main` into your branch, raise the version above the one `main` now carries, push |
| the pull request stays **BLOCKED** with every check green, the ruleset waiting on a result — *code scanning* waiting for CodeQL, for example | the branch was created before that required check or rule existed, and its head has never produced the result the rule waits for | merge `main` into the branch and push; the new head runs the check |
| **every** pull request is blocked by a *code quality* rule, whatever it changes | the ruleset's `code_quality` rule waits for GitHub Code Quality, which the repository does not have enabled | a repository setting, not a file: the maintainer enables Code Quality or removes the rule |
| every pull request carrying an agent's commits is blocked for unsigned commits | the ruleset's `required_signatures` rule; a session's commits are not signed | a repository setting: the maintainer removes the rule, or commits are made where a signing key exists |

The version check's base is set in `.github/workflows/versions.yml`, and run locally the same way with `node tests/versions/check-plugin-versions.js --base origin/main --head HEAD`. All four were found on the first pull requests after the move to GitHub, while the ruleset in the root `CLAUDE.md`'s *GitHub* table was being set up; that table says which rules `main` carries.

## On Windows

| Symptom | Cause | Do |
|---|---|---|
| `git show <ref>:<path>` in Git Bash says the path does not exist, or names a Windows path | MSYS rewrites any argument that looks like a POSIX path, the `:<path>` half included | prefix the command: `MSYS_NO_PATHCONV=1 git show <ref>:<path>` |
| `node --test tests/forge-port/` fails before any test runs | given a directory, `node --test` tries to run it as a module | pass the files, or a quoted glob: `node --test "tests/**/*.test.js"` |
| dozens of unit tests fail locally while CI is green on the same commit | two prerequisites CI has and a fresh Windows machine lacks: `jq` on `PATH`, which the forge-port suite's GitHub recipes pipe through; and a `claude` CLI recent enough to have `claude plugin test`, which the `terylon-pane` mutation suite runs — an older `claude` on `PATH` fails it rather than skipping | install `jq`, and update `claude` or take the old one off `PATH`, then run the suites again |

All three were found running `node --test "**/*.test.js"` on a Windows workstation before a push.

## Before you finish a change

| Check | Why |
|---|---|
| The version is bumped in **every** plugin the change touched | a consumer fetches per plugin; a bumped port with an unbumped adapter ships half a change |
| Every dependency diagram is redrawn if an edge moved | the diagrams are drawn in the root `CLAUDE.md`, `plugins/CLAUDE.md`, **every** plugin `README.md`, and `docs/architecture/plugins.d2`, whose rendering the root `README.md` embeds |
| `grep` for any renamed component across the diagrams | a diagram that no longer matches is worse than none, because it is believed |
| The knowledge base still tells the truth | [`.claude/rules/docs-sync.md`](../../.claude/rules/docs-sync.md) — `grep -rn "<path you changed>" docs/` |

## Gotchas

**A stale `settings.local.json` is invisible.** It is gitignored, it outranks the committed settings, and a `ref` left pointing at a branch that merged months ago produces a repository that silently never updates. It is the most common cause of [`runbooks/consumer-did-not-get-the-update.md`](../runbooks/consumer-did-not-get-the-update.md) cause C.

**Testing from a branch does not test the merge.** The consumer path is `main` — a change that works from `feat/<slug>` and was never re-checked after merging has only been tested on a ref nobody tracks.

**`git filter-repo` may leave `origin` in place.** It normally removes the remote so a rewritten history cannot be pushed over the original by accident, but not in every case — found when the history was rewritten for the move to GitHub. Run `git remote -v` before the first push of a rewritten history, and point `origin` where the rewrite is meant to go.

**The repository runs on Windows and natively on Debian.** Scripts are LF, paths are case-sensitive, hooks are Node with no dependencies, and PowerShell is invoked as `pwsh` — `powershell` does not exist on Debian.

## Where it lives

| File | Role |
|---|---|
| `.claude/hooks/git-guard.js` | the `PreToolUse` guard — branch resolution from the target directory, and the push refusals |
| `.github/workflows/versions.yml` | the version check on every pull request, and the base SHA it compares against |
| `tests/versions/check-plugin-versions.js` | the version rules the workflow runs, and the local command |
| `.claude/rules/git-workflow.md` | the branch, consent, bump and naming rules the hook backs up |
| `.claude/rules/scripting.md` | Node for hooks, `pwsh` never `powershell`, Allman braces, cross-platform constraints |
| `.claude/rules/markdown.md` | frontmatter, drawing rules, and *Every orienting document carries the dependency graph* |
| `plugins/terylon-git/skills/create-workspace/SKILL.md` | `create-workspace` — isolation detection, native-tool preference, the ignore check |
| `plugins/CLAUDE.md` | *Versioning*, and the checklist for adding a plugin |
| `.gitignore` | `.claude/worktrees/`, `docs/terylon/`, `docs/superpowers/` |
