---
name: forge-ops
description: >-
  Use when another Terylon skill needs Azure DevOps MCP mechanics — URL/ID parsing,
  repo-id resolution, PR/work-item metadata, diffs, threads/comments, eligibility,
  and the ADO posting conventions. Internal mechanics library for other skills, not a user command.
allowed-tools: Read, Grep, Glob, Bash(git *), mcp__plugin_terylon-ado_ado__*
---

# forge-ops — Azure DevOps MCP engine

The ADO **engine** for the Terylon transport skills. It centralizes the mechanical Azure DevOps plumbing — URL/ID parsing, `repositoryId` resolution, PR and work-item metadata fetches, diff recipes, thread/comment operations, eligibility flags, and the ADO posting conventions — into a single source of truth so each transport skill keeps only its own judgment and generation logic.

This skill is a **mechanics library rather than a user command**. Its normal caller is another skill or agent loading it by name; a user invoking it directly gets a catalogue of recipes rather than an action.

The single source of truth is the reference document:

```
${CLAUDE_PLUGIN_ROOT}/skills/forge-ops/references/forge-ops.md
```

## What it owns vs. what it does NOT own

**Owns (mechanics only):** the exact tool names and argument shapes for every ADO call; URL parsing recipes; `repositoryId` resolution; PR/work-item metadata fetches; the two `build-pr-diff` flag profiles; thread/comment request JSON; `threadContext` anchoring (both write and read directions); field encodings and enums; work-item create/update/link shapes; raw eligibility flags and prior-run sentinel detection.

**Does NOT own (caller-side judgment):** footer/version resolution and footer stamping; eligibility *decisions* (draft policy, ownership gate, prior-run BLOCK/ASK/PROCEED); thread classification and client-side filtering; the inline-vs-PR-wide and code-review dot choices; all generation, scoring, and tone. The caller issues its own `mcp__ado__*` calls following these recipes and assembles its own output — **this skill never stamps a footer.**

## Operation catalog

Each operation below maps to a recipe in `references/forge-ops.md`. The reference is the contract; the table is the index. `mcp__ado__*` is the documented short name; at runtime the terylon-ado-provided server is namespaced `mcp__plugin_terylon-ado_ado__*` — callers issue the namespaced form.

| Operation | Tool(s) | Used by | Purpose |
|---|---|---|---|
| `parse-pr-url` | — (string) | review-pr, address-pr-comments, write-pr-description, pr-reviewer | Parse a PR URL into `org` / `project` / `repoName` / `prId` (bash + PowerShell recipes). |
| `parse-item-url` | — (string) | create-user-story, create-feature | Parse a work-item URL or bare number into `org` / `project` / `WI_ID`; a bare number resolves `org` / `project` per §9 (env var + git remote). |
| `resolve-repo-id` | `repo_repository(action="get")` | review-pr, address-pr-comments, write-pr-description, pr-reviewer | Resolve `repositoryId` once per repo per run; accepts a name or a GUID. |
| `fetch-pr-metadata` | `repo_pull_request(action="get")` | review-pr, address-pr-comments, write-pr-description, pr-reviewer | Fetch the PR and report the normalised keys (`isOpen`, `isDraft`, `author`, `sourceBranch`, `targetBranch`, `headSha`, …); the raw object stays here. |
| `eligibility-check` | `repo_pull_request(action="get")` | review-pr, address-pr-comments, write-pr-description, pr-reviewer | Two-phase; returns raw flags + a default recommendation. Decisions stay caller-side. |
| `detect-prior-run` | `repo_pull_request_thread(action="list")`, `wit_work_item(action="get")` | review-pr, address-pr-comments, create-user-story, pr-reviewer | Grep existing threads / child work-item descriptions for the version-less sentinel `Generated with [Claude Code]`. |
| `list-threads` | `repo_pull_request_thread(action="list")` | review-pr, address-pr-comments, pr-reviewer | Return raw PR threads; classification/filtering stay caller-side. |
| `list-thread-comments` | `repo_pull_request_thread(action="list_comments")` | address-pr-comments | Read a thread's comments; the first comment's `parentCommentId` feeds `reply-to-thread`. |
| `post-pr-thread` | `repo_pull_request_thread_write(action="create")` | review-pr, pr-reviewer | Create an inline or PR-wide thread (one op keyed on `threadContext` presence). |
| `reply-to-thread` | `repo_pull_request_thread_write(action="reply")` | address-pr-comments | Reply to an existing thread; does NOT change status. |
| `update-thread-status` | `repo_pull_request_thread_write(action="update_status")` | *(none — exposed for completeness)* | Change a thread's status. Policy-guarded: never auto-resolve to `2` (fixed). |
| `update-pr-description` | `repo_pull_request_write(action="update")` | write-pr-description | Overwrite the PR description field (**≤4000 chars, counted over the whole field**); Claude-region locate-or-append stays caller-side. |
| `fetch-work-item` | `wit_work_item(action="get")` | create-user-story, create-feature | Fetch a work item with `expand="relations"` and report it in the work-item keys (`type`, `title`, `description`, `acceptanceCriteria`, `parent`, `children`, `planning`, …); HTML fields pass as-is. |
| `build-pr-diff` | — (git) | review-pr, write-pr-description, pr-reviewer | Build the local PR diff. TWO flag profiles — never `git diff HEAD`. |
| `create-work-item` | `wit_work_item_write(action="create")` | create-user-story, create-feature | Create a work item from the work-item keys; every multiline key is written Markdown. Cannot set the parent relation. |
| `link-work-item-parent` | `wit_work_item_link_write(action="link")` | create-user-story, create-feature | Link `child` under `parent` (`type: "parent"`), verified by reading the parent back. |
| `update-work-item` | `wit_work_item_write(action="update")` | create-feature, update-work-item-checklist | Replace the given work-item keys on an existing item. JSON-Patch; the single form has no `format` arg, so the reference's `update_batch` form carries it. |
| `create-pull-request` | `repo_pull_request_write(action="create")` | create-pr, develop (terylon-dev) | Create a PR (source→target); can associate work items at creation via `workItems` (space-separated IDs). |
| `check-preconditions` | — (env + git) | create-pr | Verify the adapter can be used at all **before** any other call. |
| `list-pull-requests` | `repo_pull_request(action="list")` | create-pr | List a branch's pull requests, filtered by source ref and status. Returns the normalised `isOpen` / `isDraft` / `author`; the raw numeric status stays here. |
| `resolve-current-user` | — (git config) | address-pr-comments, pr-reviewer | Who the run is acting as, in the form `author` is reported in. |
| `resolve-identity` | `core_get_identity_ids` | create-pr | Turn an email or display name into the identifier reviewer operations take. |
| `add-reviewers` | `repo_pull_request_write(action="update_reviewers")` | create-pr | Add optional reviewers. Cannot make one required. |
| `set-auto-merge` | `repo_pull_request_write(action="update")` | create-pr | Set auto-complete with a merge strategy. Merges immediately when policies already pass. |
| `item-comments-read` | `wit_work_item(action="list_comments")` | update-work-item-checklist | Read an item's comments; also the item half of prior-run detection. |
| `item-comment-post` | `wit_work_item_comment_write(action="add" \| "update")` | update-work-item-checklist | Post a comment, or update the one a previous run left. |
| `list-linked-items` | `repo_pull_request(action="get")`, `wit_work_item(action="get")` | create-pr | Items already linked. The metadata key may be absent even when links exist. |
| `link-work-item-to-pull-request` | `wit_work_item_link_write(action="link_to_pull_request")` | create-pr, develop (terylon-dev) | Link a work item to an existing PR (artifact link). `projectId`/`repositoryId` must be GUIDs, not names. |

### Where each operation's full contract lives

`references/forge-ops.md` carries **one section per operation**, named for it, with the exact arguments, the response shape and the gotchas. Read that section rather than any summary.

**This file deliberately keeps no second index of them.** It had one, it fell nine operations behind the table above, and the table's own heading carried a count that drifted twice. Two lists of one thing is one list plus a liability, and the reference is the copy that cannot go stale, because it *is* the contract.

## Delegation contract

`forge-ops` centralizes **knowledge** only. Every transport skill still issues its own `mcp__ado__*` (runtime: `mcp__plugin_terylon-ado_ado__*`) tool calls following these recipes.

- **Every caller is cross-plugin now.** The transports (`create-pr`, `review-pr`, `write-pr-description`, `address-pr-comments`, the two `update-*-checklist` skills, the `pr-reviewer` agent) live in `terylon-forge`; `create-user-story` and `create-feature` are in `terylon-product`; `develop` and `planner` are in `terylon-dev`. None of them is a sibling of this skill.
- **So they load it by name** — `forge-ops`, plugin-qualified as `terylon-ado:forge-ops` once `resolve-forge` has answered and always when both adapters are enabled. **Never with a path or `@`**: `${CLAUDE_PLUGIN_ROOT}` is plugin-local and would resolve to the *caller's* plugin, and parent-directory relative imports are banned.
- **Nothing declares this plugin as a dependency, deliberately.** The port must not, or an Azure DevOps server installs in every GitHub repository; the consumer enables it instead. A caller that does not find `forge-ops` says so and stops.
- **The caller assembles its own footer.** Footer/version resolve in the *calling* skill's own `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` plus that skill's own name, and the caller passes finished content into the write ops. **This skill never resolves a version and never stamps a footer.**

## Operational caveats

**Enum values are case-sensitive.** `status: "Active"`, not `"active"`. The tool rejects the lowercase form with a validation error listing the accepted values, which is a fast failure but an easy one to hit when the surrounding JSON is all lowercase.
