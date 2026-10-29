---
name: hand-over
description: "Use when the owner wants a story worked out and handed to Terylon's leader — \"write the spec for this\", \"turn this into a plan and give it to the leader\", \"hand this story over\" — from a rough idea through a specification and a plan to tasks_add."
allowed-tools: mcp__plugin_terylon-os_terylon__* mcp__terylon__* Read Grep Glob
---

# hand-over — story to spec to plan to hand-over

**Mirrors the MCP prompt `hand-over`** that Terylon's `/mcp` serves (`/mcp__terylon__hand-over` in Claude Code). The prompt is the source; this text says the same.

## What to do

> Take this story from me to the leader: {the story, as the owner said it}
>
> First write its specification with me, as markdown: the problem, what changes, the acceptance criteria one per line, the files it touches, and what is out of scope. Read the code for what you can; ask me, one question at a time, for what you cannot. Then write the plan: its steps, in order. Show me both and wait for my word. Then hand it over with tasks_add — one task with the title, a brief, the criteria, the files, the size (S, M, L or XL), the spec and the plan, under the goal I name (goals_list) or a new one, after the stories it must wait for. Tell me the leader's answer and that its plan waits in plans_list for me to approve in the console.

## What binds it

- **`tasks_add` proposes; it approves nothing.** The leader turns the task into a plan that waits for the owner's approval, given in the pane, the console or this session. `plan_approve` is the owner's act, called only on the owner's word — never to finish the job. Nor is `story_merge`: merge is the one gate, confirmed with the passkey in the console.
- **The spec is version 1 of the story's specification** (`spec`, markdown), and the plan travels with it (`plan`, the steps in order). A later change goes through `spec_revise`, never a second `tasks_add`.
- **A write answers when the leader has decided, within 10 s.** An answer of `accepted: null` carries a `commandId`: ask `leader_answer` with it rather than sending the task again.
