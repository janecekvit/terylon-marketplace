---
name: background-run
description: >-
  Use when the operator asks for work to leave this session and run on its own — "run this in the
  background", "dispatch this as a background agent", "kick this off overnight", "start it while I'm
  away", "run it unattended". Dispatches it with claude --bg into a worktree whose name is chosen
  rather than generated, writes the commit-after-every-step discipline into the dispatched prompt so
  an interruption costs one step instead of the whole run, and reports the session id, the worktree
  and the branch. Not for work this session should do itself, however long that work is, and not for
  a task with no step boundary to commit on. Optional flags --auto and --dry-run.
allowed-tools: Bash(claude *), Bash(git *), Read, Grep, Glob, AskUserQuestion
---

# background-run

Hands a long piece of work to a background agent **with the discipline that decides whether an interruption costs one step or all of it**, and reports where the work landed.

The discipline is the point. The dispatch is three flags.

## Why this is a skill and not an instruction to remember

On 2026-08-25 four background agents ran unattended in this environment. What separated the one that lost nothing from the one that lost everything was not the model, the length or the machine — it was whether the agent committed as it went.

| Run | Instructed to commit each item | Interrupted | Kept |
|---|---|---|---|
| `worktree-db-internals-primer` | yes | no | **30 commits**, one per chapter |
| `worktree-distributed-systems-docs` | yes | no | **12 commits**, one per document |
| `worktree-compiler-construction-primer` | yes | **yes**, 35 s in | **nothing** — zero commits, and the worktree still holds only the seed files |

The third run's job record still reads `"state": "failed"`, `"detail": "process gone while supervisor was down"`. It has read that way ever since. **Nothing re-ran it, and nothing was going to** — which is correct, because a run that has already spent budget and written output must not be replayed blind, and it is exactly why the only protection available is an instruction given *before* the run starts. That instruction is what this skill supplies without the operator having to remember it.

## What it does

```
/background-run  ·  or the operator asking for the work to be backgrounded
    │
    ├── settle three things ...... which repository · what one step is · what "done" looks like
    │      └── no step boundary ──▶ say so and stop; a commit cannot protect one indivisible artifact
    │
    ├── compose the prompt ....... the operator's task, under the commit block this skill supplies
    │
    ├── confirm .................. the default; --auto skips it, --dry-run stops here and dispatches nothing
    │
    ├── claude --bg --worktree <slug>
    │      └── the worktree name is CHOSEN, so the branch is known before the run starts
    │
    └── report ................... session id · worktree · branch · and what will not happen
```

## Before dispatching, settle three things

| Settle | Why it cannot be skipped |
|---|---|
| **Which repository** | the worktree is created under it, and a run with nowhere to commit is a run with nothing to protect |
| **What one step is** | it is the unit an interruption costs, and it goes into the prompt verbatim — "one document", "one migration", "one test and its implementation" |
| **What "done" looks like** | nothing will ask a clarifying question at 3 a.m.; an ambiguity dispatched is an ambiguity guessed |

Ask for whichever of the three the operator did not give. Asking once before the dispatch is cheap; every question after it is unanswerable.

## Refuse these, and say why

- **Work with no step boundary.** One indivisible artifact — a single document rewritten end to end, one function refactored in place — cannot be protected by committing, because there is no partial state worth keeping. Offer to split it, or say plainly that an interruption costs the whole run and let the operator decide.
- **Work with no repository.** `claude --bg` will run it; nothing will keep it. Say so.
- **Work the operator is waiting for.** Dispatching is slower than doing it here, not faster: the operator gains nothing and loses the ability to correct it mid-flight.

## The prompt this skill writes

The operator's task goes **underneath** this block, never instead of it. Substitute `<STEP>` with the step boundary settled above and change nothing else — the wording is what survives in the run's own record.

```text
Commit after every completed step, as its own commit, before you begin the next one.
A step here is: <STEP>.

Do not batch several steps into one commit, and do not leave committing until the end.
Write each commit message so it names the step rather than the files.

If the machine this runs on goes away, nothing restarts this run: there is no retry and
no replay. An uncommitted step is a lost step and a committed step is a kept one, and
that is the only difference such an interruption will find.
```

**The block goes in the prompt rather than into an injected hook on purpose.** The prompt is kept verbatim as `intent` in the run's job record, so what was asked stays readable long after the run; a hook leaves commits and no record that any discipline was in force. The full argument, and the case for switching to a hook if a run ever ignores this, is in `references/invocation-decision.md`.

## The dispatch

Run it **from inside the repository**, and always pass `--worktree` with a name you chose:

```bash
claude --bg \
    --worktree "<slug>" \
    --name "<short label>" \
    --model "<model>" \
    --permission-mode auto \
    "<the block above, then the operator's task>"
```

| Flag | Why |
|---|---|
| `--worktree <slug>` | **without a name, one is generated** and the operator cannot find the branch from anything they typed. With one, the worktree is `<repo>/.claude/worktrees/<slug>` and the branch is `worktree-<slug>`, both known before the run starts |
| `--name "<label>"` | what `claude agents` shows. Without it a label is auto-derived, and it does not match the worktree name |
| `--model` | name it explicitly. An omitted model inherits this session's, which is usually the most expensive one |
| `--permission-mode auto` | nobody is there to answer a prompt. A run that stops on a permission question has stopped for the night |

**`claude --bg` prints the short id and the label, and neither the worktree nor the branch.** That is why the report below is part of the skill rather than a courtesy.

## The report

Report all of it, in this shape, every time:

```text
Dispatched.

  session      <short-id>          attach: claude attach <short-id>
  worktree     <repo>/.claude/worktrees/<slug>
  branch       worktree-<slug>
  repository   <repo>
  record       ~/.claude/jobs/<short-id>/state.json

  It will not be resumed if it is interrupted. Nothing re-runs a background agent that
  died, and the leader does not either. Whatever it committed is what you have.

  Nothing will tell you when it finishes. Poll it: claude agents --json --all

  The terminal log is not a durable record. See "What you can still read afterwards".
```

The **record** line matters more than it looks: `state.json` carries `worktreePath`, `worktreeBranch`, `sessionId` and the prompt as `intent`, and it outlives the session, the daemon and the report itself. It is the answer when this report has scrolled away.

## What will not happen

**No resumption once the SUPERVISOR is gone — and that qualifier is load-bearing.** This section said "nothing restarts an interrupted run" flat, and a measurement on 2026-09-11 showed that to be true of one interruption and false of another:

| What died | What happened |
|---|---|
| the **session process** alone | the daemon **restarted it with `--resume`** within seconds and the run carried on. Nothing was lost, and nothing had been interrupted |
| the **daemon** alone | the session ran on unsupervised until it was reaped, committing three more steps first |
| **both together** — the shape a reboot has | the run stopped, nothing resumed it a minute later, and every committed step was on the branch |

So an operator who kills a background session to stop it has not stopped it. `claude stop <id>` is the way to end one; a reboot is the interruption this skill's discipline is actually protecting against.

What still holds is the part that mattered: **nothing replays an interrupted task blind**, and neither Claude Code nor `leader` re-runs one whose supervisor is gone — a run that already spent budget and wrote output must not be repeated. `claude respawn` exists and is not this: it restarts a background session so it picks up the current Claude Code binary. Do not offer it as recovery.

**No notification.** A background session that finishes announces nothing. `claude agents --json --all` reports each session's `state` — `working`, `done`, `failed` — and polling it is the only mechanism unless the operator asked for something more.

**No readable log, eventually.** The terminal log lives in the background **daemon**, not on disk, and it is a raw replay of the session's terminal — escape sequences and all — even while it works:

```
daemon running · session still running ................... the replay
daemon running · session finished under THIS daemon ...... the replay
daemon running · session finished under an earlier one ... job not found - it may have already exited
daemon gone (container restart, host reboot) ............. connect ENOENT /tmp/cc-daemon-<uid>/<hash>/control.sock
```

The last row is what the operator hits in practice, because the gap between a run finishing and someone reading it usually contains a restart.

### What you can still read afterwards

| Survives | Path | Carries |
|---|---|---|
| the commits | `<repo>/.claude/worktrees/<slug>`, branch `worktree-<slug>` | the work itself — this is the record that matters |
| the job record | `~/.claude/jobs/<short-id>/state.json` | `worktreePath`, `worktreeBranch`, `sessionId`, `intent`, `state`, `detail` |
| the transcript | `~/.claude/projects/<encoded-worktree-path>/<sessionId>.jsonl` | the full conversation, including a failed run's last turns |

**A commit is not a push.** The worktree branch is local: it survives an interrupted run, a stopped daemon and a container restart, and it does not survive the machine going away. Publishing is `finish-branch` and `create-pr`, and this skill does neither.

`claude rm <id>` refuses to delete a worktree holding unpushed commits and prints what it would take to discard them. Treat that refusal as the safety net it is, not as an obstacle.

## Flags

| Flag | Behaviour |
|---|---|
| _(default)_ | show the composed prompt, the repository, the worktree name and the branch, then wait for the operator to confirm before dispatching |
| `--auto` | dispatch immediately. Still reports the same block afterwards |
| `--dry-run` | print the composed prompt and the exact command, dispatch nothing |

The default pause is deliberate and it is what makes model-triggering safe: a dispatch spends budget with nobody watching and cannot be taken back, so the one case where the description matched something the operator did not mean still costs a confirmation rather than a run.

## Relationship to the `commit-as-you-go` hook

The Terylon repository solves this same problem a second way, for a different runtime. `homelab/services/claude-agent/hooks/commit-as-you-go.js` is a `PostToolUse` hook that commits after every `Edit` / `Write` / `NotebookEdit` inside a **dispatched worker container**. They are not alternatives to choose between — they cover different machines:

| | `background-run` | `commit-as-you-go.js` |
|---|---|---|
| Runs in | the operator's own session | a dispatched worker container |
| Mechanism | an instruction in the dispatched prompt | a hook, outside the permission system |
| Unit of loss | one **step**, as the prompt defines it | one **file write** |
| Can the agent skip it? | yes — it is a prompt | no |
| Why that mechanism | the operator's session may already commit, and a prompt leaves a record of what was asked | the worker's allow list carries no `git commit`, so the model cannot commit at all and something outside it must |

Both exist because of the same 2026-08-25 test, and neither replaces the other.

## Verification

What has been measured against the real tooling, and what has not, is recorded in `VERIFICATION.md` beside this file. Read it before repeating any claim above as established.
