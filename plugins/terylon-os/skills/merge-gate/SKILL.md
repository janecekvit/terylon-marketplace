---
name: merge-gate
description: "Use when the owner wants to merge a verified Terylon story, asks what proves it, or says \"merge 327\" / \"return it\" — walks the verdict and its evidence, then hands the decision to the merge gate the person confirms."
allowed-tools: mcp__plugin_terylon-os_terylon__*, mcp__terylon__*
---

# merge-gate — a verified story's evidence, then merge or return

**Mirrors the MCP prompt `merge-gate`** that Terylon's `/mcp` serves (`/mcp__terylon__merge-gate` in Claude Code). The prompt is the source; this text says the same.

## What to do

> Take story {the story's number; every story waiting for its merge when none is given} through the merge gate. Read it with merge_gate: its environment's address for me to click through, the verdict's commit and checks, what the brain weighed, which criteria the evidence covers and which it does not. Say plainly what is unproven. Then wait for my word: story_merge to merge, or story_return with my note. Terylon asks me to confirm the exact commit in its own form.

## What binds it

- **The person confirms, never the model.** `story_merge` sends Terylon's form to the person; when the client cannot show it, or they decline, the tool answers *pending* with the console's link. Pass the link on and stop — never retry, never look for another route.
- **Say what is unproven before what is green.** A criterion with no evidence is the first line, not a footnote.
