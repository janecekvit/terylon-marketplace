---
name: create-feature
description: >-
  Use when drafting, updating, reviewing, or validating an Azure DevOps Feature work item.
  Triggers on phrasings like "write a Feature", "draft a Feature spec", "update Feature N",
  "is this Feature ready", "review this Feature". Applies the Terylon Feature Specification
  Standard in this skill's references/.
allowed-tools: Read, Edit, Write, Bash(git *), mcp__plugin_terylon-devops_ado__*
---

# Create Feature

## Overview

Drafts, updates, and reviews Azure DevOps Features against the Terylon Feature Specification Standard. The standard itself - naming rules, the field template, the Definition of Ready, the quality bar - lives in `${CLAUDE_PLUGIN_ROOT}/skills/create-feature/references/feature-standard.md` and is the **single source of truth**. This skill does not restate it; it reads the rule at runtime and applies it. Always read that file at the start.

**Core discipline:** never fabricate the inputs a drafter can't know. Customer names, external references, business context, and real-world numbers are not yours to invent - gather them from the user (or mark `N/A` / `TBD` with a note). A confident-looking spec full of invented references is worse than one that flags its gaps.

## Prerequisites

- The `ado` MCP server is provided by `terylon-devops@terylon`, auto-installed because this plugin declares `dependencies: ["terylon-devops"]`. At runtime the server is namespaced `mcp__plugin_terylon-devops_ado__*`; the bare `mcp__ado__*` names below are shorthand for that form.
- ADO mechanics (tool call shapes, field encodings) are owned by the **`ado-mcp`** engine skill in `terylon-devops`. **Load `ado-mcp` by name** for the exact recipes before issuing any `mcp__ado__*` call. Reference it by name only - this skill lives in a different plugin, so do not path into `terylon-devops` (`${CLAUDE_PLUGIN_ROOT}` is local to `terylon-product`, and parent-directory relative imports are banned).
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

Give the paste-ready artifact, then the readiness verdict and the specific list of what must happen before it's ready to break down into User Stories. If pushing to ADO, follow [Writing to ADO](#writing-to-ado).

## Mode: update or review an existing Feature

Given a Feature ID (or a pasted draft), validate and improve it against the standard.

### 1. Read the standard

Read `${CLAUDE_PLUGIN_ROOT}/skills/create-feature/references/feature-standard.md`.

### 2. Fetch the work item

If the user gave an ADO Feature ID, fetch the work item with `mcp__plugin_terylon-devops_ado__wit_get_work_item` (the `ado-mcp` `fetch-work-item` recipe) to see the current title, description, state, assignees, and tags before drafting. For a pasted draft, skip this step.

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

A checklist verdict plus a concrete, ordered list of fixes. Suggest a compliant name rewrite if the title fails (sanctioned by Section 1), but don't rewrite field bodies unless asked - point to what to change. If pushing changes to ADO, follow [Writing to ADO](#writing-to-ado).

## Writing to ADO

Before updating the work item:

1. **Show the draft and confirm.** Print the draft in plain Markdown. Ask: push as-is (placeholders included), revise first, or just leave the draft here? Do not write to the work item until the user confirms.
2. **Confirm title edits separately.** Title edits are higher blast radius than description edits - get a separate yes for the name.
3. **Always Markdown — never HTML.** In HTML a `- [ ]` line is a dead bullet, headings and tables need hand-written tags, and the Definition of Ready checklist stops being a checklist. Markdown renders all of it natively and matches what `create-user-story` already does.

   | Mode | Operation | What it must carry |
   |---|---|---|
   | New Feature | `create-work-item` | `System.Description` as Markdown — send the draft as written |
   | Update existing | `update-work-item` | the format path **and** the content in one call, format first |

   **Patch the format path every time, even when the field is already Markdown.** It is idempotent, and omitting it against an HTML field silently writes Markdown source into an HTML container, where a `- [ ]` renders as a dead bullet. The exact patch shape lives in the `update-work-item` recipe in `ado-mcp` — read it there rather than writing it from memory: the tool surface changes between pinned server versions, and a stale parameter name rejects the whole call.
4. **Do NOT hard-wrap.** ADO renders every source line break verbatim - it does not treat a single newline as a soft wrap the way GitHub does. Wrapping a paragraph or a bullet at 72 / 80 chars produces visibly choppy short lines in the rendered work item. Emit each paragraph and each bullet as **one continuous line**; insert a real line break only between distinct paragraphs, bullets, or headings. This applies to the Markdown draft and to the HTML you push.
5. **Dashes:** in the body use only `-` or `–`, never an em-dash (`—`). The footer line below is the single exception - it is emitted from the template verbatim.

The Azure DevOps calls themselves - fetching the Feature (`fetch-work-item`), creating one (`create-work-item`) and pushing an update (`update-work-item`) - are owned by the **`ado-mcp`** engine skill. **Load `ado-mcp` by name and take the call shapes from it**; this skill issues its own `mcp__plugin_terylon-devops_ado__*` calls following those recipes and names no tool of its own.

Every write is Markdown. A new Feature is created with `format: "Markdown"`; an update patches `/multilineFieldsFormat/System.Description` alongside the content, because the update operation carries no per-field format. See step 3 and the `update-work-item` recipe.

**Parenting.** `create-work-item` sets field values only - it cannot set the parent relation. To place the Feature under an Epic, follow with `link-work-item-parent`, where the **new Feature** is the subject and the Epic is what it links to. Getting the direction backwards makes the Epic a child of the Feature.

## Footer

End every artifact pushed to ADO with:

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

- For non-Feature ADO work items (Tasks, Bugs, Epics) - the standard is Feature-scoped. For User Stories use `create-user-story`.
- For product strategy, brainstorming, or marketing copy - use a brainstorming workflow or the relevant prompt template.
- For a change so small it is a single User Story - create the story directly under an existing Feature instead of wrapping it in a new one.

## How to extend

The standard lives in this repo and is owned here. To change the template, the naming convention, the DoR checklist, or the quality bar, edit `${CLAUDE_PLUGIN_ROOT}/skills/create-feature/references/feature-standard.md` directly via PR, bump the `**Version:**` / `**Last updated:**` header in that file, and bump `terylon-product`'s `plugin.json` version so consumers re-fetch.

## Verification

In Claude Code from the repo root:

1. Run `/create-feature` (or ask "draft a feature spec") in a session — confirm the skill loads and reads the standard at `${CLAUDE_PLUGIN_ROOT}/skills/create-feature/references/feature-standard.md` before drafting.
2. Pass a sample brief (e.g. "draft a feature: SIEM log forwarding for enterprise customers, depends on the platform team") and confirm the draft uses the Section 2 template verbatim (all seven fields, UX included), runs the Section 3 DoR check, and writes `[needs input]` for fields the brief didn't cover (not invented content).
3. Given an existing ADO Feature ID, the review mode must call `mcp__plugin_terylon-devops_ado__wit_get_work_item` (the `ado-mcp` `fetch-work-item` recipe) before commenting on the title or fields, and must report on the UX field's three edge states.
4. Footer identity — a pushed Feature's footer reads `create-feature@<terylon-product version>`, resolved from this plugin's own `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`.
5. **Markdown rendering** — open a Feature this skill wrote: headings, tables and code spans render natively, and any `- [ ]` line is an interactive checkbox rather than a dead bullet. Equivalently, re-fetch it and confirm `multilineFieldsFormat["System.Description"]` reads `"markdown"`.
6. **Conversion of an inherited HTML Feature** — run the update mode against a Feature whose description is HTML. Expect `multilineFieldsFormat` to read `"markdown"` afterwards and the body to render as Markdown. Verified on Feature #112, which was created as HTML before this rule existed.

## Common mistakes

- **Writing HTML at all.** Every multiline field this skill touches is Markdown. HTML costs the interactive checkboxes and forces hand-written `<p>` / `<ul><li>` tags for content ADO renders on its own.
- **Updating without the format op.** The `update-work-item` operation takes no per-field `format`, so a Markdown body patched into a field still encoded as HTML renders as literal `#` and `-`. Always send the `/multilineFieldsFormat/` op alongside the content — it is idempotent when the field is already Markdown, and it is the repair when it is not.
- **Forgetting the parent link.** `create-work-item` sets fields only. Without a following `link-work-item-parent`, the Feature is orphaned rather than sitting under its Epic.
- **Inventing what you cannot know.** Customer names, external references, real-world numbers. Mark `[needs input]` and say so in the readiness verdict.
- **Hard-wrapping paragraphs or bullets.** ADO renders source line breaks verbatim; wrapping at 72 or 80 characters produces visibly choppy lines. One continuous line per paragraph and per bullet.
