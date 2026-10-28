---
name: briefing
description: "Use when the owner asks what is new in Terylon, what waits on them, or how the leader stands — plans at the gate, verified stories waiting for their merge, open questions, blocked stories, a paused leader."
allowed-tools: mcp__plugin_terylon-os_terylon__*, mcp__terylon__*
---

# briefing — what waits on the owner

**Mirrors the MCP prompt `briefing`** that Terylon's `/mcp` serves (`/mcp__terylon__briefing` in Claude Code). The skill exists because a client without MCP prompts — Codex, an agent loading skills by name — still needs the same way of working. The prompt is the source; this text says the same.

## What to do

> Call the terylon briefing tool. Tell me in a few lines what waits on me — plans at the gate (id, goal, stories, estimate), stories verified and waiting for their merge, the leader's open questions, blocked stories, whether the leader is paused — then offer the one next act that matters most. Do not act before I choose.

## What binds it

- **Read with `briefing` first**; `work_in_flight` and `events_since` only when the owner asks for more.
- **Never take an owner's act to be helpful.** `plan_approve`, `story_return`, `leader_resume` and the other owner's acts are called only on the owner's word, given in this conversation, and apply at once, with no confirmation asked; offering one is the most this skill does unasked.
- **Merge is the one gate.** `story_merge` applies nothing over MCP: it answers *pending* with the console's merge-sheet link, and the owner confirms the exact commit with the passkey in the console. Say so and stop; `merge-gate` walks the evidence first.
- **The owner's language**: answer in it. Story titles stay as filed.
