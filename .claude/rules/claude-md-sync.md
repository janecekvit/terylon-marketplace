---
paths:
  - "plugins/**/plugin.json"
  - "plugins/**/SKILL.md"
  - "plugins/**/agents/*.md"
  - "plugins/**/references/*.md"
  - "plugins/**/README.md"
  - "plugins/**/.mcp.json"
  - ".claude-plugin/marketplace.json"
  - ".claude/hooks/**"
  - ".claude/rules/**"
  - "docs/**"
  - ".gitignore"
  - ".gitattributes"
---

# CLAUDE.md sync

After modifying files in any folder, check whether a `CLAUDE.md` exists in that folder or a nearby ancestor (up to 3 levels up). If one exists, decide whether the change affects the orientation information it contains.

This repo has three: the root `CLAUDE.md` (repo structure, Azure DevOps identity, rules), `plugins/CLAUDE.md` (authoring conventions, plugin overview, naming, versioning), and `docs/CLAUDE.md` (which documentation store is which, and the directive to read the knowledge base before the sources).

A `CLAUDE.md` is read by whoever picks this repository up next — human or agent — with no memory of the session that produced the change. Its job is to stop them re-deriving what is already established, and above all to stop them **re-learning the hard way something that was already paid for once.**

> **The `paths:` list above decides whether this rule is loaded at all**, so a directory missing from it is a directory whose edits will never prompt a docs update — silently, with nothing to complain, and visible only months later as documentation that stopped tracking reality.
>
> **`plugins/**/references/*.md` and `.claude/hooks/**` are the two gaps that mattered.** `plugins/CLAUDE.md` actively tells authors to move bulk *out* of `SKILL.md` into `references/`, which is to say straight out of this rule's reach; and operational knowledge comes overwhelmingly from *running* things, so a list covering only skills and manifests misses exactly the sessions with the most to record. The `agents/` and `references/` globs are non-recursive on purpose — both directories are flat by convention. Make them `**` if that stops being true.
>
> **`docs/**` is in the list** because `docs/CLAUDE.md` is a navigational file like any other and goes stale when a section is added or a boundary moves. The gitignored scratch under `docs/terylon/` and `docs/superpowers/` is not tracked, so it cannot trigger anything.
>
> **A new top-level folder is two edits:** its row in the root `CLAUDE.md` structure block, and its glob here. A rename is the same two — plus the third glob list, in `docs-sync.md`.
>
> **Keeping the knowledge base current is a different rule** — see `docs-sync.md`. This one asks whether the nearest `CLAUDE.md` still orients a reader; that one asks whether an article anywhere in `docs/` still tells the truth, which is a search rather than a look upward. Both can fire on one change, and when they do they want different edits in different files.

## Update the CLAUDE.md when

**Structure changed**

- A plugin is added or removed — the plugin overview table in `plugins/CLAUDE.md` and the table in `README.md` go stale immediately, **and so does every dependency diagram**
- A skill or agent is added, removed, or renamed — the plugin's own `README.md` lists them
- A plugin's `dependencies` change — documented as a column in three places (root `README.md`, `plugins/CLAUDE.md`, the plugin's `README.md`) **and drawn as a graph in all of those plus every other plugin's `README.md`**
- A component moves between plugins — the *What lives where* table, the cross-plugin load table, and every diagram naming the old home
- An MCP server is added to or removed from a `.mcp.json`
- A new authoring convention is established (a naming rule, a frontmatter constraint, a footer format)
- The engine/transport split changes — which skill owns judgment and which owns transport
- A folder is created, deleted, renamed or merged — including one whose *name* changed meaning

**Something was VERIFIED that was previously assumed**

The category most often missed and the most valuable. When a run, a dispatch or a live call settles a question the files could only guess at, record the ANSWER and mark it verified:

- A harness behaviour confirmed by observation — what a dispatched agent actually holds, what a hook actually receives, which tier a fan-out really costs
- A documented-but-untested claim now exercised, or found false
- A number measured rather than estimated (a startup latency, a token total, a share of output)

Say **which** of the two a fact is. `unverified` and `measured on <date>, by <how>` are different facts, and a reader who cannot tell them apart will either over-trust a guess or needlessly re-test a certainty.

**When something becomes verified, delete the hedge in the same edit.** Not in a follow-up, not in the next change that touches the file — the same edit that records the answer removes the qualifier, and the measured figure replaces the guess rather than sitting beside it. Leaving "unverified" next to a proven fact is worse than silence, because the next reader spends the effort again.

This is the marketplace's one statement of that obligation; `docs-sync.md` and `docs/README.md` link to it rather than restating it, and it binds both documentation stores alike.

**A failure mode was hit that the docs did not predict**

If it cost you time, it will cost the next person the same time. Write it as a gotcha, *symptom first* — the symptom is what they will search for:

1. The symptom exactly as it appears (the error text, or the silent wrong behaviour)
2. Why it happens
3. What to do instead

Include failures in the **tooling around** the content, not only in the content. A grep written against a renamed prefix that passes because it cannot fire; a hook that resolved the branch from the wrong directory and refused every write inside a correctly-branched worktree; a collision check that matched this marketplace's own cached copy, so every name looked taken. None of those are visible in a diff and all of them are expensive to rediscover.

**A decision was reversed**

Record the reversal *and its reason*, not just the new state. A rationale that reads "X is deliberate" but was really a tooling limitation dressed as a decision must be corrected explicitly — otherwise the stale rationale actively argues against fixing it, and the next person defends a constraint nobody chose.

### Redraw the dependency graphs, do not only edit the tables

**Every orienting document draws the plugin dependency graph, and a dependency change is not applied until all of them are redrawn.** The full rule — which document draws what, the per-plugin vantage, and that the graph is derived from `plugin.json#dependencies` rather than from prose — is in `.claude/rules/markdown.md`, under *Every orienting document carries the dependency graph*. This file says only **when**: the same commit that changes an edge.

Editing a dependency column and leaving the diagram alone is the specific failure this exists to prevent. A table that says one thing while the picture above it says another is worse than either alone, because a reader believes the picture.

## Do NOT update the CLAUDE.md when

- Wording inside an existing skill changes without changing what it does
- A reference file gains detail within its existing structure
- A version is bumped (that is mechanical and already documented as a rule)
- Formatting or typo fixes
- A refactor preserves the described structure
- Tests are added without establishing one of the facts above

## How to update

- **Edit only the affected sections.** Do not rewrite the whole file.
- Match the surrounding tone and level of detail.
- `CLAUDE.md` describes **what is in the project and what is known about it** — not how a component works line by line, and not how a subsystem behaves end to end. The second belongs beside the component; the third is the knowledge base.
- **Replace a stale sentence rather than appending a new one.** Two paragraphs that disagree are worse than either alone: the reader cannot tell which is current, so they trust neither.
- Keep a claim next to its evidence. A gotcha that says *what* without *how it was found* invites someone to simplify it away.
- A reference to a path, skill, agent or variable is **load-bearing**: a rename has to carry it. `grep -r` the old name before calling a rename finished.

## Name collisions

When adding a skill or agent, verify its name does not collide with anything installed — see the collision check in `plugins/CLAUDE.md`.

Check what *kind* of thing collides before renaming around it. The official `code-review` plugin ships a **command**, not a skill, so this repo's `code-review` **skill** coexists with it: different namespaces, and the reference repo ran the same pair for a year without trouble. The cost is that typing `/code-review` offers both, which is noise rather than breakage. Rename only when the collision is real.
