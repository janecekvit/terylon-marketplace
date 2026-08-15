---
paths:
  - "plugins/**/SKILL.md"
  - "plugins/**/agents/*.md"
  - "plugins/**/references/*.md"
  - "plugins/**/plugin.json"
  - "plugins/**/.mcp.json"
  - ".claude-plugin/marketplace.json"
  - ".claude/hooks/**"
  - ".claude/rules/**"
  - "docs/architecture/**"
---

# Knowledge base sync

After an **architectural** change, check whether an article in `docs/` still tells the truth — and fix it in the same change.

This rule is the sibling of `claude-md-sync.md` and deliberately not a copy of it. They answer different questions and go stale in different ways:

| | Fires on | Answers | Where the affected file is |
|---|---|---|---|
| `claude-md-sync` | almost any edit | *what is in the project* | the **nearest** `CLAUDE.md`, up to 3 levels up |
| **this rule** | architectural edits only | *how it behaves end to end, and why* | **anywhere in `docs/`** — often in a section named after a different concern |

That last column is the whole point. A `CLAUDE.md` sits next to what it describes, so staleness is local and easy to spot. **The knowledge base is cross-cutting**: one line changed in `resolve-forge` can invalidate a diagram in `docs/flows/`, a consequence in an ADR and a fix row in a runbook, none of which live anywhere near the file you edited and none of which any folder-local habit will lead you to. `flows/` is the worst of them, because a flow spans components and therefore has no owner: every component's author can leave it stale while believing they touched nothing that matters.

> **The `paths:` list above is narrower than `claude-md-sync.md`'s, on purpose.** It names the surfaces where behaviour is **decided** — the skills and agents other repositories execute, the manifests that decide what installs, the hooks that enforce, the rules that bind — and not every file in the tree. A rule that fires on every edit is a rule dismissed on every edit, and the knowledge base is the one store that does not have to move when a bug is fixed.
>
> **`docs/architecture/**` is in the list** although it is documentation: an ADR is where a decision is *made*, so changing one is an architectural act, and the flows and runbooks that depend on it have to follow.
>
> **`docs/terylon/` and `docs/superpowers/` are omitted on purpose**, so their absence is not mistaken for the same oversight. Both are gitignored task scratch — a design, a plan, a ledger, a spend measurement — discarded once the work ships, so nothing in them can go stale in a way this rule could fix.
>
> **A new top-level folder is two edits**: its glob here and its glob in `claude-md-sync.md`. Both lists decide whether their rule loads at all, so a directory missing from one is a directory whose changes will never prompt that half of the documentation — silently, with nothing to complain, and visible only months later as documentation that stopped tracking reality.

## How to find the affected article — do not go by memory

Every article ends with a **`## Where it lives`** table naming the files it describes. That table is a reverse index, so the search is mechanical:

```bash
grep -rn "<path or symbol you changed>" docs/
```

**Every hit is an article claiming something about code you just changed.** Read each one and decide. Zero hits is a real answer too, and sometimes means the article that *should* exist does not yet.

Do this **before** concluding "no docs change needed". That conclusion reached from memory is worth nothing — nobody holds the knowledge base in their head, and the affected article is usually filed under a different concern than the file you edited.

## Update the knowledge base when

**A structural fact changed**

- A hop, a boundary or a gate appears, disappears or moves — a new dispatch edge, a new stop condition, a step that used to be manual
- What enforces a rule changes hands — a guard moves from a rule into a hook, a check moves from a transport into an engine
- A plugin gains or loses a dependency, or a component moves between plugins
- A named skill, agent, operation, environment variable or file is renamed. **The knowledge base names these literally**, and a rename silently turns an instruction into a wrong one

**Something was VERIFIED that the article recorded as an assumption**

The most valuable category and the most often skipped. The knowledge base is explicitly allowed to state open questions, so it accumulates them — and an assumption still marked as one *after* being settled costs the next reader the whole experiment again.

**What settling an assumption obliges you to do, and by when, is stated in `claude-md-sync.md`** — it binds both stores and is not repeated here. Two things are specific to this one:

- Saying **by what** matters more here than anywhere else. An article's claims are read as evidence, so a measurement with no method behind it is a guess wearing better clothes.
- If the answer came out the *other* way, say so **where the assumption was**, not in a new paragraph further down. An article is read top to bottom by someone who stops when they think they have the answer.

**A failure mode was hit that the article did not predict**

Symptom first — the symptom is the search term. Include failures in the tooling around the code, not only in the code itself: a grep that could not fire because it was written against a renamed prefix is exactly this category, and it is invisible in a diff.

**A decision was reversed**

| Where | Do |
|---|---|
| In an **ADR** | do not edit the decision away. Mark it superseded and write the new one, so the reasoning that was overturned stays readable |
| In any other article | replace the stale sentence outright. Two paragraphs that disagree are worse than either alone |

A constraint that turns out to be a tooling limitation dressed as a decision must be corrected **explicitly**, or the stale rationale keeps arguing against fixing it.

**The change makes an article that does not exist necessary**

A genuinely new flow, subsystem or recurring failure gets its own article. Add it under the right section, follow the skeleton in `docs/README.md`, and **add its line to that section's `README.md` index** — an article no index points at is an article nobody will find.

## Do NOT update the knowledge base when

- The change is a bug fix or an implementation detail inside a hop the article already describes
- A refactor preserves the described behaviour — the knowledge base describes behaviour, not call graphs
- A version was bumped, which is mechanical and already documented as a rule
- The material is task-scoped: a design, a plan, a ledger, a status. That is `docs/terylon/` or `docs/superpowers/`, both gitignored, and it must not be filed as an article
- The change belongs in a different store — the root `CLAUDE.md` holds the test that decides which

## Drawing

**The drawing rules live in `.claude/rules/markdown.md` and are not restated here** — the character set, the fencing, the width ceiling, what not to draw, and *keep them true*. That file owns all of it, and a second copy of a rule is a rule that will eventually disagree with itself.

One thing is specific to this store and is stated here: **put the load-bearing fact IN the drawing**, not only under it. An arrow labelled `no bump ──▶ consumer sees nothing`, or a box that says `declares no adapter — on purpose`, carries the thing a reader must not miss to the one place they are certain to look.

## How to update

- **Edit the affected sections only.** Do not rewrite an article to make room for a sentence.
- **Replace a stale sentence rather than appending a new one.** Two paragraphs that disagree are worse than either alone: the reader cannot tell which is current, so they trust neither.
- Label a fact's confidence in the form `claude-md-sync.md` prescribes. A reader who cannot tell a guess from a certainty either over-trusts the first or re-runs the second.
- Keep every claim next to its evidence. A claim without how it was established invites the next person to simplify it away.
- **Update the `## Where it lives` table when a file it names is renamed, moved or deleted.** That table is also the staleness detector, so a wrong row is worse than a missing one.
- Keep the section's `README.md` index in agreement with what the article now says.
