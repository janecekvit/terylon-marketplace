# Diagrams are Mermaid blocks that open with their keyword

**Status:** accepted, 2026-10-28, on issue #43; supersedes the D2 decision of #36 and the front matter of #37. **A structural or flow diagram is a Mermaid block in the Markdown that owns it, starting with its diagram keyword; a flowchart asks for ELK with an init directive on the line after the keyword, and is laid out to read on dagre too.** The rules are in `.claude/rules/markdown.md`, under *Mermaid with ELK for structure, Mermaid for flows, box drawing for short sketches*.

## Context

Two arrangements came before this one, and each broke on something the other had not met.

```
  #36  D2 source ──render script──▶ light SVG + dark SVG    two files per diagram, a Go toolchain
                                                             in CI, a pin, a stale-SVG check
  #37  a mermaid fence                                      one block, its own picture on GitHub;
       ---                                                   Azure DevOps' preview draws nothing,
       config: { layout: elk }   ◀── front matter first      because the block does not start
       ---                                                   with the keyword
       flowchart TD
```

D2 worked, and it cost a second file per diagram, a render script, a Go toolchain in CI and a version pin, all to keep a picture in step with a source nobody read on GitHub. What D2 did better was an explicit dark theme per diagram.

Mermaid with ELK gave the same orthogonal layout from a block that is its own picture: the source and what a reader sees are one text, read alike by a person and a model, and models write Mermaid more reliably than D2. The first Mermaid drawings kept D2's light pastels, with a container stroked and not filled; pale fills glared on GitHub's dark background, and the adaptive style of saturated fills with white text replaced them on 2026-10-27.

The front matter that asked for ELK was the next thing to break. **Azure DevOps' preview renders a Mermaid block only when it starts with the diagram keyword**, and the plugins write into consumers' Azure DevOps — pull request descriptions, threads and work items. A form that renders on one forge and not the other is a rule the writer has to remember per target.

## The alternatives

| Option | What it costs | Chosen |
|---|---|---|
| D2 sources and rendered SVGs | a second file per diagram, a render script, a toolchain and a pin in CI | no — superseded |
| Mermaid with `---` front matter | nothing on GitHub; nothing drawn in Azure DevOps' preview | no — superseded |
| Mermaid, keyword first, no layout requested | renders on both; dagre's curved edges cross on a dependency graph | no |
| **Mermaid, keyword first, ELK by an init directive on the next line, readable on dagre** | a renderer that ignores the directive draws dagre, so each diagram is laid out to survive that | **yes** |

## Decision

| Rule | Where it is held |
|---|---|
| The block starts with its keyword; no front matter | `tests/architecture-diagrams/architecture-diagrams.test.js` |
| A flowchart's second line is `%%{init: {"layout": "elk", "flowchart": {"padding": 16}}}%%` | the same test |
| No `theme`, `themeVariables` or `fontFamily`, no HTML in a label | the same test |
| Every block is rendered in light, in dark and on dagre before a push, and checked on GitHub by the owner | `.claude/rules/markdown.md`, by hand — CI starts no browser |

Measured 2026-10-28 with `@mermaid-js/mermaid-cli@11.4.2` and the pre-installed headless shell: all five flowcharts in `README.md` and `docs/` rendered with the directive after the keyword, with ELK's orthogonal edges, in both themes, and each read on dagre with the directive removed.

## Consequences

| | |
|---|---|
| Good | one text is the source and the picture on both forges; nothing is generated, so nothing goes stale |
| Good | the plugins can write a Mermaid block into a consumer's Azure DevOps in the same form this repository commits |
| Cost | a renderer that ignores the directive lays the diagram out with dagre, which is why each one is checked there too |
| Cost | whether a block parses is checked by hand; CI starts no browser |
| **Constraint** | **putting `---` front matter back, or a comment above the keyword, stops Azure DevOps drawing the block.** The test refuses both |
| **Constraint** | a diagram that reads only on ELK breaks on the first renderer without it |

## Where it lives

| File | Role |
|---|---|
| `.claude/rules/markdown.md` | *Mermaid with ELK for structure* — the opening, the adaptive style, the palette, the render check |
| `tests/architecture-diagrams/architecture-diagrams.test.js` | `ELK_OPENING`, `FRONT_MATTER` — the opening every flowchart is held to |
| `README.md` | *How a story travels* and *Architecture* — the plugin graph, the one copy |
| `docs/architecture/README.md` | *The forge port*, *terylon-os and the pane* |
| `docs/flows/forge-resolution.md` | the resolution flowchart |
