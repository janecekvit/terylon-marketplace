---
name: develop
description: >-
  Use when implementing one or more user stories end-to-end — give work-item or issue URLs from either forge, a prose
  description, or several prose items separated by --- on its own line. Several items fan out into
  concurrent leaders, one workspace each. Hosts the human gates and dispatches the leader agent, which
  owns the plan → build (TDD) → finish loop. Optional flags --auto, --dry-run, and --here.
allowed-tools: Bash(git *) Bash(node *) Bash(gh *) Read Grep Glob Write Agent AskUserQuestion mcp__ado__*
---

# develop — entry point of the development pipeline

The main thread of the turn. It turns a user story into implemented, tested code by **hosting the human gates** and handing the loop itself to the `leader` agent.

It is a **skill and not an agent** for two reasons: it carries the slash command, and it is the only place `AskUserQuestion` works — subagents cannot prompt the user.

## Usage

```
/terylon-dev:develop <item> [<item> …] [--auto | --dry-run] [--here] [--no-brainstorm]
```

An `<item>` is an **item URL from either forge** — an Azure DevOps work item (`dev.azure.com/{org}/{project}/_workitems/edit/<id>`) or a GitHub issue (`github.com/{owner}/{repo}/issues/<n>`) — which is fetched and turned into a seed-spec; a **path to a seed-spec** that `brainstorm` already wrote, which is read as-is; or a **prose description**, which becomes the seed directly.

**Any number of items, of either kind, mixed freely.** URLs separate themselves; prose items are separated by **`---` on its own line**. Prose without a `---` is one item no matter how many bullets it contains — see step 1. Each item becomes its own workspace and its own `leader`, run concurrently; the ceiling and the rest of the mechanics are in *Fan-out*.

- `--dry-run` — stop after Gate 1 (plan only, no code).
- `--auto` — skip the *pauses* at the gates; `leader` runs the loop on its own. The git rules still hold. It does **not** skip `CONTINUE`: that status pauses for nobody, and suppressing it is what made an unattended build carry one leader's context from the first task to the last.
- `--here` — stay in the current checkout instead of an isolated worktree. Use only when you are already on the intended feature branch.
- `--no-brainstorm` — skip the Gate 0 triage and run the ordinary intake, however vague the item looks.

## Prerequisites

- **`terylon-forge`** — a hard dependency, installed automatically. It provides `resolve-forge` and `create-pr`, which opens the pull request at Gate 3 and calls `write-pr-description` itself.
- **An adapter** — `terylon-ado` or `terylon-github`, enabled by the consumer rather than declared here. It supplies the `forge-ops` engine (**load it by name**, plugin-qualified once `resolve-forge` has answered) and, on Azure DevOps, the `ado` MCP server. With none enabled, say so and stop.
- **`terylon-git`** — a direct hard dependency (also reachable through `terylon-forge`), so it is installed automatically. It provides `create-workspace` and the `code-review` engine — **load both by name**.
- **`terylon-core`** — a hard dependency, installed automatically. It provides `measure-token-spend`, and `delegate-to-repo-agents` for the personas that dispatch a repo-local specialist. It also ships the `SubagentStop` hook that records the run's spend continuously. `run-build-loop`, `write-plan` and `brainstorm` are **this plugin's own** — `leader` and `planner` load the first two from here, and Gate 0 loads the third.
- Run from the repo root. All work happens on a feature branch.

## Shape of a run

```
develop (this skill — main thread, the only place that can ask the user)
├── Gate 0   intake ── or ──▶ brainstorm .. asks ✓   (triage picks the mode)
├── route    per item, once Gate 0 has settled what the item is
├── create-workspace                   isolated worktree (unless --here)
├── leader ─────────────────────────▶  owns the loop, returns at every boundary
│   └── AWAITING_APPROVAL <plan path>
├── Gate 1   plan approval ........... asks ✓   (--dry-run stops here)
├── leader ─────────────────────────▶  re-dispatched with the approved plan
│   ├── CONTINUE <ledger> task-N ──┐   asks nothing
│   └───────────────◀──────────────┘   re-dispatched at once, fresh context
│   └── BUILD_COMPLETE <ledger>
└── Gate 3   PR / finish ............. asks ✓
```

The gates live here because `AskUserQuestion` works only on the main thread. `leader` ends its run at a gate and is re-dispatched afterwards; state survives in files, so nothing is lost across the hand-off.

**The `CONTINUE` edge is the same hand-off with nobody in it.** It loops straight back into a new `leader` without reaching a gate, which is what keeps a build from being one instance however long it runs. Most of a build's returns are this edge.

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

### 1. Input resolution

**First decide how many items the input contains**, then resolve each one.

#### Decomposition

The split is **explicit, never inferred**:

| Input | Items |
|---|---|
| Item URLs — Azure DevOps work items or GitHub issues | one per URL |
| A path to an existing seed-spec under `docs/terylon/intake/` | one per path — read it as the seed, never rewrite it |
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

- **Item URL:** **resolve the forge first** — invoke `resolve-forge` with the URL and report its answer in one line; if its adapter is not enabled, stop for this item and name the plugin to enable, never falling back to the other adapter. Then fetch the item via the `fetch-work-item` recipe from that adapter's `forge-ops`, plugin-qualified, and write a seed-spec to `docs/terylon/intake/<slug>-seed.md` — title, description, acceptance criteria, links.
- **Prose description:** write the prose to that same file as the seed.

Derive `<slug>` from the item's topic and keep it consistent through the run. **Slugs must be unique across the run** — two items whose topics slugify the same way would share a seed-spec, which silently merges two builds into one. Disambiguate with the work item id (`<slug>-116`) or an ordinal, and say that you did.

#### Artifact layout

Every run's working files live under `docs/terylon/` — the terylon-owned working tree, gitignored (local, not distributed). This is terylon's own directory:

```text
docs/terylon/
├── intake/      <slug>-seed.md        the approved seed-spec (this skill, or brainstorm)
├── specs/       <idea-slug>-brainstorm.md  the design and its decisions — one per brainstorm, covering every item it produced
│                <slug>-grounding.md   the one-per-work-item grounding map (planner)
│                <slug>-design.md      the design (planner)
├── plans/       <slug>.md             the implementation plan (planner)
├── ledgers/     <slug>-ledger.md      leader loop state
└── monitoring/  <session>-tokens.md   per-run token spend (measure-token-spend, Gate 3)
```

### 2. Gate 0 — intake, or brainstorm

Gate 0 has **two modes**, and both end at the same place: the **approved seed-spec**, the input contract for `leader`. Triage each item, then run the mode it earns.

| The item | Mode |
|---|---|
| states an outcome, and how you would know it is met | intake |
| is a work item carrying acceptance criteria | intake |
| is one sentence of intent with no stated outcome | **brainstorm** |
| could reasonably be one deliverable or several | **brainstorm** |
| is a work item whose description is empty or restates its title | **brainstorm** |

**Say which mode you took, in one line.** Both directions cost: an unnecessary brainstorm spends a dialogue on work that was already decided, and a skipped one sends `planner` at something nobody has defined. Announcing it lets the user overrule a misread before it spends anything.

**Intake.** `AskUserQuestion`, **one question per message**. Ask **only what is genuinely open** — not what the story or the code already answers. Fold each answer back into the seed-spec. A seed-spec carrying a `brainstormed:` marker was already interrogated; ask only what it left open.

**Brainstorm.** Load **`brainstorm`** (this plugin's own, by name). It grounds the idea, runs the dialogue, writes a design document, and returns **one or more** approved seed-specs. Then:

| | |
|---|---|
| **Restate the count** | one item can become several, which invalidates the count stated in step 1. Say the new one before creating any workspace |
| **Route each resulting item separately** | items from one design can take different routes — see step 3 |
| **`--auto` does not load it** | it is a dialogue and has no unattended form. Say that it was skipped and proceed on the seed as given, rather than inventing the answers |
| **`--no-brainstorm` skips the triage** | run the intake regardless of how vague the item looks |

### 3. Route

Classify **each item, once Gate 0 has settled what it is** — three routes, and the classification decides which gates run:

| Route | When | Planner | Gate 1 |
|---|---|---|---|
| **Trivial** | an obvious, single-file, low-risk edit | skip | **skip** |
| **Documentation** | a change with **nothing to execute** — prose, config, or instructions across `SKILL.md` / agent / rule / `README` files; no runtime behaviour and no test surface | skip | **keep** |
| **Full chain** | anything with code to write and test | run | keep |

- **Trivial** → skip planning, go straight to the build hop with a one-task plan.
- **Documentation** → skip the **planner**: the seed-spec is the plan, because a planner drawing a design and a test-first plan for work with nothing to run buys a plan longer than the documents it edits. Make the edits directly, then hold **Gate 1 over the complete diff** (not a planner's plan) before anything is committed, and still run the phase-3 whole-branch review (`code-reviewer`) afterwards. Gate 1 stays because changing the instructions the pipeline itself obeys is exactly the kind of change that needs a human's eyes.
- **Full chain** → the full pipeline below.

**The route is per item, not per invocation.** One brainstorm can produce a documentation item and two full-chain items from the same design; routing them together sends the wrong gates to two of the three.

**Say which route you took and why, in one line, before acting on it.** Two of the three routes change which gates run — the trivial route drops Gate 1, the documentation route drops the planner — so a misclassification silently removes a checkpoint or spends the pipeline's most expensive tier on work with nothing to test. The user finds out from what never arrives, not from anything the run said. Announcing it costs a line and makes the choice contestable.

**Several work items fan out.** Each gets its own seed-spec, its own worktree, and its own `leader`, and the leaders run concurrently — see *Fan-out* below. Never take the first item and drop the rest.

### 4. Workspace

By default, ensure an isolated worktree: invoke **`create-workspace "<slug>"`** (from `terylon-git`, loaded by name). It branches `feat/<slug>` off the detected integration branch into `.claude/worktrees/<slug>`, and no-ops when you are already inside an isolated worktree.

`--here` skips this step. Do not hand-roll your own isolation.

### 5. Dispatch `leader`

Dispatch **`Agent(terylon-dev:leader)`** with **paths** — seed-spec, ledger, and the `--auto` flag if set. Never send file contents in the prompt.

Handle the return:

| Return | What to do |
|---|---|
| `CONTINUE <ledger> <boundary>` | **Re-dispatch `leader` immediately. Ask the user nothing.** It has taken a boundary its ledger already covers, so there is no decision here and no artifact to show. Name the new dispatch `leader-<slug>-<boundary>` so the run's spend record attributes to a phase. |
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

So **do not avoid gates to save tokens** — a gate resets the context and is the cheapest thing in this loop.

**`CONTINUE` is that reset without a human in it.** A gate does two things at once: it pauses for a person, and it ends the instance. A mode that removed both would let one leader run a whole build and pay quadratically for it. The status separates them — the pause is for the user, the ending is for the cost — so **`--auto` suppresses the pause and never the `CONTINUE`.** It is the mode where the status matters most, because it is the one with no gates left.

The tier that pays most is whichever one has no boundary to end at. The controller has one — a gate ends it and it is re-dispatched. **The implementer does not**, which is why it carries a turn budget instead. Where a real figure is wanted, run `measure-token-spend` against an actual session rather than reasoning from a remembered one.

**Batching answers is still right, for a smaller reason.** Each re-dispatch pays that constant again, so answering one question, re-dispatching, then answering the next pays it twice. When a return needs several answers — every question in a `NEEDS_CLARIFICATION`, every edit at a Gate — ask them one message at a time as the tools require, then **fold all the answers into the seed-spec and re-dispatch once.** A real saving, but a constant one against a quadratic: never trade a gate away to get it.

This is orthogonal to the fan-out rule below: across *different* work items you host each gate as it arrives and never barrier; within *one* leader's return you batch the answers it asked for before re-dispatching.

### 6. Gate 3 — finish

Invoke **`finish-branch`** (from `terylon-git`, loaded by name). For a pull request, invoke **`create-pr`** (from `terylon-forge`, loaded by name) and pass it the work item this build implemented.

`create-pr` owns the whole sequence — opening the PR, associating the work items, and filling the description through `write-pr-description` — plus reviewers and auto-complete, which this skill has no reason to reimplement. **Do not issue the `create-pull-request` or `link-work-item-to-pull-request` recipes here.** Duplicating them puts the ref-name and GUID rules in two places, and the copy is the one that goes stale.

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

More than one work item runs the whole chain once per item, with the leaders concurrent. **Before the first Gate 0 of a run with N > 1, read [`references/fan-out.md`](references/fan-out.md)**: per-item state, sequential intakes with concurrent builds, returns handled as they arrive, every question prefixed with its work item, mandatory worktrees, and the ceiling of ten items. Nothing above changes for N > 1; that file says what only applies then.

## Common mistakes

The mistakes this skill has been seen to make, each with its correction, are in [`references/common-mistakes.md`](references/common-mistakes.md). Read it before hosting the first gate of a run.

## Verification

The manual checks a maintainer runs after changing this skill are in [`references/verification.md`](references/verification.md). They are not needed to run it.
