---
name: create-user-story
description: >-
  Use when a product owner wants to create a User Story from a short brief and a parent Feature, on
  Azure DevOps or GitHub — drafts a codebase-grounded, implementation-ready story (short Summary, Description,
  Approach, precise implementation detail, acceptance-criteria checklist, out-of-scope) and creates it on the forge.
  Optional flags --auto and --dry-run.
allowed-tools: Bash(git *), Bash(wc *), Bash(gh *), Read, Grep, Glob, Agent, mcp__plugin_terylon-ado_ado__*
---

# Create User Story

You turn a short brief plus a parent Feature into a well-structured, **codebase-grounded** User
Story: a Markdown description opening with a capped plain-language `## Summary`, then
Description, Approach, precise implementation detail anchored in
real artifacts, an acceptance-criteria checklist, and an out-of-scope section — precise enough for a
downstream AI agent to implement directly. The story is created under the parent Feature, and
inherits the Feature's place in the team's plan wherever the forge has one.

**A story is an item on whichever forge the repository is hosted on** — a work item on Azure DevOps,
an issue on GitHub. This skill is written against the port's **work-item keys** (`type`, `title`,
`description`, `acceptanceCriteria`, `footer`, `parent`, `children`, `planning`, `estimate`,
`priority`, `tags`) and never names a platform field: where each key lives, and which keys a forge
does not carry, is the adapter's answer.

## Usage

```
/create-user-story "<brief>" --parent=<Feature-ID|URL> [--repo=<path>] [--story-points=N] [--priority=N] [--auto | --dry-run]
```

- `<brief>` — required free-text intent describing what the story is about.
- `--parent` — required parent Feature, as an id or as an item URL on either forge
  (`dev.azure.com/{org}/{project}/_workitems/edit/{id}` or `github.com/{owner}/{repo}/issues/{n}`).
  A bare id resolves its coordinates through `forge-ops` from the `--repo` git remote. Used for
  context, for the `planning` key the story inherits, and as the parent the new story is linked under.
- `--repo` — optional path to the product repo to ground implementation detail against. Default =
  current working directory. The skill grounds read-only against this repo; it never edits product code.
- `--story-points` — optional; the `estimate` key.
- `--priority` — optional; the `priority` key.
- `--auto` — create immediately, no confirmation (still runs the eligibility re-check and duplicate guard).
- `--dry-run` — draft only; never create.
- Default (neither flag) — print the draft, wait for `push` / `create` / an explicit confirmation, then create.

## Prerequisites

- Forge access comes from an adapter. `terylon-forge`, the port, is auto-installed because this plugin declares
  `dependencies: ["terylon-forge"]`, but it ships no adapter and registers no server. **`resolve-forge`**
  (in the port) decides which adapter a run targets; a forge whose adapter is not enabled stops the run.
- Platform mechanics (call shapes, where each key lives, field encodings, markdown rendering rules) are
  owned by the **`forge-ops`** engine skill of that adapter. **Load `forge-ops` by name** —
  plugin-qualified when both adapters are enabled — for the exact recipes before the first platform call.
- **Cross-plugin reference — by name only, never by path.** `forge-ops` is in a different plugin than this
  skill, so it MUST be loaded by its name `forge-ops` and never by a file path. `${CLAUDE_PLUGIN_ROOT}`
  resolves to **`terylon-product`** (this plugin), NOT to `terylon-forge` — so building a path to the
  engine's files under `${CLAUDE_PLUGIN_ROOT}` points at a file that does not exist here and will fail.
  Relative parent-directory imports (paths that climb out of this plugin) are likewise banned. Loading
  the engine by name is the only supported cross-plugin mechanism.
- The skill runs inside the product repo it grounds against (`--repo` default = cwd).

## Forge mechanics — delegated to `forge-ops`

**This skill names operations and keys, never tools or fields.** The operations it relies on —
fetching an item (`fetch-work-item`), creating one (`create-work-item`), and linking a parent
(`link-work-item-parent`) — live in the **`forge-ops`** engine skill of the adapter `resolve-forge`
named, together with the key table that says where each key lives on that forge. Delegation centralizes
the *recipes* only — this skill still issues its own platform calls following them, which is why both
surfaces sit in `allowed-tools` (an absent one is inert), and it assembles its own footer. `forge-ops`
never resolves or stamps this skill's footer; footer/version are resolved locally (see the Output
template section).

```
create-user-story
├── resolve-forge ........ which forge, and so which adapter      (terylon-forge)
└── forge-ops ............ the adapter's body: recipes + key table (terylon-ado | terylon-github)
    ├── fetch-work-item ........ the parent: context, planning, children
    ├── create-work-item ....... the story, from the keys
    └── link-work-item-parent .. child under parent, read back
```

## Workflow

### 1. Parse inputs

Parse `<brief>`, `--parent` (id or URL), and the flags. Resolve `--repo` (default = current working
directory). Capture `--story-points` / `--priority` if supplied.

**Resolve the forge before anything else**: invoke `resolve-forge` with the `--parent` URL when one was
given, and against `--repo` otherwise, and report what it returned in one line. If it resolves nothing,
or its adapter is not enabled, stop as it says — never fall back to the other adapter. Then load that
adapter's `forge-ops` and parse the parent with `parse-item-url`.

### 2. Fetch the parent Feature

Fetch the parent Feature via `forge-ops` `fetch-work-item`. Read its `title` and `description` for
context, and keep its `planning` to inherit onto the new story. Keep its `children` for the duplicate
guard in step 6.

### 2a. What this forge does not carry

Read the **Carried** column of the key table in `forge-ops` for every key this draft will carry —
`planning` always, `estimate` and `priority` when given, `tags` when given. **Every key marked *not
carried* is named in the draft before anything is written**, with what happens instead:

```markdown
**Not carried on github:** `planning` (the Feature's area and iteration) and `estimate` (5) — this forge has no field for them, so nothing is written in their place.
```

Never drop one silently, and never invent a stand-in — a milestone for an iteration, a label for an
estimate. A reader who asked for story points and finds none must be able to see that the run said so.

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

#### 5a. `## Summary` — the human-readable opener

**Every story opens with a `## Summary` block: 2 to 5 bullets, 400 characters total, hard cap.**

Not to be confused with the `## Summary` of a PR description (`write-pr-description`), which is prose rather than bullets. The same name is deliberate — same job, same position, adjacent artifacts — but the shape and the cap belong to this skill.

The rest of the description is written for whoever implements it: grounded, exact, long. That precision is the point and is **not** budgeted. But it makes the story unreadable at a glance, and most people who open a story are not implementing it — they are triaging a backlog, running a planning session, or checking what a colleague is on. `## Summary` is the part they read.

| Belongs in it | Does not |
|---|---|
| **what changes**, in the language of someone using the thing rather than the language of the code | file paths, symbol names |
| **why**, when the reason is not obvious from the what | tool or parameter names, version numbers |
| **the one constraint or decision** a reader would otherwise have to dig for | links |

A bullet a product owner cannot parse has failed at its one job.

**Measure it before creating.** 400 characters is roughly four lines of prose and drafts overshoot it routinely. Count the assembled block — bullet markers included, the heading excluded — with `wc -c` on a quoted heredoc; UTF-8 bytes are never fewer than the characters, so passing that check guarantees you are inside the cap.

Over budget: **cut the qualifier from the longest bullet before cutting a whole bullet.** Dropping a bullet loses a fact; tightening one only loses words. Never go below 2 bullets, and never solve it by moving the content down into `## Description`.

**The section that follows is `## Description`, and it is what keeps the opener honest.** Everything after `## Summary` sits under a heading of its own — never a bare paragraph. An unheaded paragraph renders as a continuation of the bullets, so a block that promised 400 characters visually runs on for a screen and a half and a skimmer cannot tell where "short" ended.

### 6. Branch on flags / create flow

- `--dry-run` → print the draft in chat, labelled dry-run. **Stop** — never create.
- default → print the draft (see Chat summary format) and wait for `push` / `create` / an explicit confirmation.
- `--auto` → proceed to create immediately.

**Before creating (even with `--auto`):**

- **Eligibility re-check** — re-fetch the parent Feature and confirm it still exists and `isClosed` is
  false. If not, surface this and stop.
- **Duplicate guard** — scan the Feature's `children` (fetched in step 2) for an AI-drafted story with
  the same title — detected by the footer sentinel substring `Generated with [Claude Code]` in its
  description. If a match is found, ask the user before creating a duplicate.

### 7. Create the story and link the parent

Create via `forge-ops` `create-work-item`, with these keys:

| Key | Value |
|---|---|
| `type` | `user-story` |
| `title` | the drafted title |
| `description` | the drafted Markdown description, **without** the footer |
| `acceptanceCriteria` | the `- [ ]` checklist, no heading |
| `footer` | the footer line (Output template) |
| `planning` | the parent's, unchanged — only where the forge carries it |
| `estimate`, `priority`, `tags` | from the flags, only where given and carried |

**Every key is handed over as markdown, and rendering it is the adapter's job.** Where a forge stores
multiline text in a field with its own format, the adapter writes it as Markdown — the setting that
makes a `- [ ]` line an interactive checkbox rather than a dead bullet. This skill passes no format.

**The acceptance criteria go in the `acceptanceCriteria` key**, the one named for them. Do not duplicate them into `description` — two copies means one of them starts drifting, and a reader has no way to tell which is current. The description carries the story, the approach, the implementation detail and the out-of-scope boundary; the criteria travel separately, and the adapter puts them where that forge keeps criteria.

Then link the parent via `forge-ops` `link-work-item-parent` with `child` = the new story and
`parent` = the Feature. **Verify by reading the parent back**: its `children` include the new story.
The direction matters — the story's parent is the Feature, not the reverse.

**If the link is refused**, the story exists and is not attached. Print it as such — `Created User Story
#<id>, NOT linked under Feature #<parent>: <reason>` — and do not record the parent anywhere else.

Print: `Created User Story #<id> under Feature #<parent>: <url>`.

### 8. Do not commit

Do NOT create a commit, stage anything, or touch the git worktree. This skill creates an item on the forge,
not git changes — it reads the product repo only to ground the story. Stop after creating (or printing).

## Output template

**Title** — concise, with a scope qualifier when relevant (e.g. `… (Devices MVP)`).

**Description** — the `description` key:

```markdown
## Summary
- <what changes, in plain language — 2 to 5 bullets, 400 characters TOTAL (step 5a)>

## Description
<one-paragraph what + why, linking the parent Feature and any related WIs / spikes>

## Approach
<the chosen approach in prose>

## Implementation
<precise, codebase-grounded detail: numbered where ordered; reference REAL artifacts
(exact file paths, modules, classes, data shapes, config/catalog locations); Markdown
table where it clarifies>

## Out of scope
- <explicitly excluded items>
```

**Footer** — the `footer` key, which the adapter places last in the item:

```markdown
---
*🤖 Generated with [Claude Code](https://claude.ai/code) — create-user-story@<plugin-version> · <model> / <effort>*
```

**Acceptance criteria** — the `acceptanceCriteria` key. Just the checklist, no heading (the adapter supplies one where the forge needs it):

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

**Two mechanics from `forge-ops` bite here.** Criteria stored as HTML render `~~` literally, and on
Azure DevOps the `update-work-item` operation silently drops tag-shaped `<…>` content - so scan the
criteria you are round-tripping for a literal angle bracket before writing. Both are declared in
`forge-ops`; write the criteria so they survive either forge.

**This is the product owner's act, never the tester's.** The `tester` proposes rewrites for
criteria it finds defective and applies none of them; see the criteria/test-plan convention in
`plugins/CLAUDE.md`.

`<plugin-version>` is read at runtime from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`. `<model>` is the model the run executes under (e.g. `opus-4.8`) — the skill knows it from itself, as no environment variable exposes it. `<effort>` comes from the `CLAUDE_EFFORT` environment variable (e.g. `xhigh`); **when `CLAUDE_EFFORT` is unset, omit the entire ` · <model> / <effort>` segment.** The substring `Generated with [Claude Code]` is the sentinel for prior-run detection — everything variable sits after that stable prefix.

**Formatting rules** (the same markdown rules `forge-ops` documents — load
`forge-ops` by name for the full text):

- **Acceptance criteria use unchecked `- [ ]` only** — never `- [x]` and never static glyphs (`✓`,
  `✅`, `🟢`, "Done"). A pre-checked box claims something was verified; on Azure DevOps it renders as
  a static tick the reader cannot toggle, defeating the checklist. Even criteria you believe are already
  met stay `- [ ]`.
- **No hard-wrapping** — Azure DevOps renders every source line break verbatim, so wrapping a paragraph
  or bullet at 72 / 80 chars produces choppy short lines; GitHub would forgive it, and the rule binds on
  both anyway. Emit each paragraph and each bullet as one continuous line; insert a real line break only
  between distinct paragraphs / bullets / headings.
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

**Print the measured `## Summary` length against the 400-character cap** beside the draft, so a reader can see the budget was checked rather than assumed.

## Common mistakes

- **Skipping `## Summary`, or burying it** — it is mandatory and it goes first, above the opening paragraph. Its whole value is being the first thing on screen.
- **Writing `## Summary` in code** — file paths, symbol and tool names belong below it.
- **Trimming `## Implementation` to hit a budget** — only `## Summary` is capped. The grounded detail serves a different reader, which is why the two are separate sections.
- **Leaving the paragraph after `## Summary` unheaded** — it belongs under `## Description`, or the short block visually runs on and the cap buys nothing.

- **Hard-wrapping paragraphs / bullets** — Azure DevOps renders source line breaks verbatim; wrapping at
  72–80 chars produces visible choppy lines. One continuous line per paragraph / bullet, on both forges.
- **Pre-checking acceptance criteria with `- [x]` or `✓`** — a pre-checked box is a claim nobody
  verified, and on Azure DevOps a tick the reader cannot toggle. Always emit `- [ ]`.
- **Acceptance criteria show as plain bullets, not checkboxes** — the item was written outside the
  `create-work-item` recipe, whose adapter writes every multiline key as Markdown. Follow the recipe
  rather than calling the platform from memory; it is the single most common cause of missing checkboxes.
- **Criteria in the wrong key, or in two** — they belong in `acceptanceCriteria`. Do not also put them
  in `description`: two copies drift, and a reader cannot tell which one is current.
- **Dropping a key the forge does not carry without saying so** — a requested estimate that silently
  vanishes is a defect even though the write succeeded. Step 2a names every one before the write.
- **Naming a platform field or tool here** — this skill names keys and operations. A field reference
  copied into it is a second place to fix when the adapter changes, and it makes the skill one forge's.
- **Un-grounded, vague implementation detail** — the distinctive value of this skill is real anchors.
  Reference exact file paths / modules / data shapes from the Explore sub-agent, not generic prose. If
  grounding failed, say so rather than inventing plausible-looking detail.
- **Forgetting the parent link** — `create-work-item` sets the keys only; it CANNOT set the parent
  relation. Skipping `link-work-item-parent` leaves the story orphaned (no parent Feature).
- **Reversing the `link-work-item-parent` direction** — `child` must be the new story and `parent` the
  Feature. Swapping them makes the Feature a child of the story.

## Verification

1. `/create-user-story "<brief>" --parent=<known Feature> --dry-run` inside a product repo.
   Expect: a draft matching the Output template printed to chat with **real file anchors** in `## Implementation`,
   `- [ ]` acceptance criteria, an `## Out of scope` section, and the footer. No work item created
   (the parent Feature's child count is unchanged); no `create-work-item` / `link-work-item-parent` call.
2. `/create-user-story "<brief>" --parent=<known Feature>` (default) → confirm prompt.
   On `push`: a User Story is created with a Markdown description, the parent's `planning` where the
   forge carries it, and **linked as a child of the parent Feature** (verify the story's parent is the
   Feature, not the reverse). The new id + URL is printed.
3. Footer identity — the created story's footer reads `create-user-story@<terylon-product version>`,
   resolved in this plugin's own `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`.
4. Duplicate guard — re-run step 2 against the same Feature with the same title. Expect: the existing
   AI-drafted child (footer sentinel) is detected and the skill asks before creating a duplicate.
5. Checkbox rendering — open the created story: the acceptance criteria appear as **interactive
   checkboxes**, not plain bullets, on either forge. Re-fetch via `forge-ops` `fetch-work-item` and
   confirm `acceptanceCriteria` comes back as the checklist that was sent, in markdown. If they render as
   plain bullets, the item was written outside the recipe (see Common mistakes).
6. **A forge that does not carry a key** — on GitHub, pass `--story-points=5`. Expect the draft to name
   `planning` and `estimate` as not carried before the confirmation prompt, and the created issue to
   carry no invented label or milestone for either.
7. **Criteria state outcomes, not implementations.** Read every generated criterion back: none
   names a component, a file path, a command or a flag. A criterion saying "the tester invokes
   `measure-token-spend` and writes `docs/…/<session>-tokens.md`" is a defect even when it is
   true on the day it is written, because the next refactor moves the call and the criterion
   then contradicts working code. The equivalent outcome — "the run's token spend is reported
   per tier and written to the session's monitoring file" — survives the move.
