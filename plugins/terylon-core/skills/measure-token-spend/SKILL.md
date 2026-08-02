---
name: measure-token-spend
description: >-
  Use when you want to know what a Claude Code run cost in tokens — per tier (main thread vs
  subagents) and per agent type — measured from the session's own transcripts, not from the
  harness's notification figures. Runs after a pipeline build, or to compare a change's cost
  against a baseline. Reads local files only; no network.
allowed-tools: Bash(node *), Read, Glob
---

# measure-token-spend

Sums a Claude Code session's token usage from the per-agent transcripts the harness writes, and reports it **per tier and per agent type**. It ships a dependency-free Node script that reads the transcripts **off-context** and prints only the totals — so measuring a run does not itself cost the context it is measuring.

This skill is the single source of the measurement method. It exists to be run at the end of a pipeline build (the `develop` skill invokes it at Gate 3) and standalone in any repository.

## Run it

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/measure-token-spend/scripts/measure-token-spend.js" [--project <slug>] [--session <id>] [--dir <path>] [--out <file>]
```

| Flag | Meaning | Default |
|---|---|---|
| `--project <slug>` | project folder under `~/.claude/projects/` | auto-detect |
| `--session <id>` | session id (the transcript basename) | newest in the project |
| `--dir <path>` | explicit project directory (overrides `--project`) | — |
| `--out <file>` | also write the report to this path | stdout only |
| `--top <n>` | how many individual agent runs the costliest-runs table lists | `10` |

With no arguments it measures the **newest session across every project** — which, run at the end of a session, is the one that just finished. The script prints a markdown report; `--out` additionally writes it to a file.

## OET — the derived quantity, beside the raw ones

The three buckets do not cost the same, and the largest by volume is not the largest by cost. **Output-equivalent tokens** weight them into one number proportional to spend:

```
OET = modelFactor x (output + 0.25 x cacheWrite + 0.02 x cacheRead)
```

The weights live in `shared/weights.json` at the plugin root, as **ratios between published rates** rather than as prices — ratios move far more slowly than the numbers behind them. `modelFactor` comes from each agent's `.meta.json`; a model the table does not name falls back to `1.00`, which over-counts rather than hides.

**OET never replaces the raw sums.** They are the measured facts; OET is a model that may turn out badly weighted, and a report that dropped them could not be re-derived under different weights. Every report prints the date the ratios were read, so a stale table is visible.

## Three tables, and what each answers

| Table | Answers |
|---|---|
| by tier | how much of the run was the main thread and how much was fanned out |
| by agent type | which kind of agent the run spent itself on |
| costliest individual runs | whether a type's total is many even runs or one runaway — the per-type table cannot tell them apart, and in a measured session that was the question that mattered |

## Continuous collection, without being invoked

The plugin also registers a **`SubagentStop` hook** (`hooks/record-agent-spend.js`) that appends one event per completed subagent to `docs/terylon/monitoring/<session>-spend.jsonl`. It reads only the bytes new since the last event and fails open.

This skill and that hook answer different questions: the hook records **as the run happens**, so a run that ends badly is still measured; this skill produces the **whole-session report** at the end. They share `shared/oet.js`, so the weighting cannot drift between them.

## What it measures, and why not the notification figure

Two different quantities both get called "tokens", and they must **never appear in one table**:

| Source | What it is | Use it for |
|---|---|---|
| Per-agent transcript `message.usage` | the tokens the model actually billed | **this — the measurement** |
| `<task-notification>` `subagent_tokens` | a harness composite nobody has defined | orientation only, never a total |

`subagent_tokens` is **not** an output count. In a measured session the notification's largest single agent exceeded the real output of **every** transcript, by a wide margin, so the two quantities cannot be reconciled under any interpretation. It also **omits the main thread entirely** — which was **a third of all output** when measured. An optimisation aimed at the notification numbers is aimed at a quantity nobody has defined.

## Where the transcripts live

```text
~/.claude/projects/<project-slug>/<session-id>.jsonl        the main thread
~/.claude/projects/<project-slug>/<session-id>/subagents/
    agent-<id>.jsonl        one transcript per subagent
    agent-<id>.meta.json    agentType, description, parentAgentId, spawnDepth, model
```

The `.meta.json` beside each transcript names the agent's **type**, its **parent**, and its **spawn depth** — enough to total by tier (`developer`, `Explore`, the review lenses) and to see the fan-out shape.

## What it sums

The three fields of `message.usage`, over records where **`type == "assistant"`**:

```text
output_tokens
cache_read_input_tokens
cache_creation_input_tokens
```

In the main JSONL every record is `isSidechain: false`, so subagents never double-count against it. The script totals the main thread and the `subagents/` transcripts **separately**, then adds — the main thread is a tier of its own, not part of the subagent total.

## Caveats that bound the method

- **Cache-read dominates by volume** — by roughly two orders of magnitude against output — but is priced far below it. That gap is exactly what OET exists to express; the raw token counts are **not** cost, and OET is proportional to it rather than equal to it. There are no currency figures here, by design: absolute prices go stale in a way ratios do not.
- **An agent that died mid-response** may have a truncated transcript; the script skips the unparseable line, so its total is a floor, not the exact figure.
- **Re-running over the same session reproduces the totals.** If it does not, the filter (`type == "assistant"`) or the field list is wrong, not the transcripts.

## Verification

- **Unit tests:** `node --test "plugins/terylon-core/skills/measure-token-spend/scripts/measure-token-spend.test.js"` — pass the test **file**, not the directory (`node --test <dir>/` tries to execute the directory as a module and fails). A fixture session with a known layout asserts the per-tier and per-type totals, that non-assistant records are excluded, that argument parsing nulls a trailing flag, and that a truncated line is skipped rather than fatal. It further asserts the OET weighting per bucket and per model, that an unknown model falls back to a finite default rather than `NaN`, that an unreadable weights file degrades to the documented defaults rather than to zero, that the costliest-runs table orders by OET and not by output, and that the raw sums are unchanged by the addition.
- **Hook tests:** `node --test "plugins/terylon-core/hooks/record-agent-spend.test.js"` — asserts the hook exits 0 with no stdout on malformed and empty input, appends one event per subagent, records only what is new on a second run, and rewinds a partial trailing line so it is counted once and whole.
- **Real session:** run with `--project <slug>` and confirm the main-thread and subagent tiers are both non-zero on a run that fanned out, and that re-running yields the same numbers.
