# terylon-os

**Terylon itself, as a plugin** — *Terylon, the agentic OS extension*: the owner's MCP endpoint, `/mcp`, registered as the server `terylon`, and one skill per prompt that endpoint serves. Nothing here holds a rule: merge is the one gate, and the owner confirms it with the passkey in Terylon's console; every other act that decides something is the owner's, and a session takes it only on the owner's word.

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
| `add-goal` | `goal` | a goal in one sentence — a general direction, a concrete ask steered to a task under a goal — to `goal_add`, a short title and the request whole as `ask` |
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

## One gate, and the owner's acts

Terylon's `/mcp` sorts what a session can call into three kinds, and only the first is a gate:

| Kind | Tools | Who takes it, and how | What the tool answers |
|---|---|---|---|
| **The gate: merge** | `story_merge` | the owner, confirming the exact commit with the passkey in the console. Over MCP the tool applies nothing; it pushes the merge sheet to the owner's phone | *pending*, with the console's merge-sheet link — passed on, never retried or worked around |
| **The owner's acts** | `plan_approve`, `plan_rethink`, `story_return`, `story_unblock`, `story_abandon`, `story_stop`, `story_accept`, `leader_pause`, `leader_resume`, `goal_drop`, `memory_confirm`, `memory_drop`, `policy_save` | the owner, in the console, in the pane, or in a session — where Claude calls one only on the owner's word given in the conversation, never to be helpful. Each applies at once, with no confirmation asked | `{accepted, sentence, commandId, subjectId}`; `accepted: null` means the leader has not decided within 10 s — say so, and do not send the write again: `leader_answer` with the `commandId` reads the decision later; a refusal, `{refused, status?, console?}` or `accepted: false`, carries a sentence to relay |
| **Writes that decide nothing** | `goal_add`, `tasks_add`, `leader_answer`, `memory_propose`, `notice_handle` and the like | anyone in the session, as a skill describes | the leader's answer |

The other gate, removing a passkey, exists only in the console and has no tool.

**Terylon validates no schema**, so an owner's act is sent in exactly its shape:

| Tool | Arguments | Note |
|---|---|---|
| `plan_approve` | `{plan, stories?, edits?}` | a subset of `stories` approves only those, and the rest are dropped |
| `plan_rethink` | `{plan, comment}` | the comment is at most 2000 characters |
| `story_return` | `{story, note}` | only a verified or blocked story |
| `story_unblock` | `{story, note?}` | |
| `story_abandon` | `{story, reason?}` | |
| `story_stop` | `{story}` | only a dispatched or running story |
| `story_accept` | `{story}` | only a story kept in Terylon's own list |
| `leader_pause` | `{reason?}` | |
| `leader_resume` | `{}` | |
| `goal_drop` | `{goal}` | |
| `memory_confirm` | `{proposal, text?}` | |
| `memory_drop` | `{proposal}` | |
| `policy_save` | only the changed fields | last write wins, with no version and no concurrency check; ranges come from `policy_get.limits` |

On the phone there is no pane, because a mod draws only on its own machine: there the skills do the work, through the same tools.
