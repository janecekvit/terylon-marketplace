# terylon-os

**Terylon itself, as a plugin** — *Terylon, the agentic OS extension*: the owner's MCP endpoint, `/mcp`, registered as the server `terylon`, and one skill per prompt that endpoint serves. Nothing here holds a rule: every gate is Terylon's, and the person confirms it in Terylon's own form or in the console.

Where it stands beside the PC's pane and the phone: [One source of truth, reached from two places](../../docs/architecture/one-source-of-truth-reached-from-two-places.md).

## Audience

The owner of a Terylon, in any Claude Code session that can reach it over the tailnet — a terminal on the PC, a local session in the desktop app, an SSH session or a Remote Control session on the remote box. It needs no other Terylon plugin and installs none.

## What it contains

**MCP server:** `terylon`, declared in `.mcp.json` as one HTTP server at `${TERYLON_URL}/mcp`. **No header and no token**: the caller's identity is their tailnet login, which Terylon reads from the tailnet's own headers, and only the owner gets past the owner check. At runtime its tools are namespaced `mcp__plugin_terylon-os_terylon__*` (measured on Claude Code 2.1.296): the plugin is `terylon-os`, its server `terylon`.

**Skills** — each mirrors one prompt the endpoint serves, so a client with no MCP prompts works the same way:

| Skill | Mirrors the prompt | For |
|---|---|---|
| `briefing` | `briefing` | what waits on the owner |
| `hand-over` | `hand-over` | a story from a rough idea to a specification, a plan, and `tasks_add` |
| `merge-gate` | `merge-gate` | a verified story's evidence, then merge or return |
| `add-goal` | `goal` | a goal in one sentence, to `goal_add` |
| `review-plan` | `plan-review` | a plan at the plan gate |
| `show-story` | `story` | one story in flight |

**What it does not contain: the pane.** The Desktop pane is the mod `terylon-pane`, a separate plugin, because a mod draws only where a surface can and the skills and tools must work everywhere — an SSH session and a Remote Control session have the plugin alone.

## Setup

Set `TERYLON_URL` to your Terylon's address on the tailnet — `https://` and the host, no path, no trailing slash — in your own `~/.claude/settings.json`. **It is required and has no default**: unset, the server's address is `/mcp` and it connects to nothing, which is the failure you want rather than a silent default pointing at somebody else's host.

```json
{
  "env": {
    "TERYLON_URL": "https://terylon.example.ts.net"
  },
  "extraKnownMarketplaces": {
    "terylon": {
      "source": { "source": "github", "repo": "janecekvit/terylon-marketplace" }
    }
  },
  "enabledPlugins": {
    "terylon-os@terylon": true
  }
}
```

Or, at a terminal prompt: `/plugin install terylon-os@terylon`.

**A session that added the server by hand** (`claude mcp add --transport http --scope user terylon <url>/mcp`) has its tools as `mcp__terylon__*`; every skill here allows both spellings, so either registration works — but not both at once, or the same tools are listed twice.

## The gates stay the person's

`plan_approve`, `plan_rethink`, `story_merge`, `story_return`, `story_unblock`, `story_abandon`, `story_stop`, `story_accept`, `leader_pause` and `leader_resume` are marked destructive in the tool list and are confirmed by the person in a form Terylon shows them. When the client cannot show the form, or they decline, the tool answers *pending* with the console's link. No skill here retries or works around that answer, and the pane never calls a gate at all.
