# One source of truth, reached from two places

**Status:** accepted, 2026-10-12, on work item #332 (criterion c10). **Superseded in part on 2026-10-21** by [the pane takes the owner's acts](./the-pane-takes-the-owners-acts.md): the pane now takes the owner's acts on their cards, and only merge stays a link to the console. The one source of truth and the one `/mcp` stand. **Agentic OS on the owner's host holds every fact the owner works with, and is reached the same way from two places: from the PC, in Claude Desktop, with the whole pane, and from terylon-remote, through Remote Control, when the PC is off.** The pane only ever shows what Agentic OS is doing. It holds nothing and decides nothing; a decision is a link to the console.

## Context

The owner's own words on #332:

> Agentic OS on the owner's host is the only source of truth. The main place to work is Claude Desktop on the PC, with the whole pane. When the PC is off, the owner works from the phone through Remote Control on terylon-remote, which has the same access through `/mcp`. The pane only ever shows what Agentic OS is doing.

The diagram below is copied from #332, rev 28, section *Use case: one source of truth, reached from two places*, with its phone line settled on 2026-10-26:

```
                                Agentic OS on its host                                  as designed, 2026-10-12
                                leader · stories · plans · bell · memory
                                /mcp over the tailnet — THE ONLY SOURCE OF TRUTH
                                     ▲                              ▲
                  ┌──────────────────┘                              └──────────────────┐
  PC, Claude Desktop (when it is on)                     terylon-remote (Linux, always on)
  ├─ terylon-os: the /mcp tools + skills                 ├─ terylon-os: the same tools + skills
  └─ terylon-pane: the bar + the pane                    ├─ the orchestrator (a Remote Control session)
     EVERYTHING IS SEEN AND CLICKED HERE                 └─ from the PHONE through Remote Control:
     (the pane shows, it never decides)                     skills and tools always; no pane on the
                                                            phone: a mod draws on the machine
```

## The alternatives

| Option | What it costs | Chosen |
|---|---|---|
| The pane keeps its own copy of the queue, the goals or the memory, and syncs it | two truths, and the phone sees a third; every disagreement is the owner's to resolve | no |
| The pane reaches the console's routes directly, beside `/mcp` | a second door with its own identity, refusals and gates, and Remote Control would not have it | no |
| **Every surface reads and writes through the one `/mcp`, and the pane holds only what it last read** | the pane is stale while Terylon does not answer, and says so | **yes** |

## Decision

| Surface | Reaches Agentic OS through | Holds |
|---|---|---|
| PC, Claude Desktop | `terylon-os` (the `/mcp` tools and skills) and `terylon-pane` (the band and the pane) | the last answer, for drawing; nothing it decides |
| terylon-remote | `terylon-os`, the same tools and skills; the orchestrator runs there as a Remote Control session | nothing of its own |
| The phone | Remote Control on terylon-remote: skills and tools always | nothing |

- **The phone shows no pane.** A mod's hooks run in the session on the machine, and under Remote Control its drawing appears in the terminal on that machine, not in the web or mobile app (Claude Code's mods overview, checked 2026-10-26). On the phone the skills and tools do everything the pane would.
- A gate is always the person's, confirmed in Terylon's form or in the console: plan approve or rethink, story merge, return, unblock, abandon, stop or accept, leader pause or resume. **Superseded 2026-10-21**: merge is the one gate; the rest are the owner's acts, taken on their cards ([the pane takes the owner's acts](./the-pane-takes-the-owners-acts.md)).
- A surface may write only what decides nothing: a task, a goal, an answer to the leader's question, a proposed memory edit. **Superseded 2026-10-21** by the same record, for the owner's acts.

## Consequences

| | |
|---|---|
| good | the PC and the phone never disagree about what waits, runs or is done: both read the same `/mcp` |
| good | the PC being off loses no capability that matters: the gates live in the console, and everything else is a skill or a tool on terylon-remote |
| cost | while Terylon does not answer, the pane shows the last state it read, marked stale, with the time and the reason |
| **constraint** | **giving the pane a store of its own that survives a session, or a write that decides, undoes this.** The pane's `$.state` holds only the last answer and the screen it is on. Its `$.store` holds only where it last read the events and which signals it posted. |
| **constraint** | **a tool in the pane's allow-list that is a gate undoes it**: `PANE_TOOLS` names reads, the five writes that decide nothing — `notice_handle` the fifth since #360 — and, since S27, the owner's thirteen acts; `story_merge`, the one gate, is never among them, and a mutation planting it there must turn the tests red |

## Where it lives

| File | Role |
|---|---|
| `plugins/terylon-os/.mcp.json` | the `terylon` server — `${TERYLON_URL}/mcp`, the one door every surface uses |
| `plugins/terylon-pane/hooks/terylon.ts` | `PANE_TOOLS`, `GATE_TOOLS` — what the pane may call, and the gates it refuses by name |
| `plugins/terylon-pane/hooks/register.tsx` | `refresh`, the `AbovePrompt` and `Pane` renders — the band and the pane drawn from the last answer |
| `plugins/terylon-pane/types/index.d.ts` | `PaneSnapshot` — everything the pane holds, a copy of what `/mcp` answered |
| `tests/terylon-pane/mutations.js` | the mutations that plant a gate in `PANE_TOOLS` and in the allow rules |
