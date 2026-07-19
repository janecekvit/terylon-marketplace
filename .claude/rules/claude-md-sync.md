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

- A plugin is added or removed — the plugin overview table in `plugins/CLAUDE.md` and the table in `README.md` go stale immediately
- A skill or agent is added, removed, or renamed — the plugin's own `README.md` lists them
- A plugin's `dependencies` change — the dependency column is documented in three places (root `README.md`, `plugins/CLAUDE.md`, the plugin's `README.md`)
- An MCP server is added to or removed from a `.mcp.json`
- A new authoring convention is established (a naming rule, a frontmatter constraint, a footer format)
- The engine/transport split changes — which skill owns judgment and which owns transport

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
