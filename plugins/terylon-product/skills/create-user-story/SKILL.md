---
name: create-user-story
description: >-
  Use when a product owner wants to create an Azure DevOps User Story from a short brief and a
  parent Feature — drafts a codebase-grounded, implementation-ready story (Approach, precise
  implementation detail, acceptance-criteria checklist, out-of-scope) and creates it in ADO.
  Optional flags --auto and --dry-run.
allowed-tools: Bash(git *), Read, Grep, Glob, Agent, mcp__ado__*, mcp__plugin_terylon-devops_ado__*
---

# Azure DevOps — Create User Story

You turn a short brief plus a parent Feature into a well-structured, **codebase-grounded** Azure
DevOps User Story: a Markdown description with Approach, precise implementation detail anchored in
real artifacts, an acceptance-criteria checklist, and an out-of-scope section — precise enough for a
downstream AI agent to implement directly. The story is created under the parent Feature, inheriting
its area and iteration.

## Usage

```
/create-user-story "<brief>" --parent=<Feature-ID|URL> [--repo=<path>] [--story-points=N] [--priority=N] [--auto | --dry-run]
```

- `<brief>` — required free-text intent describing what the story is about.
- `--parent` — required parent Feature WI id or URL of form
  `https://dev.azure.com/{org}/{project}/_workitems/edit/{id}` (default org / project when a bare id is
  given: `https://dev.azure.com/janecekvit/Dev/_workitems/edit/{id}`). Used for context, for inheriting
  `System.AreaPath` / `System.IterationPath`, and as the parent the new story is linked under.
- `--repo` — optional path to the product repo to ground implementation detail against. Default =
  current working directory. The skill grounds read-only against this repo; it never edits product code.
- `--story-points` — optional `Microsoft.VSTS.Scheduling.StoryPoints` value.
- `--priority` — optional `Microsoft.VSTS.Common.Priority` value.
- `--auto` — create immediately, no confirmation (still runs the eligibility re-check and duplicate guard).
- `--dry-run` — draft only; never create.
- Default (neither flag) — print the draft, wait for `push` / `create` / an explicit confirmation, then create.

## Prerequisites

- The `ado` MCP server is provided by `terylon-devops@terylon`, auto-installed because this plugin
  declares `dependencies: ["terylon-devops"]`. At runtime the plugin-provided server is namespaced
  `mcp__plugin_terylon-devops_ado__*`; the bare `mcp__ado__*` names in this document are shorthand for
  that namespaced form.
- ADO mechanics (tool call shapes, field encodings, markdown rendering rules) are owned by the
  **`ado-mcp`** engine skill, which lives in the **`terylon-devops`** plugin. **Load `ado-mcp` by name**
  for the exact recipes before issuing any `mcp__ado__*` call.
- **Cross-plugin reference — by name only, never by path.** `ado-mcp` is in a different plugin than this
  skill, so it MUST be loaded by its name `ado-mcp` and never by a file path. `${CLAUDE_PLUGIN_ROOT}`
  resolves to **`terylon-product`** (this plugin), NOT to `terylon-devops` — so building a path to the
  engine's files under `${CLAUDE_PLUGIN_ROOT}` points at a file that does not exist here and will fail.
  Relative parent-directory imports (paths that climb out of this plugin) are likewise banned. Loading
  the engine by name is the only supported cross-plugin mechanism.
- The skill runs inside the product repo it grounds against (`--repo` default = cwd).

## Azure DevOps mechanics — delegated to `ado-mcp`

The Azure DevOps recipes this skill relies on — fetching a work item (`fetch-work-item`), creating a
work item (`create-work-item`), and linking a parent (`link-work-item-parent`) — live in the
**`ado-mcp`** engine skill (terylon-devops). Load `ado-mcp` **by name** for those recipes before
calling any `mcp__ado__*` tool. Delegation centralizes the *recipes* only — this skill still issues its
own `mcp__ado__*` calls following them, and assembles its own footer. `ado-mcp` never resolves or
stamps this skill's footer; footer/version are resolved locally (see the Output template section).

## Workflow

### 1. Parse inputs

Parse `<brief>`, `--parent` (id or URL), and the flags. From a `--parent` URL, extract the trailing
work-item id. Resolve `--repo` (default = current working directory). Capture `--story-points` /
`--priority` if supplied.

### 2. Fetch the parent Feature

Fetch the parent Feature via `ado-mcp` `fetch-work-item` with `expand="relations"`. Read its
`System.Title` and `System.Description` for context, and capture `System.AreaPath` and
`System.IterationPath` to inherit onto the new story. Keep the relations list for the duplicate guard
in step 6.

### 3. Sufficiency check

If the brief is too thin to write a precise, testable story, ask **1–2 targeted questions** before
drafting — typically the core problem being solved and what is explicitly out of scope. Do not ask more
than two; if the brief plus the Feature context is enough, proceed without questions.

### 4. Codebase grounding (one Explore sub-agent)

Dispatch **one** `Explore`-style sub-agent (via the `Agent` tool) over `--repo`, seeded with the brief
and the Feature context. Instruct it to return a structured list of **concrete anchors**:

- real files / modules the story touches (exact paths),
- existing patterns to follow,
- data shapes, config, and catalog locations,
- natural integration points.

The sub-agent returns the anchor list; **do NOT inline file contents** into the story. Use the anchors
to write precise implementation detail. If grounding finds nothing usable (wrong or empty repo), warn
the user that implementation detail will be brief-only and continue.

Do not assume any particular language, framework, or stack. Take conventions and stack from the target
repo's `CLAUDE.md` and from the surrounding code.

### 5. Draft the User Story

Draft the User Story in Markdown using the **Output template** below. Write a concise
Title with a scope qualifier when relevant (e.g. `… (Devices MVP)`). Ground the `## Implementation`
section in the real artifacts the sub-agent returned in step 4.

### 6. Branch on flags / create flow

- `--dry-run` → print the draft in chat, labelled dry-run. **Stop** — never create.
- default → print the draft (see Chat summary format) and wait for `push` / `create` / an explicit confirmation.
- `--auto` → proceed to create immediately.

**Before creating (even with `--auto`):**

- **Eligibility re-check** — confirm the parent Feature still exists and is not closed / removed. If it
  is, surface this and stop.
- **Duplicate guard** — scan the Feature's existing children (from the relations fetched in step 2) for
  an AI-drafted story with the same title — detected by the footer sentinel substring
  `Generated with [Claude Code]` in its description. If a match is found, ask the user before creating a
  duplicate.

### 7. Create the story and link the parent

Create via `ado-mcp` `create-work-item`:

- `workItemType = "User Story"`,
- `System.Title`,
- `System.Description` with **`format: "Markdown"`**,
- `Microsoft.VSTS.Common.AcceptanceCriteria` with **`format: "Markdown"`** — the `- [ ]` checklist,
- inherited `System.AreaPath` and `System.IterationPath`,
- optional `Microsoft.VSTS.Scheduling.StoryPoints`, `Microsoft.VSTS.Common.Priority`, `System.Tags`.

**Both multiline fields are created with `format: "Markdown"`.** ADO defaults them to HTML, in which a `- [ ]` line renders as a plain bullet or literal `[ ]` — no checkbox. Markdown is what makes the boxes tickable, and it also renders headings, tables and code spans without hand-written tags.

**The acceptance criteria go in `Microsoft.VSTS.Common.AcceptanceCriteria`**, the field named for them, as a `- [ ]` checklist in Markdown. Do not duplicate them into `System.Description` — two copies means one of them starts drifting, and a reader has no way to tell which is current. The description carries the story, the approach, the implementation detail and the out-of-scope boundary; the criteria live in their own field.

Then link the parent via `ado-mcp` `link-work-item-parent` with
`updates: [{ id: <new story id>, linkToId: <Feature id>, type: "parent" }]` — `id` is the new story,
`linkToId` is the Feature, `type: "parent"` makes the story a child of the Feature. Verify the direction:
the story's parent is the Feature, not the reverse.

Print: `Created User Story #<id> under Feature #<parent>: <url>`.

### 8. Do not commit

Do NOT create a commit, stage anything, or touch the git worktree. This skill creates an ADO work item,
not git changes — it reads the product repo only to ground the story. Stop after creating (or printing).

## Output template

**Title** — concise, with a scope qualifier when relevant (e.g. `… (Devices MVP)`).

**Description** (Markdown, written with `format: "Markdown"`):

```markdown
<one-paragraph what + why, linking the parent Feature and any related WIs / spikes>

## Approach
<the chosen approach in prose>

## Implementation
<precise, codebase-grounded detail: numbered where ordered; reference REAL artifacts
(exact file paths, modules, classes, data shapes, config/catalog locations); Markdown
table where it clarifies>

## Out of scope
- <explicitly excluded items>

---
*🤖 Generated with [Claude Code](https://claude.ai/code) — create-user-story@<plugin-version> · <model> / <effort>*
```

**Acceptance criteria** — a separate field, `Microsoft.VSTS.Common.AcceptanceCriteria`, also written with `format: "Markdown"`. Just the checklist, no heading (the field supplies its own):

```markdown
- [ ] <testable, observable criterion>
- [ ] <…>
```

**A criterion states an outcome. It never names a component, a file path, a command or a flag.**
Those are implementation choices, and a criterion that names one goes stale the moment the
implementation moves — which it will, because the criteria are written before the work.

```markdown
Wrong:  - [ ] the tester invokes measure-token-spend and writes docs/terylon/monitoring/<session>-tokens.md
Right:  - [ ] after a verification run, the run's token spend is reported per tier and written to the session's monitoring file
```

This is not hypothetical. A story whose criterion named *the tester* as the caller was
contradicted by the very pull request implementing it, because the call was placed in a skill
instead — so the criterion was a defect while the code was correct, and a reader had no way to
tell which of the two to trust.

**The procedure belongs in the pull request's test plan, authored by whoever did the build.**
Your criteria say what must be true; the plan says what was run to show it. Keep the two
shapes apart and neither list duplicates the other.

### Amending criteria after the work has started

Criteria are the input contract, and sometimes the work teaches you the contract was wrong.
Editing the field in place destroys the record of what was agreed; leaving it stale makes the
story contradict its own implementation. Neither is acceptable, so amend **visibly**.

**Never edit or delete a criterion in place.** Move it to a trailing `**Superseded**` group,
struck through and **without a checkbox**, and put the replacement in whichever group states its
outcome:

```markdown
**Transport**

- [ ] the replacement criterion, stating the outcome

**Superseded**

- ~~the old criterion, verbatim~~ - replaced by the criterion above on 2026-07-23; reason in the comment
```

The checkbox is dropped on purpose: a withdrawn criterion is not *unsatisfied*, it is
**withdrawn**, and a box invites someone to tick it. Do not wrap the whole line as
`~~- [ ] …~~` either - that breaks checkbox rendering instead of striking the text.

**Post a comment saying what changed and why.** The field can show that a criterion was
withdrawn; only the comment can say what was learned that withdrew it and which criterion took
its place. A strikethrough with no explanation is a puzzle for the next reader.

**Amend, or open a follow-up story?** The two cases look alike and want opposite answers:

| What happened | Do |
|---|---|
| an outcome the story promised **changed or turned out wrong** | amend here: strike the old, state the new |
| **new outcomes were added** - the work grew past what the story described | leave the criteria alone and open a follow-up story |

Stretching a story's criteria to cover work it explicitly excluded is how a story stops
describing anything. A pull request whose plan items map to **no** criterion is the signal for
the second row, not an invitation to add rows to the first.

**Two mechanics from `ado-mcp` bite here.** The field must be `markdown` or `~~` renders
literally, and `wit_update_work_item` silently drops tag-shaped `<…>` content - so scan the
criteria you are round-tripping for a literal angle bracket before writing.

**This is the product owner's act, never the tester's.** The `tester` proposes rewrites for
criteria it finds defective and applies none of them; see the criteria/test-plan convention in
`plugins/CLAUDE.md`.

`<plugin-version>` is read at runtime from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`. `<model>` is the model the run executes under (e.g. `opus-4.8`) — the skill knows it from itself, as no environment variable exposes it. `<effort>` comes from the `CLAUDE_EFFORT` environment variable (e.g. `xhigh`); **when `CLAUDE_EFFORT` is unset, omit the entire ` · <model> / <effort>` segment.** The substring `Generated with [Claude Code]` is the sentinel for prior-run detection — everything variable sits after that stable prefix.

**Formatting rules** (the same ADO-markdown rules `ado-mcp` documents in reference §17 — load
`ado-mcp` by name for the full text):

- **Acceptance criteria use unchecked `- [ ]` only** — never `- [x]` and never static glyphs (`✓`,
  `✅`, `🟢`, "Done"). ADO renders a pre-checked `[x]` as a static green tick the reader cannot toggle,
  defeating the checklist. Even criteria you believe are already met stay `- [ ]`.
- **No hard-wrapping** — ADO renders every source line break verbatim, so wrapping a paragraph or bullet
  at 72 / 80 chars produces choppy short lines. Emit each paragraph and each bullet as one continuous
  line; insert a real line break only between distinct paragraphs / bullets / headings.
- **Footer** — resolve `<plugin-version>` from **this skill's own**
  `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` `version` field, combined with this skill's own
  name (`create-user-story`), the model, and `CLAUDE_EFFORT` as described above. Match only the
  version-less substring `Generated with [Claude Code]` when detecting prior runs — never the full
  footer, whose trailing `@<version> · <model> / <effort>` segment varies between runs. That substring
  is the prior-run sentinel the duplicate guard (step 6) scans for.

## Chat summary format

```markdown
### User Story draft — under Feature #<parent>

<title>

<the drafted Markdown description verbatim>
```

Then, for default mode: `Reply "push" to create User Story under Feature #<id>.`
For `--dry-run`: label the block "(dry-run — nothing will be created)".

## Common mistakes

- **Hard-wrapping paragraphs / bullets** — ADO renders source line breaks verbatim; wrapping at 72–80
  chars produces visible choppy lines. One continuous line per paragraph / bullet.
- **Pre-checking acceptance criteria with `- [x]` or `✓`** — ADO renders pre-checked boxes as a static
  tick the reader cannot toggle. Always emit `- [ ]`.
- **Acceptance criteria show as plain bullets, not checkboxes** — the field was left in HTML. ADO renders
  `- [ ]` as interactive checkboxes ONLY in **Markdown**, and it defaults both multiline fields to HTML.
  Pass `format: "Markdown"` for `System.Description` **and** for
  `Microsoft.VSTS.Common.AcceptanceCriteria`. This is the single most common cause of missing checkboxes.
- **Criteria in the wrong field, or in two** — they belong in
  `Microsoft.VSTS.Common.AcceptanceCriteria`, the field named for them. Do not also put them in the
  description: two copies drift, and a reader cannot tell which one is current.
- **Un-grounded, vague implementation detail** — the distinctive value of this skill is real anchors.
  Reference exact file paths / modules / data shapes from the Explore sub-agent, not generic prose. If
  grounding failed, say so rather than inventing plausible-looking detail.
- **Forgetting the parent link** — `create-work-item` sets field values only; it CANNOT set the parent
  relation. Skipping `link-work-item-parent` leaves the story orphaned (no parent Feature).
- **Reversing the `wit_work_items_link` direction** — `id` must be the new story and `linkToId` the
  Feature, with `type: "parent"`. Swapping them makes the Feature a child of the story.

## Verification

1. `/create-user-story "<brief>" --parent=<known Feature> --dry-run` inside a product repo.
   Expect: a draft matching the Output template printed to chat with **real file anchors** in `## Implementation`,
   `- [ ]` acceptance criteria, an `## Out of scope` section, and the footer. No work item created
   (the parent Feature's child count is unchanged); no `create-work-item` / `link-work-item-parent` call.
2. `/create-user-story "<brief>" --parent=<known Feature>` (default) → confirm prompt.
   On `push`: a User Story is created with a Markdown description, inherited area / iteration, and
   **linked as a child of the parent Feature** (verify the story's parent is the Feature, not the
   reverse). The new id + URL is printed.
3. Footer identity — the created story's footer reads `create-user-story@<terylon-product version>`,
   resolved in this plugin's own `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`.
4. Duplicate guard — re-run step 2 against the same Feature with the same title. Expect: the existing
   AI-drafted child (footer sentinel) is detected and the skill asks before creating a duplicate.
5. Checkbox rendering — open the created story in ADO: the acceptance criteria appear as **interactive
   checkboxes**, not plain bullets. Equivalently, re-fetch via `ado-mcp` `fetch-work-item` and confirm
   `multilineFieldsFormat["System.Description"]` is `"markdown"`. If they render as plain bullets, the
   field was created as HTML — recreate with `format: "Markdown"` (see Common mistakes).
6. **Criteria state outcomes, not implementations.** Read every generated criterion back: none
   names a component, a file path, a command or a flag. A criterion saying "the tester invokes
   `measure-token-spend` and writes `docs/…/<session>-tokens.md`" is a defect even when it is
   true on the day it is written, because the next refactor moves the call and the criterion
   then contradicts working code. The equivalent outcome — "the run's token spend is reported
   per tier and written to the session's monitoring file" — survives the move.
