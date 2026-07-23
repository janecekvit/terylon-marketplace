---
name: test
description: >-
  Use when verifying a pull request's test plan and/or the acceptance criteria of its linked work
  item — "verify the test plan on <PR>", "check what was actually tested". Hosts the human gate
  before anything is written back, dispatches the tester agent, and reports the run's token spend.
  Several PRs or checklists fan out into concurrent testers. Optional flags --auto and --dry-run.
allowed-tools: Read, Grep, Glob, Write, Bash(node *), Agent, AskUserQuestion
---

# test — entry point of the verification pipeline

The main thread of the turn. It turns a pull request (or a bare checklist) into a verified, honestly-ticked plan by **hosting the human gate** and handing the checking itself to the `tester` agent.

It is a **skill and not an agent** for two reasons: it carries the slash command, and it is the only place `AskUserQuestion` works — subagents cannot prompt the user. This is exactly why `develop` is a skill and `leader` an agent; `test` is to `tester` what `develop` is to `leader`.

## Usage

```
/terylon-test:test <item> [<item> …] [--auto | --dry-run]
```

An `<item>` is either an **Azure DevOps pull request URL** (`dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/<id>`), whose test plan — and the acceptance criteria of any work item it links — is verified and written back; or a **checklist** handed over directly (a path, or prose), which is verified and returned with nothing written.

**Any number of items, mixed freely.** URLs separate themselves; prose checklists are separated by **`---` on its own line**. Prose without a `---` is one checklist however many bullets it holds. Each item becomes its own `tester`, run concurrently — the ceiling and the rest of the mechanics are in *Fan-out*.

- `--dry-run` — verify and show the proposed writes, then stop. Nothing is written to the PR or the work item.
- `--auto` — skip the *pause* at the write-back gate; the tester writes back on its own. The tick gate and the downgrade rules in the transports still hold.

There is no `--here`: the tester reads the repository under test **read-only** and builds fixtures in a throwaway directory elsewhere, so it needs no worktree of that repository.

## Prerequisites

- **`terylon-devops`** — a hard dependency, installed automatically. It provides the `ado` MCP server and the two transports the tester drives: `update-pr-checklist` and `update-work-item-checklist`.
- **`terylon-metrics`** — a hard dependency, installed automatically. It provides `measure-token-spend`, which this skill invokes at the end. **Load it by name.**
- Run from the repository whose pull request you are verifying, so its own agents and stack are in scope.

## Shape of a run

```
test (this skill — main thread, the only place that can ask the user)
├── intake ............................. asks ✓  (which repo, where fixtures may go)
├── tester ──────────────────────────▶  phase 1: read plan + AC, triage, coverage, exercise
│   └── AWAITING_WRITE_APPROVAL <result>
├── write-back gate .................... asks ✓  (--dry-run stops here)
├── tester ──────────────────────────▶  phase 2: write back through the two transports
│   └── VERIFICATION_COMPLETE <report>
└── token-spend report ................. measure-token-spend (main thread)
```

The gate lives here because `AskUserQuestion` works only on the main thread. The tester ends its run at the gate and is re-dispatched afterwards; state survives in the result file, so nothing is lost across the hand-off — the same mechanic `develop` uses with `leader`.

With several items, the same shape runs once per item and the testers run **concurrently**:

```
test (main thread — every question named by its PR)
├── intake ×N .......................... sequential; interactive by nature
│
├── tester(PR-54) ┐
├── tester(PR-57) ├─ dispatched together, run concurrently
├── tester(PR-58) ┘
│      │
│      ├── PR-54 → AWAITING_WRITE_APPROVAL ─▶ gate now ─▶ re-dispatch write
│      └── PR-57 → still exercising
│
└── token-spend report ................. once, for the whole session
```

Returns are handled **as they arrive**, not at a barrier. Waiting for the slowest tester before approving the fastest write-back wastes the parallelism the fan-out just bought.

## Workflow

### 1. Input resolution

**First decide how many items the input contains**, then resolve each. The split is **explicit, never inferred**:

| Input | Items |
|---|---|
| Pull request URLs | one per URL |
| Prose/paths containing `---` on its own line | one per `---`-separated block |
| Prose without `---` | exactly **1**, however many bullets it holds |

**State the count before dispatching anything** — `Read 2 items: PR-54, "the checklist in notes.md".` A missing `---` silently merges two checklists into one, and one echoed line catches it while it is still free to fix.

### 2. Intake — the only interactive gate before work

`AskUserQuestion`, **one question per message**. Ask **only what is genuinely open**:

- the **repository under test** — default the current checkout;
- the **fixtures directory** — default a throwaway temp directory; never the repository under test.

For a PR item, most of this is already known. Do not ask what the PR or the repository already answers.

### 3. Dispatch the tester

Dispatch **`Agent(terylon-test:tester)`** with **paths and identifiers** — the PR URL or checklist path, the repository under test, the fixtures directory, a result path for the evidence, and the `--auto` / `--dry-run` flags. Never paste checklist contents into the prompt.

**Dispatch it to verify only — it must not write yet.** The tester does its reading, triage, coverage and exercise, writes the proposed outcome to the result path, and returns. Handle the return:

| Return | What to do |
|---|---|
| `NEEDS_CLARIFICATION <questions>` | Put them to the user via `AskUserQuestion` (one at a time), fold the answers into the brief, re-dispatch the tester. |
| `AWAITING_WRITE_APPROVAL <result-path>` | **Write-back gate** — read the result and show the user what would be written: the PR test plan regrouped, the acceptance-criteria ticks and downgrades, the coverage map between the two, and the evidence. Wait for consent. On consent, re-dispatch the tester to **write** from that result path. `--dry-run` **stops here**. |
| `VERIFICATION_COMPLETE <report>` | The write-back is done (or there was nothing to write — a checklist with no URL). Continue to step 4. |
| `BLOCKED <reason>` | Show the reason and ask how to proceed. |

**The write-back gate is the load-bearing one.** Ticking a box in Azure DevOps is an outward-facing, hard-to-reverse act — a pre-checked box renders as a static tick the next reader cannot toggle. Do not move past this gate without genuine consent. `--auto` may skip the *pause*, not the transports' tick gate or their downgrade reporting.

#### Batch answers before re-dispatching

A tester resume replays a growing transcript, so the cost is per resume, not per answer. When a return needs several answers, ask them one message at a time as the tools require, but fold them all into the brief and re-dispatch the tester **once**.

### 4. Report the run's token spend

After every item's verification is complete, invoke **`measure-token-spend`** (from `terylon-metrics`, loaded by name) for the current session and write its report to `docs/terylon/monitoring/<session>-tokens.md`, surfacing the per-tier summary in one line. It reads the run's transcripts **off-context**, so the report costs almost nothing to produce, and it attributes each tester's per-claim fan-out to the subagent tier. This is the same call and skill `develop` makes at its Gate 3; reusing it keeps one measurement method rather than two counters that drift. It runs under `--auto` too — there is nothing to consent to, since it only reads, and it writes to the operator's own session project, never a tracked file in the repository under test.

## Fan-out — several items

More than one item runs the whole chain once per item, with the testers concurrent. What follows is what only applies when N > 1.

### State is per item

Every item carries its own result path and its own report; two runs must never share one, or an outcome meant for one PR ends up written to another.

### Sequential intakes, concurrent verification

Run **intake for every item first**, one at a time — it is interactive and cannot be parallelized. Then dispatch **all testers in one round** so they verify concurrently.

### Handle returns as they arrive

Do **not** wait for all testers before hosting any gate. A tester that returns `AWAITING_WRITE_APPROVAL` while others are still exercising gets its write-back gate hosted immediately and is re-dispatched. Barriering here would spend the parallelism on waiting.

### Every question names its PR

**Prefix each question with the item it belongs to** — `PR-54: …`, never a bare question. With several verifications live, questions arrive interleaved, and an unlabelled one gets answered against whichever PR the user last thought about. The same goes for every status line and finding you surface.

### The ceiling

Each tester fans out one subagent per independent claim, so a handful of PRs is already dozens of concurrent agents. **Above five items, say so and ask** whether to proceed or split into batches; **above ten, refuse** and propose batches — past the harness's concurrency limit they queue rather than run, so the extra items buy latency, not throughput.

## Common mistakes

- **Writing the checking loop yourself.** The verification belongs to `tester`, which drives `verify-test-plan`. This skill only hosts the gate and measures.
- **Letting the tester write before the gate.** Dispatch it to verify and return first; write only after consent (or `--auto`).
- **Holding ADO tools here.** This skill has none — all forge access is the tester's, through its two transports. The gate is about *consent*, not about this skill touching Azure DevOps.
- **Pasting checklist contents into the dispatch.** Items travel by path or URL.
- **Trying to prompt from the tester.** `AskUserQuestion` works only here. The tester returns `NEEDS_CLARIFICATION` and you do the asking.
- **Barriering the fan-out.** Host each write-back gate as it arrives.
- **Unlabelled questions during a fan-out.** A question without its PR number gets answered against the wrong one.
- **Splitting a prose checklist on its bullets.** Only `---` splits.

## Verification

1. **Discovery:** `/terylon-test:test` is in autocomplete; the `tester` agent is dispatchable.
2. **Frontmatter:** this skill has `AskUserQuestion` and `Agent`; it holds **no** `mcp__ado__*` and no `Edit`; no `permissionMode`, `hooks`, `mcpServers` or `disable-model-invocation`.
3. **Gate held:** on a PR the tester returns `AWAITING_WRITE_APPROVAL`, the proposed writes are shown, and nothing reaches the PR or work item until the user consents. `--dry-run` stops there; `--auto` writes without the pause.
4. **Two-phase dispatch:** the tester is dispatched to verify (no write), then re-dispatched to write only after consent — never one dispatch that both checks and writes.
5. **Token spend:** after verification the run invokes `measure-token-spend` and writes `docs/terylon/monitoring/<session>-tokens.md` with per-tier and per-agent totals, surfacing the per-tier line; a fanned-out run attributes the tester subagents to the subagent tier.
6. **Fan-out** with two PRs: two result paths, both testers dispatched in one round, each write-back gate hosted as it arrives, every question named by its PR. Eleven items are refused with a batching proposal; six draw a confirmation first.
7. **Checklist, no URL:** verified and returned, nothing written.
