# Azure DevOps MCP — canonical reference

Single source of truth for all Azure DevOps (ADO) MCP mechanics used across the Terylon plugins. This document is the heavy reference behind the `forge-ops` engine skill, the **Azure DevOps body of the `terylon-forge` port**; its sibling is `terylon-github:forge-ops`, the same catalog over the `gh` CLI. Two bodies, one contract: where they disagree about what an operation means, the port's declaration decides and one of them is wrong. The transport callers (`review-pr`, `address-pr-comments`, `write-pr-description` and the `pr-reviewer` agent, all in `terylon-forge`; `create-user-story`, `create-feature` in `terylon-product`; `develop` in `terylon-dev`) delegate their ADO recipes here and issue their own tool calls following these recipes.

---

## 1. Overview & scope

`forge-ops` owns **all mechanical ADO operations**: URL/ID parsing, `repositoryId` resolution, PR and work-item metadata fetches, local diff construction, thread/comment listing and posting, batch work-item lookup, parent rollup, and the ADO posting conventions (field encodings, `threadContext` anchoring, markdown rendering).

It does **NOT** own any judgment or generation. The following always stay in the calling skill:

- **Footer / version resolution** — the caller stamps its own footer from its own `plugin.json` (see §16).
- **Eligibility *decisions*** — `forge-ops` returns raw flags; the caller decides draft policy, ownership gating, and the prior-run BLOCK / ASK / PROCEED branch (see §14).
- **Thread classification** — mechanical vs inline-text vs conceptual is caller-owned.
- **Review diff dot-choice** — the three-dot symmetric reviewer view lives in the `code-review` engine (in `terylon-git`, loaded by name), not here (see §13).
- **All generation / judgment** — confidence scoring, description authoring, user-story and feature drafting.

This file is the single source of truth; when a recipe changes, it changes here and nowhere else.

---

## 2. MCP server prerequisites & tool namespace

All ADO calls use tools from the `ado` MCP server, declared in `plugins/terylon-ado/.mcp.json`. No plugin declares this one as a dependency: the consumer enables it, and the port would install an Azure DevOps server everywhere if it declared it.

**Tool namespace — documented vs runtime:**

- This document writes tool names in the short documented form `mcp__ado__*` (e.g. `repo_pull_request(action="get")`).
- **At runtime the server is namespaced by its providing plugin: `mcp__plugin_terylon-ado_ado__*`** (e.g. `mcp__plugin_terylon-ado_ado__repo_pull_request(action="get")`). This is the form you actually call, and the form that must appear in each calling skill's `allowed-tools`.
- The two are the same tool. The bare `mcp__ado__*` names in this document are shorthand for the namespaced runtime form.

**WIT tool-name drift:** the `wit_*` tools were added in a later version of `@azure-devops/mcp` and the names drifted between versions. The comment-listing tool is `wit_work_item(action="list_comments")`; the pre-2.9.0 `wit_list_work_item_comments` does not exist at runtime. Verify the exact names installed locally with the inspector:

```
npx @azure-devops/mcp --list-tools
```

---

## 3. Tool catalog — the 2.9.0 surface

The pinned server is **`@azure-devops/mcp@2.9.0`**, which consolidated the whole surface into **action-based tools**: one tool per resource, an `action` parameter selecting the operation. Call them in the runtime namespace `mcp__plugin_terylon-ado_ado__*`.

**Three things break silently when a call is written from memory of the old surface**, and all three fail the whole call rather than degrading:

| Trap | Consequence |
|---|---|
| Every schema is `additionalProperties: false` | one unknown parameter rejects the entire call |
| `projectName` became **`project`** | the old name is now an unknown parameter — see above |
| The old one-tool-per-operation names are **gone** | `repo_update_pull_request` and its siblings do not resolve at all; the migration table below has every one |

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

### `parse-item-url`
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
- **In:** `prId`, `repositoryId`, `project`. **Out:** the whole PR object — `status`, `isDraft`, `createdBy`, `sourceRefName`, `targetRefName`, `lastMergeSourceCommit`, `description`, **`mergeStatus`**, **`autoCompleteSetBy`** and **`completionOptions`**. The last three are what `set-auto-merge`'s gate reads and what it echoes back; an output list omitting them leaves that gate with nothing to test.
- **Tools:** `repo_pull_request(action="get")`. **Consumers:** review-pr, address-pr-comments, write-pr-description, pr-reviewer.

### `eligibility-check`
- **In:** PR metadata. **Out:** the **normalised verdict** below, plus the raw flags it was derived from.

**The normalised verdict is what a transport reads. It never reads the raw fields.** Azure DevOps returns `status` as a **number** and GitHub has no `status` key at all, so a transport comparing against `"completed"` matches nothing on either side and passes everything — the gate then fails **open**, which is how a run posts to a pull request somebody already merged.

| Normalised | Type | Derived here from |
|---|---|---|
| `isOpen` | boolean | `status == 1` (active). `2` completed, `3` abandoned |
| `isDraft` | boolean | `isDraft` |
| `author` | string | `createdBy.uniqueName` — email-shaped |
| `sourceBranch` | string | `sourceRefName`, stripped of `refs/heads/` |
| `targetBranch` | string | `targetRefName`, stripped of `refs/heads/` |
| `headSha` | string | `lastMergeSourceCommit.commitId` — the commit the diff's `$HEAD` must be |
| `isMergeable` | boolean | `mergeStatus == 3` (succeeded) |
| `autoMergeAlreadySet` | boolean | `autoCompleteSetBy` present |

**These are numbers, not words** (§6). The one place a word is correct is the `status` **input** of `list-pull-requests`.

**The two branch keys are stripped here, once.** Consumers used to be told to read `targetRefName` and strip the prefix themselves — a raw field name and a prefix shape that exist on this side only, restated in six places across the port. The other body reports the same two keys from `baseRefName` / `headRefName` with nothing to strip.
- **Tools:** `repo_pull_request(action="get")`. **Consumers:** review-pr, address-pr-comments, write-pr-description, pr-reviewer.
- **Decisions stay skill-side** (§14). Two-phase: phase-1 before read, phase-2 re-check before write.

### `detect-prior-run`
- **In:** PR threads or WI comments. **Out:** boolean (prior Claude post present).
- **Tools:** `repo_pull_request_thread(action="list")` (PR) / `wit_work_item(action="get")` (WI). **Consumers:** review-pr, address-pr-comments, create-user-story, pr-reviewer.
- **Sentinel:** version-less `Generated with [Claude Code]` (§15).

### `list-threads`
- **In:** `prId`, `repositoryId`, `project`. **Out:** the **normalised thread shape** below. The raw form is `[{ id, status, comments: [{ id, content, commentType, … }] }]` and stays here.

**Both bodies return this shape, key for key**, or a transport cannot be written once against them:

| Key | Meaning | From, here |
|---|---|---|
| `threadId` | opaque handle for replies and status changes | `id` |
| `isResolved` | boolean | `status` in `{2 fixed, 4 closed, 6 byDesign}` |
| `isSystem` | boolean — generated, not written by a person | `comments[0].commentType == 3` |
| `anchor` | `null` for PR-wide, else `{ path, startLine, endLine }` **inclusive** | `threadContext`, with `rightFileEnd.line - 1` as `endLine` |
| `comments[]` | `{ commentId, body, author }` | `{ id, content, createdBy.uniqueName }` |

The `- 1` is load-bearing: this side stores the end one past the last covered line, and reporting it raw makes every consumer edit one line too many.
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

### Work-item keys — the authoring contract

`fetch-work-item`, `create-work-item` and `update-work-item` speak these keys, **key for key with the GitHub body**, so an authoring skill is written once against them. A skill never names a field reference; it names a key, and this table says where the key lives here. A row marked *not carried* is a **declared difference**: the caller states it before writing rather than dropping the value silently.

| Key | Meaning | Here | Carried |
|---|---|---|---|
| `type` | the item's kind, in the port's vocabulary: `user-story`, `feature`, `epic` | `System.WorkItemType` — `User Story`, `Feature`, `Epic` | yes |
| `title` | plain text | `System.Title` | yes |
| `description` | markdown, everything but the criteria and the footer | `System.Description`, written `Markdown` | yes |
| `acceptanceCriteria` | a markdown `- [ ]` list with no heading; absent when the item has none | `Microsoft.VSTS.Common.AcceptanceCriteria`, written `Markdown` | yes |
| `footer` | the caller's finished footer line — **composed by the caller, only placed here** | appended last to `System.Description` | yes |
| `parent` | id of the parent item, or `null` | `System.Parent` on a fetch; set only by `link-work-item-parent` | yes |
| `children` | `[{ id, title, description }]` | the `System.LinkTypes.Hierarchy-Forward` relations, each fetched | yes |
| `isClosed` | boolean | `System.State` is `Closed`, `Removed` or `Done` | yes |
| `url` | the item's web URL | `_links.html.href` | yes |
| `planning` | where the item sits in the team's plan; opaque to the caller, which copies it from a parent's fetch into a child's create | `System.AreaPath` and `System.IterationPath` | yes |
| `estimate` | a number | `Microsoft.VSTS.Scheduling.StoryPoints` | yes |
| `priority` | a number | `Microsoft.VSTS.Common.Priority` | yes |
| `tags` | a list of strings | `System.Tags`, `; `-joined | yes |

**The encoding is this body's business, not the caller's.** Every multiline key is written `Markdown` here, and a caller never passes a format: it hands over markdown and gets markdown rendered.

### `fetch-work-item`
- **In:** `WI_ID`, `project`, `expand`. **Out:** the work-item keys above, plus the raw fields + relations they were read from.
- **Tools:** `wit_work_item(action="get")` with `expand="relations"`, then one `get` per child for `children`. **Consumers:** create-user-story, create-feature.
- Use `expand="relations"`; HTML fields pass as-is (§11), and `description` / `acceptanceCriteria` are reported with the encoding `multilineFieldsFormat` names, because an inherited HTML field is not markdown and must not be parsed as such.
- **Gotcha — `multilineFieldsFormat` is empty under a `fields` filter.** The response reports which multiline fields are markdown in a `multilineFieldsFormat` object, and **that object comes back `{}` whenever the call passes an explicit `fields` list**, even for fields it asked for. It is populated under `expand`. Measured on a work item whose description and acceptance criteria are both markdown: the filtered fetch reported `{}` and the `expand` fetch reported both as `markdown`. **A check that confirms the format must use `expand`** — the filtered form fails it every time, and fails it in the direction that looks like a real defect.

### `fetch-work-items-batch`
- **In:** `ids[]`, `project`, explicit `fields[]`. **Out:** `[{ id, rev, fields, url }, ...]`.
- **Tools:** `wit_work_item(action="get_batch")`. **Consumers:** *(none today — exposed for completeness)*.
- Explicit `fields` selector; deleted IDs silently omitted; ~200/call (§12).

### `parent-rollup`
- **In:** WIs from a batch (with `System.Parent`). **Out:** `parentId → (type, title)` lookup.
- **Tools:** `wit_work_item(action="get_batch")`. **Consumers:** *(none today — exposed for completeness)*.
- `System.Parent` is top-level; two-pass; one level only (§12).

### `item-comments-read`
- **In:** `WI_ID`, `project`. **Out:** `{ totalCount, comments: [{ id, text, createdBy }] }`.
- **Tools:** `wit_work_item(action="list_comments")`. **Consumers:** update-work-item-checklist.
- Doubles as the WI `detect-prior-run` source (grep `comments[].text`).

### `item-comment-post`
- **In:** `WI_ID`, `project`, `text` (already includes the caller's footer). **Out:** `{ id }`.
- **Tools:** `wit_work_item_comment_write(action="add")`, and `(action="update")` for the idempotent re-run. **Consumers:** update-work-item-checklist.
- **Update form:** pass the existing `commentId` with `action="update"`. A re-run **updates** its previous comment rather than posting a second; both bodies must offer this or the idempotence the callers rely on has no call behind it.
- Plain text; print the returned `id`.

### `build-pr-diff`
- **In:** PR refs + `lastMergeSourceCommit`. **Out:** local `git diff` text.
- **Tools:** none (git). **Consumers:** review-pr, write-pr-description, pr-reviewer.
- **TWO flag profiles — see §13.** Never `git diff HEAD`.

### `create-work-item`
- **In:** `project` (resolved per *Resolving org / project without a URL* (§9) when not taken from a URL) and the work-item keys `type`, `title`, `description`, `footer`, and when given `acceptanceCriteria`, `planning`, `estimate`, `priority`, `tags`. **Out:** the new item's `id` and `url`.
- **Tool:** `wit_work_item_write(action="create")`. **Consumers:** create-user-story, create-feature.
- **Recipe:** `workItemType` from `type`; `fields: [{name, value, format?}]` mapped through the key table — `System.Title`; `System.Description` = `description` + a blank line + `footer`, with **`format: "Markdown"`**; `Microsoft.VSTS.Common.AcceptanceCriteria` with **`format: "Markdown"`** when `acceptanceCriteria` is present; `System.AreaPath` and `System.IterationPath` from `planning`; `Microsoft.VSTS.Scheduling.StoryPoints`, `Microsoft.VSTS.Common.Priority`, `System.Tags` from `estimate`, `priority`, `tags`.
- **Gotcha (parent):** sets *field values* only — it CANNOT set the parent relation. Link the parent in a separate step (`link-work-item-parent`).
- **Gotcha (checkboxes):** `- [ ]` renders as an interactive checkbox **only when the field is written with `format: "Markdown"`**. ADO defaults every multiline field to HTML, where the same line is a plain bullet or a literal `[ ]`. Pass `format: "Markdown"` for **each** multiline field independently — `System.Description` and `Microsoft.VSTS.Common.AcceptanceCriteria` do not inherit from one another, and setting only the first leaves a story whose description renders and whose criteria do not.

### `link-work-item-parent`
- **In:** `child`, `parent` — two item ids, the same two keys on both bodies. **Out:** linked work item.
- **Tool:** `wit_work_item_link_write(action="link")`. **Consumers:** create-user-story, create-feature.
- **Recipe:** `updates: [{ id: <child>, linkToId: <parent>, type: "parent" }]` — `id` is the work item being updated (the new story); `linkToId` is the Feature; `type: "parent"` makes the story a child of the Feature.
- **Verify by reading the parent back** — `fetch-work-item` on `parent` lists `child` among its `children`. The link response is trimmed (§3) and is not evidence.
- **Alternative (one call, limited fields):** `wit_work_item_write(action="add_child")(parentId, workItemType, items:[{title, description, format, areaPath?, iterationPath?}])` creates AND links a child in one call — but supports only title/description/format/area/iteration, NOT StoryPoints/Priority/Tags. Use create-work-item + link-work-item-parent when any extra metadata is needed.

### `update-work-item`
- **In:** `id` and any of the work-item keys `title`, `description`, `acceptanceCriteria`, `footer`; each given key replaces what the item holds. **Out:** updated work item. The JSON-Patch below is how this body writes them — a caller passes keys, never patch paths.
- **Tool:** `wit_work_item_write(action="update")` — or `action="update_batch"` with `batchUpdates: [{ id, op, path, value, format }]`. **Consumers:** create-feature, update-work-item-checklist.
- **The two update forms are not equivalent, and only one can state a format.** `update_batch` accepts a per-op **`format`**; the single `update` does not. So rewriting a markdown multiline field — acceptance criteria, a description — goes through `update_batch` **even for one item**, or the write lands with no format stated and depends on whatever encoding the field already carries. Measured: `update_batch` with `format: "Markdown"` on a single-element array round-tripped the criteria with `multilineFieldsFormat` still `markdown`.
- **Recipe:** patch existing fields — `op: "replace"` (or the schema default `add`, which ADO upserts), `path: "/fields/<FieldRef>"` (e.g. `/fields/System.Title`, `/fields/System.Description`), `value: "<new value>"`.
- **Gotcha (no format arg on the single form):** unlike `create-work-item`'s `fields:[{name,value,format?}]`, `wit_work_item_write(action="update")` takes JSON-Patch ops with **no per-field `format`**. A plain field op writes into whatever encoding the field already has, so a Markdown string sent to an HTML field renders as literal `#` and `-` characters. `update_batch` is the form that carries `format`; use it when the encoding matters rather than hoping the field is already right.

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
- **Tool:** `repo_pull_request_write(action="create")`. **Consumers:** create-pr, develop (terylon-dev).
- **Recipe:** pass **full ref names** (`refs/heads/<branch>`) for `sourceRefName` / `targetRefName` — do NOT strip `refs/heads/` here (that stripping is only for diff building, §13). Resolve `repositoryId` once via `resolve-repo-id` (§5); pass `project` when `repositoryId` is a name. `description` is capped at 4000 chars — keep the generated PR body within the limit.
- **Associate work items:** `workItems` (space-separated WI IDs, e.g. `"101055 98792"`) links work items at creation — an alternative to a separate `link-work-item-to-pull-request` call. Draft/eligibility decisions and footer stay caller-side.

### `check-preconditions`
- **In:** nothing. **Out:** usable / not usable, with the reason.
- **Tools:** none (environment + git). **Consumers:** create-pr, and any transport before its first call.
- **Recipe:** `TERYLON_ADO_ORG` must be set — there is no default (§9) — and it must equal the organisation in the repository's remote, or every call goes to an organisation the remote does not describe. Report the mismatch and stop; do not "correct" either side.
- **The `ado` server must be connected:** its `mcp__plugin_terylon-ado_ado__*` tools are present in the session. When they are absent the server failed to start or could not connect — say so and stop before the first call, as `resolve-forge` prescribes, and point at `check-access`.

### `list-pull-requests`
- **In:** `repositoryId`, `project`, optional `sourceRefName` (full `refs/heads/<branch>`), `status`.
- **Out:** one entry per matching pull request, each carrying the **same normalised `isOpen` / `isDraft` / `author`** that `eligibility-check` reports, derived the same way (`status == 1` is open, and so on). **Tool:** `repo_pull_request(action="list")`. **Consumers:** create-pr.
- **Gotcha:** the `status` **input** is a **word** (`"Active"`, `"All"`), unlike the numeric `status` the response carries. That input is the one place the word form is correct — and the response's number never leaves this file.

### `resolve-current-user`
- **In:** nothing. **Out:** the identity of whoever the run is acting as, in the same form `eligibility-check` reports `author`.
- **Recipe:** `git config user.email` — on this forge `createdBy.uniqueName` is email-shaped, so the two compare directly.
- **Why it is an operation:** the ownership gate needs "am I the author", and the answer is a platform question. Without it a transport reaches for a platform command of its own and crosses the port boundary to ask something the port should have answered.

### `resolve-identity`
- **In:** an email or display name. **Out:** identity GUIDs. **Tool:** `core_get_identity_ids`. **Consumers:** create-pr.
- **Gotcha:** reviewer operations take **GUIDs, never emails**. Zero or several matches is a stop-and-ask, never a guess.

### `add-reviewers`
- **In:** `repositoryId`, `pullRequestId`, `project`, `reviewerIds` (GUIDs), `reviewerAction: "add"`.
- **Out:** updated reviewers. **Tool:** `repo_pull_request_write(action="update_reviewers")`. **Consumers:** create-pr.
- **Gotcha:** the request body carries `{ id }` only, so every reviewer added here is **optional** — required comes from a branch policy. On read-back an optional reviewer **omits** `isRequired` rather than reporting `false`; never test for an explicit `false`.

### `set-auto-merge`
- **In:** `repositoryId`, `pullRequestId`, `project`, `autoComplete`, `mergeStrategy`, `deleteSourceBranch`, `transitionWorkItems`.
- **Out:** updated pull request. **Tool:** `repo_pull_request_write(action="update")`. **Consumers:** create-pr.
- **Gate before calling:** `status == 1`, `isDraft == false`, `mergeStatus == 3`, `autoCompleteSetBy` absent. **These are numbers, not words** (§6) — comparing against `"active"` matches nothing and passes everything.
- **Gotchas:** completion options are sent whole, so read and echo back what a human already chose; `transitionWorkItems` defaults to `true` and moves every linked item on the board; **never send `bypassReason`** — any non-empty string overrides branch policies. The response **strips** `autoCompleteSetBy` and `completionOptions`, so read the pull request back to confirm.

### `list-linked-items`
- **In:** `repositoryId`, `pullRequestId`, `project`. **Out:** the items already linked to the pull request.
- **Tool:** `repo_pull_request(action="get", includeWorkItemRefs=true)`, **read back from the work item** when it returns nothing.
- **Measured gotcha:** that call returned **no `workItemRefs` key at all** on a pull request that demonstrably had a linked work item. Never report "no links" from its absence — confirm against `wit_work_item(action="get", expand="Relations")`, which is where the relation actually lives.

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
url="https://dev.azure.com/contoso/Platform/_git/ExampleRepo/pullrequest/12345"
ORG=$(echo "$url"     | sed -E 's|.*dev\.azure\.com/([^/]+)/.*|\1|')
PROJECT=$(echo "$url" | sed -E 's|.*dev\.azure\.com/[^/]+/([^/]+)/.*|\1|')
REPO=$(echo "$url"    | sed -E 's|.*/_git/([^/]+)/.*|\1|')
PRID=$(echo "$url"    | sed -E 's|.*/pullrequest/([0-9]+).*|\1|')
```

In PowerShell:

```powershell
$url   = "https://dev.azure.com/contoso/Platform/_git/ExampleRepo/pullrequest/12345"
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
wi_url="https://dev.azure.com/contoso/Platform/_workitems/edit/98310"
ORG=$(echo "$wi_url"     | sed -E 's|.*dev\.azure\.com/([^/]+)/.*|\1|')
PROJECT=$(echo "$wi_url" | sed -E 's|.*dev\.azure\.com/[^/]+/([^/]+)/.*|\1|')
WI_ID=$(echo "$wi_url"   | sed -E 's|.*/edit/([0-9]+).*|\1|')
```

In PowerShell:

```powershell
$wi_url  = "https://dev.azure.com/contoso/Platform/_workitems/edit/98310"
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

**`org` must equal the server's startup organisation.** The `ado` server is launched with `${TERYLON_ADO_ORG}` (see the plugin `.mcp.json`), so it can only talk to that one organisation. Take `org` from that variable — the same source the server used — rather than from the remote, so the two never disagree. Derive `project` and `repo` from the remote.

**There is no fallback.** With `TERYLON_ADO_ORG` unset the server has no organisation to talk to, so **stop and say the variable is unset** rather than guessing one. The variable used to carry a hard-coded default, and the failure that produced was worse than this one: calls went to a real organisation nobody had chosen — whichever one the marketplace author happened to use — and failed later, on authorization, naming an org the consumer had never heard of.

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

ORG="${TERYLON_ADO_ORG:?TERYLON_ADO_ORG is not set - no default organisation exists}"
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

$ORG     = if ($env:TERYLON_ADO_ORG)     { $env:TERYLON_ADO_ORG }     else { throw "TERYLON_ADO_ORG is not set - no default organisation exists" }
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
SOURCE=$sourceBranch      # normalised; derived here from sourceRefName
TARGET=$targetBranch      # normalised; derived here from targetRefName
HEAD=$headSha             # normalised; derived here from lastMergeSourceCommit.commitId

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

`eligibility-check` returns the **normalised verdict** — `isOpen`, `isDraft`, `author`, `isMergeable`, `autoMergeAlreadySet`, `sourceBranch`, `targetBranch` — plus the raw flags it derived them from. **A caller reads the normalised keys and never the raw ones.** The **decisions** stay caller-side.

- **Phase 1 — before any read/work:** fetch metadata, evaluate the caller's skip rules (completed/abandoned, draft policy, ownership gate).
- **Phase 2 — re-check before any write:** re-fetch metadata immediately before posting; abort if `isOpen` went false or `isDraft` flipped to `true` (the PR may have been completed mid-run). **Read-only skills are exempt from the phase-2 write half.**

**Sequencing obligation:** call `detect-prior-run` **before** phase-1 so the prior-run check and the eligibility flags are evaluated together — this reproduces `review-pr`'s fused gate (a prior Claude post is part of the skip decision, not a separate later step).

**Caller-owned decisions** (never decided here): the draft policy (write-pr-description allows drafts; review-pr/address skip them), the ownership gate (address-pr-comments compares the normalised `author` against `resolve-current-user`), and the prior-run BLOCK / ASK / PROCEED branch.

---

## 15. Prior-run detection

Detect a prior skill run by searching for the **version-less sentinel substring** `Generated with [Claude Code]` (it survives the `@<version>` suffix, so match the substring, not the full footer).

- **PR path:** list threads and search the **`body` of each thread's first comment** — the normalised key `list-threads` returns, not the raw field it is derived from. A recipe that names the raw key contradicts its own sibling twelve hundred lines above.
- **WI path:** fetch the parent work item with `expand="relations"`, then read its child work items and search each `fields["System.Description"]` (this is the duplicate guard `create-user-story` runs before creating a story).

If a prior post is found, the caller decides what to do (ask before re-running, overwrite under `--auto`, etc. — §14).

---

## 16. Footer / version contract

**`forge-ops` does NOT resolve a version or stamp a footer.** The calling skill assembles the footer from its **own** `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` (which resolves to the *caller's* plugin root) plus its own skill `name`, and passes the finished content into the write op (`post-pr-thread`, `update-pr-description`, `item-comment-post`).

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
- **`!<id>` is safe inside a pull request and unsafe outside it.** Azure DevOps renders `!<id>` as a link to a pull request and `#<id>` as a link to a work item, so the two sigils are needed. But **pull request numbers are per-repository while the sigil carries no repository**, so outside the pull request's own threads the renderer guesses which one you meant. Measured: `!68` in a work-item comment rendered as a link to `_git/DumpAnalysis/pullrequest/68` — a different repository in the same project, where pull request 68 does not exist. **In a work-item comment, write the full URL.** The sigil stays correct in a thread on the pull request itself, where the repository is implied by where the text lives.
- **Checklists use unchecked `- [ ]` only.** Never emit `- [x]`. The reason is that ADO renders a pre-checked box as a static tick the reader cannot untick, so a box checked on the author's say-so is both a claim nobody verified and one nobody can withdraw.

  **One carve-out, and it is narrow.** A skill that **executed** the item may write `- [X]`, on five conditions: it ran the thing rather than reading about it, the run **passed**, what it ran **bears on that item** rather than merely passing nearby, the evidence is posted where a reader can check it, and any item it could not execute stays `- [ ]`. The exemption belongs to whichever skill meets all five, not to any named one — an allowlist would go stale the moment a second skill qualified. A skill claiming it states the five conditions in its own steps, and those steps govern: this is the summary, and a summary that drifts looser than what it summarises is worse than none. The third condition is the one that gets skipped: a green suite that never touches the behaviour under test satisfies "it ran" and proves nothing. The rule above still binds every skill that *generates* a checklist — `write-pr-description`, `create-user-story`, `review-pr` — because generating is not executing, however sure the author feels.

  **A generator must not erase a tick it finds.** Regenerating a checklist over one that a verification pass has ticked destroys the evidence and cannot be undone, since ADO keeps no revision history for a description. Carry the existing state across the regeneration, or leave the section alone and say so.

---

## 18. Cross-plugin delegation

`${CLAUDE_PLUGIN_ROOT}` always resolves to the plugin that **owns the executing file** — it is plugin-local, and parent-directory relative imports across plugins are banned by `plugins/CLAUDE.md`. This forces two delegation mechanisms:

- **Inside this plugin:** deterministic `Read ${CLAUDE_PLUGIN_ROOT}/skills/forge-ops/references/forge-ops.md`, reachable because it is this plugin's own file.
- **From anywhere else — which is every caller:** load the `forge-ops` skill **by name**, plugin-qualified as `terylon-ado:forge-ops` when both adapters are enabled. Reference it by name only, **never with a path or `@`**, and never path into `terylon-ado` from another plugin's file: `${CLAUDE_PLUGIN_ROOT}` there resolves to the caller's own plugin, so the path silently points at a file that does not exist.

**Consequence for shared docs:** there is no cross-plugin file path, so a shared reference cannot live as a path-imported doc across plugins. Centralizing it in the `forge-ops` skill (loaded by name) is the supported cross-plugin mechanism.

---

## 19. Consumer index

Every caller that delegates its ADO recipes to this file:

- `create-pr`, `review-pr`, `write-pr-description`, `address-pr-comments`, `update-pr-checklist`, `update-work-item-checklist` and the `pr-reviewer` agent (all terylon-forge) — load this skill by name.
- `create-user-story` (terylon-product) — loads `forge-ops` by name.
- `create-feature` (terylon-product) — loads `forge-ops` by name.
- `develop` (terylon-dev) — loads `forge-ops` by name.

Each caller still issues its own `mcp__ado__*` (runtime `mcp__plugin_terylon-ado_ado__*`) calls following these recipes; delegation centralizes the **knowledge**, not the calls. The footer/version is always resolved by the calling skill (§16).
