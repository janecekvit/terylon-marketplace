# terylon-metrics

Claude Code **run metrics** — measurement of how a run behaved, read from the session's own transcripts rather than from the harness's notification figures. It is a leaf plugin: no dependencies, no MCP server, works in any repository.

## Audience

Anyone who wants to know what a Claude Code run cost — today, its token spend per tier and per agent type, measured from the transcripts the harness writes.

## Skills

| Skill | What it does |
|---|---|
| `measure-token-spend` | Sums a session's token usage per tier (main thread, subagents) and per agent type, read from `~/.claude/projects/<slug>/<session>/`. Ships a dependency-free Node script that reads the transcripts **off-context** and prints only the totals. |

## Setup in a consuming repo

Into `.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "terylon-metrics@terylon": true
  }
}
```

Dev repositories get it automatically: `terylon-dev` declares `terylon-metrics` as a dependency so the `develop` pipeline can report a run's token spend at finish time.

## Requirements

Node.js on the `PATH` (already required by the marketplace's hooks). Nothing else — the measurement reads local files only and makes no network call.
