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
> A goal is a general direction or outcome. If what I said is a concrete ask — a file, a document, one change — say in one sentence that it becomes a task under a goal, and go on: hand it over with tasks_add under the goal it serves (goals_list), or add it with goal_add and the leader files it as a task. If the target repository, or another repository it works in, is not clear, ask me once. Then call goal_add with the title, the priority (2 unless I said otherwise), the target and the repositories. Tell me the leader's answer: it asks every question it has first, and then its plan appears in plans_list, for me to approve.

## What binds it

- **Goals are general; a concrete ask is a task** (the operator, 2026-10-22, Terylon #369): steer it in one sentence, never refuse it. The leader reads every goal it is given and files a concrete one as a task under a goal itself.
- **The target is `<forge>:<organisation>/<project>/<repository>`** as `goals_list` shows targets, or `list` for Terylon's own list. **`repositories`** names the others it works in, the same shape: each is checked out, to read, for the leader and every run of its stories.
- **`goal_add` approves nothing**: the plan it leads to waits for the owner's approval, given in the pane, the console or this session; `plan_approve` is the owner's act, called only on the owner's word. Nor is `story_merge` ever called to finish the job: merge is the one gate, confirmed with the passkey in the console. A story worked out in detail goes through `hand-over` instead.
