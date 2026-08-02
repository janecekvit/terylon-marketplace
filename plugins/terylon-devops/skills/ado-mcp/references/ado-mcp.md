# Azure DevOps MCP — canonical reference

Single source of truth for all Azure DevOps (ADO) MCP mechanics used across the Terylon plugins. This document is the heavy reference behind the `ado-mcp` engine skill. The transport callers (`review-pr`, `address-pr-comments`, `write-pr-description` and the `pr-reviewer` agent in `terylon-devops`; `create-user-story`, `create-feature` in `terylon-product`; `develop` in `terylon-dev`) delegate their ADO recipes here and issue their own tool calls following these recipes.

---

## 1. Overview & scope

`ado-mcp` owns **all mechanical ADO operations**: URL/ID parsing, `repositoryId` resolution, PR and work-item metadata fetches, local diff construction, thread/comment listing and posting, batch work-item lookup, parent rollup, and the ADO posting conventions (field encodings, `threadContext` anchoring, markdown rendering).

It does **NOT** own any judgment or generation. The following always stay in the calling skill:

- **Footer / version resolution** — the caller stamps its own footer from its own `plugin.json` (see §16).
- **Eligibility *decisions*** — `ado-mcp` returns raw flags; the caller decides draft policy, ownership gating, and the prior-run BLOCK / ASK / PROCEED branch (see §14).
- **Thread classification** — mechanical vs inline-text vs conceptual is caller-owned.
- **Review diff dot-choice** — the three-dot symmetric reviewer view lives in the `code-review` engine (in `terylon-git`, loaded by name), not here (see §13).
- **All generation / judgment** — confidence scoring, description authoring, user-story and feature drafting.

This file is the single source of truth; when a recipe changes, it changes here and nowhere else.

---

## 2. MCP server prerequisites & tool namespace

All ADO calls use tools from the `ado` MCP server, declared in `plugins/terylon-devops/.mcp.json`. `terylon-product` and `terylon-dev` inherit it via `dependencies: ["terylon-devops"]`.

**Tool namespace — documented vs runtime:**

- This document writes tool names in the short documented form `mcp__ado__*` (e.g. `repo_pull_request(action="get")`).
- **At runtime the server is namespaced by its providing plugin: `mcp__plugin_terylon-devops_ado__*`** (e.g. `mcp__plugin_terylon-devops_ado__repo_pull_request(action="get")`). This is the form you actually call, and the form that must appear in each calling skill's `allowed-tools`.
- The two are the same tool. The bare `mcp__ado__*` names in this document are shorthand for the namespaced runtime form.

**WIT tool-name drift:** the `wit_*` tools were added in a later version of `@azure-devops/mcp` and tool names have drifted between versions. In particular the comment-listing tool is `wit_work_item(action="list_comments")` (NOT `wit_work_item(action="list_comments")`, which does not exist at runtime). Verify the exact names installed locally with the inspector:

```
npx @azure-devops/mcp --list-tools
```

---

## 3. Tool catalog — the 2.9.0 surface

The pinned server is **`@azure-devops/mcp@2.9.0`**, which consolidated the whole surface into **action-based tools**: one tool per resource, an `action` parameter selecting the operation. Call them in the runtime namespace `mcp__plugin_terylon-devops_ado__*`.

**Three things break silently when a call is written from memory of the old surface**, and all three fail the whole call rather than degrading:

| Trap | Consequence |
|---|---|
| Every schema is `additionalProperties: false` | one unknown parameter rejects the entire call |
| `project` became **`project`** | the old name is now an unknown parameter — see above |
| The old one-tool-per-operation names are **gone** | `repo_pull_request_write(action="update")` and its siblings do not resolve at all |

### Reads

| Tool | Actions | Key parameters |
|---|---|---|
| `repo_repository` | `get`, `list` | `repositoryNameOrId`, `project` |
| `repo_pull_request` | `get`, `list`, `list_by_commits` | `pullRequestId`, `repositoryId`, `project`, `includeWorkItemRefs?`, `includeChangedFiles?`, `status?`, `sourceRefName?` |
| `repo_pull_request_thread` | `list`, `list_comments` | `repositoryId`, `pullRequestId` (**both required**), `project`, `threadId` (for `list_comments`), `status?` |
| `wit_work_item` | `get`, `get_batch`, `list_comments`, `my`, `list_revisions`, `list_for_iteration`, `get_type` | see the per-action parameter table below |
| `wit_query` | `get`, `get_results`, `wiql` | `wiql`, `project`, `top?` |
| `core_get_identity_ids` | — (no action) | `searchFilter` |

### Writes

| Tool | Actions | Key parameters |
|---|---|---|
| `repo_pull_request_write` | `create`, `update`, `update_reviewers`, `vote` | `repositoryId`, `project`, `sourceRefName`, `targetRefName`, `title`, `description` (**≤4000**), `workItems?`, `isDraft?`, `autoComplete?`, `mergeStrategy?`, `reviewerIds?`, `reviewerAction?` |
| `repo_pull_request_thread_write` | `create`, `reply`, `update_status` | `repositoryId`, `pullRequestId` (**both required**), `content`, `threadId`, `filePath?`, `rightFileStartLine?`, `rightFileEndLine?`, `status?` |
| `wit_work_item_write` | `create`, `update`, `update_batch`, `add_child` | `workItemType`, `fields[]`, `id`, `updates[]`, `parentId`, `items[]` |
| `wit_work_item_comment_write` | `add`, `update` | `workItemId`, `text`, `commentId` (for `update`), `format?` |
| `wit_work_item_link_write` | `link`, `unlink`, `link_to_pull_request`, `add_artifact_link` | `updates[]`, `projectId` / `repositoryId` (**GUIDs**), `pullRequestId`, `workItemId` |

### `wit_work_item` — the parameter name changes per action

This one is a genuine trap: the work item's id is called something different depending on what you are doing with it.

| Action | Id parameter | Other |
|---|---|---|
| `get` | `id` | `expand` **or** `fields` — never both |
| `get_batch` | `ids[]` | `fields[]` |
| `list_comments` | `workItemId` | `top?` |
| `list_revisions` | `workItemId` | `expand?`, `skip?`, `top?` |

### Migration from the pre-2.9.0 names

Prose written before the consolidation names tools that no longer exist. Translate it with this table rather than trusting it:

| Was | Is |
|---|---|
| `repo_get_repo_by_name_or_id` | `repo_repository(action="get")` |
| `repo_get_pull_request_by_id` | `repo_pull_request(action="get")` |
| `repo_create_pull_request` | `repo_pull_request_write(action="create")` |
| `repo_update_pull_request` | `repo_pull_request_write(action="update")` |
| `repo_list_pull_request_threads` | `repo_pull_request_thread(action="list")` |
| `repo_list_pull_request_thread_comments` | `repo_pull_request_thread(action="list_comments")` |
| `repo_create_pull_request_thread` | `repo_pull_request_thread_write(action="create")` |
| `repo_update_pull_request_thread` | `repo_pull_request_thread_write(action="update_status")` |
| `repo_reply_to_comment` | `repo_pull_request_thread_write(action="reply")` |
| `wit_get_work_item` | `wit_work_item(action="get")` |
| `wit_get_work_items_batch_by_ids` | `wit_work_item(action="get_batch")` |
| `wit_list_work_item_comments`, `wit_get_work_item_comments` | `wit_work_item(action="list_comments")` |
| `wit_create_work_item` | `wit_work_item_write(action="create")` |
| `wit_update_work_item` | `wit_work_item_write(action="update")` |
| `wit_add_child_work_items` | `wit_work_item_write(action="add_child")` |
| `wit_work_items_link` | `wit_work_item_link_write(action="link")` |
| `wit_link_work_item_to_pull_request` | `wit_work_item_link_write(action="link_to_pull_request")` |
| `wit_add_work_item_comment` | `wit_work_item_comment_write(action="add")` |
| `wit_update_work_item_comment` | `wit_work_item_comment_write(action="update")` |

**A rename is not always the whole change.** `repo_pull_request_thread_write(action="update_status")` became `update_status`, which is narrower than the name it replaced; thread creation moved its inline anchor from a `threadContext` object to flat `rightFile*` parameters. Where this document's recipes disagree with the table above, the table is newer.

### Responses omit what they just did

Several writes return a trimmed object that does not contain the field the call set. Measured: `repo_pull_request(action="get", includeWorkItemRefs=true)` returned **no `workItemRefs` key at all** on a PR that demonstrably had a linked work item, and the `update` response strips `autoCompleteSetBy` and `completionOptions`.

**Never report an outcome from the response that produced it.** Read the state back — and for work-item links, read it from the *work item* (`wit_work_item(action="get", expand="Relations")`), which is where the relation actually lives.

### Batch reads are all-or-nothing

`wit_work_item(action="get_batch")` returns `null` for the **entire batch** when a single id is unknown, so a batch of untrusted ids tells you nothing about the good ones. Validate untrusted candidates one call at a time. A `null` also conflates not-found, deleted and no-permission — report "could not be resolved", never "does not exist".

---

## 4. Operation catalog

One subsection per operation: its IN/OUT contract, the tool(s) it uses, and which skills consume it. Full mechanics (recipes, JSON shapes, gotchas) are in the cited sections below.

### `parse-pr-url`
- **In:** PR URL string. **Out:** `org`, `project`, `repoName`, `prId`.
- **Tools:** none (string parsing). **Consumers:** review-pr, address-pr-comments, write-pr-description, pr-reviewer.
- **Recipe:** §9 (bash + PowerShell).

### `parse-wi-url`
- **In:** WI URL string or bare number. **Out:** `org`, `project`, `WI_ID`.
- **Tools:** none. **Consumers:** create-user-story, create-feature.
- **Recipe:** §9. Bare number → use directly; `org` / `project` come from the resolution order in *Resolving org / project without a URL* (§9) — `TERYLON_ADO_ORG` for the org, git remote for the project.

### `parse-vstfs`
- **In:** `vstfs://` artifact-link URL. **Out:** `projectGuid`, `repoGuid`, `prId`.
- **Tools:** none. **Consumers:** *(none today — exposed for completeness)*.
- **Recipe:** §10 (bash + net-new PowerShell). Only `rel=ArtifactLink` / `attributes.name='Pull Request'` relations carry it.

### `resolve-repo-id`
- **In:** `repoName` (or GUID) + `project`. **Out:** `repositoryId` (`id` GUID).
- **Tools:** `repo_repository(action="get")`. **Consumers:** review-pr, address-pr-comments, write-pr-description, pr-reviewer.
- **Invariant:** resolve once per repo per run; cache (§5).

### `fetch-pr-metadata`
- **In:** `prId`, `repositoryId`, `project`. **Out:** whole PR object (`status`, `isDraft`, `createdBy`, `sourceRefName`, `targetRefName`, `lastMergeSourceCommit`, `description`).
- **Tools:** `repo_pull_request(action="get")`. **Consumers:** review-pr, address-pr-comments, write-pr-description, pr-reviewer.

### `eligibility-check`
- **In:** PR metadata. **Out:** raw flags (`status`, `isDraft`, `createdBy.uniqueName`) + default recommendation.
- **Tools:** `repo_pull_request(action="get")`. **Consumers:** review-pr, address-pr-comments, write-pr-description, pr-reviewer.
- **Decisions stay skill-side** (§14). Two-phase: phase-1 before read, phase-2 re-check before write.

### `detect-prior-run`
- **In:** PR threads or WI comments. **Out:** boolean (prior Claude post present).
- **Tools:** `repo_pull_request_thread(action="list")` (PR) / `wit_work_item(action="get")` (WI). **Consumers:** review-pr, address-pr-comments, create-user-story, pr-reviewer.
- **Sentinel:** version-less `Generated with [Claude Code]` (§15).

### `list-threads`
- **In:** `prId`, `repositoryId`, `project`. **Out:** raw threads `[{ id, status, comments: [{ id, content, commentType, ... }] }]`.
- **Tools:** `repo_pull_request_thread(action="list")`. **Consumers:** review-pr, address-pr-comments, pr-reviewer.
- Classification/filtering stay skill-side.

### `list-thread-comments`
- **In:** `prId`, `repositoryId`, `project`, `threadId`. **Out:** comments in that thread.
- **Tools:** `repo_pull_request_thread(action="list_comments")`. **Consumers:** address-pr-comments.
- The first comment's `id` feeds `reply-to-thread` as `parentCommentId`.

### `post-pr-thread`
- **In:** comment body, `status`, optional `threadContext`. **Out:** created thread.
- **Tools:** `repo_pull_request_thread_write(action="create")`. **Consumers:** review-pr, pr-reviewer.
- **Merged op:** inline (with `threadContext`) and PR-wide (no `threadContext`) keyed on `threadContext` presence (§7, §8).

### `reply-to-thread`
- **In:** `threadId`, `parentCommentId`, reply `content`. **Out:** created reply.
- **Tools:** `repo_pull_request_thread_write(action="reply")`. **Consumers:** address-pr-comments.
- Does **not** change thread status.

### `update-thread-status`
- **In:** `threadId`, `status`. **Out:** updated thread.
- **Tools:** `repo_pull_request_thread_write(action="update_status")`. **Consumers:** *(none today — exposed for completeness)*.
- **Policy-guarded — never auto-resolve to `2` (fixed)** (§6).

### `update-pr-description`
- **In:** `prId`, `repositoryId`, `project`, full `description` string (**≤4000 chars**). **Out:** updated PR.
- **Tools:** `repo_pull_request_write(action="update")`. **Consumers:** write-pr-description.
- Overwrites the whole `description` field; the Claude-region locate-or-append logic stays skill-side.
- **`description` is capped at 4000 characters** and the cap counts the *whole* field, not just the region you are writing. Over the limit the call fails validation before reaching ADO (`too_big`), so nothing is written — the failure is safe but the work is wasted. Measure before calling, and remember that a locate-or-append write carries any content that was already there.

### `fetch-work-item`
- **In:** `WI_ID`, `project`, `expand`. **Out:** WI fields + relations.
- **Tools:** `wit_work_item(action="get")`. **Consumers:** create-user-story, create-feature.
- Use `expand="relations"`; HTML fields pass as-is (§11).

### `fetch-work-items-batch`
- **In:** `ids[]`, `project`, explicit `fields[]`. **Out:** `[{ id, rev, fields, url }, ...]`.
- **Tools:** `wit_work_item(action="get_batch")`. **Consumers:** *(none today — exposed for completeness)*.
- Explicit `fields` selector; deleted IDs silently omitted; ~200/call (§12).

### `parent-rollup`
- **In:** WIs from a batch (with `System.Parent`). **Out:** `parentId → (type, title)` lookup.
- **Tools:** `wit_work_item(action="get_batch")`. **Consumers:** *(none today — exposed for completeness)*.
- `System.Parent` is top-level; two-pass; one level only (§12).

### `wi-comments-read`
- **In:** `WI_ID`, `project`. **Out:** `{ totalCount, comments: [{ id, text, createdBy }] }`.
- **Tools:** `wit_work_item(action="list_comments")`. **Consumers:** *(none today — exposed for completeness)*.
- Doubles as the WI `detect-prior-run` source (grep `comments[].text`).

### `wi-comment-post`
- **In:** `WI_ID`, `project`, `text` (already includes the caller's footer). **Out:** `{ id }`.
- **Tools:** `wit_work_item_comment_write(action="add")`. **Consumers:** *(none today — exposed for completeness)*.
- Plain text; print the returned `id`.

### `build-pr-diff`
- **In:** PR refs + `lastMergeSourceCommit`. **Out:** local `git diff` text.
- **Tools:** none (git). **Consumers:** review-pr, write-pr-description, pr-reviewer.
- **TWO flag profiles — see §13.** Never `git diff HEAD`.

### `create-work-item`
- **In:** `project` (resolved per *Resolving org / project without a URL* (§9) when not taken from a URL), `workItemType` (e.g. `"User Story"`), `fields: [{name, value, format?}]`. **Out:** new work item `id`.
- **Tool:** `wit_work_item_write(action="create")`. **Consumers:** create-user-story, create-feature.
- **Recipe:** set `System.Title`; `System.Description` with **`format: "Markdown"`**; `System.AreaPath` and `System.IterationPath` (inherited from the parent); optionally `Microsoft.VSTS.Scheduling.StoryPoints`, `Microsoft.VSTS.Common.Priority`, `System.Tags`.
- **Gotcha (parent):** sets *field values* only — it CANNOT set the parent relation. Link the parent in a separate step (`link-work-item-parent`).
- **Gotcha (checkboxes):** `- [ ]` renders as an interactive checkbox **only when the field is written with `format: "Markdown"`**. ADO defaults every multiline field to HTML, where the same line is a plain bullet or a literal `[ ]`. Pass `format: "Markdown"` for **each** multiline field independently — `System.Description` and `Microsoft.VSTS.Common.AcceptanceCriteria` do not inherit from one another, and setting only the first leaves a story whose description renders and whose criteria do not.

### `link-work-item-parent`
- **In:** `updates: [{ id: <childId>, linkToId: <parentId>, type: "parent" }]`. **Out:** linked work item.
- **Tool:** `wit_work_item_link_write(action="link")`. **Consumers:** create-user-story.
- **Recipe:** `id` is the work item being updated (the new story); `linkToId` is the Feature; `type: "parent"` makes the story a child of the Feature.
- **Alternative (one call, limited fields):** `wit_work_item_write(action="add_child")(parentId, workItemType, items:[{title, description, format, areaPath?, iterationPath?}])` creates AND links a child in one call — but supports only title/description/format/area/iteration, NOT StoryPoints/Priority/Tags. Use create-work-item + link-work-item-parent when any extra metadata is needed.

### `update-work-item`
- **In:** `id`, `updates: [{ op, path, value }]` (JSON-Patch). **Out:** updated work item.
- **Tool:** `wit_work_item_write(action="update")`. **Consumers:** create-feature.
- **Recipe:** patch existing fields — `op: "replace"` (or the schema default `add`, which ADO upserts), `path: "/fields/<FieldRef>"` (e.g. `/fields/System.Title`, `/fields/System.Description`), `value: "<new value>"`.
- **Gotcha (no format arg):** unlike `create-work-item`'s `fields:[{name,value,format?}]`, `wit_work_item_write(action="update")` takes JSON-Patch ops with **no per-field `format`** in the `fields` shape. A plain field op writes into whatever encoding the field already has, so a Markdown string sent to an HTML field renders as literal `#` and `-` characters.

- **Converting an existing field to Markdown.** The encoding lives at its own patch path, so an update *can* switch it — patch the format and the content in the same call, format first:

  ```
  wit_work_item_write(action="update")(
    id: <WI_ID>,
    updates: [
      { op: "add", path: "/multilineFieldsFormat/System.Description", value: "Markdown" },
      { op: "add", path: "/fields/System.Description",                value: "<markdown body>" }
    ]
  )
  ```

  Verified on a real Feature: `multilineFieldsFormat["System.Description"]` flips from `html` to `markdown` and the body renders as Markdown thereafter. This is the repair path for a work item created as HTML — recreating it is not necessary.

- **Every multiline field this repo writes should be Markdown.** HTML costs the interactive `- [ ]` checkbox, needs hand-written `<p>` / `<ul><li>` tags, and renders tables and code spans worse. Create with `format: "Markdown"`; if you inherit an HTML field, convert it with the patch above rather than writing HTML into it.

- **Gotcha (angle brackets are eaten on update).** ADO sanitises anything that looks like an HTML tag, and the two calls differ in how:

  | Call | `feat/<slug>` arrives as |
  |---|---|
  | `wit_work_item_write(action="create")` | `feat/&lt;slug&gt;` — escaped, renders correctly |
  | `wit_work_item_write(action="update")` | `feat/` — **the tag is silently dropped** |

  Observed on Story #110: `create-workspace creates a worktree on \`feat/<slug>\`` came back as `` `feat/` ``, losing the placeholder without any error. Nothing in the response signals it, so the loss is only visible by reading the stored value back.

  When updating, write placeholders in a form that is not tag-shaped — `feat/` plus a description in prose, `{slug}`, or `feat/SLUG`. Reserve `<…>` for content you create in one call and never patch.

- **Acceptance criteria belong in `Microsoft.VSTS.Common.AcceptanceCriteria`.** It is the field named for them and the one a reader looks at. Set its `format` to `"Markdown"` as well — it defaults to HTML independently of `System.Description`, so a story can easily end up with a Markdown description and an HTML criteria field whose checkboxes are dead. Do not duplicate the list into the description: two copies drift, and nothing marks which is current.
- **Gotcha (blast radius):** title edits are higher blast-radius than description edits — the caller confirms a title change separately. The confirm-before-write decision and any footer stay caller-side (this engine never stamps a footer, §16).

### `create-pull-request`
- **In:** `repositoryId`, `sourceRefName`, `targetRefName`, `title` (required); `project` (required when `repositoryId` is a name), `description?` (≤4000), `isDraft?`, `labels?`, `workItems?`. **Out:** new PR (`pullRequestId`).
- **Tool:** `repo_pull_request_write(action="create")`. **Consumers:** develop (terylon-dev).
- **Recipe:** pass **full ref names** (`refs/heads/<branch>`) for `sourceRefName` / `targetRefName` — do NOT strip `refs/heads/` here (that stripping is only for diff building, §13). Resolve `repositoryId` once via `resolve-repo-id` (§5); pass `project` when `repositoryId` is a name. `description` is capped at 4000 chars — keep the generated PR body within the limit.
- **Associate work items:** `workItems` (space-separated WI IDs, e.g. `"101055 98792"`) links work items at creation — an alternative to a separate `link-work-item-to-pull-request` call. Draft/eligibility decisions and footer stay caller-side.

### `link-work-item-to-pull-request`
- **In:** `projectId`, `repositoryId`, `pullRequestId`, `workItemId` (optional `pullRequestProjectId` for cross-project links). **Out:** linked work item.
- **Tool:** `wit_work_item_link_write(action="link_to_pull_request")`. **Consumers:** develop (terylon-dev).
- **Gotcha (GUIDs, not names):** `projectId` must be the **project GUID** (the tool rejects a project name) and `repositoryId` must be the **repo GUID**. Resolve both via `resolve-repo-id` (§5) — `repo_repository(action="get")` returns the repo object with its `project.id`. Most other ops accept a project *name*; this one does not.
- **Vs `link-work-item-parent`:** that op links a work item to a parent *work item* (`wit_work_item_link_write(action="link")`); this op links a work item to a *pull request* (an artifact link). Different tools, different purposes.

---

## 5. `repositoryId` resolution invariant

A PR URL gives you `repoName`, not the GUID `repositoryId` that every `repo_*` call needs. **Resolve `repositoryId` once per repo per run, before any other `repo_*` call, and cache it** for all subsequent calls in that run.

```
repo_repository(action="get")(repositoryNameOrId=<repoName>, project=<project>)
→ returns { id: "<uuid>", name: "...", ... }
```

`repo_repository(action="get")` accepts a name **or** a GUID, so it also resolves a `repoGuid` from a parsed `vstfs://` link (§10) to a repo name for `git fetch`. In a multi-repo run, cache one `repositoryId` per repo.

---

## 6. Field encodings & enums

- **`commentType`** — `1` = text, `2` = code-change, `3` = system. **Always create threads/comments with `1`.** When reading, **skip system threads (`commentType == 3`)**.
- **Thread `status`** — `1` active, `2` fixed, `3` won't fix (wontfix), `4` closed, `5` pending, `6` byDesign.
  - **Skills create threads with `1` (active).**
  - **NO-AUTO-RESOLVE prohibition (co-located here on purpose):** do **NOT** auto-resolve a thread to `2` (fixed). Leave status changes for the reviewer or the user to decide. This applies to `update-thread-status` and to every skill that replies to threads.
- **Line offsets** — 1-based (both `line` and `offset`).
- **File sides** — `rightFileStart` / `rightFileEnd` anchor to the post-change (right) side; use these for added/modified lines. `leftFileStart` / `leftFileEnd` anchor to the pre-change (left) side; use them only for comments on deleted lines, and omit otherwise.

---

## 7. Request shapes

2.9.0 takes **flat parameters**, not the nested request bodies the REST API uses. The old `comments[]` array and `threadContext` object are gone from the write side; both survive on the **read** side, which is why §8 still matters.

### Inline suggestion thread

`repo_pull_request_thread_write(action="create")`

| Parameter | Value |
|---|---|
| `repositoryId`, `pullRequestId` | both **required**, at the top level |
| `project` | required when `repositoryId` is a name |
| `filePath` | `/path/from/repo/root.cpp` — leading `/`, forward slashes, no leading dot |
| `rightFileStartLine` | `N` |
| `rightFileEndLine` | `N+1` for a single line; `M+1` for a span `N..M` — always **one past** the last line covered |
| `rightFileStartOffset`, `rightFileEndOffset` | `1` |
| `content` | the comment body, including the suggestion block and the footer |
| `status` | `Active` (a word here, not the numeric enum reads return) |

The content of a ` ```suggestion ` block replaces the covered lines, so its indentation must match the file exactly — tabs against tabs.

### PR-wide thread

The same call **without** `filePath` and without the `rightFile*` parameters. Their absence is what makes the thread PR-wide; there is no separate tool.

### Reply to a thread

`repo_pull_request_thread_write(action="reply")` with `threadId` and `content`. **No `parentCommentId`** — 2.9.0 dropped it, and a reply attaches to the thread rather than to a comment within it.

### Update a thread's status

`repo_pull_request_thread_write(action="update_status")` with `threadId` and `status`. This is narrower than the `update` it replaced: **status is the only thing it can change.**

### Update a PR description

`repo_pull_request_write(action="update")` with `pullRequestId`, `repositoryId`, `project` and `description`.

**`description` is capped at 4000 characters and the schema rejects an over-length value outright** (`too_big`) — it does not truncate, and nothing is written. Measure the whole field, not the part you generated.

### Post a work-item comment

`wit_work_item_comment_write(action="add")` with `workItemId`, `text`, and `format: "Markdown"`.

### Create a work item

`wit_work_item_write(action="create")` with `workItemType` and **`fields` as an array of `{name, value, format?}`** — not an object keyed by field name. `format: "Markdown"` belongs on each large text field individually.

```
fields = [
  { name: "System.Title",       value: "<title>" },
  { name: "System.Description", value: "<markdown>", format: "Markdown" },
  { name: "Microsoft.VSTS.Common.AcceptanceCriteria", value: "<markdown>", format: "Markdown" }
]
```

It **cannot set the parent relation** — link it afterwards with `wit_work_item_link_write(action="link", updates=[{id, linkToId, type: "parent"}])`.

### Update a work item

`wit_work_item_write(action="update")` with `id` and **`updates` as JSON-Patch operations** — `[{op, path, value}]`, where `path` is `/fields/<ReferenceName>`.

### Batch work-item lookup

`wit_work_item(action="get_batch")` with `ids[]` and an explicit `fields[]` selector. Without the selector the response carries every field of every item, which is large enough to matter.

**One unknown id nulls the whole batch** — see §3. Untrusted ids go one call at a time.

---

## 8. `threadContext` anchoring (BOTH directions)

`filePath` MUST start with `/`, use forward slashes, and have no leading dot (e.g. `/src/foo.cpp`, never `./src/foo.cpp` or `src\foo.cpp`).

**Write side (anchoring a new thread to a line).** 2.9.0 takes these as **flat parameters** — `rightFileStartLine`, `rightFileEndLine`, `rightFileStartOffset`, `rightFileEndOffset` — not as the nested `threadContext` object of the REST API and of pre-2.9.0 tools. The arithmetic is unchanged:

- Single line `N` → `rightFileStartLine = N`, `rightFileEndLine = N+1`.
- Span `N..M` inclusive → `rightFileStartLine = N`, `rightFileEndLine = M+1`.

So the end line is always **one past** the last line you intend to cover.

(Verified against a live inline thread.)

**Read side (inverse — mapping an existing thread anchor back to file lines).** Reads still return the nested `threadContext` object, so the two directions genuinely differ in shape: flat going out, nested coming back.

When you read a thread's `threadContext` to find which lines a comment covers (e.g. `address-pr-comments` locating the edited region), invert the write-side math: the actual last edited line is `rightFileEnd.line - 1` (NOT `rightFileEnd.line`). The covered range is therefore `rightFileStart.line .. rightFileEnd.line - 1`. The `- 1` is load-bearing — omitting it produces an off-by-one that edits or quotes one line too many.

**Suggestion-block indentation** must match the file exactly (tabs vs spaces). Azure DevOps shows whitespace churn in the diff preview if it differs, and an applied suggestion with the wrong indentation corrupts the line.

---

## 9. URL parsing

### Pull request URL

```
https://dev.azure.com/{org}/{project}/_git/{repoName}/pullrequest/{prId}
                       ^^^   ^^^^^^^         ^^^^^^^^             ^^^^
```

In bash:

```bash
url="https://dev.azure.com/janecekvit/Dev/_git/TerylonMarketplace/pullrequest/12345"
ORG=$(echo "$url"     | sed -E 's|.*dev\.azure\.com/([^/]+)/.*|\1|')
PROJECT=$(echo "$url" | sed -E 's|.*dev\.azure\.com/[^/]+/([^/]+)/.*|\1|')
REPO=$(echo "$url"    | sed -E 's|.*/_git/([^/]+)/.*|\1|')
PRID=$(echo "$url"    | sed -E 's|.*/pullrequest/([0-9]+).*|\1|')
```

In PowerShell:

```powershell
$url   = "https://dev.azure.com/janecekvit/Dev/_git/TerylonMarketplace/pullrequest/12345"
$ORG   = ([regex]'dev\.azure\.com/([^/]+)/').Match($url).Groups[1].Value
$PROJ  = ([regex]'dev\.azure\.com/[^/]+/([^/]+)/').Match($url).Groups[1].Value
$REPO  = ([regex]'/_git/([^/]+)/').Match($url).Groups[1].Value
$PRID  = ([regex]'/pullrequest/(\d+)').Match($url).Groups[1].Value
```

### Work item URL

```
https://dev.azure.com/{org}/{project}/_workitems/edit/{id}
                       ^^^   ^^^^^^^                   ^^^
```

In bash:

```bash
wi_url="https://dev.azure.com/janecekvit/Dev/_workitems/edit/98310"
ORG=$(echo "$wi_url"     | sed -E 's|.*dev\.azure\.com/([^/]+)/.*|\1|')
PROJECT=$(echo "$wi_url" | sed -E 's|.*dev\.azure\.com/[^/]+/([^/]+)/.*|\1|')
WI_ID=$(echo "$wi_url"   | sed -E 's|.*/edit/([0-9]+).*|\1|')
```

In PowerShell:

```powershell
$wi_url  = "https://dev.azure.com/janecekvit/Dev/_workitems/edit/98310"
$ORG     = ([regex]'dev\.azure\.com/([^/]+)/').Match($wi_url).Groups[1].Value
$PROJECT = ([regex]'dev\.azure\.com/[^/]+/([^/]+)/').Match($wi_url).Groups[1].Value
$WI_ID   = ([regex]'/edit/(\d+)').Match($wi_url).Groups[1].Value
```

**Bare-number shortcut:** if the user passes a bare number, skip URL parsing and use it directly as `WI_ID` (or `prId`). `ORG` / `PROJECT` then come from the resolution order below, not from the (absent) URL.

### Resolving `org` / `project` without a URL

When there is no URL to parse — a bare work-item number, or a skill grounding against the current repository — resolve `org` and `project` in this order, first hit wins:

| Source | Supplies | Precedence |
|---|---|---|
| An explicit URL argument | `org`, `project`, `repo`, `id` | highest — a pasted URL always wins |
| `TERYLON_ADO_ORG` / `TERYLON_ADO_PROJECT` env vars | `org`, `project` | override |
| `git remote get-url origin` of the consuming repository | `org`, `project`, `repo` | the normal path |
| `az devops configure --defaults` | `org`, `project` | last resort |

**`org` must equal the server's startup organisation.** The `ado` server is launched with `${TERYLON_ADO_ORG:-janecekvit}` (see the plugin `.mcp.json`), so it can only talk to that one organisation. Take `org` from `TERYLON_ADO_ORG` (falling back to `janecekvit`) — the same source the server used — rather than from the remote, so the two never disagree. Derive `project` and `repo` from the remote.

Deriving `project` / `repo` from the git remote, in bash:

Both the HTTPS form (`https://dev.azure.com/{org}/{project}/_git/{repo}`) and the SSH form (`git@ssh.dev.azure.com:v3/{org}/{project}/{repo}`) carry the same three segments; the SSH form has no `/_git/`, so `repo` is its last path segment. In bash:

```bash
REMOTE=$(git remote get-url origin 2>/dev/null)
REMOTE=$(echo "$REMOTE" | sed -E 's#//[^@/]+@#//#')   # drop any "user@" before the host

case "$REMOTE" in
    *dev.azure.com*)      # https://dev.azure.com/{org}/{project}/_git/{repo}  and  git@ssh.dev.azure.com:v3/{org}/{project}/{repo}
        PROJECT=$(echo "$REMOTE" | sed -E 's#.*dev\.azure\.com[:/](v3/)?([^/]+)/([^/]+).*#\3#')
        ;;
    *visualstudio.com*)   # https://{org}.visualstudio.com/{project}/_git/{repo}  (legacy)
        PROJECT=$(echo "$REMOTE" | sed -E 's#.*visualstudio\.com/([^/]+)/.*#\1#')
        ;;
esac

case "$REMOTE" in
    */_git/*) REPO=$(echo "$REMOTE" | sed -E 's#.*/_git/([^/]+).*#\1#') ;;   # HTTPS
    *)        REPO=$(echo "$REMOTE" | sed -E 's#.*/([^/]+)$#\1#') ;;         # SSH: last segment
esac
REPO="${REPO%.git}"

ORG="${TERYLON_ADO_ORG:-janecekvit}"
PROJECT="${TERYLON_ADO_PROJECT:-$PROJECT}"
```

In PowerShell:

```powershell
$REMOTE = (git remote get-url origin 2>$null) -replace '//[^@/]+@', '//'

if ($REMOTE -match 'dev\.azure\.com[:/](?:v3/)?([^/]+)/([^/]+)')
{
    $PROJECT = $Matches[2]
}
elseif ($REMOTE -match '//([^.]+)\.visualstudio\.com/([^/]+)')
{
    $PROJECT = $Matches[2]
}

if     ($REMOTE -match '/_git/([^/]+)') { $REPO = $Matches[1] }   # HTTPS
elseif ($REMOTE -match '/([^/]+)$')     { $REPO = $Matches[1] }   # SSH: last segment
if ($REPO) { $REPO = $REPO -replace '\.git$', '' }

$ORG     = if ($env:TERYLON_ADO_ORG)     { $env:TERYLON_ADO_ORG }     else { "janecekvit" }
$PROJECT = if ($env:TERYLON_ADO_PROJECT) { $env:TERYLON_ADO_PROJECT } else { $PROJECT }
```

---

## 10. `vstfs://` parsing

PR links inside a work item's `relations` use this format:

```
vstfs:///Git/PullRequestId/<projectGuid>%2F<repoGuid>%2F<prId>
```

The separators are URL-encoded `%2F` (= `/`). **URL-decode `%2F` → `/` first, then split** on `/` into `projectGuid`, `repoGuid`, `prId`.

**Which relations carry it:** only relations where `rel == "ArtifactLink"` **and** `attributes.name == "Pull Request"`. Ignore all other relations.

In bash:

```bash
vstfs_url="vstfs:///Git/PullRequestId/abc123%2Fdef456%2F12345"

encoded="${vstfs_url##*PullRequestId/}"
decoded="${encoded//%2F//}"
IFS='/' read -r projectGuid repoGuid prId <<< "$decoded"

echo "projectGuid=$projectGuid  repoGuid=$repoGuid  prId=$prId"
```

In PowerShell (net-new — the source doc had bash only):

```powershell
$vstfs_url = "vstfs:///Git/PullRequestId/abc123%2Fdef456%2F12345"

$encoded = $vstfs_url -replace '.*PullRequestId/', ''
$decoded = $encoded -replace '%2F', '/'
$projectGuid, $repoGuid, $prId = $decoded -split '/'

Write-Output "projectGuid=$projectGuid  repoGuid=$repoGuid  prId=$prId"
```

Then resolve `repoGuid` to a repo name with `resolve-repo-id` (§5) for `git fetch`.

---

## 11. Work item structure

`wit_work_item(action="get")` with `expand="relations"` returns:

```json
{
  "id": 98310,
  "fields": {
    "System.Title": "...",
    "System.Description": "<p>HTML content</p>",
    "System.WorkItemType": "User Story",
    "System.State": "Active",
    "System.Parent": 98000,
    "Microsoft.VSTS.Common.AcceptanceCriteria": "<p>...</p>",
    "Microsoft.VSTS.TCM.ReproSteps": "<p>...</p>"
  },
  "relations": [
    {
      "rel": "ArtifactLink",
      "url": "vstfs:///Git/PullRequestId/<projectGuid>%2F<repoGuid>%2F<prId>",
      "attributes": { "name": "Pull Request" }
    }
  ]
}
```

- **Fields used:** `System.Title`, `System.Description`, `System.WorkItemType`, `System.State`, `Microsoft.VSTS.Common.AcceptanceCriteria`, `Microsoft.VSTS.TCM.ReproSteps`.
- **Encoding varies per work item — read it, do not assume.** `System.Description`, `AcceptanceCriteria` and `ReproSteps` carry whatever format they were written with; `multilineFieldsFormat` in the response says which. Items this marketplace writes are Markdown; older ones and anything created through the ADO web UI are typically HTML. Check the field's format before parsing, and pass the content to a generation sub-agent as-is rather than guessing at its syntax.
- **`System.Parent`** is a **top-level field** (under `fields`), not a relation. It holds the parent WI's numeric ID, or is absent if the WI is top-level.

---

## 12. Batch WI lookup & parent rollup

### Batch lookup

When you already have a known list of work-item IDs, prefer a single batch call (`wit_work_item(action="get_batch")`, §7) over per-WI fetches.

- **Always pass an explicit `fields` selector.** The default field set is large — the response can be ~10× bigger than you need.
- **Silent omission caveat:** if a requested ID does not exist (deleted WI), the batch endpoint silently omits it from the response. **Cross-check the returned IDs against the input list** to detect deletions, and surface `(WI not found)` for any missing ones.
- **Chunking:** batch ~200 IDs per call; split larger lists.

### Parent rollup (two-pass, one level)

To roll up one level (Task → User Story, Bug → User Story):

1. Run a batch fetch including `System.Parent` in `fields`.
2. Collect every non-null `fields["System.Parent"]` value from the response.
3. Issue **one** additional batch call for those parent IDs, with the same field selector.
4. Join in memory by `System.Id` to build `parentId → (type, title)`.

**Do not recurse beyond one level** unless a skill explicitly needs it — each level is another round-trip and the parent chain is usually shallow (Task → Story is common; Story → Feature rarer; Feature → Epic rarest). A parent's parent is not displayed by default.

---

## 13. Diff recipes — TWO profiles

Build the diff **locally with `git`** — the MCP server exposes metadata, not raw diffs. The two consuming skills differ in **load-bearing** flags *and* merge-base arguments; do not collapse them. All are two-dot (author view). **Never use `git diff HEAD`** — it picks up unrelated local commits. If PRs span multiple repos, `git fetch` each repo's local clone separately. Always strip `refs/heads/` from `sourceRefName` / `targetRefName`.

### Profile (a) — review-pr

```bash
SOURCE=$(strip "refs/heads/" from sourceRefName)
TARGET=$(strip "refs/heads/" from targetRefName)
HEAD=lastMergeSourceCommit.commitId

git fetch origin "$SOURCE" "$TARGET"
BASE=$(git merge-base "origin/$TARGET" "origin/$SOURCE")
git diff --name-only "$BASE".."$HEAD"
```

### Profile (b) — write-pr-description

```bash
git fetch origin "<base>"
BASE_SHA=$(git merge-base HEAD "origin/<base>")
git diff --no-prefix --unified=100000 --minimal "$BASE_SHA"..HEAD
git log --oneline "$BASE_SHA"..HEAD
git diff --stat "$BASE_SHA"..HEAD
```

The `--no-prefix --unified=100000 --minimal` flags are load-bearing (full-file context for generation).

> **Reviewer three-dot view:** the three-dot symmetric-difference diff that a reviewer sees stays inside the `code-review` engine, which lives in `terylon-git` and is loaded by name — it is NOT one of these profiles and is not built here.

---

## 14. Eligibility — two-phase

`eligibility-check` returns **raw flags** (`status`, `isDraft`, `createdBy.uniqueName`) and a default recommendation. The **decisions** stay caller-side.

- **Phase 1 — before any read/work:** fetch metadata, evaluate the caller's skip rules (completed/abandoned, draft policy, ownership gate).
- **Phase 2 — re-check before any write:** re-fetch metadata immediately before posting; abort if `status` is no longer active or `isDraft` flipped to `true` (the PR may have been completed mid-run). **Read-only skills are exempt from the phase-2 write half.**

**Sequencing obligation:** call `detect-prior-run` **before** phase-1 so the prior-run check and the eligibility flags are evaluated together — this reproduces `review-pr`'s fused gate (a prior Claude post is part of the skip decision, not a separate later step).

**Caller-owned decisions** (never decided here): the draft policy (write-pr-description allows drafts; review-pr/address skip them), the ownership gate (address-pr-comments requires `createdBy.uniqueName == git config user.email`), and the prior-run BLOCK / ASK / PROCEED branch.

---

## 15. Prior-run detection

Detect a prior skill run by searching for the **version-less sentinel substring** `Generated with [Claude Code]` (it survives the `@<version>` suffix, so match the substring, not the full footer).

- **PR path:** list threads, search `comments[0].content` of each thread.
- **WI path:** fetch the parent work item with `expand="relations"`, then read its child work items and search each `fields["System.Description"]` (this is the duplicate guard `create-user-story` runs before creating a story).

If a prior post is found, the caller decides what to do (ask before re-running, overwrite under `--auto`, etc. — §14).

---

## 16. Footer / version contract

**`ado-mcp` does NOT resolve a version or stamp a footer.** The calling skill assembles the footer from its **own** `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` (which resolves to the *caller's* plugin root) plus its own skill `name`, and passes the finished content into the write op (`post-pr-thread`, `update-pr-description`, `wi-comment-post`).

The footer is, as a **placeholder template only**:

```
---
*🤖 Generated with [Claude Code](https://claude.ai/code) — <skill-name>@<plugin-version>*
```

`<skill-name>` = the calling skill's slug; `<plugin-version>` = the `version` from the caller's own `plugin.json`. **Never substitute a concrete example here** — an LLM caller could copy a hard-coded version verbatim and stamp the wrong identity. The version-less substring `Generated with [Claude Code]` also serves as the prior-run sentinel (§15).

---

## 17. ADO markdown rendering

Applies to every write (PR threads, PR descriptions, WI comments):

- **Never hard-wrap** paragraphs or bullets. Azure DevOps renders line breaks verbatim, so a hard-wrapped paragraph shows mid-sentence breaks. Let lines run long; break only at real paragraph boundaries.
- **Checklists use unchecked `- [ ]` only.** Never emit `- [x]`. The reason is that ADO renders a pre-checked box as a static tick the reader cannot untick, so a box checked on the author's say-so is both a claim nobody verified and one nobody can withdraw.

  **One carve-out, and it is narrow.** A skill that **executed** the item may write `- [X]`, on five conditions: it ran the thing rather than reading about it, the run **passed**, what it ran **bears on that item** rather than merely passing nearby, the evidence is posted where a reader can check it, and any item it could not execute stays `- [ ]`. The exemption belongs to whichever skill meets all five, not to any named one — an allowlist would go stale the moment a second skill qualified. A skill claiming it states the five conditions in its own steps, and those steps govern: this is the summary, and a summary that drifts looser than what it summarises is worse than none. The third condition is the one that gets skipped: a green suite that never touches the behaviour under test satisfies "it ran" and proves nothing. The rule above still binds every skill that *generates* a checklist — `write-pr-description`, `create-user-story`, `review-pr` — because generating is not executing, however sure the author feels.

  **A generator must not erase a tick it finds.** Regenerating a checklist over one that a verification pass has ticked destroys the evidence and cannot be undone, since ADO keeps no revision history for a description. Carry the existing state across the regeneration, or leave the section alone and say so.

---

## 18. Cross-plugin delegation

`${CLAUDE_PLUGIN_ROOT}` always resolves to the plugin that **owns the executing file** — it is plugin-local, and parent-directory relative imports across plugins are banned by `plugins/CLAUDE.md`. This forces two delegation mechanisms:

- **Same-plugin (terylon-devops transport skills):** deterministic `Read ${CLAUDE_PLUGIN_ROOT}/skills/ado-mcp/references/ado-mcp.md` — reachable because `ado-mcp` is a sibling skill in the same plugin.
- **Cross-plugin (terylon-product / terylon-dev callers):** load the `ado-mcp` skill **by name** (skills are global once installed; both plugins declare `dependencies: ["terylon-devops"]`). Reference it by name only — **never with a path or `@`**, and never path into `terylon-devops` from another plugin's file.

**Consequence for shared docs:** there is no cross-plugin file path, so a shared reference cannot live as a path-imported doc across plugins. Centralizing it in the `ado-mcp` skill (loaded by name) is the supported cross-plugin mechanism.

---

## 19. Consumer index

Every caller that delegates its ADO recipes to this file:

- `review-pr` (terylon-devops) — same-plugin `Read` of this file.
- `address-pr-comments` (terylon-devops) — same-plugin `Read` of this file.
- `write-pr-description` (terylon-devops) — same-plugin `Read` of this file.
- `pr-reviewer` (terylon-devops, agent) — same-plugin `Read` of this file.
- `create-user-story` (terylon-product) — loads `ado-mcp` by name.
- `create-feature` (terylon-product) — loads `ado-mcp` by name.
- `develop` (terylon-dev) — loads `ado-mcp` by name.

Each caller still issues its own `mcp__ado__*` (runtime `mcp__plugin_terylon-devops_ado__*`) calls following these recipes; delegation centralizes the **knowledge**, not the calls. The footer/version is always resolved by the calling skill (§16).
