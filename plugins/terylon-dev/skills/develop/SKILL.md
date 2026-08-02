---
name: develop
description: >-
  Use when implementing one or more user stories end-to-end — give Azure DevOps work-item URLs, a prose
  description, or several prose items separated by --- on its own line. Several items fan out into
  concurrent leaders, one workspace each. Hosts the human gates and dispatches the leader agent, which
  owns the plan → build (TDD) → finish loop. Optional flags --auto, --dry-run, and --here.
allowed-tools: Bash(git *), Bash(node *), Read, Grep, Glob, Write, Agent, AskUserQuestion, mcp__plugin_terylon-devops_ado__*
---

# develop — entry point of the development pipeline

The main thread of the turn. It turns a user story into implemented, tested code by **hosting the human gates** and handing the loop itself to the `leader` agent.

It is a **skill and not an agent** for two reasons: it carries the slash command, and it is the only place `AskUserQuestion` works — subagents cannot prompt the user.

## Usage

```
/terylon-dev:develop <item> [<item> …] [--auto | --dry-run] [--here]
```

An `<item>` is either an **Azure DevOps work item URL** (`dev.azure.com/{org}/{project}/_workitems/edit/<id>`), which is fetched and turned into a seed-spec, or a **prose description**, which becomes the seed directly.

**Any number of items, of either kind, mixed freely.** URLs separate themselves; prose items are separated by **`---` on its own line**. Prose without a `---` is one item no matter how many bullets it contains — see step 2. Each item becomes its own workspace and its own `leader`, run concurrently; the ceiling and the rest of the mechanics are in *Fan-out*.

- `--dry-run` — stop after Gate 1 (plan only, no code).
- `--auto` — skip the *pauses* at the gates; `leader` runs the loop on its own. The git rules still hold.
- `--here` — stay in the current checkout instead of an isolated worktree. Use only when you are already on the intended feature branch.

## Prerequisites

- **`terylon-devops`** — a hard dependency, installed automatically. It provides the `ado` MCP server, the `ado-mcp` engine (**load it by name**), and `write-pr-description`.
- **`terylon-git`** — a direct hard dependency (also reachable through `terylon-devops`), so it is installed automatically. It provides `create-workspace` and the `code-review` engine — **load both by name**.
- **`terylon-core`** — a hard dependency, installed automatically. It provides `run-build-loop` (the controller mechanics `leader` runs), `write-plan` (the plan format `planner` emits), and `measure-token-spend`. It also ships the `SubagentStop` hook that records the run's spend continuously.
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

With several work items, the same shape runs once per item and the leaders run **concurrently**:

```
develop (main thread — every question passes through here)
├── Gate 0 ×N ....................... sequential; intake is interactive by nature
├── create-workspace ×N ............. one worktree and one branch each
│
├── leader(#116) ┐
├── leader(#117) ├─ dispatched together, run concurrently
├── leader(#118) ┘
│      │
│      ├── #116 → AWAITING_APPROVAL ──▶ ask now ──▶ re-dispatch #116
│      ├── #118 → NEEDS_CLARIFICATION ─▶ ask now ──▶ re-dispatch #118
│      └── #117 → still planning
│
└── Gate 3 ×N ....................... as each build completes
```

Returns are handled **as they arrive**, not at a barrier. Waiting for the slowest planner before approving the fastest plan wastes the parallelism the fan-out just bought.

## Workflow

### 1. Route

Classify the request first — three routes, and the classification decides which gates run:

| Route | When | Planner | Gate 1 |
|---|---|---|---|
| **Trivial** | an obvious, single-file, low-risk edit | skip | **skip** |
| **Documentation** | a change with **nothing to execute** — prose, config, or instructions across `SKILL.md` / agent / rule / `README` files; no runtime behaviour and no test surface | skip | **keep** |
| **Full chain** | anything with code to write and test | run | keep |

- **Trivial** → skip planning, go straight to the build hop with a one-task plan.
- **Documentation** → skip the **planner**: the seed-spec is the plan, because a planner drawing a design and a test-first plan for work with nothing to run buys a plan longer than the documents it edits. Make the edits directly, then hold **Gate 1 over the complete diff** (not a planner's plan) before anything is committed, and still run the phase-3 whole-branch review (`code-reviewer`) afterwards. Gate 1 stays because changing the instructions the pipeline itself obeys is exactly the kind of change that needs a human's eyes.
- **Full chain** → the full pipeline below.

**Say which route you took and why, in one line, before acting on it.** Two of the three routes change which gates run — the trivial route drops Gate 1, the documentation route drops the planner — so a misclassification silently removes a checkpoint or spends the pipeline's most expensive tier on work with nothing to test. The user finds out from what never arrives, not from anything the run said. Announcing it costs a line and makes the choice contestable.

**Several work items fan out.** Each gets its own seed-spec, its own worktree, and its own `leader`, and the leaders run concurrently — see *Fan-out* below. Never take the first item and drop the rest.

### 2. Input resolution

**First decide how many items the input contains**, then resolve each one.

#### Decomposition

The split is **explicit, never inferred**:

| Input | Items |
|---|---|
| Azure DevOps work item URLs | one per URL |
| Prose containing `---` on its own line | one per `---`-separated block |
| Prose without `---` | exactly **1**, however many bullets it contains |

```
/terylon-dev:develop add retry with backoff to the uploader
---
fix the timezone bug in the monthly report
---
extract the config loader out of Startup
```

**Bullets never split an item.** `implement the uploader with: retry, backoff, logging` is one story whose scope happens to be a list, and it stays one story. This is the whole reason for the separator: guessing at intent from list formatting gets it wrong in both directions, and each wrong guess costs N workspaces before anyone notices.

URLs and prose blocks may be mixed in one invocation.

**State the count before creating anything** — `Read 3 items: #116, #117, "extract the config loader".` A missing `---` silently merges two stories into one, and one echoed line catches it while it is still free to fix.

#### Per item

- **ADO URL:** fetch the work item via the `fetch-work-item` recipe from the `ado-mcp` engine and write a seed-spec to `docs/terylon/intake/<slug>-seed.md` — title, description, acceptance criteria, links.
- **Prose description:** write the prose to that same file as the seed.

Derive `<slug>` from the item's topic and keep it consistent through the run. **Slugs must be unique across the run** — two items whose topics slugify the same way would share a seed-spec, which silently merges two builds into one. Disambiguate with the work item id (`<slug>-116`) or an ordinal, and say that you did.

#### Artifact layout

Every run's working files live under `docs/terylon/` — the terylon-owned working tree, gitignored (local, not distributed). This is terylon's own directory:

```text
docs/terylon/
├── intake/      <slug>-seed.md        the approved seed-spec (this skill)
├── specs/       <slug>-grounding.md   the one-per-work-item grounding map (planner)
│                <slug>-design.md      the design (planner)
├── plans/       <slug>.md             the implementation plan (planner)
├── ledgers/     <slug>-ledger.md      leader loop state
└── monitoring/  <session>-tokens.md   per-run token spend (measure-token-spend, Gate 3)
```

### 3. Gate 0 — interactive intake

`AskUserQuestion`, **one question per message**. Ask **only what is genuinely open** — not what the story or the code already answers. Fold each answer back into the seed-spec.

Result: the **approved seed-spec**, the input contract for `leader`.

### 4. Workspace

By default, ensure an isolated worktree: invoke **`create-workspace "<slug>"`** (from `terylon-git`, loaded by name). It branches `feat/<slug>` off the detected integration branch into `.claude/worktrees/<slug>`, and no-ops when you are already inside an isolated worktree.

`--here` skips this step. Do not hand-roll your own isolation.

### 5. Dispatch `leader`

Dispatch **`Agent(terylon-dev:leader)`** with **paths** — seed-spec, ledger, and the `--auto` flag if set. Never send file contents in the prompt.

Handle the return:

| Return | What to do |
|---|---|
| `NEEDS_CLARIFICATION <questions>` | Put them to the user via `AskUserQuestion` (one at a time), write the answers into the seed-spec, re-dispatch `leader`. |
| `AWAITING_APPROVAL <path> <what>` | **Gate 1** — show the user the artifact's contents and wait for approval or edits. Once approved, re-dispatch `leader` with the approved artifact. This can arrive **mid-build**, not only after the first plan: a review finding that invalidates the design sends `leader` back to `planner`, and a materially changed plan returns here rather than proceeding on a plan the user never saw. Say which finding forced it. |
| `BUILD_COMPLETE <ledger>` | Continue to step 6. |
| `BLOCKED <reason>` | Show the reason to the user and ask how to proceed. |

**Gate 1 is the highest-leverage gate** — spec and design failures are the largest and least recoverable class. Do not move past it without genuine approval. `--dry-run` **stops here**.

#### A gate is cheap, and a long leader run is not

Re-dispatching `leader` starts a **new instance with fresh context** — that is what `Agent(…)` does, and it is a different mechanism from `SendMessage`, which resumes an existing agent and does retain its full history. This pipeline uses the first. Nothing is replayed.

Three consequences, and they invert the intuition:

| | |
|---|---|
| **Waiting at a gate costs nothing** | `leader` has **ended**. It is not blocked on a question — there are no turns while the user thinks. |
| **Resuming costs a constant** | a re-dispatched leader starts from an almost empty context and re-reads the ledger and the plan. That is the whole cost, and it does not grow with how much work came before. |
| **Length is the cost, not count** | every turn re-reads the **entire** cached prefix, and the prefix grows with each turn. A run's cache-read is therefore **quadratic in its turn count**: double the turns and it roughly quadruples; split one run into `k` shorter ones and it drops to about `1/k` of what it was. |

So **do not avoid gates to save tokens** — a gate resets the context and is the cheapest thing in this loop. `--auto` keeps one leader running through the whole build and pays quadratically for it.

**Batching answers is still right, for a smaller reason.** Each re-dispatch pays that constant again, so answering one question, re-dispatching, then answering the next pays it twice. When a return needs several answers — every question in a `NEEDS_CLARIFICATION`, every edit at a Gate — ask them one message at a time as the tools require, then **fold all the answers into the seed-spec and re-dispatch once.** A real saving, but a constant one against a quadratic: never trade a gate away to get it.

This is orthogonal to the fan-out rule below: across *different* work items you host each gate as it arrives and never barrier; within *one* leader's return you batch the answers it asked for before re-dispatching.

### 6. Gate 3 — finish

Invoke **`finish-branch`** (from `terylon-git`, loaded by name). For an Azure DevOps PR:

1. Open the PR via the `create-pull-request` recipe from `ado-mcp` — pass full `refs/heads/<branch>` ref names.
2. Link the work item via the `link-work-item-to-pull-request` recipe — note that `projectId` and `repositoryId` must be GUIDs, not names.
3. Generate the PR body with **`write-pr-description`** (from `terylon-devops`).

**Require explicit consent before every commit, push, and PR** — consent for one operation is not consent for the next. **Never merge to the default branch yourself.** `--auto` may skip the *pause*, not these rules.

#### Report the run's token spend

After the build completes, invoke **`measure-token-spend`** (from `terylon-core`, loaded by name) for the current session and write its report to `docs/terylon/monitoring/<session>-tokens.md`, surfacing the per-tier summary in one line. It reads the run's transcripts **off-context**, so the report costs almost nothing to produce. This is the monitoring that lets the next change be judged against a number rather than an impression — the point of aiming the pipeline's spend in the first place. It runs under `--auto` too; there is nothing to consent to, since it only reads.

#### Offering the deeper review

The branch has already been through `code-reviewer` in phase 3. Where the change warrants more than that, **say so and let the user decide** — a heavier multi-agent review is available in the harness as `/code-review ultra`, run against the current branch.

**You cannot launch it.** It is user-triggered and billed, it is not a tool available to a skill or an agent, and attempting to invoke it through `Bash` or any other route is wrong. Your part is to name the moment:

| Situation | Worth offering |
|---|---|
| Large diff, or one touching many modules | yes |
| Security-sensitive surface — auth, secrets, input handling, a guard | yes |
| Last change before a release | yes |
| Small, well-covered change already clean through phase 3 | no — say nothing |

Offer it once, in one line, and move on. It is an escalation of the review that already ran, not a replacement for it, so a clean phase 3 is not a reason to skip it on a risky diff nor a reason to suggest it on a trivial one.

## Fan-out — several work items

More than one work item runs the whole chain once per item, with the leaders concurrent. Nothing above changes; what follows is what only applies when N > 1.

### State is per item, all the way down

Every item carries its own `<slug>`, and every path derives from it — `docs/terylon/intake/<slug>-seed.md`, its ledger at `docs/terylon/ledgers/<slug>-ledger.md`, its worktree, its branch. Two runs must never share a seed-spec or a ledger; that is how an answer meant for one story ends up steering another.

### Sequential intakes, concurrent builds

Run **Gate 0 for every item first**, one at a time. Intake is interactive and cannot be parallelized, and it is also where you learn whether two of the items collide (see below) — worth knowing before any of them start building.

Then create the workspaces and dispatch **all leaders in one round**, so they run concurrently rather than one after another.

### Handle returns as they arrive

Do **not** wait for all leaders before responding to any of them. A leader that returns `AWAITING_APPROVAL` while two others are still planning gets its gate hosted immediately, is re-dispatched, and carries on. Barriering here would spend the parallelism on waiting.

Recall the mechanic: a leader that needs something **ends its run** — it is not sitting blocked on a question. State lives in files, so folding the answer into that item's seed-spec and re-dispatching resumes it where it stopped.

### Every question names its work item

**Prefix each question with the work item it belongs to** — `#116: …`, never a bare question. With several builds live, questions arrive interleaved from different stories, and an unlabelled one gets answered in the context of whichever story the user last thought about. That is not a risk at N > 1, it is the default outcome.

The same goes for every status line, plan, and finding you surface: say which item it came from.

### Constraints that only bite here

| Constraint | Why |
|---|---|
| **Worktrees are mandatory** — `--here` is incompatible with N > 1 | Concurrent builds in one checkout overwrite each other's files. Refuse the combination rather than running it. |
| **Ten items is the hard ceiling; above five, confirm** | Each leader dispatches a developer plus four review lenses, so five items already means roughly 25 concurrent agents and ten means fifty. Past the harness's concurrency limit they queue rather than run, so the extra items buy latency, not throughput. Above five, say so and ask whether to proceed or split into batches. Above ten, refuse and propose batches — do not start a run you cannot keep legible. |
| **Items touching the same files should run sequentially** | Concurrency does not prevent the conflict, it defers it to merge time. If Gate 0 reveals an overlap, say so and offer to serialize those two. |

`--dry-run` still stops at Gate 1 — for every item, so you get N plans and no code. `--auto` skips the *pauses* only; the git rules hold per item, and consent for one item's commit is not consent for another's.

## Common mistakes

- **Writing your own build loop.** The loop belongs to `leader`, which runs `run-build-loop`. This skill only hosts the gates.
- **Pasting content into dispatches.** Seed-specs, plans, and diffs travel **by path**.
- **Trying to prompt from a subagent.** `AskUserQuestion` works only here. `leader` returns `NEEDS_CLARIFICATION` and you do the asking.
- **Hand-rolled isolation.** Use `create-workspace`, or `--here`.
- **Committing to the default branch.** Never.
- **Over-decomposing trivial work.** A genuine one-line change takes the trivial route.
- **Running the full chain on documentation.** A change with nothing to execute takes the documentation route: no planner, Gate 1 falls on the diff. A planner's plan for doc work is longer than the docs it edits.
- **Avoiding a gate to save tokens.** A gate ends the leader and the next one starts fresh, which is the cheapest reset available. Length is what costs; a gate shortens it. Batching a single return's answers is still worth it, but for a saving an order of magnitude smaller.
- **Taking the first work item and dropping the rest.** Several items fan out; they are not a queue you may silently truncate.
- **Splitting a prose item on its bullets.** Only `---` splits. `implement the uploader with: retry, backoff, logging` is one story whose scope happens to be a list.
- **Merging items across a `---`.** The separator is the user's statement of intent, not a hint to weigh against how related the items look.
- **Creating workspaces before stating the count.** One echoed line — `Read 3 items: …` — catches a missing separator while it is still free to fix.
- **Colliding slugs.** Two items that slugify identically share a seed-spec, and the second silently overwrites the first.
- **Barriering the fan-out.** Waiting for every leader before hosting any gate turns concurrent planning back into sequential planning.
- **Unlabelled questions during a fan-out.** A question without its work-item number gets answered against the wrong story.
- **`--here` with several items.** Concurrent builds in one checkout corrupt each other. Refuse the combination.

## Verification

1. **Discovery:** `terylon-dev` appears in the marketplace; `/terylon-dev:develop` is in autocomplete; the agents `leader`, `planner`, `developer`, `debugger`, `refactorer`, and the four review lenses are dispatchable.
2. **Frontmatter:** this skill has `AskUserQuestion`; the lenses have no `Edit`/`Write`; fan-out agents list bare `Agent` in `tools`; no `permissionMode`, `hooks`, `mcpServers`, or `disable-model-invocation` anywhere.
3. **Dry-run to Gate 1** on a small story: intake asks → `leader` dispatches `planner` → `design.md` and `plan.md` appear with real file anchors and acceptance criteria as test cases → **stop**. No code.
4. **Reuse:** `leader` runs `run-build-loop` (no hand-rolled per-task loop), `planner` emits the plan in the `write-plan` format, `create-workspace` handles isolation and `finish-branch` handles the finish.
5. **Gates:** no code before Gate 1; commit/push/PR only with explicit consent; never an automatic merge to the default branch.
6. **Fan-out** with two work items and `--dry-run`: two seed-specs under distinct slugs, two worktrees on two branches, both leaders dispatched in **one** round, and **two** plans — neither item silently dropped. Every question and status line names its work item.
7. **Fan-out returns stream:** with one item's plan ready while the other is still planning, Gate 1 for the ready one is hosted immediately rather than after both finish.
8. **`--here` with two items is refused**, not run.
9. **Decomposition:** three prose blocks separated by `---` yield three items; one prose block containing a three-bullet list yields **one**; a mix of two URLs and one prose block yields three. The count is stated before any workspace is created. Eleven items are refused with a batching proposal; six draw a confirmation first.
10. **Documentation route:** a change touching only `SKILL.md` / agent / rule / `README` files takes the documentation route — no `planner`, no `design.md`/`plan.md`, Gate 1 falls on the diff, and the phase-3 `code-reviewer` still runs. The route is announced. A three-document change does not produce a plan longer than the documents.
11. **Batched resume:** a single leader return that raises several questions is answered in full and re-dispatched **once**, not re-dispatched after each answer.
12. **Token-spend report:** at Gate 3 the run invokes `measure-token-spend` (from `terylon-core`) and writes `docs/terylon/monitoring/<session>-tokens.md` with per-tier and per-agent totals, so a follow-up run can be judged against a number.
13. **Continuous spend events:** a run that fanned out leaves one JSON line per completed subagent in `docs/terylon/monitoring/<session>-spend.jsonl`, written by the `terylon-core` `SubagentStop` hook without any agent invoking it. A run interrupted before Gate 3 still has its events.
