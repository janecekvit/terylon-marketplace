---
name: merge-gate
description: "Use when the owner wants to merge a verified Terylon story, asks what proves it, or says \"merge 327\" / \"return it\" — walks the verdict and its evidence, then hands the decision to the one gate, merge, which the owner makes in the console."
allowed-tools: mcp__plugin_terylon-os_terylon__* mcp__terylon__*
---

# merge-gate — a verified story's evidence, then merge or return

**Mirrors the MCP prompt `merge-gate`** that Terylon's `/mcp` serves (`/mcp__terylon__merge-gate` in Claude Code). The prompt is the source; this text says the same.

## What to do

> Take story {the story's number; every story waiting for its merge when none is given} through the merge gate. Read it with merge_gate: its environment's address for me to click through, the verdict's commit and checks, what the brain weighed, which criteria the evidence covers and which it does not. Say plainly what is unproven. Then wait for my word: I merge in the console, on the commit with the green verdict — give me its link — or story_return with my note, which applies at once.

## What binds it

- **Merge is the one gate, and the owner makes it in the console, never the model.** No tool merges: the owner presses merge on the story's gate in the console, on the commit with the green verdict. Give the console's link and stop — never look for another route.
- **Returning is the owner's act, called only on the owner's word, and it applies at once, with no confirmation asked**: `story_return` with `{story, note}`, for a verified or blocked story. Its answer is `{accepted, sentence, commandId, subjectId}`; `accepted: null` means the leader has not decided within 10 s — say so, and do not send the write again; `leader_answer` with the `commandId` reads the decision later — and a refusal's sentence is relayed as it stands.
- **Say what is unproven before what is green.** A criterion with no evidence is the first line, not a footnote.
