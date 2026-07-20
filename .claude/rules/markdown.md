---
paths:
  - "**/*.md"
---

# Markdown conventions

Applies to every `.md` in this repo: `SKILL.md` files, agent definitions, `README.md`, `CLAUDE.md`, rules, and reference documents.

## Two audiences, two rule sets

Markdown here goes to one of two places, and they render differently. Know which one you are writing for.

| Target | Who reads it | Wrapping |
|---|---|---|
| **Repo files** — `SKILL.md`, agents, `README.md`, rules | the model, and humans in a diff | wrap freely; source is the artifact |
| **Azure DevOps** — PR descriptions, thread comments, work items | the ADO renderer | **never hard-wrap** |

### Never hard-wrap ADO-bound markdown

Azure DevOps renders every source line break **verbatim**. It does not treat a single newline as a soft wrap the way GitHub does. Wrapping a paragraph at 72 or 80 characters produces visibly choppy short lines in the rendered output.

Emit each paragraph and each bullet as **one continuous line**. Insert a real line break only between distinct paragraphs, bullets, or headings. Let the renderer wrap.

This applies to every skill that writes to ADO — `review-pr`, `address-pr-comments`, `write-pr-description`, `create-user-story`, `create-feature` — and to any future one.

## Dashes

Use `-` (hyphen) or `–` (en dash) in body text. Do **not** use an em dash (`—`) in content this repo generates and pushes to an external system.

Two deliberate exceptions:

1. **The generated-with footer**, emitted verbatim from its template.
2. **Repo documentation** — these rules, `CLAUDE.md`, `README.md`, and skill prose. The constraint exists for generated artifacts, not for docs humans maintain by hand.

## Frontmatter

`SKILL.md` and agent files carry YAML frontmatter. It is not decoration — Claude Code parses it.

```yaml
---
name: <slug>                    # MUST match the directory name (skills) or the file name (agents)
description: Use when <trigger>  # triggering conditions, never the internal workflow
allowed-tools: Read, Grep, Glob  # skills only
tools: [Read, Grep, Glob, Agent] # agents only
disallowedTools: [Edit, Write]   # agents only — read-only lenses need this
skills: [<name>, …]              # agents only — skills this agent may load, by name
---
```

**`skills:` declares, the prose says when.** The field lists the skills an agent may load, by name and across plugin boundaries — `code-reviewer` in `terylon-git` lists `code-review`, and `pr-reviewer` in `terylon-devops` lists `create-workspace` from another plugin. Declaring a skill there does **not** mean the agent uses it on every run: `create-workspace` is listed on `code-reviewer` but only used when `isolate` is set.

So the two carry different halves and both are needed:

| Where | Carries |
|---|---|
| `skills:` frontmatter | that the agent may load it at all |
| The agent's prose | when to load it, and what it must not do |

Declaring without prose leaves an agent holding a skill it has no reason to open. Prose without the declaration relies on the name resolving anyway. **A safety constraint belongs in the prose regardless** — inline and short, where it cannot be missed if the skill is never loaded. The procedure can live in the skill; the boundary cannot.

**Never set `disable-model-invocation`.** It hides the skill from being loaded by name, which breaks the engine/transport pattern this repo is built on: `ado-mcp` and `code-review` exist to be called by other skills, and a hidden engine cannot be called at all. A skill that is mainly for other skills says so in its prose instead.

- **`description` starts with `Use when …`** and lists triggering conditions with concrete symptoms. It is what the model matches against — describing the internal workflow there wastes the field.
- **`name` follows the kind:** skills are named for the action (`create-workspace`, `code-review`), agents for the role (`developer`, `code-reviewer`). See the naming section in `plugins/CLAUDE.md`.
- **Agent frontmatter must not carry** `permissionMode`, `hooks`, or `mcpServers`. They are not in the plugin agent specification.
- A rules file may use a `paths:` frontmatter block to scope itself to matching files, as this one does.

## Structure

- **One `# H1` per file**, at the top, naming what the file is.
- **Do not skip heading levels.** `##` follows `#`, `###` follows `##`.
- **Fence every code block with a language tag** — ` ```powershell `, ` ```bash `, ` ```json `, ` ```yaml `. Untagged fences lose syntax highlighting and make the intended interpreter ambiguous.
- **A blank line around** every heading, list, table, and fenced block. Some renderers silently merge them otherwise.

## Show structure, do not describe it

**Whenever something has a shape, draw it.** A call chain, a dependency graph, a set of cases and what each one selects, a state machine, a pipeline, a comparison across several options, a layout, a sequence of steps with branches — all of these are clearer as an ASCII diagram or a table than as prose, and none of them should be left as prose when a diagram or table would carry them. A reader who has to reconstruct a shape from three paragraphs will reconstruct it wrong.

This is not a stylistic preference. Prose is **interpretable**; a table is not. "Patch within a branch, minor on a new one" reads as a guideline someone can weigh against how big the change feels — the same rule as a table keyed on the condition leaves nothing to weigh. That matters more here than in most repositories, because these documents are read as instructions by a model, and an instruction that can be interpreted eventually will be. Structure removes the room.

The rule holds for what this repo **generates** as well as for what it commits: pull request descriptions, work items, review findings, and answers in a session. Wherever there is a shape and the target renders markdown, draw it.

Two limits. A diagram that is wrong is worse than prose, because it is believed — see *Keep them true* below. And a table with one row is a sentence wearing a costume; use one when there are cases, not to decorate a single fact.

### Tables for decisions and enumerable facts

Any rule with distinct cases becomes a table keyed on the condition, not a bulleted list:

```markdown
| Situation | Digit |
|---|---|
| Another commit on the branch you are already on | **patch** |
| First commit on a plugin from a new branch | **minor**, patch back to `0` |
| Breaking change | **major** — only when the user says so |
```

Same for flags, recipe catalogues, tool mappings, and field encodings. Key column first, answer second. Prose stays for the reasoning that the table cannot carry.

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

**Where each diagram belongs:**

| Diagram | Lives in |
|---|---|
| Which agents a skill or agent dispatches, and in what order | that `SKILL.md` or agent file |
| How plugins depend on each other | root `CLAUDE.md` and `plugins/CLAUDE.md` |
| Which component lives in which plugin | `plugins/CLAUDE.md` |
| How a value flows through a pipeline | the file that owns the pipeline |

Use plain ASCII (`└──`, `├──`, `──▶`, `┐`/`┘`), never Unicode box-drawing beyond that set — it has to stay readable in a terminal diff, in a raw file, and in the ADO renderer alike.

**Keep them true.** A diagram that no longer matches the code is worse than no diagram, because it is believed. When you rename or re-wire a component, grep for its name in every diagram before you finish.

## Cross-references

- **Refer to other skills by name only.** Write ``the `ado-mcp` engine``, never `@path/to/SKILL.md`. An `@`-prefixed path force-loads the file into context immediately and burns tokens.
- **Never use `../`** to reach into another plugin. It is not in the specification and it breaks when the layout shifts. A skill in another plugin is loaded **by name**; `${CLAUDE_PLUGIN_ROOT}` resolves to the *calling* plugin's own root, so it can only address files inside that same plugin.
- **Link within the repo by relative path** for humans (`see plugins/CLAUDE.md`), which is prose, not an import.

## Reference documents

When a skill needs more than roughly 60 lines of API tables, request shapes, or enum encodings, move them to `references/<file>.md` **inside that skill** and link with the relative path `references/<file>.md`.

When two or more skills in the same plugin genuinely need the same reference, lift it to `<plugin>/shared/<file>.md` and address it as `${CLAUDE_PLUGIN_ROOT}/shared/<file>.md`.

## Writing style

- **Say what the reader must do.** Skills are instructions, not essays.
- **Lead with the constraint, then the reason.** "Never commit to `main` — it is the protected base branch" beats the reverse order.
- **Bold the load-bearing words**, not whole sentences. Bold everywhere is bold nowhere.
- **Show, don't describe.** A wrong/right code pair teaches faster than a paragraph about it.
- **No placeholders in committed content.** `TBD`, `TODO`, and "implement later" in a `SKILL.md` are defects. Reference documents may carry an explicit `N/A` with a reason.

## Language

Every `.md` in this repo is written in **English** — skills, agents, reference documents, repo documentation, and these rules alike.

This holds regardless of the language the work is discussed in. See the Language section in the root `CLAUDE.md`, which states the same rule for everything committed, not just markdown.

There are no exceptions. A file that acquires a paragraph in another language is a defect, not a dialect.
