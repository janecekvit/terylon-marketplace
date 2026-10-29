---
paths:
  - "**/*.md"
---

# Markdown conventions

Applies to every `.md` in this repo: `SKILL.md` files, agent definitions, `README.md`, `CLAUDE.md`, rules, and reference documents.

## Three audiences

Markdown here goes to one of three places, and they render differently. Know which one you are writing for.

| Target | Who reads it | Wrapping |
|---|---|---|
| **Repo files** — `SKILL.md`, agents, `README.md`, rules | the model, humans in a diff, and GitHub's renderer | wrap freely; source is the artifact |
| **This repository's issues and pull requests**, on GitHub | GitHub's renderer | one paragraph per line |
| **Azure DevOps** — the PR descriptions, thread comments and work items the plugins write in a consumer's repository | the ADO renderer | **never hard-wrap** |

**GitHub treats a single newline as a soft wrap**, so a hard-wrapped issue or pull request here renders correctly. Write one paragraph per line anyway: it is what the plugins write, and a text moved between this repository and a consumer's forge then never needs reflowing.

### Never hard-wrap ADO-bound markdown

Azure DevOps renders every source line break **verbatim**. It does not treat a single newline as a soft wrap the way GitHub does. Wrapping a paragraph at 72 or 80 characters produces visibly choppy short lines in the rendered output.

Emit each paragraph and each bullet as **one continuous line**. Insert a real line break only between distinct paragraphs, bullets, or headings. Let the renderer wrap.

This applies to every skill that writes to a forge — `create-pr`, `review-pr`, `address-pr-comments`, `write-pr-description`, both `update-*-checklist` skills, `create-user-story`, `create-feature` — and to any future one. It binds on GitHub too, whose renderer soft-wraps and would not need it: one rule, obeyed on both, is cheaper than remembering which target is which.

## Dashes

Use `-` (hyphen) or `–` (en dash) in body text. Do **not** use an em dash (`—`) in content this repo generates and pushes to an external system.

Two deliberate exceptions:

1. **The generated-with footer**, emitted verbatim from its template.
2. **Repo documentation** — these rules, `CLAUDE.md`, `README.md`, and skill prose. The constraint exists for generated artifacts, not for docs humans maintain by hand.

## Frontmatter

`SKILL.md` and agent files carry YAML frontmatter. It is not decoration — Claude Code parses it.

**A skill's frontmatter is the [Agent Skills specification](https://agentskills.io/specification)'s, and nothing else.** `tests/skill-spec` refuses any other key.

```yaml
---
name: <slug>                         # = the directory; 1-64 of a-z 0-9 -, no leading, trailing or double hyphen
description: Use when <trigger>. <what it does>   # 1-1024 characters; the trigger first, then the what
allowed-tools: Read Grep Bash(git *) # space-separated, as the specification writes it (experimental there)
license: <name>                      # optional; the plugin's manifest already says Apache-2.0
compatibility: <requirements>        # optional, 1-500 characters; only for a real environment requirement
metadata:                            # optional; string keys to string values
  <key>: "<value>"
---
```

An agent is not a skill, and its frontmatter is the plugin agent specification's:

```yaml
---
name: <slug>                    # = the file name
description: Use when <trigger>
tools: [Read, Grep, Glob, Agent]
disallowedTools: [Edit, Write]  # read-only lenses need this
skills: [<name>, …]             # skills this agent may load, by name
---
```

**`skills:` declares, the prose says when.** The field lists the skills an agent may load, by name and across plugin boundaries — `code-reviewer` in `terylon-git` lists `code-review`, and `pr-reviewer` in `terylon-forge` lists `create-workspace` from another plugin. Declaring a skill there does **not** mean the agent uses it on every run: `create-workspace` is listed on `code-reviewer` but only used when `isolate` is set.

So the two carry different halves and both are needed:

| Where | Carries |
|---|---|
| `skills:` frontmatter | that the agent may load it at all |
| The agent's prose | when to load it, and what it must not do |

Declaring without prose leaves an agent holding a skill it has no reason to open. Prose without the declaration relies on the name resolving anyway. **A safety constraint belongs in the prose regardless** — inline and short, where it cannot be missed if the skill is never loaded. The procedure can live in the skill; the boundary cannot.

**Never set `disable-model-invocation`.** It hides the skill from being loaded by name, which breaks the engine/transport pattern this repo is built on: `forge-ops` and `code-review` exist to be called by other skills, and a hidden engine cannot be called at all. A skill that is mainly for other skills says so in its prose instead. The specification has no such key either.

- **`description` starts with `Use when …`** and lists triggering conditions with concrete symptoms, then says what the skill does. It is what the model matches against — describing the internal workflow there wastes the field.
- **`name` follows the kind:** skills are named for the action (`create-workspace`, `code-review`), agents for the role (`developer`, `code-reviewer`). See the naming section in `plugins/CLAUDE.md`.
- **A key Claude Code reads and the specification lacks goes under `metadata`** when Claude Code honours it there; otherwise the skill does without it. No skill here needs one.
- **Agent frontmatter must not carry** `permissionMode`, `hooks`, or `mcpServers`. They are not in the plugin agent specification.
- A rules file carries a `paths:` frontmatter block to scope itself to matching files, as this one does.

The body, the supporting folders and the file references are `plugins/CLAUDE.md`'s, under *Skill conventions*.

## Structure

- **One `# H1` per file**, at the top, naming what the file is.
- **Do not skip heading levels.** `##` follows `#`, `###` follows `##`.
- **Fence every code block with a language tag** — ` ```powershell `, ` ```bash `, ` ```json `, ` ```yaml `. Untagged fences lose syntax highlighting and make the intended interpreter ambiguous. **A diagram is the one exception** and takes a bare fence — see below; a Mermaid diagram takes ` ```mermaid `, which is what renders it.
- **A blank line around** every heading, list, table, and fenced block. Some renderers silently merge them otherwise.

## Show structure, do not describe it

**Whenever something has a shape, draw it.** A call chain, a dependency graph, a set of cases and what each one selects, a state machine, a pipeline, a comparison across several options, a layout, a sequence of steps with branches — all of these are clearer as an ASCII diagram or a table than as prose, and none of them should be left as prose when a diagram or table would carry them. A reader who has to reconstruct a shape from three paragraphs will reconstruct it wrong.

This is not a stylistic preference. Prose is **interpretable**; a table is not. "Wrap repository files freely, but not what goes to Azure DevOps" reads as a guideline someone can weigh against how long the line feels — the same rule as a table keyed on the target leaves nothing to weigh. That matters more here than in most repositories, because these documents are read as instructions by a model, and an instruction that can be interpreted eventually will be. Structure removes the room.

The rule holds for what this repo **generates** as well as for what it commits: pull request descriptions, work items, review findings, and answers in a session. Wherever there is a shape and the target renders markdown, draw it. **What a plugin writes to a forge** draws a table, or a box drawing in a bare fence, by default; a Mermaid block it writes starts with its keyword and carries no front matter, as below, because a consumer's Azure DevOps renders nothing else.

Two limits. A diagram that is wrong is worse than prose, because it is believed — see *Keep them true* below. And a table with one row is a sentence wearing a costume; use one when there are cases, not to decorate a single fact.

### Tables for decisions and enumerable facts

Any rule with distinct cases becomes a table keyed on the condition, not a bulleted list:

```markdown
| Target | Wrapping |
|---|---|
| Repository files — `SKILL.md`, agents, `README.md`, rules | wrap freely |
| Azure DevOps — PR descriptions, thread comments, work items | **never hard-wrap** |
```

The example is the wrapping rule this file already owns, on purpose: an example that reproduced a rule owned elsewhere would be a copy of it, and copies drift.

Same for flags, recipe catalogues, tool mappings, and field encodings. Key column first, answer second. Prose stays for the reasoning that the table cannot carry.

### Mermaid with ELK for structure, Mermaid for flows, box drawing for short sketches

Three kinds of drawing, and each shape has one of them:

| Shape | Drawn as | Lives in |
|---|---|---|
| **Structure** — components, their dependencies and boundaries, the static view | a Mermaid `flowchart` in a ` ```mermaid ` fence, in the adaptive style below | the Markdown file that owns it: `docs/architecture/README.md`, the ADR that draws it, or, for the plugin graph, the root `README.md` |
| **A flow over time** — a resolution, a pipeline, a sequence of calls with branches | Mermaid in a ` ```mermaid ` fence: a `flowchart` takes the same opening and edge colour, a `sequenceDiagram` the default theme with translucent boxes | the article that walks the flow, usually in `docs/flows/` |
| **A short inline sketch** — a dispatch chain in a `SKILL.md`, the dependency graph an orienting document must carry, a layout | box drawing in a bare fence, by the rules below | the file it orients |

- **The block is the source and the picture.** GitHub renders a ` ```mermaid ` fence where it stands; nothing is generated, so there is no file to regenerate and no copy to go stale. To change a diagram, edit its block.
- **Each diagram has exactly one block.** Another document that needs it links to the heading that holds it and never pastes a second copy. **The main diagram is the plugin graph, in the root `README.md` under *Architecture*,** because that is where a consumer lands; every other document links to `README.md#architecture`. The forge port and terylon-os with its pane are drawn once each, in `docs/architecture/README.md`.
- **ELK, not dagre — and readable on dagre.** GitHub renders both; ELK's edges are orthogonal and edges leaving a subgraph do not cross, which reads far better on a dependency graph. A renderer without ELK falls back to dagre, so every diagram is laid out to read there too: few crossings by construction, no meaning carried by position alone.
- **Comments are `%%`, on their own line, next to the node or edge they explain.** What a source comment says about why an edge or a colour is there belongs in the block, not in prose beside it.
- **No HTML in a label.** A line break is a Markdown string, the label in backticks inside its quotes with a real newline: ``a["`terylon-core\nthe root`"]`` (written over two source lines). No `<br/>`, no icons and no `click` links: Azure DevOps's renderer refuses them, and GitHub drops the last two.
- **Shapes by kind:** a stadium `(["…"])` for something external, outside the marketplace, `[("…")]` for a store, `[/"…"/]` for a note or a page, `[["…"]]` for "one of many". A dashed edge is `-.->`, its annotation in `|"…"|`.
- **The source stays plain text everywhere else**, so write node labels and ids a reader can follow unrendered.

#### A dense picture splits in two

| Picture | Drawn as |
|---|---|
| **The steps** | a `sequenceDiagram`: one `box` per trust boundary, each check a `Note`, an alternative an `opt` |
| **The architecture** | a simplified `flowchart`: each box at most 2 lines, each edge labelled with its step number from the sequence |

**Why Mermaid** is a measurement: the same threat-model diagram was 32.6 KB in draw.io, 7.6 KB in D2 and 7.1 KB in Mermaid, 22 % of draw.io (measured 2026-10, by the owner, on one diagram drawn in all three). The rest of the reasoning is in [`diagrams-are-mermaid-blocks.md`](../../docs/architecture/diagrams-are-mermaid-blocks.md).

#### The adaptive style: one drawing for GitHub's light and dark themes

Every block **starts with its diagram keyword**, and a flowchart asks for ELK with an init directive on the line after it. It sets **no `theme` and no `themeVariables`**, so GitHub draws it in its light theme in light mode and its dark theme in dark mode, on a transparent background:

```text
flowchart TD
%%{init: {"layout": "elk", "flowchart": {"padding": 16}}}%%
```

**Never `---` front matter.** Azure DevOps' preview renders a block only when it starts with the keyword, and the plugins write into consumers' Azure DevOps; one form for both forges is cheaper than remembering which is which. Why Mermaid at all, and why this form, is in [`diagrams-are-mermaid-blocks.md`](../../docs/architecture/diagrams-are-mermaid-blocks.md).

| Element | Style | Because |
|---|---|---|
| A node, through `classDef` and `:::class` | a saturated fill, a darker stroke, **white text**, from the palette below | white on a saturated fill reads on either background; a pale fill glares in dark mode |
| A boundary, through `subgraph` and **one `style` line per subgraph** | a semi-transparent fill `#RRGGBBAA` with alpha `1A` (`14` for a large area), the stroke in the layer's colour, the title in the layer's **title colour** from the palette below, the stroke dashed: `style port fill:#B453091A,stroke:#B45309,color:#C0590A,stroke-dasharray:3 3` | the background shows through, so the box tints in either theme; **without an explicit `color:` the title vanishes in Azure DevOps' dark preview**, and the layer's own colour is too dark for a title on the dark background |
| A boundary with no layer of its own | the neutral `#8B949E` for the fill (alpha `14`) and the stroke, the title `#717B87` | a dark grey title vanishes on the dark background, a light one on the white |
| Edges | `linkStyle default stroke:#8B949E`; an edge label is short and takes no colour; a token or key flow is dotted, `-.->` | the theme colours the labels |
| A node's category | one `classDef` per category, from the palette below | one meaning per colour |
| A node left without a class (the owner, or a flow's ordinary step) | the theme's own colours | |
| Text | **never set `fontFamily`** | GitHub measures text in one font and draws it in another, so a set font clips the labels |
| A `sequenceDiagram` | the default theme; a `box` per trust boundary takes a translucent `rgba()` fill, `box rgba(37, 99, 235, 0.1) Agentic OS` | an opaque box hides the lifelines in the dark preview |

One meaning per colour, across every diagram here:

| Colour | `classDef` | A boundary's title | Means here |
|---|---|---|---|
| indigo | `fill:#4F46E5,stroke:#3730A3,color:#FFFFFF` | `#6C64E9` | the clients: the role plugins, and the callers that name a forge operation |
| green | `fill:#047857,stroke:#065F46,color:#FFFFFF` | `#058762` | the entry points into a forge: the adapters |
| blue | `fill:#2563EB,stroke:#1E40AF,color:#FFFFFF` | `#3770ED` | services: the chain every plugin sits on (`terylon-core`, `terylon-git`), and Agentic OS |
| amber | `fill:#B45309,stroke:#92400E,color:#FFFFFF` | `#C0590A` | the runtime seam: the forge port, `terylon-forge` |
| purple | `fill:#7E22CE,stroke:#6B21A8,color:#FFFFFF` | `#9C4CE2` | Terylon's own plugins: `terylon-os` and its mod `terylon-pane` |
| grey | `fill:#4B5563,stroke:#374151,color:#FFFFFF` | — | outside the marketplace: servers, forges, the phone, and a note |
| red | `fill:#B91C1C,stroke:#991B1B,color:#FFFFFF` | — | a stop or the one gate: where the flow refuses, or merge in the console |

The first six are the owner's palette, shared with their other repositories; red is this repository's one addition, because a stop and the merge gate must not read as an ordinary step.

**A boundary's title is one colour drawn on two backgrounds**, the tinted fill over GitHub's white `#ffffff` and over its dark `#0d1117`, so it is a mid-tone of the layer's hue. Each title colour above is the lightness of that hue that reads best on both, about 3.9:1 on each (#48); no colour reaches 4.5:1 on both, since the best any colour can do against that pair is about 4.3:1. The layer's own colour, the one its nodes and stroke use, fell to 2.6–3.4:1 on the dark background. `tests/architecture-diagrams` computes every `style … color:` against both backgrounds and fails one under **3.75:1**.

**Check every block before pushing.** CI starts no browser for it. Render each block with `@mermaid-js/mermaid-cli@11.4.2` against the pre-installed headless shell (`/opt/pw-browsers/chromium_headless_shell-*/`), with `--no-sandbox`, three times: in the default theme with `-b '#ffffff'`, with `-t dark -b '#0d1117'`, and once with the init directive removed, which is dagre. Look at all three: no label clipped, every word readable on both backgrounds, ELK's edges orthogonal, and the dagre drawing still readable. Commit only the Markdown; the owner checks it on GitHub. `node --test tests/architecture-diagrams/architecture-diagrams.test.js` fails on a block with front matter, on a flowchart without the opening above, or with a `theme`, `themeVariables` or `fontFamily`, and holds the plugin graph's edges to `plugin.json#dependencies`.

**The plugin graph stays a box drawing in every orienting document but one.** The root `README.md` draws it as the Mermaid block instead: it is read on GitHub, where the block renders in both themes, and a third hand-drawn copy of the same edges there would be one more copy to drift. Every other orienting document keeps its box drawing, because a terminal and an agent's context window render no Mermaid. Both drawings are derived from `plugin.json#dependencies`.

### ASCII diagrams for call chains and dependencies

Every skill or agent that dispatches others carries a diagram of what it dispatches and in which order:

```
develop (skill, main thread — holds the gates)
└── leader
    ├── planner
    ├── developer ──▶ debugger  (on a failing test)
    ├── security-reviewer  ┐
    ├── performance-reviewer│ parallel, read-only
    ├── architecture-reviewer
    ├── edge-case-reviewer ┘
    └── whole-branch review:
        ├── code-reviewer   (no PR — the usual case)
        └── pr-reviewer ──▶ code-reviewer  (a PR exists)
```

Annotate the edges with what the reader cannot infer from the shape: which branches run in parallel, which are conditional and on what, which direction data flows.

**Three rules keep a diagram readable everywhere it is read** — in a terminal, in a raw file, in a diff pane, in GitHub's renderer, in a consumer's Azure DevOps and in an agent's context window:

| Rule | Because |
|---|---|
| **A bare ` ``` ` fence**, never a language tag | a diagram is not code, and syntax highlighting mangles it |
| **Under 120 columns** | wide enough that a diagram is never cramped into unreadability, narrow enough to survive a side-by-side diff pane on an ordinary screen |
| **One idea per diagram** | two diagrams beat one that needs a legend |

The 120 is a ceiling, not a target. It was set rather than inherited: the classic 78 would have put existing, perfectly readable diagrams in breach on the day the rule was written, and a formatting rule violated the moment it ships teaches people to ignore the file it lives in.

**Do not draw what a table says better.** A diagram shows *structure*; a table shows *values*. A list of eight operations with their arguments is a table. Which side of the port each one sits on is a diagram.

**Where each diagram belongs:**

| Diagram | Lives in |
|---|---|
| Which agents a skill or agent dispatches, and in what order | that `SKILL.md` or agent file |
| How plugins depend on each other | root `CLAUDE.md`, `plugins/CLAUDE.md`, root `README.md`, **and every plugin `README.md`** |
| Which component lives in which plugin | `plugins/CLAUDE.md` |
| How a value flows through a pipeline | the file that owns the pipeline |
| How something travels **end to end, across components** | an article in `docs/flows/` — no single component's file can see the whole path |

Use plain ASCII (`└──`, `├──`, `──▶`, `┐`/`┘`), never Unicode box-drawing beyond that set — it has to stay readable in a terminal diff, in a raw file, on GitHub and in a consumer's Azure DevOps alike.

**Keep them true.** A diagram that no longer matches the code is worse than no diagram, because it is believed. When you rename or re-wire a component, grep for its name in every diagram before you finish.

### Every orienting document carries the dependency graph

**A document that orients a reader in this marketplace draws the plugin dependency graph. This is not optional and it is not satisfied by prose.** A reader who opens one plugin must not have to open three more to learn what it sits on.

| Document | Draws |
|---|---|
| root `CLAUDE.md` | the whole graph |
| root `README.md` | the whole graph, as the one Mermaid block that draws it — the one exception, stated under *Mermaid with ELK for structure* |
| `plugins/CLAUDE.md` | the whole graph, plus which component lives in which plugin and every cross-plugin load |
| each `plugins/<slug>/README.md` | the graph from **that plugin's vantage** — what it sits on, what sits on it, marked `← you are here` |
| `docs/CLAUDE.md` | **not the plugin graph** — it orients inside the knowledge base, and draws the `docs/` tree instead. `docs/README.md` beside it is an authoring standard and draws neither |

**Plugins have no `CLAUDE.md` of their own** — only the repo root, `plugins/` and `docs/` do. A plugin's orienting document is its `README.md`, and the rule binds there exactly as it binds on a `CLAUDE.md`.

The last row is the limit of this rule: it binds a document that orients a reader **among the plugins**. A document orienting a reader among the documentation stores draws that shape instead — one graph per document, of whatever the reader is actually lost in.

**The graph is derived from `plugin.json#dependencies`, which is the only source of truth.** Draw what the manifests declare, never what the prose remembers. A diagram that disagrees with a manifest is a defect in the diagram — fix the drawing, or fix the manifest if the drawing turned out to be the honest one, but never leave them disagreeing.

Two things the drawing must show, because both have been got wrong here and neither is visible in prose:

- **Direct versus transitive.** A plugin that declares a dependency it could have reached through the chain is saying something — annotate it, as `terylon-dev` does with `terylon-git` and `terylon-core`.
- **The root.** Which plugin has no dependencies at all, so a reader can see at a glance what installs for everyone.

**Update the diagrams in the same commit that changes a `dependencies` array, adds a plugin, or moves a component between plugins.** A dependency edge added without redrawing is how the diagrams stopped being true the last time.

## Cross-references

- **Refer to other skills by name only.** Write ``the `forge-ops` engine``, never `@path/to/SKILL.md`. An `@`-prefixed path force-loads the file into context immediately and burns tokens.
- **Never use `../`** to reach into another plugin. It is not in the specification and it breaks when the layout shifts. A skill in another plugin is loaded **by name**; `${CLAUDE_PLUGIN_ROOT}` resolves to the *calling* plugin's own root, so it can only address files inside that same plugin.
- **Link within the repo by relative path** for humans (`see plugins/CLAUDE.md`), which is prose, not an import.

## Reference documents

**When a skill's tables outgrow it, and where a shared reference goes, is stated once in `plugins/CLAUDE.md`, under *Heavy reference*.**

## Writing style

- **Say what the reader must do.** Skills are instructions, not essays.
- **Lead with the constraint, then the reason.** "Never commit to `main` — it is the protected base branch" beats the reverse order.
- **Bold the load-bearing words**, not whole sentences. Bold everywhere is bold nowhere.
- **Show, don't describe.** A wrong/right code pair teaches faster than a paragraph about it.
- **No placeholders in committed content.** `TBD`, `TODO`, and "implement later" in a `SKILL.md` are defects. Reference documents may carry an explicit `N/A` with a reason.

## Language

**Every `.md` here is English.** The rule covers everything committed, not only markdown, and is stated once, with its reason, in the root `CLAUDE.md`, under *Language*.
