---
name: review-plan
description: "Use when a Terylon plan waits for the owner's approval and the owner wants it reviewed — \"look at plan 41\", \"what is waiting to be approved\" — before approving all, some or edited stories, or sending it back."
allowed-tools: mcp__plugin_terylon-os_terylon__*, mcp__terylon__*
---

# review-plan — a plan waiting for the owner's approval

**Mirrors the MCP prompt `plan-review`** that Terylon's `/mcp` serves (`/mcp__terylon__plan-review` in Claude Code). The prompt is the source; this text says the same.

## What to do

> Review plan {the plan's number; the oldest proposed one when none is given}, which waits for my approval. Read it with plans_list, the leader's policy with policy_get and the memory with memory_get. For each story list its criteria, declared files, size and estimate, the stories it runs after, and anything that collides or looks under-specified; compare the estimate with the day's budget. Recommend approve all, approve some, edit criteria or rethink, and wait for my choice. Approving and rethinking are my acts: once I have chosen, call plan_approve with the plan, and the stories I approve or my edits when I approve only some or edited ones, or plan_rethink with the plan and my comment. Tell me the leader's answer.

## What binds it

- **Approving and rethinking are the owner's acts, called only on the owner's word** — never to be helpful, never on a recommendation the owner has not taken up. The owner may as well take them in the pane or the console.
- **Send exactly these shapes**; Terylon validates no schema:

  | Act | Arguments | Note |
  |---|---|---|
  | `plan_approve` | `{plan, stories?, edits?}` | a subset of `stories` approves only those, and the rest are dropped |
  | `plan_rethink` | `{plan, comment}` | the comment is at most 2000 characters |

- **The answer is `{accepted, sentence, commandId, subjectId}`.** `accepted: null` means the leader has not decided within 10 s: say so and do not retry. A refusal, `{refused, status?, console?}` or `accepted: false`, carries a sentence: relay it.
