---
name: show-story
description: "Use when the owner asks about one Terylon story in flight — \"how is 333 doing\", \"why is it blocked\", \"summarise the story in the session\" — its step, cost, attempts, pull request and verdicts, and what it needs."
allowed-tools: mcp__plugin_terylon-os_terylon__*, mcp__terylon__*
---

# show-story — one story in flight

**Mirrors the MCP prompt `story`** that Terylon's `/mcp` serves (`/mcp__terylon__story` in Claude Code). The prompt is the source; this text says the same.

## What to do

> Show me story {the story's number}: read it with story_get and work_in_flight — its step n of m, cost against budget, hours, attempts, timeline, pull request and verdicts. If it is blocked, say why and offer story_unblock with an answer; if its run is going nowhere, offer story_stop; if it is stuck or wrong, offer story_return or story_abandon. Do not act before I choose.

## What binds it

- **Offer, never act.** `story_unblock`, `story_stop`, `story_return` and `story_abandon` are gates the person confirms in Terylon's form.
- **This is what the pane's "Shrň mi to v session" asks for**: the `terylon-pane` mod posts the request into the session, and this skill answers it.
