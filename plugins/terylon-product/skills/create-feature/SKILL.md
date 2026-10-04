---
name: create-feature
description: >-
  Use when drafting, updating, reviewing, or validating a Feature, on Azure DevOps or GitHub.
  Triggers on phrasings like "write a Feature", "draft a Feature spec", "update Feature N",
  "is this Feature ready", "review this Feature". Applies the Terylon Feature Specification
  Standard in this skill's references/.
allowed-tools: Read, Edit, Write, Bash(git *), Bash(gh *), mcp__plugin_terylon-ado_ado__*
---

# Create Feature

## Overview

Drafts, updates, and reviews Features against the Terylon Feature Specification Standard, on whichever forge the repository is hosted on — a work item on Azure DevOps, an issue on GitHub. It is written against the port's **work-item keys** and never names a platform field; where each key lives is the adapter's answer. The standard itself - naming rules, the field template, the Definition of Ready, the quality bar - lives in `${CLAUDE_PLUGIN_ROOT}/skills/create-feature/references/feature-standard.md` and is the **single source of truth**. This skill does not restate it; it reads the rule at runtime and applies it. Always read that file at the start.

**Core discipline:** never fabricate the inputs a drafter can't know. Customer names, external references, business context, and real-world numbers are not yours to invent - gather them from the user (or mark `N/A` / `TBD` with a note). A confident-looking spec full of invented references is worse than one that flags its gaps.

## Prerequisites

- Forge access comes from an adapter. `terylon-forge`, the port, is auto-installed because this plugin declares `dependencies: ["terylon-forge"]`, but it ships no adapter. **`resolve-forge`** (in the port) decides which adapter a run targets — from a pasted Feature URL first, then `TERYLON_FORGE`, then the git remote — and a forge whose adapter is not enabled stops the run.
- Platform mechanics (call shapes, where each key lives, field encodings) are owned by the **`forge-ops`** engine skill of that adapter, `terylon-ado` or `terylon-github`. **Load `forge-ops` by name** — plugin-qualified when both are enabled — for the exact recipes before the first platform call. Reference it by name only - it lives in a different plugin, so do not path into it (`${CLAUDE_PLUGIN_ROOT}` is local to `terylon-product`, and parent-directory relative imports are banned).
- The standard this skill applies is `${CLAUDE_PLUGIN_ROOT}/skills/create-feature/references/feature-standard.md`, owned by this repo. Read it at the start of every run.

## Mode: write a new Feature

### 1. Read the standard

Read `${CLAUDE_PLUGIN_ROOT}/skills/create-feature/references/feature-standard.md`. Use Section 1 for naming, Section 2 for the field template, Section 3 for the readiness check, Section 4 as the quality bar.

### 2. Intake - gather inputs before drafting

Ask the user for what you'd otherwise have to guess. Don't draft until you have, or have explicitly marked `N/A` / `TBD` for:

- **Problem context:** what's broken / missing / risky, who's impacted, why now. Any evidence backing it (tickets, measurements, user feedback)?
- **Affected roles:** which user roles the Feature serves, and whether their needs differ. Distinct roles become distinct User Stories later, so get the list right.
- **Desired outcome & scope:** what the solution does; what's explicitly in and out of scope. If several solution variants were considered, which were rejected and why.
- **UX:** the user flow step by step, links to wireframes / Figma designs, and behaviour of the three edge states (empty, error, loading). For a backend-only Feature with no UI, confirm `N/A` - don't guess.
- **Requirements:** the functional behaviour the system must exhibit, plus any non-functional constraints (performance, availability, security, compatibility) that genuinely apply.
- **References:** links to designs, related work items, prior discussions. Do **not** invent these - ask, or leave `TBD` with a note.

Ask for missing pieces in one batch; don't interrogate field-by-field.

### 3. Draft

Write the artifact using the Section 2 template verbatim (field order and headings). Apply the Section 1 naming rules to the title (user-benefit outcome, no jargon / codename, at most one prefix). Fill every field or mark `N/A` with a brief why. Write acceptance criteria in Given / When / Then form and cover the negative paths too - invalid input, missing permission, a dependency being down.

For fields the user could not fully specify, write `[needs input]` (optionally with a short suggestion, e.g. `[needs input - suggest: adoption %, support-ticket trend at 30/60 days]`) instead of inventing content.

### 4. Readiness check

Run the Section 3 Definition of Ready checklist (see [Definition of Ready](#definition-of-ready) below). Report each item pass / partial / not-met. Be explicit about what still needs human input (real references, unresolved scope decisions) and cannot be settled inside a draft.

### 5. Output

Give the paste-ready artifact, then the readiness verdict and the specific list of what must happen before it's ready to break down into User Stories. If pushing it to the forge, follow [Writing to the forge](#writing-to-the-forge).

## Mode: update or review an existing Feature

Given a Feature ID (or a pasted draft), validate and improve it against the standard.

### 1. Read the standard

Read `${CLAUDE_PLUGIN_ROOT}/skills/create-feature/references/feature-standard.md`.

### 2. Fetch the work item

If the user gave a Feature id or URL, resolve the forge (`resolve-forge`), then fetch it with the `fetch-work-item` operation to see its current `title`, `description`, `isClosed` and `tags` before drafting. For a pasted draft, skip this step.

### 3. Title - check against Section 1

Compare the title to the naming convention:

- Format: `[Optional prefix] <user-benefit statement>`
- Outcome-focused, not implementation-focused
- Understandable without further context
- No jargon, acronyms, or internal codenames in the benefit statement
- At most one prefix, and only in the `[ProjectName]` form - never two

If the title describes the technical change rather than the user outcome, flag it and propose an outcome-focused alternative. Do not silently rename - ask before changing. Title edits are higher blast radius than description edits.

### 4. Completeness

Every Section 2 field must be present and filled or `N/A` with a reason. Flag empty / placeholder fields. A present-but-malformed field (e.g. acceptance criteria written as loose prose instead of Given / When / Then) is a fail with a suggested correction, not a pass.

Pay particular attention to the fields most often left thin:

- **UX** - is the user flow described step by step? Are the design links present? Are **all three edge states** covered: empty state (the user has nothing yet), error state (what went wrong and what to do), loading state (what the user sees before data arrives)? A backend-only Feature must say so explicitly rather than leaving UX blank.
- **User needs** - is every affected role listed, in the "As a \<role\> I want \<goal\> so that \<benefit\>" form?
- **Acceptance criteria** - Given / When / Then, and do they cover the negative paths?
- **Out of scope** - are the boundaries explicit, with reasons?

### 5. Quality

Apply the Section 4 quality bar: a developer must be able to derive User Stories from the Feature without asking follow-up questions, and a tester must be able to write test scenarios straight from the acceptance criteria. Call out vague scope, untestable requirements, requirements that describe *how* rather than *what*, and any field that looks confident but rests on invented data.

### 6. Definition of Ready

Run the Section 3 checklist (see below) against the current state. Mark each item pass / partial / not-met. Where the pasted text simply cannot settle an item, mark it "can't verify from text" rather than forcing a result.

### 7. Output

A checklist verdict plus a concrete, ordered list of fixes. Suggest a compliant name rewrite if the title fails (sanctioned by Section 1), but don't rewrite field bodies unless asked - point to what to change. If pushing changes to the forge, follow [Writing to the forge](#writing-to-the-forge).

## Writing to the forge

```
create-feature
├── resolve-forge ........ which forge, and so which adapter      (terylon-forge)
└── forge-ops ............ the adapter's body: recipes + key table (terylon-ado | terylon-github)
    ├── fetch-work-item ........ review mode: the Feature as it stands
    ├── create-work-item ....... a new Feature, from the keys
    ├── update-work-item ....... an existing Feature, only the keys that changed
    └── link-work-item-parent .. a new Feature under its Epic, read back
```

**The whole specification is the `description` key, on both forges.** The standard's seven fields — Acceptance criteria among them — are sections of one body, so a Feature passes no `acceptanceCriteria` key and every section reaches the forge in the order the standard lays out. That is what keeps the standard intact on a forge whose criteria have no field of their own.

| Key | Value |
|---|---|
| `type` | `feature` |
| `title` | the Section 1 title |
| `description` | the drafted specification, all seven fields, **without** the footer |
| `footer` | the footer line ([Footer](#footer)) |

Any other key this run would carry — `tags`, `planning` under an Epic — is checked against the **Carried** column of the key table in `forge-ops` first. A key the forge does not carry is named in the draft before the write, never dropped silently and never replaced by an invented stand-in.

Before writing to the item:

0. **Resolve the forge, in either mode.** Invoke `resolve-forge` — with the Feature's URL in update mode, against the repository in create mode — and report its answer in one line. If nothing resolves or its adapter is not enabled, stop as it says; a new Feature has no fallback forge.
1. **Show the draft and confirm.** Print the draft in plain Markdown. Ask: push as-is (placeholders included), revise first, or just leave the draft here? Do not write to the work item until the user confirms.
2. **Confirm title edits separately.** Title edits are higher blast radius than description edits - get a separate yes for the name.
3. **Always Markdown — never HTML.** In HTML a `- [ ]` line is a dead bullet, headings and tables need hand-written tags, and the Definition of Ready checklist stops being a checklist. Hand the keys over as markdown; storing them so they render is the adapter's job, including converting an inherited HTML field the moment it is written.

   | Mode | Operation | What it carries |
   |---|---|---|
   | New Feature | `create-work-item` | the keys above, the draft as written |
   | Update existing | `update-work-item` | only the keys that changed — `description`, and `title` once separately confirmed |

   **Take the call shape from the recipe, not from memory.** Where a forge keeps a per-field format, the `update-work-item` recipe in `forge-ops` sets it in the same call as the content; a write from memory can land Markdown source in an HTML container, where a `- [ ]` renders as a dead bullet. The tool surface changes between pinned versions, and a stale parameter name rejects the whole call.
4. **Do NOT hard-wrap.** Azure DevOps renders every source line break verbatim - it does not treat a single newline as a soft wrap the way GitHub does. Wrapping a paragraph or a bullet at 72 / 80 chars produces visibly choppy short lines in the rendered item. Emit each paragraph and each bullet as **one continuous line**; insert a real line break only between distinct paragraphs, bullets, or headings. The rule binds on both forges.
5. **Dashes:** in the body use only `-` or `–`, never an em-dash (`—`). The footer line below is the single exception - it is emitted from the template verbatim.

The platform calls themselves - fetching the Feature (`fetch-work-item`), creating one (`create-work-item`) and pushing an update (`update-work-item`) - are owned by the **`forge-ops`** engine skill of the adapter `resolve-forge` named. **Load `forge-ops` by name and take the call shapes from it**; this skill issues its own platform calls following those recipes, names operations and keys, and names no tool or field of its own. Both surfaces sit in `allowed-tools` for that reason — an absent one is inert.

**Parenting.** `create-work-item` sets the keys only - it cannot set the parent relation. To place the Feature under an Epic, follow with `link-work-item-parent`, with `child` = the **new Feature** and `parent` = the Epic, and confirm by reading the Epic back. Getting the direction backwards makes the Epic a child of the Feature. A refused link is reported as created-and-not-linked, and the Epic is recorded nowhere else.

## Footer

End every artifact pushed to the forge with this line — the `footer` key, which the adapter places last:

```
---
*🤖 Generated with [Claude Code](https://claude.ai/code) — create-feature@<plugin-version> · <model> / <effort>*
```

`<plugin-version>` is read at runtime from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`. `<model>` is the model the run executes under (e.g. `opus-4.8`) — the skill knows it from itself, as no environment variable exposes it. `<effort>` comes from the `CLAUDE_EFFORT` environment variable (e.g. `xhigh`); **when `CLAUDE_EFFORT` is unset, omit the entire ` · <model> / <effort>` segment.** The substring `Generated with [Claude Code]` is the sentinel for prior-run detection — everything variable sits after that stable prefix.

## Definition of Ready

Use this checklist for both modes; it mirrors Section 3 of the standard. The Feature is ready to be broken down into User Stories only when every item is checked.

- [ ] Title follows the Section 1 naming rules
- [ ] **Problem** is concrete and evidenced, not an assumption
- [ ] **User needs** cover every affected role
- [ ] **Design & proposal** delimits both the scope and what falls outside it
- [ ] **UX** describes the flow and all three edge states (or `N/A` with a reason)
- [ ] **Requirements** are testable and describe what, not how
- [ ] **Acceptance criteria** are in Given / When / Then form and cover the negative paths
- [ ] No field contains an invented value - open questions are marked `TBD` with a note

Report which items are not yet met. A draft with `[needs input]` placeholders is explicitly *not* DoR.

## When NOT to use this skill

- For non-Feature items (Tasks, Bugs, Epics) - the standard is Feature-scoped. For User Stories use `create-user-story`.
- For product strategy, brainstorming, or marketing copy - use a brainstorming workflow or the relevant prompt template.
- For a change so small it is a single User Story - create the story directly under an existing Feature instead of wrapping it in a new one.

## How to extend

The standard lives in this repo and is owned here. To change the template, the naming convention, the DoR checklist, or the quality bar, edit `${CLAUDE_PLUGIN_ROOT}/skills/create-feature/references/feature-standard.md` directly via PR, bump the `**Version:**` / `**Last updated:**` header in that file, and bump `terylon-product`'s `plugin.json` version so consumers re-fetch.

## Verification

In Claude Code from the repo root:

1. Run `/create-feature` (or ask "draft a feature spec") in a session — confirm the skill loads and reads the standard at `${CLAUDE_PLUGIN_ROOT}/skills/create-feature/references/feature-standard.md` before drafting.
2. Pass a sample brief (e.g. "draft a feature: SIEM log forwarding for enterprise customers, depends on the platform team") and confirm the draft uses the Section 2 template verbatim (all seven fields, UX included), runs the Section 3 DoR check, and writes `[needs input]` for fields the brief didn't cover (not invented content).
3. Given an existing Feature id or URL on either forge, the review mode must call the `fetch-work-item` operation before commenting on the title or fields, and must report on the UX field's three edge states.
4. Footer identity — a pushed Feature's footer reads `create-feature@<terylon-product version>`, resolved from this plugin's own `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`.
5. **Markdown rendering** — open a Feature this skill wrote: headings, tables and code spans render natively, and any `- [ ]` line is an interactive checkbox rather than a dead bullet. Equivalently, re-fetch it and confirm the `description` key comes back as the markdown that was sent.
6. **Conversion of an inherited HTML Feature** — run the update mode against a Feature whose description is HTML, on Azure DevOps where a field can be. Expect the body to render as Markdown afterwards. Verified on Feature #112, which was created as HTML before this rule existed.
7. **Every section of the standard survives the forge** — push a Feature on each forge and re-fetch it: all seven fields of Section 2 are present in the `description`, in the standard's order, and nothing of the specification was moved into a field or section of the forge's own choosing.

## Common mistakes

- **Writing HTML at all.** Every key this skill hands over is Markdown. HTML costs the interactive checkboxes and forces hand-written `<p>` / `<ul><li>` tags for content either forge renders on its own.
- **Updating from memory instead of the recipe.** On a forge with per-field formats, a Markdown body written into a field still encoded as HTML renders as literal `#` and `-`. The `update-work-item` recipe sets the format with the content; follow it rather than reconstructing the call.
- **Splitting the specification across keys.** The standard's Acceptance criteria are a section of the description, not the `acceptanceCriteria` key. Moving them out reorders the standard on one forge and not the other.
- **Naming a platform field or tool here.** This skill names keys and operations; a field reference copied into it is a second place to fix, and it makes the skill one forge's.
- **Forgetting the parent link.** `create-work-item` sets the keys only. Without a following `link-work-item-parent`, the Feature is orphaned rather than sitting under its Epic.
- **Inventing what you cannot know.** Customer names, external references, real-world numbers. Mark `[needs input]` and say so in the readiness verdict.
- **Hard-wrapping paragraphs or bullets.** Azure DevOps renders source line breaks verbatim; wrapping at 72 or 80 characters produces visibly choppy lines. One continuous line per paragraph and per bullet, on both forges.
