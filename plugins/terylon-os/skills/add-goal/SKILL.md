---
name: add-goal
description: "Use when the owner gives Terylon's leader a goal in a sentence — \"the leader should take X\", \"add a goal for Y\" — and wants the leader to plan it."
allowed-tools: mcp__plugin_terylon-os_terylon__*, mcp__terylon__*
---

# add-goal — hand the leader a goal in one sentence

**Mirrors the MCP prompt `goal`** that Terylon's `/mcp` serves (`/mcp__terylon__goal` in Claude Code). The prompt is the source; this text says the same.

## What to do

> I want the leader to take this goal: {the goal, in a sentence, and where it lands}
>
> If the target repository is not clear, ask me once. Then call goal_add with the title, the priority (2 unless I said otherwise) and the target. Tell me the leader's answer and that its plan will appear in plans_list, for me to approve.

## What binds it

- **The target is `<forge>:<organisation>/<project>/<repository>`** as `goals_list` shows targets, or `list` for Terylon's own list.
- **`goal_add` approves nothing**: the plan it leads to waits at the plan gate for the owner. A story worked out in detail goes through `hand-over` instead.
