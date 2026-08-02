# terylon-core

**Methodology and measurement** — how a plan is written, how a build loop is driven, and what a run cost. A leaf plugin: no dependencies, no MCP server, works in any repository.

> **Successor to `terylon-metrics`.** That plugin no longer exists; everything it shipped lives here. If your `.claude/settings.json` enables `terylon-metrics@terylon`, rename the key to `terylon-core@terylon` — see *Migration* below.

## Audience

Two, and they overlap:

- anyone driving a plan-and-build loop who wants the mechanics written down rather than improvised,
- anyone who wants to know what a Claude Code run cost, measured from the session's own transcripts rather than from the harness's notification figures.

## Skills

| Skill | What it does |
|---|---|
| `write-plan` | The implementation plan's format — header, global constraints, file map, task shape with interfaces, the no-placeholder rules, the self-review. Written for an implementer who sees only their own task. |
| `run-build-loop` | The controller's mechanics for executing a plan: the ledger that survives a compaction, the pre-flight scan before the first task, the bounded fix rounds with model escalation, and how to pick a tier per role. |
| `measure-token-spend` | Sums a session's token usage per tier (main thread, subagents), per agent type and per individual run, read from `~/.claude/projects/<slug>/<session>/`. Ships a dependency-free Node script that reads the transcripts **off-context** and prints only the totals. |

## The spend hook

The plugin registers a **`SubagentStop`** hook (`hooks/record-agent-spend.js`). It appends one JSON line per completed subagent to `docs/terylon/monitoring/<session>-spend.jsonl` in the repository the run works in:

```json
{"at":"…","agent":"agent-a1b2","type":"developer","model":"claude-sonnet-4-5","output":1200,"cacheRead":840000,"cacheWrite":31000,"oet":4600}
```

Measurement that has to be remembered is measurement that stops happening, so nothing invokes this — it records by itself, and a run that ends badly is measured anyway. It reads only the bytes that are new since the last event, and fails open: any error exits 0 with no output.

## OET — output-equivalent tokens

A run's three token buckets do not cost the same, and the largest by volume is not the largest by cost. OET is one derived quantity proportional to cost:

```
OET = modelFactor x (output + 0.25 x cacheWrite + 0.02 x cacheRead)
```

The weights live in `shared/weights.json` as **ratios between published rates**, never as prices — ratios move far more slowly than the numbers they come from. Every report prints the date the ratios were read, so a stale table is visible rather than merely suspected.

**OET never replaces the raw sums.** They are the measured facts; OET is a model that may turn out badly weighted, and a report that dropped them could not be re-derived under new weights.

## Setup in a consuming repo

Into `.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "terylon-core@terylon": true
  }
}
```

Dev and test repositories get it automatically: `terylon-dev` and `terylon-test` both declare it as a dependency.

## Migration from terylon-metrics

| Was | Is |
|---|---|
| `"terylon-metrics@terylon": true` | `"terylon-core@terylon": true` |
| `plugins/terylon-metrics/skills/measure-token-spend/…` | `plugins/terylon-core/skills/measure-token-spend/…` |
| the skill loaded by name as `measure-token-spend` | unchanged — skills are addressed by name, not by plugin |

Only the enablement key changes. Anything that loaded `measure-token-spend` by name keeps working.

## Requirements

Node.js on the `PATH` (already required by the marketplace's hooks). Nothing else — the measurement reads local files only and makes no network call.
