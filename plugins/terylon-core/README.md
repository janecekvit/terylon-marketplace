# terylon-core

**The marketplace's root** — the conventions every persona shares, and the measurement of what a run cost. No dependencies, no MCP server, no git; every other Terylon plugin sits on top of it.

> **Successor to `terylon-metrics`.** That plugin no longer exists; everything it shipped lives here. If your `.claude/settings.json` enables `terylon-metrics@terylon`, rename the key to `terylon-core@terylon` — see *Migration* below.

## Where it sits

```
terylon-core  ← you are here      the root: nothing below it, everything above
    ▲
    └── terylon-git
           ▲
           └── terylon-devops
                  ▲
                  ├── terylon-product
                  ├── terylon-dev
                  └── terylon-test
```

`terylon-dev` and `terylon-test` declare it **directly** as well as reaching it through the chain, because both load `measure-token-spend` whether or not git or a forge is in play.

## What belongs here

Only what **every** plugin above may need and that needs nothing itself. A component whose consumers all sit in one plugin belongs in that plugin instead — `write-plan` and `run-build-loop` were held here and moved to `terylon-dev` for exactly that reason. The root stays small on purpose: everything in it is installed for everyone.

| Belongs here | Does not |
|---|---|
| consumed by two or more plugins **and** needs no git, forge or MCP server | consumed by one plugin, whichever one |
| a convention any persona may have to apply | anything that exercises git, a forge, or a browser |

## Skills

| Skill | What it does |
|---|---|
| `delegate-to-repo-agents` | The convention for dispatching agents the *target* repository ships. Its load-bearing rule is a **capability test** — may the candidate change the files under examination? `Edit`, `Write` and unrestricted `Bash` all mean yes. Loaded by name by the personas in `terylon-dev`, `terylon-git` and `terylon-test`. |
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

Enabling any other Terylon plugin installs it automatically — it is the root of the dependency chain.

## Skills that moved out

`write-plan` and `run-build-loop` shipped here in `1.0.x` and now live in **`terylon-dev`**. Both are consumed only by that plugin's `develop`, `leader` and `planner`, and a root that carries a single plugin's methodology is installed for everyone who does not need it.

Nothing changes for a caller: skills are addressed **by name**, so an agent loading `write-plan` keeps working as long as `terylon-dev` is enabled. A repository that enabled `terylon-core` alone in order to get the plan format must now enable `terylon-dev`.

## Migration from terylon-metrics

| Was | Is |
|---|---|
| `"terylon-metrics@terylon": true` | `"terylon-core@terylon": true` |
| `plugins/terylon-metrics/skills/measure-token-spend/…` | `plugins/terylon-core/skills/measure-token-spend/…` |
| the skill loaded by name as `measure-token-spend` | unchanged — skills are addressed by name, not by plugin |

Only the enablement key changes. Anything that loaded `measure-token-spend` by name keeps working.

## Requirements

Node.js on the `PATH` (already required by the marketplace's hooks). Nothing else — the measurement reads local files only and makes no network call.
