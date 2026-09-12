---
name: run-build-loop
description: Use when executing an approved implementation plan task by task with a fresh implementer subagent per task. Defines the ledger that survives compaction, the pre-flight scan of the plan, the bounded fix-round loop after a review, and how to pick a model per role. For the controller of the loop, not for the implementer.
allowed-tools: Read, Grep, Glob, Write, Bash(git *)
---

# run-build-loop

The controller's mechanics for executing a plan: **fresh implementer per task, review after each task, bounded fix rounds, ledger throughout.**

This is the half of the loop that is not obvious from the loop's shape. Which personas get dispatched and in what order is the controller's own definition; what follows is the state-keeping, the escalation and the model economics that make the loop survive a long run.

## The ledger is a recovery map, not a diary

**Conversation memory does not survive compaction.** A controller that lost its place has re-dispatched an entire completed task sequence — the most expensive failure this loop has available, because every re-dispatch is a full implementer at full context.

So the ledger is written for a reader who has forgotten everything:

| Rule | Why |
|---|---|
| First line names the plan it belongs to | a ledger for another plan must be recognisable as such and left alone |
| One `Task <N>: complete` line per finished task, with its commit hashes | the resume point is a grep, not a judgment |
| A task mid-fix-loop records the round it is on | resuming re-enters the loop rather than restarting the task |
| Every ruling that was made — a finding judged invalid, a conflict adjudicated | nobody watched it happen, and the reasoning is not recoverable from the diff |

**After a compaction, trust the ledger and `git log` over your own recollection.** The commits the ledger names exist in git whether or not you remember making them. A task with a `complete` line is done; resume at the first task without one.

## Pre-flight — scan the plan once before dispatching anything

Before Task 1, read the plan through looking for two things:

- tasks that contradict each other, or contradict the plan's global constraints
- anything the plan **mandates** that a reviewer will treat as a defect — a test that asserts nothing, a block duplicated verbatim

Raise everything found as **one batched question**, each finding placed beside the plan text that mandates it, asking which governs. One question before execution, never one interrupt per discovery mid-run. A clean scan proceeds without comment.

The per-task review loop remains the net for conflicts that only appear once code exists. This scan catches the ones that were visible on paper, when they are still free.

## The task loop

```
per task
├── dispatch a fresh implementer with a brief (goal, files, criteria as test cases, grounding-map path)
├── implementer implements test-first, runs the covering tests, commits, self-reviews
├── review the task
│   ├── clean ──────────────▶ record completion in the ledger, next task
│   └── findings ──▶ fix round (below)
└── record completion
```

**A fresh subagent per task, never a resumed one.** The implementer must not inherit the controller's history: its brief is constructed, not accumulated. That is what keeps a task's context proportional to the task rather than to the run.

## Fix rounds are bounded and escalate

A review that returns findings starts a fix round. **Five rounds, and the escalation is part of the design:**

| Round | Who fixes |
|---|---|
| 1-3 | resume the same implementer |
| 4-5 | a **fresh** implementer, on a model at least one tier above the one that got stuck |

Each round is followed by a **scoped re-review** of the fix diff only — not a re-review of the whole task.

**When round 5 still leaves findings open, adjudicate each one.** A finding that is load-bearing stops the run: report blocked, with the ledger path and the surviving findings. Findings that are not load-bearing are parked in the ledger **with the ruling and its reasoning**, and the task completes.

Repeating a round that is not converging is the failure this bound exists to prevent: most often a fix in one round introduces what the next flags, and the two oscillate indefinitely.

## Model selection

Use the least capable model that can do the role. The saving is real and it compounds across a build of N tasks.

| Role | Tier |
|---|---|
| Implementer, plan text contains the code to write | cheapest — this is transcription plus testing |
| Implementer, 1-2 files with a complete spec | cheap |
| Implementer, multi-file with integration concerns | standard |
| Implementer, design judgment or broad codebase understanding | most capable |
| Reviewer | scaled to the diff's size, complexity and risk |
| Scoped re-review of a small fix diff | cheap to mid |
| Whole-branch review at the end | most capable |
| Fix rounds 4-5 | one tier above whatever got stuck |

Two rules that decide the rest:

**Always name the model explicitly in a dispatch.** An omitted model inherits the session's, which is usually the most capable and most expensive one, and silently defeats every row above.

**Turn count beats token price.** Cost and wall-clock scale with how many turns a subagent takes, and the cheapest models routinely take two to three times the turns on multi-step work — costing more in total. Keep a mid tier as the floor for reviewers and for any implementer working from prose rather than from code in the plan.

## A long run is itself the cost, whichever agent is having it

Every turn re-reads the **entire** cached prefix, and the prefix grows with each turn, so **any** agent's cache-read is **quadratic in its turn count**. Double a run's length and it roughly quadruples; split one run into `k` shorter ones and it drops to about `1/k`.

**This applies to every tier, and the controller is not the one it bites hardest.** It is stated here first because the controller is what this skill is about — and because the controller already has the fix: it ends at a boundary and is re-dispatched. **The implementer has no such boundary**, which is why it carries a turn budget instead, and why it is the tier to watch.

A controller that ends and is re-dispatched starts a **new instance with fresh context**, not where the previous one stopped. Resuming costs re-reading the ledger and nothing else — a constant, and one that does not grow with how much work came before. (This is `Agent(…)`; `SendMessage` is the other mechanism and does retain full history — do not confuse them.)

**So ending the run is an optimisation, not a loss.** Wherever the loop has a natural boundary — a phase completing, a task finishing, a review round closing, a question that must go to a human — take it, record the state in the ledger, and let the next controller start clean. The ledger exists for exactly this, and a controller that never ends is the one paying the most for its own history.

**The controller has a status for taking a boundary that needs nobody:** `CONTINUE <ledger-path> <boundary>`. It asks nothing, so it is not suppressed by `--auto` — and `--auto` is where it earns the most, because it is the mode in which every gate has been removed and no other boundary is left. The boundaries and the statuses beside it are in `leader`.

**The shape, and it follows from the mechanism rather than from any run:**

```text
  why splitting a run is not a wash

  one agent, N turns        turn 1 re-reads nothing
                            turn 2 re-reads turn 1
                            turn 3 re-reads turns 1-2          cost ∝ N²
                            ...
                            turn N re-reads turns 1..N-1

  k agents, N/k turns each  each pays (N/k)², and there are k of them
                            total ∝ k · N²/k² = N²/k       cost drops to ~1/k

  SO THE SAVING IS THE SPLIT ITSELF, not the tier and not the model. Doubling
  an agent's length roughly quadruples what it costs; halving it roughly
  quarters it. What an agent WRITES is a rounding error against what it
  RE-READS on every turn.
```

**Measure rather than reason from an example.** `measure-token-spend` reports a run's actual per-tier split; where a figure is needed, take it from there. No worked number is kept in this file, deliberately — the one that used to be here outlived the run it came from and aimed the loop at the wrong tier for as long as it survived.

## Dispatch hygiene

**Everything pasted into a dispatch prompt, and everything a subagent prints back, stays resident in the controller's context for the rest of the run** and is re-read on every later turn. Hand artifacts over as **paths**: plans, grounding maps, diffs, test output, reports.

A subagent's return is a status and a path. Its detail belongs in the report file it was given.

## Execute continuously

Do not pause between tasks to ask whether to continue. The plan was approved; executing it is the instruction. Stop only for a genuine block, an ambiguity that prevents progress, or the end of the plan.

Progress summaries between tasks are the same interruption wearing a helpful face — the ledger already carries the record.
