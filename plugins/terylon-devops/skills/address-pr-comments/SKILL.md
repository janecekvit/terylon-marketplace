---
name: address-pr-comments
description: Use when the user provides an Azure DevOps pull request URL (dev.azure.com/…/pullrequest/N)
  for THEIR OWN PR and asks to apply / address / incorporate the review comments left by others.
  Optional flags --auto and --dry-run.
allowed-tools: Bash(git *), Read, Grep, Glob, Edit, Write, mcp__ado__*, mcp__plugin_terylon-devops_ado__*
---

# Azure DevOps PR — Address Reviewer Comments

You read all open reviewer threads on an Azure DevOps pull request and apply the
requested changes to the local working tree. Inline `` ```suggestion `` blocks become
mechanical Edits. Free-text feedback is interpreted, planned, and applied — with user
confirmation by default.

## Usage

```
/address-pr-comments <PR-URL> [--auto | --dry-run]
```

- `<PR-URL>` — required, of form `https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}`.
- `--auto` — apply mechanical (suggestion-block) edits immediately, no confirmation. Free-text
  threads still pause for review (interpretation is judgment, not mechanics).
- `--dry-run` — never edit; only report the plan in chat.
- Default — summarize the plan in chat, wait for explicit user confirmation
  ("do it" / "apply" / "go"), then apply.

## Prerequisites

- The `ado` MCP server registered (see `plugins/terylon-devops/README.md`). Invoked on demand by the MCP host — no manual install needed beyond the `.mcp.json` entry.
- Local clone of the PR's source branch checked out (you'll edit files in place).
- Git worktree clean OR user is fine with mixing reviewer-driven edits into existing changes.

## Workflow

### 1. Parse PR URL and resolve the repository id

Follow the **parse-pr-url** and **resolve-repo-id** recipes in the `ado-mcp` engine skill (`Read ${CLAUDE_PLUGIN_ROOT}/skills/ado-mcp/references/ado-mcp.md`). Extract `org`, `project`, `repoName`, `prId` from the URL, then call the documented `repo_get_repo_by_name_or_id` recipe yourself to obtain `repositoryId` (use the returned `id` for all subsequent calls). You issue the `mcp__plugin_terylon-devops_ado__*` calls — `ado-mcp` only supplies the recipe and exact argument shapes.

### 2. Eligibility check

Fetch PR metadata using the **fetch-pr-metadata** recipe in `ado-mcp` (`repo_get_pull_request_by_id`; exact arguments in `${CLAUDE_PLUGIN_ROOT}/skills/ado-mcp/references/ado-mcp.md`). You make the call.

Skip with a chat message if any of:

- `status` is `completed` or `abandoned` (nothing to address — already merged/closed).
- `isDraft` is `true` (no reviewers yet).
- `createdBy.uniqueName` is NOT the current user (this skill is for addressing feedback on YOUR PR; reviewing someone else's is `review-pr`).

**Ownership gate (this skill's own rule — keep here, do NOT delegate):** to identify the current user, compare `createdBy.uniqueName` from the PR response against `git config user.email` — Azure DevOps `uniqueName` is typically the user's email address. Only proceed if the PR is YOUR OWN.

### 3. Fetch active threads

Fetch threads using the **list-threads** recipe in `ado-mcp` (`repo_list_pull_request_threads`; arguments in `${CLAUDE_PLUGIN_ROOT}/skills/ado-mcp/references/ado-mcp.md`). You make the call.

Then filter the result client-side (this skill's own logic — keep here):
- Keep only threads with `status` of `1` (active) or `5` (pending).
- Drop system threads (`comments[0].commentType == 3`).
- Drop threads whose `comments[0].content` contains `Generated with [Claude Code]`
  (those came from `review-pr` and the user may want to handle those separately).

### 4. Classify each thread

For each remaining thread, classify by its FIRST comment's content:

| Pattern | Class | Action |
|---------|-------|--------|
| Contains `` ```suggestion `` block AND has `threadContext.filePath` | **mechanical** | Read file, replace lines `rightFileStart.line..rightFileEnd.line - 1` with the suggestion block content. |
| Has `threadContext.filePath` but no suggestion block | **inline-text** | Reviewer commented on a specific line; apply judgment. Show the user the comment + surrounding code, propose an edit. |
| No `threadContext` (PR-wide thread) | **conceptual** | Reviewer raised a broader concern. Surface it for human decision; do NOT auto-edit. |

### 5. Build a plan

For each thread, produce:

```yaml
- threadId: <int>
  class: mechanical | inline-text | conceptual
  file: <path or "(PR-wide)">
  startLine: <int or null>
  endLine: <int or null>
  reviewer: <displayName>
  excerpt: <first 200 chars of comment>
  proposedEdit: |        # null for conceptual
    <new content for those lines>
  rationale: <1 sentence why this edit addresses the comment>
```

### 6. Branch on flags

- `--dry-run` → print the plan as the chat summary below. STOP. Make no edits.
- `--auto` → apply all `mechanical` items via `Edit` immediately. Print a summary of what
  was applied. List `inline-text` and `conceptual` items separately and STOP — wait for
  the user to direct each one individually.
- default → print the chat summary. Wait for `do it` / `apply` / `go`. Then apply
  `mechanical` items. For `inline-text` and `conceptual`, walk through them one at a time
  with the user.

### 7. Apply edits via `Edit` tool

For each mechanical item:

1. `Read` the file to confirm current content matches `rightFileStart..rightFileEnd`.
2. If indentation in the suggestion block doesn't match the file's tabs/spaces, normalise to
   the file's existing convention (Azure DevOps suggestions can lose tab/space fidelity).
3. `Edit` with `old_string` = exact current lines, `new_string` = suggestion block content.
4. Record the thread-id → file:line mapping for step 8.

For each inline-text or conceptual item that the user approves: same Edit cycle, but with
the user's chosen edit text.

5. (Optional) After applying a free-text reviewer suggestion, invoke `code-review` (the review
   engine from `terylon-git`, loaded by name) with
   `--scope=staged` over the just-edited file. If it returns a `blocker` or `issue` finding
   on the applied change, surface it before posting the thread reply — the reviewer's
   suggestion may have introduced a rule violation. Mechanical (suggestion-block) edits skip
   this check.

### 8. (Optional) Reply on each addressed thread

**Re-check eligibility first.** Re-fetch the PR metadata via the `fetch-pr-metadata` recipe and skip posting if `status` is no longer active or `isDraft` flipped true. The snapshot from step 2 is stale by now: applying the edits took time, and default mode waited for the user on top of that. The sibling `review-pr` does this at its step 6.

The stakes here are lower than in `write-pr-description` — `repo_reply_to_comment` is additive, so the worst case is a reply landing on a PR someone just completed. That is noise rather than data loss, but it is noise with your name on it.

Per thread that was successfully addressed, post a short reply ending with the standard footer:

```
Addressed in local working tree (commit pending). <one-line description of the edit>.

---
*🤖 Generated with [Claude Code](https://claude.ai/code) — address-pr-comments@<plugin-version> · <model> / <effort>*
```

`<plugin-version>` is read at runtime from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` (parse the `version` field). `<model>` is the model the run executes under (e.g. `opus-4.8`) — the skill knows it from itself, as no environment variable exposes it. `<effort>` comes from the `CLAUDE_EFFORT` environment variable (e.g. `xhigh`); **when `CLAUDE_EFFORT` is unset, omit the entire ` · <model> / <effort>` segment.** The substring `Generated with [Claude Code]` is the sentinel for prior-run detection — everything variable sits after that stable prefix.

Follow the **reply-to-thread** recipe in `ado-mcp` (`Read ${CLAUDE_PLUGIN_ROOT}/skills/ado-mcp/references/ado-mcp.md`) for the exact arguments, then post via `repo_reply_to_comment` yourself. **NO-AUTO-CLOSE:** do NOT update thread status to `2` (fixed) — leave that for the reviewer or for the user to decide.

This step is gated by user confirmation (or `--auto`). On `--dry-run`, never post.

### 9. Commit

Do NOT commit without explicit user permission, and never push. After edits are applied (and optionally posted), report status and stop — the user decides when the work gets committed.

## Chat summary format (default + --dry-run)

```markdown
### PR feedback — <PR title> (#<id>)

<N> active reviewer threads (excluding Claude's own).

**Mechanical (<n> threads, ready to apply):**
1. `<file>:<line>` — <reviewer>: "<excerpt>"
   → <one-line edit description>

**Inline-text (<n> threads, need interpretation):**
1. `<file>:<line>` — <reviewer>: "<excerpt>"
   → Proposed: <one-line proposal>

**Conceptual (<n> PR-wide threads):**
1. <reviewer>: "<excerpt>"
   → No automatic action; user decides.
```

Then: `Reply "do it" to apply mechanical edits. Inline / conceptual items will be walked through individually.`

## Common mistakes

- Treating threads posted by `review-pr` as reviewer feedback — would create
  a self-referential loop. Filter them out in step 3 (match on `Generated with [Claude Code]`).
- Reading a stale file: PR may have been updated since the reviewer commented. If
  `rightFileStart..rightFileEnd` no longer points to the lines the suggestion targeted,
  surface the conflict instead of guessing.
- Auto-closing threads after edit: tempting, but the reviewer is the one who marks "fixed".
  Do not call `mcp__ado__repo_update_pull_request_thread` with `status: 2` from this skill.
- Mixing reviewer edits into unrelated in-flight changes silently. If `git status` shows
  uncommitted work outside the touched files, mention it in the summary.
- Indentation drift between the suggestion block and the file (tabs vs spaces). Normalise
  to the file's convention before applying.

## Verification

1. `/address-pr-comments <my-PR-url> --dry-run` on a PR with at least one
   `` ```suggestion `` block reviewer thread. Expect: chat summary with that thread under
   "Mechanical". No edits.
2. Re-run without `--dry-run`. Expect: same summary, prompt for confirmation, then `Edit`
   applies the suggestion. `git diff` shows exactly the suggested change.
3. (Optional) Approve thread reply step. Expect: reviewer thread now has a child comment
   from Claude saying "Addressed in local working tree".
