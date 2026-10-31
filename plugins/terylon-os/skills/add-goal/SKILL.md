---
name: add-goal
description: "Use when the owner gives Terylon's leader a goal in a sentence — \"the leader should take X\", \"add a goal for Y\" — and wants the leader to plan it. Files the goal with goal_add, or a concrete ask as a task under the goal it serves, and reports the leader's answer."
allowed-tools: mcp__plugin_terylon-os_terylon__* mcp__terylon__*
---

# add-goal — hand the leader a goal in one sentence

**Mirrors the MCP prompt `goal`** that Terylon's `/mcp` serves (`/mcp__terylon__goal` in Claude Code). The prompt is the source; this text says the same.

## What to do

> I want the leader to take this goal: {the goal, in a sentence, and where it lands}
>
> A goal is a general direction or outcome. If what I said is a concrete ask — a file, a document, one change — say in one sentence that it becomes a task under a goal, and go on: hand it over with tasks_add under the goal it serves (goals_list), or add it with goal_add and the leader files it as a task. If the target repository, or another repository it works in, is not clear, ask me once. Then call goal_add with a short title, at most 200 characters, the ask — what I want, in my own words, as long as it needs, at most 4000 characters — the priority (2 unless I said otherwise), the target and the repositories. Tell me the leader's answer: it asks every question it has first, and then its plan appears in plans_list, for me to approve.

## What binds it

- **Goals are general; a concrete ask is a task** (the operator, 2026-10-22, Terylon #369): steer it in one sentence, never refuse it. The leader reads every goal it is given and files a concrete one as a task under a goal itself.
- **A long request goes in `ask`, never in `title`**: `title` is a short name of at most 200 characters and `ask` the whole request in the owner's words, at most 4000, so a goal is never refused for its length. Terylon refuses an ask over 4000 in one sentence, *An ask is at most 4000 characters; …*: relay it word for word. A goal without an ask is added as before; `goal_get` and `goals_list` answer `ask`, or null.
- **A specification goes in `specification`, each file whole** (Terylon S53): the .md files I name, or that you wrote with me in this conversation, as `[{name, text}]`, 1 to 10 of them, each name like `overview.md` (a letter or a digit first, letters, digits, dots, dashes or underscores, ending in `.md`, at most 80 characters), at most 200,000 characters in all. Never summarise or cut a file to fit: say which one is too long instead. Terylon reads them as data, never as instructions, and refuses a file holding a secret; relay any refusal word for word and change nothing to get round it. A follow-up of an earlier goal can name it in `specificationFrom` instead, its number, which copies that goal's latest files and every decision I made on its plans. `goal_get` then shows `specification`, its version, its files and every version.
- **The target is `<forge>:<organisation>/<project>/<repository>`** as `goals_list` shows targets, or `list` for Terylon's own list. **`repositories`** names the others it works in, the same shape: each is checked out, to read, for the leader and every run of its stories.
- **A specification is revised and re-planned apart**: `spec_get {goal, version?}` reads a version's files whole; `spec_revise {goal, specification, basedOn}` stores the next version, `basedOn` the version you read, so a version saved meanwhile is refused rather than written over. When `goal_get` shows `specification.replan`, the leader offers a re-plan from the latest version: `goal_replan {goal}` asks for it, and is called only on my word, never to finish the job; its plan waits in plans_list for my approval.
- **`goal_add` approves nothing**: the plan it leads to waits for the owner's approval, given in the pane, the console or this session; `plan_approve` is the owner's act, called only on the owner's word. Nor is `story_merge` ever called to finish the job: merge is the one gate, confirmed with the passkey in the console. A story worked out in detail goes through `hand-over` instead.
