# ADR — a run's cost is measured from its own transcripts, weighted toward output

**Status:** accepted
**Date:** 2026-08-14
**Decided in:** PR 57, PR 64

What a Claude Code run cost is read from the per-agent transcripts the harness writes, summed per tier and per agent type, and expressed both as raw token counts and as one derived number weighted toward the bucket that actually costs. The figures in the harness's task notifications are not used as a total.

## Context

Optimising a pipeline requires a number that goes down when the pipeline gets cheaper. Two candidate numbers were available and neither was that.

**The notification figure.** Every completed subagent reports a `subagent_tokens` value. It is free to read and it is what anyone would reach for first. Measured against the transcripts it does not survive:

| Observation | Consequence |
|---|---|
| The notification's largest single agent exceeded the real output of **every** transcript, by a wide margin | the two quantities cannot be reconciled under any interpretation — it is not an output count |
| It omits the main thread entirely, which was **a third of all output** when measured | a run could be optimised to zero on this number while the main thread grew |

**The raw token total.** Summing everything the transcripts report is honest but not proportional to spend. The three buckets are priced very differently, and the largest by volume is the cheapest:

```
volume                                      price
cache read     ████████████████████████     ▌            ~2 orders of magnitude more volume,
cache write    ███                          ████          priced far below output
output         █                            ████████████
```

A total dominated by cache reads moves when caching behaviour changes and barely moves when the expensive part does.

## The alternatives

| Option | What it would have meant | Why it lost |
|---|---|---|
| Sum the transcripts, report raw buckets **and** a weighted derived number | reading local files, one weighting formula, both kept | **chosen** |
| Use `subagent_tokens` from the notifications | nothing to build, no file reads | measures an undefined composite and omits the main thread — see above |
| Sum raw totals only | no model, nothing that can be mis-weighted | not proportional to cost; the number moves for the wrong reasons |
| Report currency figures | directly comparable to a bill | published prices change; a committed price is wrong on a date nobody notices |

## Decision

**Spend is summed from `message.usage` in the session's own transcripts, over records where `type == "assistant"`, and reported per tier and per agent type. Beside the raw sums, one derived quantity expresses cost.**

```
OET = modelFactor x (output + 0.25 x cacheWrite + 0.02 x cacheRead)
```

Four properties make it usable, and each was a decision of its own:

| Property | Why |
|---|---|
| The weights are **ratios between published rates**, not prices | ratios move far more slowly than the numbers behind them, and a stale ratio is visibly a ratio |
| The raw sums are **always printed beside it** | OET is a model that may turn out badly weighted; a report that dropped the measured facts could not be re-derived under different weights |
| An unknown model falls back to `1.00` | it over-counts rather than hides |
| Every report prints the date the ratios were read | a stale weights table is visible rather than silently wrong |

The main thread is a **tier of its own**. Its transcript and the `subagents/` transcripts are totalled separately and then added; in the main transcript every record is `isSidechain: false`, so subagents never double-count against it.

### Measured as the run happens, not only at the end

Two mechanisms, answering different questions, sharing one weighting:

```
during the run   SubagentStop hook  ──▶  one event per completed subagent
                 (record-agent-spend.js)  appended to docs/terylon/monitoring/<session>-spend.jsonl
                        │
                        └── reads only the bytes new since the last event; fails open

at the end       measure-token-spend  ──▶  the whole-session report, three tables

both            shared/oet.js + shared/weights.json   one formula, so the two cannot drift
```

A hook rather than something the pipeline invokes, because **a run that ends badly is still a run worth measuring** — and anything that has to be invoked is not invoked on the runs that fail.

## Consequences

| Consequence | Kind |
|---|---|
| The measurement is local, dependency-free, and reads no network | good |
| A run that crashes is still measured, because the hook does not depend on anyone calling it | good |
| The script reads transcripts **off-context** and prints only totals, so measuring a run does not cost the context it is measuring | good |
| Three tables must be read together — a type's total does not say whether it was many even runs or one runaway | cost |
| **The two quantities must never appear in one table.** A transcript sum and a notification figure in adjacent columns invites a comparison that has no meaning | **constraint** |
| **The raw sums must never be dropped in favour of OET.** They are the measured facts; OET is the model | **constraint** |

## Gotchas

**A truncated transcript makes a total a floor, not an exact figure.** An agent that died mid-response can leave an unparseable line; the script skips it rather than failing. A total that looks slightly low on a run that crashed is behaving correctly.

**Re-running over the same session must reproduce the totals.** If it does not, the record filter (`type == "assistant"`) or the field list is wrong — not the transcripts.

**`node --test` needs the test file, not the directory.** `node --test <dir>/` tries to execute the directory as a module and fails.

## Where it lives

| File | Role |
|---|---|
| `plugins/terylon-core/skills/measure-token-spend/SKILL.md` | `measure-token-spend` — the flags, the three tables, and why the notification figure is not a total |
| `plugins/terylon-core/skills/measure-token-spend/scripts/measure-token-spend.js` | the whole-session sum: tier split, per-type totals, costliest individual runs |
| `plugins/terylon-core/skills/measure-token-spend/scripts/measure-token-spend.test.js` | asserts the per-bucket and per-model weighting, the unknown-model fallback, and that the raw sums are unchanged by OET |
| `plugins/terylon-core/hooks/record-agent-spend.js` | the `SubagentStop` hook — one event per completed subagent, incremental, fails open |
| `plugins/terylon-core/hooks/record-agent-spend.test.js` | asserts exit 0 on malformed input and that a partial trailing line is counted once and whole |
| `plugins/terylon-core/shared/oet.js` | the single implementation of the formula, shared by the script and the hook |
| `plugins/terylon-core/shared/weights.json` | the bucket and model ratios, plus the date they were read |
