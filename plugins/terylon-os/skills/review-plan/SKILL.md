---
name: review-plan
description: "Use when a Terylon plan waits at the plan gate and the owner wants it reviewed — \"look at plan 41\", \"what is waiting to be approved\" — before approving all, some or edited stories, or sending it back. Reads the plan, the policy and the memory, flags collisions and under-specified stories against the day's budget, and recommends; acts only on the owner's word."
allowed-tools: mcp__plugin_terylon-os_terylon__* mcp__terylon__*
---

# review-plan — a plan at the plan gate

**Mirrors the MCP prompt `plan-review`** that Terylon's `/mcp` serves (`/mcp__terylon__plan-review` in Claude Code). The prompt is the source; this text says the same.

## What to do

> Review plan {the plan's number; the oldest proposed one when none is given} at the plan gate. Read it with plans_list, the leader's policy with policy_get and the memory with memory_get. For each story list its criteria, declared files, size and estimate, the stories it runs after, and anything that collides or looks under-specified; compare the estimate with the day's budget. Recommend approve all, approve some, edit criteria or rethink, and wait for my choice. Then call plan_approve or plan_rethink only on my word: they apply at once, with no confirmation asked.

## What binds it

- **Approving and rethinking are the owner's acts, called only on the owner's word** — never to be helpful, never on a recommendation the owner has not taken up. They apply at once, with no confirmation asked; the owner may as well take them in the pane or the console. The plan gate is where a plan waits for that word, not a gate the owner confirms.
- **Send exactly these shapes**; Terylon validates no schema:

  | Act | Arguments | Note |
  |---|---|---|
  | `plan_approve` | `{plan, stories?, edits?}` | a subset of `stories` approves only those, and the rest are dropped |
  | `plan_rethink` | `{plan, comment}` | the comment is at most 2000 characters |

- **The answer is `{accepted, sentence, commandId, subjectId}`.** `accepted: null` means the leader has not decided within 10 s: say so, and do not send the write again; `leader_answer` with the `commandId` reads the decision later. A refusal, `{refused, status?, console?}` or `accepted: false`, carries a sentence: relay it.
