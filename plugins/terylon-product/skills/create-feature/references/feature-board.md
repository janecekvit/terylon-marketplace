# Feature design board

**Version:** 1.0
**Last updated:** 2026-11-08

Every Feature `create-feature` writes carries its specification as a design board, in two files: one HTML page that follows the system's light or dark, and the same board in Markdown, attached to the Feature on its forge. This document is the single source of truth for both: their sections, how they are drawn, where each file goes and what happens when a step fails. `SKILL.md` names the step and points here; it does not restate any of it.

```
the specification (feature-standard.md, Section 2)
        │  drawn, never invented: every cell comes from a field of the spec, or says N/A / [needs input]
        ▼
  board.html ── one page, 1440 wide, LIGHT AND DARK from one token block ──▶ the repository's canvas,
        │       plain HTML and inline CSS: NO SCRIPT OF ITS OWN, NO sc-if          when it keeps one
        │
        └──▶ board.md ── the same sections, the drawings as box drawings ──▶ ATTACHED TO THE FEATURE
                          one paragraph per line, no HTML                     attach-work-item-file
```

## 1. The sections

Both files carry the same six sections, in this order, under a header naming the Feature. **A section is drawn from the specification, never invented**: where the spec holds nothing for it, the section stays and says `N/A - <why>` or `[needs input]`, exactly as the spec does.

| # | Section | Drawn from | Shape |
|---|---|---|---|
| — | Header | the title, the id and its link once created, the date, `create-feature@<version>` | one line of facts |
| 0 | **Status strip** | the Feature's User Stories, or its landings, each with its state | a row of chips, one per story; before the breakdown, one chip: *not broken down yet* |
| 1 | **Today beside after** | *Problem (why)* for today, *Design & proposal (what)* for after | two drawings of the parts side by side: boxes for the parts, arrows for who calls or feeds whom, the load-bearing fact written inside the box |
| 2 | **What each part gets instead** | *Design & proposal* and *Requirements* | a table: part, today, after, why |
| 3 | **Who reaches what** | *User needs* and *UX* | a table or a drawing: each role from the User needs, what it reaches, and through what |
| 4 | **The owner's decisions** | *Design & proposal*'s chosen and rejected variants, *Out of scope* | a list: each decision with its reason; one still open is marked `TBD` with what decides it |
| 5 | **What each step measured** | the evidence the Feature's stories record | a table: step, what ran, what it printed. **At creation nothing has run**: the section says *nothing measured yet*, never a number |

**Section 5 is the one most tempting to fill and the one that must stay empty.** A board drawn before any story ran has measured nothing, and a figure in it is an invented value under the standard's quality bar. It fills when an update-mode run redraws the board after the stories record their evidence.

**A Feature with no user interface keeps every section.** Its parts are services, stores and jobs instead of screens; *Who reaches what* names the callers. No section is dropped from either file.

## 2. The HTML board

**Plain HTML and inline CSS, and nothing that needs a runtime to draw.** The board must render whole when a browser opens it from disk, with no network: no script of its own, no `sc-if`, no interactive part, no framework, no image fetched from anywhere. A drawing is inline SVG or boxes laid out in CSS. A canvas runtime line that the repository's canvas requires in every board's head is kept (section 4), because the canvas needs it and the board does not: without it the board still draws.

| Rule | Value |
|---|---|
| Width | **1440** px, the board's root a fixed-width block; the page's height is what the content takes |
| Light and dark | **one file**: the token block defines the light values on the root class and the dark ones under `@media (prefers-color-scheme: dark)`, plus `.light` and `.dark` overrides, so the system's scheme picks the theme and a viewer can force either |
| Colours, type, spacing, radii | **only through the tokens** (`var(--…)`): no colour literal outside the token block |
| Fonts | the token block's families, each followed by a local fallback, so the board draws offline. At most one Google Fonts stylesheet, and only when the canvas's own boards load one |
| External loads | none, but that one stylesheet and the canvas runtime line |
| Text | English, as everything the repository keeps; no host name, address, token or personal detail |

**The template is `${CLAUDE_SKILL_DIR}/references/feature-board.html`.** Copy it, replace its placeholders, and keep its structure: the token block between its `/* tokens: … */` and `/* /tokens */` markers, the root `<div class="t">`, and one `<section>` per row of the table in section 1, in that order.

### Whose tokens

| The repository | The token block is |
|---|---|
| keeps a canvas whose boards carry a `/* tokens: … */` block | **the canvas's**, copied byte for byte from one of its boards, or written by the generator the canvas's README names. Never edited by hand |
| keeps no canvas | the template's own, unchanged |

## 3. The Markdown board

**The same six sections, in the same order, as one Markdown file**: the board a forge renders. It is what is attached to the Feature, because a forge shows Markdown and not an HTML page.

- **Each section is a `##` heading** with the section's name, under one `#` heading that is the Feature's title.
- **A drawing becomes a box drawing in a bare fence**: `┌ ─ ┐ │ └ ┘ ├ ┤ ┬ ┴ ┼` for the boxes, `──▶` for the direction, the load-bearing fact written inside the box. Today and after are two drawings, one under the other, each under a bold label.
- **A table stays a table.** The status strip is one table row per story: story, state.
- **One paragraph per line, never hard-wrapped**, and no HTML at all: Azure DevOps renders every line break as written, and neither forge needs a tag for any of this.
- **Dashes:** `-` or `–` in the body, never an em dash, as in the specification itself.

```markdown
# <the Feature's title>

Feature <id> · <date> · create-feature@<version>

## Status strip

| Story | State |
|---|---|
| not broken down yet | - |

## 1. Today beside after

**Today**

<a box drawing in a bare fence>

**After**

<a box drawing in a bare fence>

## 2. What each part gets instead

| Part | Today | After | Why |
|---|---|---|---|

## 3. Who reaches what

| Role | Reaches | Through |
|---|---|---|

## 4. The owner's decisions

- <decision> - <reason>

## 5. What each step measured

Nothing measured yet.
```

## 4. Where each file goes

| File | Where | Written by |
|---|---|---|
| `board.html`, `board.md` | the run's draft folder, `docs/terylon/features/<slug>/` in the repository the run works in: the working tree the terylon plugins keep their task drafts in, ignored by git | this skill, always |
| `feature-<id>-board.md` | **attached to the Feature**, through the port's `attach-work-item-file` | this skill, once the Feature has an id |
| `Design-<Slug>.dc.html`, or the name the canvas's README gives a design board | **the repository's canvas**, beside its other design boards | this skill, only when a canvas exists |

**A canvas is a folder of `*.dc.html` boards**: find it with `git ls-files "*.dc.html"`. One folder is the canvas; several, and the run asks which; none, and the board stays in the draft folder alone. **Read the canvas's README before writing into it** and do what it says a new board needs, in the order it says:

1. Copy the board in under the canvas's naming, its head taken from a sibling design board (the runtime line, the wrapper elements and the font stylesheet the canvas's boards share) and its body from `board.html`.
2. Write the canvas's token block into it: run the token generator the README names, or copy the block from a sibling board.
3. Place it wherever the README says a board is placed: a manifest such as `canvas.json`, an index table in the README itself.
4. Regenerate whatever the README says is generated from the boards, such as a one-file export, with the generator it names.

**The canvas is changed in the working tree, never committed.** The files reach the repository through the owner's own branch and pull request, like every other change; the run reports each path it wrote.

**Terylon's canvas is the worked example**: `docs/architecture/terylon-architecture/`, a design board named `Design-<Slug>.dc.html`, placed on the *Design system* page in `canvas.json`, its token block written by `export/build-tokens.mjs`, the export by `export/build-export.mjs`, and the board listed in the README's *Design system* row. Its model board is `Design-Fewer-Layers.dc.html`, Feature 578's.

## 5. When a step fails

**Every step either happens or is named in the run's report, with why and what is left.** A board that was not attached is never reported as attached, and a Feature that was created is never reported as failed because its board was not.

| Step fails | The run |
|---|---|
| the spec is missing the field a section needs | draws the section with `[needs input]`, and lists it in the readiness verdict |
| writing the draft folder | stops before the push, names the path and the error: nothing is attached that was not written |
| `attach-work-item-file` refused or unavailable | reports the Feature **created, its board not attached**, the forge's error word for word, and the local path of `board.md`, so the owner can attach it by hand |
| the attachment is not found when the Feature is read back | the same: **not attached**, never assumed |
| a generator the canvas's README names fails, or a placing step cannot be done | reports the board **copied into the canvas and not placed**, the failing step and its output; leaves the files written so far in place |
| the canvas cannot be identified (several folders, no answer) | leaves the canvas untouched and says so |

**Nothing is skipped silently and nothing is retried in a loop.** One attempt per step, then the report.
