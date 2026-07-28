---
name: ado-mcp
description: >-
  Use when another Terylon skill needs Azure DevOps MCP mechanics — URL/ID parsing,
  repo-id resolution, PR/work-item metadata, diffs, threads/comments, eligibility,
  and the ADO posting conventions. Internal mechanics library for other skills, not a user command.
allowed-tools: Read, Grep, Glob, Bash(git *), mcp__ado__*, mcp__plugin_terylon-devops_ado__*
---

# ado-mcp — Azure DevOps MCP engine

The ADO **engine** for the Terylon transport skills. It centralizes the mechanical Azure DevOps plumbing — URL/ID parsing, `repositoryId` resolution, PR and work-item metadata fetches, diff recipes, thread/comment operations, eligibility flags, and the ADO posting conventions — into a single source of truth so each transport skill keeps only its own judgment and generation logic.

This skill is a **mechanics library rather than a user command**. Its normal caller is another skill or agent loading it by name; a user invoking it directly gets a catalogue of recipes rather than an action.

The single source of truth is the reference document:

```
${CLAUDE_PLUGIN_ROOT}/skills/ado-mcp/references/ado-mcp.md
```

## What it owns vs. what it does NOT own

**Owns (mechanics only):** the exact tool names and argument shapes for every ADO call; URL parsing recipes; `repositoryId` resolution; PR/work-item metadata fetches; the two `build-pr-diff` flag profiles; thread/comment request JSON; `threadContext` anchoring (both write and read directions); field encodings and enums; work-item create/update/link shapes; raw eligibility flags and prior-run sentinel detection.

**Does NOT own (caller-side judgment):** footer/version resolution and footer stamping; eligibility *decisions* (draft policy, ownership gate, prior-run BLOCK/ASK/PROCEED); thread classification and client-side filtering; the inline-vs-PR-wide and code-review dot choices; all generation, scoring, and tone. The caller issues its own `mcp__ado__*` calls following these recipes and assembles its own output — **this skill never stamps a footer.**

## Operation catalog (19 operations)

Each operation below maps to a recipe in `references/ado-mcp.md`. The reference is the contract; the table is the index. `mcp__ado__*` is the documented short name; at runtime the terylon-devops-provided server is namespaced `mcp__plugin_terylon-devops_ado__*` — callers issue the namespaced form.

| Operation | Tool(s) | Used by | Purpose |
|---|---|---|---|
| `parse-pr-url` | — (string) | review-pr, address-pr-comments, write-pr-description, pr-reviewer | Parse a PR URL into `org` / `project` / `repoName` / `prId` (bash + PowerShell recipes). |
| `parse-wi-url` | — (string) | create-user-story, create-feature | Parse a work-item URL or bare number into `org` / `project` / `WI_ID`; a bare number resolves `org` / `project` per §9 (env var + git remote). |
| `resolve-repo-id` | `repo_get_repo_by_name_or_id` | review-pr, address-pr-comments, write-pr-description, pr-reviewer | Resolve `repositoryId` once per repo per run; accepts a name or a GUID. |
| `fetch-pr-metadata` | `repo_get_pull_request_by_id` | review-pr, address-pr-comments, write-pr-description, pr-reviewer | Fetch the whole PR object (`status`, `isDraft`, `createdBy`, refs, `lastMergeSourceCommit`). |
| `eligibility-check` | `repo_get_pull_request_by_id` | review-pr, address-pr-comments, write-pr-description, pr-reviewer | Two-phase; returns raw flags + a default recommendation. Decisions stay caller-side. |
| `detect-prior-run` | `repo_list_pull_request_threads`, `wit_get_work_item` | review-pr, address-pr-comments, create-user-story, pr-reviewer | Grep existing threads / child work-item descriptions for the version-less sentinel `Generated with [Claude Code]`. |
| `list-threads` | `repo_list_pull_request_threads` | review-pr, address-pr-comments, pr-reviewer | Return raw PR threads; classification/filtering stay caller-side. |
| `list-thread-comments` | `repo_list_pull_request_thread_comments` | address-pr-comments | Read a thread's comments; the first comment's `parentCommentId` feeds `reply-to-thread`. |
| `post-pr-thread` | `repo_create_pull_request_thread` | review-pr, pr-reviewer | Create an inline or PR-wide thread (one op keyed on `threadContext` presence). |
| `reply-to-thread` | `repo_reply_to_comment` | address-pr-comments | Reply to an existing thread; does NOT change status. |
| `update-thread-status` | `repo_update_pull_request_thread` | *(none — exposed for completeness)* | Change a thread's status. Policy-guarded: never auto-resolve to `2` (fixed). |
| `update-pr-description` | `repo_update_pull_request` | write-pr-description | Overwrite the PR description field (**≤4000 chars, counted over the whole field**); Claude-region locate-or-append stays caller-side. |
| `fetch-work-item` | `wit_get_work_item` | create-user-story, create-feature | Fetch a work item with `expand="relations"`; HTML fields pass as-is. |
| `build-pr-diff` | — (git) | review-pr, write-pr-description, pr-reviewer | Build the local PR diff. TWO flag profiles — never `git diff HEAD`. |
| `create-work-item` | `wit_create_work_item` | create-user-story | Create a work item; set field values incl. Markdown `System.Description`. Cannot set the parent relation. |
| `link-work-item-parent` | `wit_work_items_link` | create-user-story | Link a work item as a child of a parent (`type: "parent"`). |
| `update-work-item` | `wit_update_work_item` | create-feature | Update fields on an existing work item (e.g. `System.Title`, `System.Description`). JSON-Patch; no `format` arg — HTML is the field default. |
| `create-pull-request` | `repo_create_pull_request` | develop (terylon-dev) | Create a PR (source→target); can associate work items at creation via `workItems` (space-separated IDs). |
| `link-work-item-to-pull-request` | `wit_link_work_item_to_pull_request` | develop (terylon-dev) | Link a work item to an existing PR (artifact link). `projectId`/`repositoryId` must be GUIDs, not names. |

### Per-operation contracts (pointers into the reference)

Read `${CLAUDE_PLUGIN_ROOT}/skills/ado-mcp/references/ado-mcp.md` for exact arguments and gotchas. The mapping below points to the section that holds each operation's full IN/OUT contract.

- **`parse-pr-url`** — IN: PR URL. OUT: `org`, `project`, `repoName`, `prId`. See *Operation catalog* (§4) and *URL parsing* (§9) for the bash (`sed -E`) and PowerShell (`[regex]`) recipes; when no URL is given, *Resolving org / project without a URL* (§9) gives the resolution order.
- **`parse-wi-url`** — IN: WI URL or bare number. OUT: `org`, `project`, `WI_ID`. See §4 and *URL parsing* (§9); a bare number resolves `org` / `project` per *Resolving org / project without a URL* (§9) — `TERYLON_ADO_ORG` for the org, the git remote for the project.
- **`resolve-repo-id`** — IN: repo name or GUID. OUT: `repositoryId`. See §4 and *`repositoryId` resolution invariant* (§5): resolve once per repo per run before any `repo_*` call, then cache.
- **`fetch-pr-metadata`** — IN: `repositoryId`, `prId`, `project`. OUT: the whole PR object. See §4; the eligibility flags it exposes are detailed in *Eligibility two-phase* (§14).
- **`eligibility-check`** — IN: PR metadata. OUT: raw flags (`status`, `isDraft`, `createdBy`) + default recommendation. See *Eligibility two-phase* (§14): phase-1 before read, phase-2 re-check before write; call `detect-prior-run` before phase-1; read-only skills are exempt from the write half. **All decisions stay caller-side.**
- **`detect-prior-run`** — IN: PR threads or child work-item descriptions. OUT: prior-run found/not-found. See *Prior-run detection* (§15): sentinel `Generated with [Claude Code]`; PR path `comments[0].content`, WI path `fields["System.Description"]` of the parent's children.
- **`list-threads`** — IN: `repositoryId`, `prId`, `project`. OUT: raw threads. See §4; classification and filtering are caller-side.
- **`list-thread-comments`** — IN: thread id. OUT: comments. See §4; use the first comment's `parentCommentId` for `reply-to-thread`.
- **`post-pr-thread`** — IN: thread JSON (with or without `threadContext`). OUT: created thread. See *Request JSON shapes* (§7), *Field encodings & enums* (§6), and *`threadContext` anchoring* (§8) for inline (write-side line math) vs PR-wide shapes. Create comments with `commentType` 1; skip system type 3.
- **`reply-to-thread`** — IN: thread id, `parentCommentId`, reply body. OUT: posted reply. See §4 and §7. Does NOT change thread status (no auto-resolve to `2`).
- **`update-thread-status`** — IN: thread id, status. OUT: updated thread. See *Field encodings & enums* (§6) for the status enum and the co-located no-auto-resolve-to-`2` prohibition. Exposed for completeness; currently used by no skill.
- **`update-pr-description`** — IN: `pullRequestId`, `repositoryId`, `project`, full description. OUT: updated PR. See *Request JSON shapes* (§7); the field is overwritten whole, so the caller must locate-or-append its Claude region first.
- **`fetch-work-item`** — IN: WI id, `expand="relations"`. OUT: work item. See *Work item structure* (§11): fields used; HTML fields pass as-is / tag-strip; `System.Parent` is a top-level field, not a relation.
- **`build-pr-diff`** — IN: source/target refs (strip `refs/heads/`), `lastMergeSourceCommit.commitId`. OUT: local diff. See *Diff recipes — TWO profiles* (§13): (a) review-pr, (b) write-pr-description. Never `git diff HEAD`; the three-dot reviewer view stays inside the `code-review` engine, not here.
- **`create-work-item`** — IN: `project`, `workItemType`, `fields: [{name, value, format?}]`. OUT: new work item `id`. See *Operation catalog* (§4, `create-work-item`): set `System.Title`, `System.Description` with `format: "Markdown"`, inherited `System.AreaPath` / `System.IterationPath`, optional StoryPoints/Priority/Tags. Sets field values only — it CANNOT set the parent relation; link it separately.
- **`link-work-item-parent`** — IN: `updates: [{ id: <childId>, linkToId: <parentId>, type: "parent" }]`. OUT: linked work item. See *Operation catalog* (§4, `link-work-item-parent`): `id` is the new story, `linkToId` is the Feature, `type: "parent"` makes the story a child of the Feature. The `wit_add_child_work_items` one-call alternative is documented there but omits StoryPoints/Priority/Tags.
- **`update-work-item`** — IN: `id`, `updates: [{ op, path, value }]` (JSON-Patch; e.g. `op: "replace"`, `path: "/fields/System.Description"`). OUT: updated work item. See *Operation catalog* (§4, `update-work-item`): updates field values on an existing item; **no `format` argument** (unlike `create-work-item`). `System.Description` defaults to HTML — pass an HTML string for HTML content. Confirm-before-write and any footer stay caller-side.
- **`create-pull-request`** — IN: `repositoryId`, `sourceRefName`, `targetRefName`, `title` (required); optional `project` (required when `repositoryId` is a name), `description` (≤4000 chars), `isDraft`, `labels`, `workItems` (space-separated WI IDs). OUT: new PR (`pullRequestId`). See *Operation catalog* (§4, `create-pull-request`): pass **full** `refs/heads/<branch>` ref names (do NOT strip `refs/heads/` — that stripping is only for diff building, §13); resolve `repositoryId` via `resolve-repo-id` (§5). `workItems` associates work items at creation, an alternative to `link-work-item-to-pull-request`.
- **`link-work-item-to-pull-request`** — IN: `projectId`, `repositoryId`, `pullRequestId`, `workItemId` (optional `pullRequestProjectId`). OUT: linked work item. See *Operation catalog* (§4, `link-work-item-to-pull-request`): **`projectId` and `repositoryId` must be GUIDs, not names** — resolve both via `resolve-repo-id` (the repo object carries its `project.id`). This is the WI↔PR artifact link, distinct from `link-work-item-parent` (WI↔WI).

## Delegation contract

`ado-mcp` centralizes **knowledge** only. Every transport skill still issues its own `mcp__ado__*` (runtime: `mcp__plugin_terylon-devops_ado__*`) tool calls following these recipes.

- **terylon-devops callers** (`review-pr`, `address-pr-comments`, `write-pr-description`, the `pr-reviewer` agent): `Read ${CLAUDE_PLUGIN_ROOT}/skills/ado-mcp/references/ado-mcp.md` (a sibling skill in the same plugin — `${CLAUDE_PLUGIN_ROOT}` resolves to terylon-devops) for the exact arguments, then issue the calls themselves.
- **Cross-plugin callers** (`create-user-story`, `create-feature` in terylon-product; `develop` in terylon-dev): load this skill **by name** (`ado-mcp`) — never with a path or `@`, since `${CLAUDE_PLUGIN_ROOT}` is plugin-local and parent-directory relative imports across plugins are banned. Both plugins declare `dependencies: ["terylon-devops"]`, so `ado-mcp` is always loadable. Then consult its `references/ado-mcp.md`.
- **The caller assembles its own footer.** Footer/version resolve in the *calling* skill's own `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` plus that skill's own name, and the caller passes finished content into the write ops. **This skill never resolves a version and never stamps a footer.**

## Operational caveats

**Enum values are case-sensitive.** `status: "Active"`, not `"active"`. The tool rejects the lowercase form with a validation error listing the accepted values, which is a fast failure but an easy one to hit when the surrounding JSON is all lowercase.
