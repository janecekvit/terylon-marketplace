---
name: show-story
description: "Use when the owner asks about one Terylon story in flight — \"how is 333 doing\", \"why is it blocked\", \"summarise the story in the session\" — its step, cost, attempts, pull request and verdicts, and what it needs."
allowed-tools: mcp__plugin_terylon-os_terylon__*, mcp__terylon__*
---

# show-story — one story in flight

**Mirrors the MCP prompt `story`** that Terylon's `/mcp` serves (`/mcp__terylon__story` in Claude Code). The prompt is the source; this text says the same.

## What to do

> Show me story {the story's number}: read it with story_get and work_in_flight — its step n of m, cost against budget, hours, attempts, timeline, pull request and verdicts. If it is blocked, say why and offer story_unblock with an answer; if its run is going nowhere, offer story_stop; if it is stuck or wrong, offer story_return with a note or story_abandon; if it was kept in Terylon's own list, offer story_accept. These are my acts: call one only when I have said so, and tell me the leader's answer.

## What binds it

- **Offer; act only on the owner's word.** Unblocking, stopping, returning, abandoning and accepting are acts the owner takes — here, in the pane or in the console. Call one only on the owner's word, never to be helpful; once called, it needs nothing more confirmed.
- **Send exactly these shapes**; Terylon validates no schema:

  | Act | Arguments | Only when |
  |---|---|---|
  | `story_unblock` | `{story, note?}` | the story is blocked |
  | `story_stop` | `{story}` | the story is dispatched or running |
  | `story_return` | `{story, note}` | the story is verified or blocked |
  | `story_abandon` | `{story, reason?}` | |
  | `story_accept` | `{story}` | the story is kept in Terylon's own list |

- **The answer is `{accepted, sentence, commandId, subjectId}`.** `accepted: null` means the leader has not decided within 10 s: say so and do not retry. A refusal, `{refused, status?, console?}` or `accepted: false`, carries a sentence: relay it.
- **Merge is the one gate**, and it is not taken here: `merge-gate` walks a verified story's evidence, and the owner confirms the exact commit with the passkey in the console.
- **This is what the pane's "Shrň mi to v session" asks for**: the `terylon-pane` mod posts the request into the session, and this skill answers it.
