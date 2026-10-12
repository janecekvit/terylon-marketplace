---
name: review-plan
description: "Use when a Terylon plan waits at the plan gate and the owner wants it reviewed — \"look at plan 41\", \"what is waiting to be approved\" — before approving all, some or edited stories, or sending it back."
allowed-tools: mcp__plugin_terylon-os_terylon__*, mcp__terylon__*
---

# review-plan — a plan at the plan gate

**Mirrors the MCP prompt `plan-review`** that Terylon's `/mcp` serves (`/mcp__terylon__plan-review` in Claude Code). The prompt is the source; this text says the same.

## What to do

> Review plan {the plan's number; the oldest proposed one when none is given} at the plan gate. Read it with plans_list, the leader's policy with policy_get and the memory with memory_get. For each story list its criteria, declared files, size and estimate, the stories it runs after, and anything that collides or looks under-specified; compare the estimate with the day's budget. Recommend approve all, approve some, edit criteria or rethink, and wait for my choice. Then call plan_approve or plan_rethink; Terylon asks me to confirm in its own form.

## What binds it

- **The person confirms `plan_approve` and `plan_rethink` in Terylon's form.** Pending means pending: pass the console's link on and stop.
