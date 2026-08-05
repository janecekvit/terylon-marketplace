---
name: address-pr-comments
description: Use when the user provides a pull request URL from either forge (dev.azure.com/…/pullrequest/N
  or github.com/…/pull/N) for THEIR OWN PR and asks to apply / address / incorporate the review comments left by others.
  Optional flags --auto and --dry-run.
allowed-tools: Bash(git *), Read, Grep, Glob, Edit, Write, Bash(gh *), mcp__plugin_terylon-ado_ado__*
---

# Pull Request — Address Reviewer Comments

You read all open reviewer threads on a pull request, on either forge, and apply the
requested changes to the local working tree. Inline `` ```suggestion `` blocks become
mechanical Edits. Free-text feedback is interpreted, planned, and applied — with user
confirmation by default.

## Usage

```
/address-pr-comments <PR-URL> [--auto | --dry-run]
```

- `<PR-URL>` — required, in either forge's PR URL — `dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}` or `github.com/{owner}/{repo}/pull/{n}`. Its host is what `resolve-forge` reads first.
- `--auto` — apply mechanical (suggestion-block) edits immediately, no confirmation. Free-text
  threads still pause for review (interpretation is judgment, not mechanics).
- `--dry-run` — never edit; only report the plan in chat.
- Default — summarize the plan in chat, wait for explicit user confirmation
  ("do it" / "apply" / "go"), then apply.

## Prerequisites

- **An adapter enabled** — `terylon-ado` or `terylon-github`. The port registers no server of its own: the adapter supplies `forge-ops`, and on Azure DevOps the `ado` MCP server with it. `resolve-forge` decides which one a run targets, and a missing adapter stops the run rather than being worked around.
- Local clone of the PR's source branch checked out (you'll edit files in place).
- Git worktree clean OR user is fine with mixing reviewer-driven edits into existing changes.

## Workflow

### 1. Parse PR URL and resolve the repository id

Resolve the forge first (`resolve-forge`), then follow the **parse-pr-url** and **resolve-repo-id** operations in that adapter's `forge-ops` (loaded by name, plugin-qualified when both adapters are enabled). Keep what `resolve-repo-id` returns and pass it on unchanged — it is a GUID on one forge and an `{owner}/{repo}` string on the other. **You issue the calls**; `forge-ops` supplies only the recipe and the exact argument shapes, and names the tool or command each resolves to.

### 2. Eligibility check

Fetch PR metadata using the **fetch-pr-metadata** operation; its arguments are in the adapter's `forge-ops` reference. You make the call.

Skip with a chat message if any of:

- `isOpen` is false (nothing to address — already merged, closed or abandoned).
- `isDraft` is true (no reviewers yet).
- `author` is NOT the current user, as `resolve-current-user` reports them (this skill addresses feedback on YOUR PR; reviewing someone else's is `review-pr`).

**All three come from `eligibility-check`'s normalised verdict.** Comparing a raw field against English words matches nothing on either forge, and the gate then fails **open**.

**Ownership gate (this skill's own rule — keep here, do NOT delegate):** compare the author `fetch-pr-metadata` returns against the local identity, and proceed only if the PR is **your own**.

Both sides of the comparison come from the port: `author` from `eligibility-check`, and the local identity from **`resolve-current-user`**. They are reported in the same form on purpose — an email on one forge, a handle on the other, but never mixed — because comparing a handle against an email never matches and leaves the gate permanently shut.

**Do not fetch the local identity yourself.** A platform command here is the port asking a question it already answers, and it is how one forge's vocabulary gets back in. **If the two cannot be compared, stop** rather than assuming ownership.

### 3. Fetch active threads

Fetch threads using the **list-threads** operation; its arguments are in the adapter's `forge-ops` reference. You make the call.

Then filter the result client-side (this skill's own logic — keep here). **Filter on what `list-threads` declares, never on one forge's raw enum**: a filter written against Azure DevOps status numbers matches nothing on GitHub, so the skill would report "no active threads" on a pull request full of them and exit successfully. A silent no-op is worse than a stop, so where a forge cannot express one of these, say so and **keep** the thread rather than dropping it.

- Keep only threads whose **`isResolved`** is false. That is the normalised key `list-threads` returns on **both** forges, not one forge's field name. Where a body cannot determine it — one reports it only over GraphQL, so a cheaper read leaves it unknown — it says unknown rather than `false`, and an unknown thread is **kept**.
- Drop threads whose **`isSystem`** is true. One body derives it from a comment type and the other never sets it; the transport reads the one key either way.
- Drop threads whose first comment contains `Generated with [Claude Code]`
  (those came from `review-pr` and the user may want to handle those separately).

### 4. Classify each thread

For each remaining thread, classify by its FIRST comment's content:

| Pattern | Class | Action |
|---------|-------|--------|
| Contains `` ```suggestion `` block AND is anchored to a file | **mechanical** | Read the file and replace the anchored span with the suggestion block's content. **Take the span from `list-threads`, not from a raw field**: one forge reports an end one past the last covered line and the other reports the line itself, so hard-coding either arithmetic edits one line too many on the other. |
| Anchored to a file but with no suggestion block | **inline-text** | Reviewer commented on a specific line; apply judgment. Show the user the comment + surrounding code, propose an edit. |
| No file anchor (PR-wide thread) | **conceptual** | Reviewer raised a broader concern. Surface it for human decision; do NOT auto-edit. |

### 5. Build a plan

For each thread, produce:

```yaml
- threadId: <opaque handle — an integer on one forge, a node id string on the other. Pass it back; never parse it>
  class: mechanical | inline-text | conceptual
  file: <path or "(PR-wide)">
  startLine: <int or null>
  endLine: <int or null>
  author: <the first comment's `author`, as `list-threads` reports it>
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

1. `Read` the file to confirm its current content still matches the anchored span.
2. If indentation in the suggestion block doesn't match the file's tabs/spaces, normalise to
   the file's existing convention (a suggestion block can lose tab/space fidelity in transit on either forge).
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

**Re-check eligibility first.** Re-fetch the PR metadata via the `fetch-pr-metadata` recipe and skip posting if `isOpen` went false or `isDraft` flipped true. The snapshot from step 2 is stale by now: applying the edits took time, and default mode waited for the user on top of that. The sibling `review-pr` does this at its step 6.

The stakes here are lower than in `write-pr-description` — the `reply-to-thread` operation is additive, so the worst case is a reply landing on a PR someone just completed. That is noise rather than data loss, but it is noise with your name on it.

Per thread that was successfully addressed, post a short reply ending with the standard footer:

```
Addressed in local working tree (commit pending). <one-line description of the edit>.

---
*🤖 Generated with [Claude Code](https://claude.ai/code) — address-pr-comments@<plugin-version> · <model> / <effort>*
```

`<plugin-version>` is read at runtime from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` (parse the `version` field). `<model>` is the model the run executes under (e.g. `opus-4.8`) — the skill knows it from itself, as no environment variable exposes it. `<effort>` comes from the `CLAUDE_EFFORT` environment variable (e.g. `xhigh`); **when `CLAUDE_EFFORT` is unset, omit the entire ` · <model> / <effort>` segment.** The substring `Generated with [Claude Code]` is the sentinel for prior-run detection — everything variable sits after that stable prefix.

Follow the **reply-to-thread** operation for the exact arguments, then post it yourself. **NO-AUTO-CLOSE:** never mark a thread resolved or fixed — that is the reviewer's or the user's judgement, on either forge.

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
- Reading a stale file: the PR may have been updated since the reviewer commented. If the
  anchored span no longer points at the lines the suggestion targeted, surface the conflict
  instead of guessing.
- Auto-closing threads after edit: tempting, but the reviewer is the one who marks "fixed".
  Do not run the `update-thread-status` operation with `status: 2` from this skill.
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
