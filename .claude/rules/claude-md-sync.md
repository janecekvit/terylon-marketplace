---
paths:
  - "plugins/**/plugin.json"
  - "plugins/**/SKILL.md"
  - "plugins/**/agents/*.md"
  - "plugins/**/.mcp.json"
  - ".claude-plugin/marketplace.json"
---

# CLAUDE.md sync

After modifying files in any folder, check whether a `CLAUDE.md` exists in that folder or a nearby ancestor (up to 3 levels up). If one exists, decide whether the change affects the orientation information it contains.

This repo has two: the root `CLAUDE.md` (repo structure, Azure DevOps identity, rules) and `plugins/CLAUDE.md` (authoring conventions, plugin overview, naming, versioning).

## Update the CLAUDE.md when

- A plugin is added or removed — the plugin overview table in `plugins/CLAUDE.md` and the table in `README.md` go stale immediately, **and so does every dependency diagram**
- A skill or agent is added, removed, or renamed — the plugin's own `README.md` lists them
- A plugin's `dependencies` change — documented as a column in three places (root `README.md`, `plugins/CLAUDE.md`, the plugin's `README.md`) **and drawn as a graph in all of those plus every other plugin's `README.md`**
- A component moves between plugins — the *What lives where* table, the cross-plugin load table, and every diagram naming the old home
- An MCP server is added to or removed from a `.mcp.json`
- A new authoring convention is established (a naming rule, a frontmatter constraint, a footer format)
- The engine/transport split changes — which skill owns judgment and which owns transport

### Redraw the dependency graphs, do not only edit the tables

**Every orienting document draws the plugin dependency graph, and a dependency change is not applied until all of them are redrawn.** The full rule — which document draws what, the per-plugin vantage, and that the graph is derived from `plugin.json#dependencies` rather than from prose — is in `.claude/rules/markdown.md`, under *Every orienting document carries the dependency graph*. This file says only **when**: the same commit that changes an edge.

Editing a dependency column and leaving the diagram alone is the specific failure this exists to prevent. A table that says one thing while the picture above it says another is worse than either alone, because a reader believes the picture.

## Do NOT update the CLAUDE.md when

- Wording inside an existing skill changes without changing what it does
- A reference file gains detail within its existing structure
- A version is bumped (that is mechanical and already documented as a rule)
- Formatting or typo fixes

## How to update

Edit only the affected sections — do not rewrite the whole file. Keep the same tone and level of detail as the existing content. CLAUDE.md describes *what is in the project*, not *how the content works*.

## Name collisions

When adding a skill or agent, verify its name does not collide with anything installed — see the collision check in `plugins/CLAUDE.md`.

Check what *kind* of thing collides before renaming around it. The official `code-review` plugin ships a **command**, not a skill, so this repo's `code-review` **skill** coexists with it: different namespaces, and the reference repo ran the same pair for a year without trouble. The cost is that typing `/code-review` offers both, which is noise rather than breakage. Rename only when the collision is real.
