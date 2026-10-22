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
> A goal is a general direction: ask me for the outcome it should reach if I gave only a concrete ask. A concrete ask — a file, a document, one change — becomes a task under a goal; say so, and point me to adding it as a task under the goal it serves. If I still want it as a goal, add it as written: the leader decides. If the target repository is not clear, ask me once. Then call goal_add with the title, the priority (2 unless I said otherwise) and the target. Tell me the leader's answer: it asks its questions first, then makes a plan that will appear in plans_list, for me to approve.

## What binds it

- **The target is `<forge>:<organisation>/<project>/<repository>`** as `goals_list` shows targets, or `list` for Terylon's own list.
- **A goal is a direction, a task is a concrete ask.** "Create an Excel file with the costs" is a task; "keep the household's costs in view" is the goal it serves. The skill steers, and never refuses: a concrete ask the owner keeps is added, and the leader's own answer says what becomes of it — retitled to the direction it serves, or filed as a task under an existing goal.
- **The leader asks first, then plans.** Its questions come before the plan; the owner answers them in the pane or the console.
- **`goal_add` approves nothing**: the plan it leads to waits at the plan gate for the owner. A story worked out in detail goes through `hand-over` instead.
