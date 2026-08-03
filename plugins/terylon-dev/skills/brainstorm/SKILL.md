---
name: brainstorm
description: >-
  Use when an idea is still too vague to plan — "I want to build X", "we should probably…", a
  half-formed feature, or a work item whose description only restates its title. Grounds the idea in
  the codebase, runs a one-question-at-a-time dialogue, writes a design document, and decomposes it
  into seed-specs that develop consumes. Also the second mode of develop's Gate 0. Optional flag
  --no-decompose.
allowed-tools: Read, Grep, Glob, Bash(git *), Write, AskUserQuestion
---

# brainstorm — from a vague idea to seed-specs

Turns something nobody can plan yet into something `develop` can. It ends where `develop`'s Gate 0 ends — at an **approved seed-spec** — which is why it can stand in for that gate rather than run before it.

It is a **skill and not an agent**, for the same reason `develop` is: `AskUserQuestion` works only on the main thread, and this skill is nothing but questions.

Two callers, and the second is the important one:

| Caller | How it arrives |
|---|---|
| the user | `/terylon-dev:brainstorm <idea>` |
| `develop` | Gate 0 triages an item as too vague and loads this skill by name |

## Usage

```
/terylon-dev:brainstorm <idea> [--no-decompose]
```

- `--no-decompose` — produce exactly one seed-spec, whatever the design contains. Use when the work is known to be a single deliverable and you only want it shaped.

## Shape of a run

```
brainstorm (main thread — the only place that can ask the user)
├── 1  ground .......... read the repository BEFORE the first question
├── 2  dialogue ........ AskUserQuestion, one question per message
├── 3  approaches ...... 2–3 with trade-offs, recommendation first
├── 4  design .......... presented in sections, approval after each
├── 5  write ........... docs/terylon/specs/<slug>-brainstorm.md
├── 6  self-review ..... placeholders, contradictions, ambiguity, scope
├── 7  decompose ....... docs/terylon/intake/<item-slug>-seed.md × N
└── 8  hand off ........ offer develop or create-user-story — never run them
```

Step 8 is skipped when `develop` is the caller: it already holds the seeds and carries on with them.

## Where it sits — the seam

Three kinds of questioning happen in this pipeline, and they must not ask the same things. **This table is the whole reason the skill can exist without duplicating `planner`.**

The middle column is Gate 0's **other** mode, not the gate as a whole — this skill is the first mode, so a run reaching the gate obeys column 1 or column 2, never both.

| | `brainstorm` | `develop` Gate 0 — **intake mode** | `planner` |
|---|---|---|---|
| Input | a vague idea | a seed-spec, URL, or prose | an approved seed-spec |
| Asks about | what, and why | what the seed leaves open | nothing — it is an agent |
| Output | a design document and N seed-specs | one completed seed-spec | a design and a test-first plan |
| Runs | main thread, before any workspace | main thread | an agent, inside the worktree |
| May name a file path | **no** | no | **yes — that is its job** |

**The last row is the hard boundary.** Read the code as *evidence* — what exists, what it costs to change, what a decision would collide with — and never prescribe the implementation. A design that names a path goes stale before anyone reads it, and `planner` redraws it from the live tree regardless.

This is the same discipline the acceptance criteria already obey: a criterion never names a component, because the implementation moves and the criterion does not. Everything this skill writes is on that side of the line.

## Workflow

### 1. Ground before asking

**Read the repository before the first question.** A question the code already answers spends a turn and teaches the user that the questions are not worth answering carefully.

| Read | For |
|---|---|
| `CLAUDE.md`, `README.md`, rules | the conventions the idea has to live inside |
| the modules the idea touches | what exists, and what the idea collides with |
| `git log` over those paths | what was already tried, and how recently |
| existing skills / agents / config of the same kind | whether this is new work or a change to something that exists |

Then say, in one or two lines, what you found that bears on the idea. That statement is also the user's chance to correct a wrong reading before it steers ten questions.

### 2. The dialogue

`AskUserQuestion`, **one question per message.** Ask only what is genuinely open.

- **Lead with your recommendation.** Put it first and mark it, then the alternatives. A question with no recommendation pushes work back at the person who asked for help.
- **Draw the options that have a shape.** An architecture, a layout, a call chain, a file tree — put an ASCII diagram in the option's preview rather than describing it in prose. The repo rule that *anything with a shape is drawn* applies to a question exactly as it applies to a document.
- **Every option carries its cost**, not only its benefit. An option list where one choice has no downside is a list that has not been thought through.

**Stop asking when the next question would not change the design.** That is the test — not a question count, and not "have I covered every area". An unanswered detail that does not move a decision belongs in the design document as an open item, not in a question.

### 3. Approaches

Two or three, with trade-offs, **recommendation first and the reasoning for it**. Cut ruthlessly: an approach carrying a feature nobody asked for is not an approach, it is scope.

### 4. The design, in sections

Present it in sections and **get approval after each one**, scaled to complexity — a few sentences where it is straightforward, a few paragraphs where it is not. Cover what the work *is*, why this shape, what it costs, and what it deliberately leaves out.

Go back when something stops making sense. A design that survived a section by not being questioned is not approved, it is unread.

### 5. Write the design document

To `docs/terylon/specs/<slug>-brainstorm.md`. Structure it the way this repo structures everything:

| Section | Content |
|---|---|
| Problem | what is wrong today, stated so it can be disagreed with |
| Decisions | a table — decision, the alternative rejected, why. One row per real fork in the dialogue |
| Shape | what the thing is, drawn if it has a shape |
| Costs and limits | what this buys and what it gives up |
| Out of scope | what was considered and deliberately left out, with the reason |
| Items | the decomposition, one row per seed-spec |

**The decisions table is the point of the document.** A design that records only the conclusion loses the alternatives, and the first person to revisit it re-argues from scratch.

### 6. Self-review

Read what you wrote with fresh eyes and fix inline — no second review pass:

| Check | Fix |
|---|---|
| `TBD`, `TODO`, an empty section, a vague requirement | resolve it or state it as an open item with an owner |
| two sections that contradict each other | pick one and correct the other |
| a requirement that reads two ways | pick a reading and make it explicit |
| scope too large for one implementation run | decompose further, or say which part is first |
| a file path or function name in the design | remove it — that is `planner`'s |

### 7. Decompose into seed-specs

One seed-spec per **independent deliverable**, written to `docs/terylon/intake/<item-slug>-seed.md`.

**Splitting follows deliverables, never list formatting.** A scope that happens to be a bulleted list is one item — the same rule `develop` applies to `---`, and it fails in both directions when guessed at.

Each seed-spec carries what Gate 0 produces today, plus one marker:

```markdown
---
brainstormed: docs/terylon/specs/<slug>-brainstorm.md
---

# <title>

<description — what and why, in the user's terms>

## Acceptance criteria

- [ ] <an outcome; never a component, path, or command>

## Links

- <work item, prior art, related seed-specs>
```

The `brainstormed:` marker is what lets `develop`'s Gate 0 ask only what is still open instead of interrogating a specification that was just interrogated.

**Slugs must be unique across the set** — `develop` requires it, and two items that slugify identically would share a seed-spec and silently merge two builds into one. Derive each slug from that item's own topic; when two collide, disambiguate as `<parent-slug>-<n>` and say that you did.

**State the resulting count in one line** before writing anything: `Three items: retry policy, the timezone fix, the config loader extraction.`

### 8. Hand off

Offer, in one line, and **do not run it**:

| Next step | When |
|---|---|
| `/terylon-dev:develop <seed paths>` | the work is ready to build |
| `/terylon-product:create-user-story` | it should exist as a work item first |

The hand-off is the user's call. A brainstorm that starts the build has removed the only checkpoint between an idea and a worktree.

## When `develop` is the caller

`develop` loads this skill **by name** as the second mode of Gate 0. Three things change:

| | |
|---|---|
| **Step 8 is skipped** | `develop` already has the seed paths and continues with them |
| **The count goes back to `develop`** | one item can become several, which invalidates the count `develop` stated earlier; it restates it |
| **Under `--auto` this skill is not loaded at all** | it is a dialogue and has no unattended form. `develop` says it skipped it rather than inventing the answers |
| **`--no-decompose` is not available** | `develop` neither accepts nor forwards it. Decomposition follows the deliverables the dialogue found; to build only one of them, take the seed-spec you want and pass **that path** to `develop` |

Everything else is identical. Whether the design document is written does not depend on the caller — it is the record of why the seeds look the way they do, and a build that ignores it still benefits from it existing.

## Artifact layout

```text
docs/terylon/
├── specs/    <slug>-brainstorm.md        the design and its decisions (this skill)
└── intake/   <item-slug>-seed.md         one per deliverable (this skill, then develop)
```

Both live under `docs/terylon/`, the gitignored working tree. Nothing this skill writes is committed.

## Common mistakes

- **Asking what the repository already answers.** Grounding comes before the first question, not after the third.
- **More than one question per message.** Two questions in one message get one answer.
- **A question with no recommendation.** The user asked for help shaping the idea; a menu is not shaping.
- **Describing an option that has a shape.** Draw it in the preview.
- **Writing the plan.** Tasks, file maps and test-first ordering are `planner`'s, after a workspace exists.
- **Naming a file path in the design.** It goes stale immediately and `planner` redraws it anyway.
- **Splitting on bullets.** Only independent deliverables split.
- **Colliding slugs.** Two items that slugify the same share a seed-spec and merge two builds into one.
- **Producing a seed Gate 0 has to re-interrogate.** If the seed does not carry the answers, the dialogue was wasted.
- **Running `develop` at the end.** The hand-off is offered, never taken.
- **Recording only the conclusion.** Without the rejected alternatives, the next reader re-argues the whole thing.

## Verification

1. **Discovery:** `/terylon-dev:brainstorm` appears in autocomplete; the skill loads by name from `develop`.
2. **Grounding precedes questions:** the run states what it found in the repository before the first `AskUserQuestion`.
3. **One question per message**, each with a marked recommendation, and options with a stated cost.
4. **Decomposition:** a three-part idea yields one design document and three seed-specs under distinct slugs; a single-deliverable idea whose scope is a bulleted list yields **one**; `--no-decompose` yields one from either.
5. **Seed shape:** every seed-spec carries the `brainstormed:` marker, a title, a description, acceptance criteria written as outcomes, and links — the shape `develop`'s Gate 0 produces.
6. **No implementation prescribed:** neither the design document nor any seed-spec names a file path, a function, or a command.
7. **Decisions recorded:** the design document's decisions table has one row per fork taken in the dialogue, each with the rejected alternative and the reason.
8. **Hand-off is offered, not taken:** the run ends with an offer; no workspace, branch, or build is started.
9. **From `develop`:** an item triaged as vague enters this skill, and the resulting count is restated by `develop` before any workspace is created.
