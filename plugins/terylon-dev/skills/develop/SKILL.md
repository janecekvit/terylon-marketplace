---
name: develop
description: >-
  Use when implementing a user story end-to-end — give an Azure DevOps work-item URL or a prose
  description. Hosts the human gates and dispatches the leader agent, which owns the plan → build (TDD)
  → finish loop. Optional flags --auto, --dry-run, and --here (stay in the current checkout).
allowed-tools: Bash(git *), Read, Grep, Glob, Write, Agent, AskUserQuestion, mcp__ado__*, mcp__plugin_terylon-devops_ado__*
---

# develop — entry point of the development pipeline

The main thread of the turn. It turns a user story into implemented, tested code by **hosting the human gates** and handing the loop itself to the `leader` agent.

It is a **skill and not an agent** for two reasons: it carries the slash command, and it is the only place `AskUserQuestion` works — subagents cannot prompt the user.

## Usage

```
/terylon-dev:develop <ADO-URL | "description"> [--auto | --dry-run] [--here]
```

- `<ADO-URL>` — an Azure DevOps work item (`dev.azure.com/{org}/{project}/_workitems/edit/<id>`); the story is fetched and turned into a seed-spec.
- `"description"` — a prose description of the change; used directly as the seed-spec.
- `--dry-run` — stop after Gate 1 (plan only, no code).
- `--auto` — skip the *pauses* at the gates; `leader` runs the loop on its own. The git rules still hold.
- `--here` — stay in the current checkout instead of an isolated worktree. Use only when you are already on the intended feature branch.

## Prerequisites

- **`terylon-devops`** — a hard dependency, installed automatically. It provides the `ado` MCP server, the `ado-mcp` engine (**load it by name**), and `write-pr-description`.
- **`terylon-git`** — a direct hard dependency (also reachable through `terylon-devops`), so it is installed automatically. It provides `create-workspace` and the `code-review` engine — **load both by name**.
- **`superpowers`** — a hard dependency via `claude-plugins-official`. `leader` runs `subagent-driven-development` from it.
- Run from the repo root. All work happens on a feature branch.

## Shape of a run

```
develop (this skill — main thread, the only place that can ask the user)
├── Gate 0   intake .................. asks ✓
├── create-workspace                   isolated worktree (unless --here)
├── leader ─────────────────────────▶  owns the loop, returns at each gate
│   └── AWAITING_APPROVAL <plan path>
├── Gate 1   plan approval ........... asks ✓   (--dry-run stops here)
├── leader ─────────────────────────▶  re-dispatched with the approved plan
│   └── BUILD_COMPLETE <ledger>
└── Gate 3   PR / finish ............. asks ✓
```

The gates live here because `AskUserQuestion` works only on the main thread. `leader` ends its run at a gate and is re-dispatched afterwards; state survives in files, so nothing is lost across the hand-off.

## Workflow

### 1. Route

Classify the request first:

- **Trivial one-line edit** (an obvious, single-file, low-risk change) → skip planning, go straight to the build hop with a one-task plan. Gate 1 is skipped **only** on this route.
- **Anything non-trivial** → the full chain below.

### 2. Input resolution

- **ADO URL:** fetch the work item via the `fetch-work-item` recipe from the `ado-mcp` engine and write a seed-spec to `docs/superpowers/intake/<slug>-seed.md` — title, description, acceptance criteria, links.
- **Prose description:** write the prose to that same file as the seed.

Derive `<slug>` from the story topic and keep it consistent through the run.

### 3. Gate 0 — interactive intake

`AskUserQuestion`, **one question per message**. Ask **only what is genuinely open** — not what the story or the code already answers. Fold each answer back into the seed-spec.

Result: the **approved seed-spec**, the input contract for `leader`.

### 4. Workspace

By default, ensure an isolated worktree: invoke **`create-workspace "<slug>"`** (from `terylon-git`, loaded by name). It branches `feat/<slug>` off the detected integration branch into `.worktrees/<slug>`, and no-ops when you are already inside an isolated worktree.

`--here` skips this step. Do not hand-roll your own isolation.

### 5. Dispatch `leader`

Dispatch **`Agent(terylon-dev:leader)`** with **paths** — seed-spec, ledger, the `--auto` flag. Never send file contents in the prompt.

Handle the return:

| Return | What to do |
|---|---|
| `NEEDS_CLARIFICATION <questions>` | Put them to the user via `AskUserQuestion` (one at a time), write the answers into the seed-spec, re-dispatch `leader`. |
| `AWAITING_APPROVAL <path> <what>` | **Gate 1** — show the user the artifact's contents and wait for approval or edits. Once approved, re-dispatch `leader` with the approved artifact. |
| `BUILD_COMPLETE <ledger>` | Continue to step 6. |
| `BLOCKED <reason>` | Show the reason to the user and ask how to proceed. |

**Gate 1 is the highest-leverage gate** — spec and design failures are the largest and least recoverable class. Do not move past it without genuine approval. `--dry-run` **stops here**.

### 6. Gate 3 — finish

Invoke **`superpowers:finishing-a-development-branch`**. For an Azure DevOps PR:

1. Open the PR via the `create-pull-request` recipe from `ado-mcp` — pass full `refs/heads/<branch>` ref names.
2. Link the work item via the `link-work-item-to-pull-request` recipe — note that `projectId` and `repositoryId` must be GUIDs, not names.
3. Generate the PR body with **`write-pr-description`** (from `terylon-devops`).

**Require explicit consent before every commit, push, and PR** — consent for one operation is not consent for the next. **Never merge to the default branch yourself.** `--auto` may skip the *pause*, not these rules.

## Common mistakes

- **Writing your own build loop.** The loop belongs to `leader`, which runs `subagent-driven-development`. This skill only hosts the gates.
- **Pasting content into dispatches.** Seed-specs, plans, and diffs travel **by path**.
- **Trying to prompt from a subagent.** `AskUserQuestion` works only here. `leader` returns `NEEDS_CLARIFICATION` and you do the asking.
- **Hand-rolled isolation.** Use `create-workspace`, or `--here`.
- **Committing to the default branch.** Never.
- **Over-decomposing trivial work.** A genuine one-line change takes the trivial route.

## Verification

1. **Discovery:** `terylon-dev` appears in the marketplace; `/terylon-dev:develop` is in autocomplete; the agents `leader`, `planner`, `developer`, `debugger`, `refactorer`, and the four review lenses are dispatchable.
2. **Frontmatter:** this skill has `AskUserQuestion`; the lenses have no `Edit`/`Write`; fan-out agents list bare `Agent` in `tools`; no `permissionMode`, `hooks`, `mcpServers`, or `disable-model-invocation` anywhere.
3. **Dry-run to Gate 1** on a small story: intake asks → `leader` dispatches `planner` → `design.md` and `plan.md` appear with real file anchors and acceptance criteria as test cases → **stop**. No code.
4. **Reuse:** `leader` runs `subagent-driven-development` (no hand-rolled per-task loop) and `create-workspace` handles isolation.
5. **Gates:** no code before Gate 1; commit/push/PR only with explicit consent; never an automatic merge to the default branch.
