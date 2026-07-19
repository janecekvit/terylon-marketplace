# Plugins — author guide

This directory holds Terylon's distributed Claude Code plugins. Each subdirectory is one plugin published through `.claude-plugin/marketplace.json` at the repo root.

## Plugin directory shape

Every plugin folder must contain:

```
plugins/terylon-<role>/
├── .claude-plugin/
│   └── plugin.json          # required, schema: claude-code-plugin-manifest
├── skills/                  # required (may be empty); SKILL.md files go here
│   └── .gitkeep             # only while skills/ is empty, so git tracks the folder
└── README.md                # required; consumer-facing audience + install snippet
```

`plugin.json` minimum:

```json
{
  "$schema": "https://json.schemastore.org/claude-code-plugin-manifest.json",
  "name": "terylon-<role>",
  "version": "0.1.0",
  "description": "<one sentence>",
  "author": { "name": "Vít Janeček", "email": "vit.janecek@outlook.com" },
  "homepage": "https://dev.azure.com/janecekvit/Dev/_git/TerylonMarketplace?path=/plugins/terylon-<role>",
  "license": "Proprietary",
  "keywords": ["<topic>", "<topic>"]
}
```

## Naming

- Every plugin slug is `terylon-<role>` — lowercase, kebab-case, role is a short noun (no `-engineer` / `-developer` suffix).
- The `terylon-` prefix is intentionally redundant with the `@terylon` marketplace suffix. Reason: Claude Code's slash-command autocomplete filters by the per-plugin slug shown in the tag column. Putting `terylon` into every slug means a user can type `/terylon` and see every command from every Terylon-marketplace plugin in one filtered list, without having to remember per-role slugs.
- Slug must match the directory name AND the `name` field in `plugin.json` AND the `name` in the corresponding entry of `marketplace.json`.

### Skills are actions, agents are roles

**Name a skill for what it does** — a verb phrase: `create-workspace`, `code-review`, `write-pr-description`, `address-pr-comments`. The user invokes it, so it reads as an instruction.

**Name an agent for who it is** — an agent noun, ending in `-er` / `-or`: `developer`, `planner`, `debugger`, `refactorer`, `code-reviewer`, `pr-reviewer`. An agent is dispatched and reports back, so it reads as a role on a team.

The distinction is load-bearing, not decorative. `code-review` (the skill) and `code-reviewer` (the agent) act on the same material, and the shape of the name is what tells a reader which one they are looking at.

**The `*-reviewer` family is graded by scope, not by rigour.** Every reviewer reviews; they differ in how much they look at.

| Agent | Scope | Plugin |
|---|---|---|
| `security-reviewer`, `performance-reviewer`, `architecture-reviewer`, `edge-case-reviewer` | one dimension of a diff | `terylon-dev` |
| `code-reviewer` | a whole diff — dispatches the lenses, then adversarially verifies what they return | `terylon-git` |
| `pr-reviewer` | a whole pull request — fetches it, dispatches `code-reviewer`, writes the findings back | `terylon-devops` |

Read top to bottom it goes dimension → code → pull request. A new reviewer belongs somewhere on that ladder; if it does not, it is probably not a reviewer.

The single-dimension lenses are read-only and propose rather than edit. Keep that property when adding one.

### No redundant prefixes

Do not prefix a component with its plugin's topic. The plugin slug already namespaces it, so `terylon-devops:devops-review-pr` says "devops" twice. The plugin boundary carries that information; the component name should carry only what is specific to it.

`ado-mcp` is not an exception — it is named for Azure DevOps specifically, not for "devops" as a discipline, and its reference document has carried that name since the original port.

## Versioning

Bump `plugin.json#version` on every commit that touches the plugin. Which digit moves is decided by **the branch**, never by how large the change feels:

| Situation | Digit | Example |
|---|---|---|
| Another commit on the branch you are already on | **patch** | `0.4.2` → `0.4.3` |
| First commit on a plugin from a new branch | **minor**, patch back to `0` | `0.4.3` → `0.5.0` |
| Breaking change | **major** | only when the user says so |

**Within one branch it is always patch — no exceptions.** A branch that renames half the plugin still moves the patch digit on every commit, however sweeping the change looks. The minor digit counts branches, not effort. This is the rule that gets broken most often, because a large change invites a large-looking bump; the size of the diff is not an input.

**Never bump major on your own.** Breaking changes (a renamed slug, a removed skill, an incompatible flag) are the user's call. Propose it and wait.

Consumers only re-fetch when this field changes, so pushing to `main` without a bump ships nothing. The branch-scoped convention exists so that one branch can iterate freely — review feedback, fixups, renames — without every iteration looking like a release.

## Adding a new plugin (checklist)

1. Create `plugins/terylon-<role>/` with the structure above.
2. Add an entry to `.claude-plugin/marketplace.json#plugins[]` with `name`, `source: "./plugins/terylon-<role>"` (paths are resolved from the **repo root**, not from `plugins/`), `description`, `category`, `keywords`.
3. Validate both manifests against JSONSchemaStore.
4. Bump version when ready to ship.
5. Open a PR against `main`. Never commit directly to `main` — work on a feature branch, and get explicit user consent for each commit.

## Skill conventions

These conventions apply to every `SKILL.md` under `plugins/terylon-<role>/skills/<skill>/`.

### Frontmatter

```yaml
---
name: <skill-slug>                    # must match the directory name; kebab-case; verb-first preferred
description: Use when <triggering condition with concrete symptoms>. Optional flags --auto and --dry-run.
allowed-tools: Bash(az *), Bash(git *), Read, Grep, Glob, Edit, Write
---
```

The `description` field starts with `Use when …` and lists triggering conditions, never the
internal workflow. (See [agentskills.io/specification](https://agentskills.io/specification).)

**Never set `disable-model-invocation`.** It hides a skill from being loaded by name, and this
marketplace is built on skills loading each other: `ado-mcp` owns every ADO recipe, `code-review`
owns the review judgment, and both exist precisely to be called by their transport skills. Hiding
an engine makes it unreachable. A skill whose usual caller is another skill states that in its
opening paragraph — the flag adds nothing that prose cannot say, and it takes away the calling
mechanism.

### URL-input + `--auto` / `--dry-run` pattern

Skills that take a remote URL and optionally write back to that system (e.g. PR review,
PR comment-addressing) follow this contract:

| Flag | Behaviour |
|------|-----------|
| _(default)_ | Summarise the plan in chat. Wait for explicit user confirmation (`push`, `do it`, `apply`, `post`, `go`) before any write. |
| `--auto` | Apply / post mechanical actions immediately. Items requiring judgment still pause for review. |
| `--dry-run` | Never write. Print the plan in chat and stop. |

A skill that writes to a remote system MUST run an **eligibility check** before reading
substantive data, and a **second eligibility re-check** immediately before writing — the
remote state may have changed during analysis.

### Heavy reference

If a skill needs more than ~60 lines of API tables, request shapes, or enum encodings,
move them to a `references/<file>.md` subdirectory **inside the skill** and link from
`SKILL.md` with the relative path `references/<file>.md`. If two or more skills genuinely
need the same heavy reference, lift it to `<plugin>/shared/<file>.md` and reference it from
each `SKILL.md` as `${CLAUDE_PLUGIN_ROOT}/shared/<file>.md` — Claude Code substitutes that
variable inline in skill content (see the [plugins reference](https://code.claude.com/docs/en/plugins-reference#environment-variables)).
Avoid parent-directory relative imports between skills; they are not in the spec and break
if the file layout shifts.

### External MCP server prerequisites

When a skill calls tools from a third-party MCP server (e.g. `mcp__ado__*` from
`@azure-devops/mcp`), the skill MUST:

- List the server in its `## Prerequisites` section with a one-line install hint.
- Include the relevant `mcp__<server>__*` wildcard in the frontmatter `allowed-tools`.
- Document the consumer-facing setup snippet in the plugin's `README.md` (not in
  every skill — one source of truth per plugin).

**Plugin-level `.mcp.json`:** when the marketplace serves a single organisation (or another
fixed-config server), prefer dropping a `.mcp.json` at the plugin root over per-skill
`Prerequisites` snippets — consumers get the server automatically when they enable the
plugin. See `plugins/terylon-devops/.mcp.json` for the canonical example.

### Footer for posted comments

When a skill posts to an external system on the user's behalf, end every comment with:

```
---
*🤖 Generated with [Claude Code](https://claude.ai/code) — <skill-name>@<plugin-version> · <model> / <effort>*
```

Resolve `<plugin-version>` at runtime by reading
`${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` — that variable is substituted to the
calling plugin's own root, so each skill picks up its own plugin's version regardless of
which other plugins are installed. `<skill-name>` is the slug of the skill posting the
comment (matches the `name` field in its own frontmatter).

`<model>` is the model the run executes under (e.g. `opus-4.8`); the skill knows it from
itself, as no environment variable exposes it. `<effort>` comes from the `CLAUDE_EFFORT`
environment variable (e.g. `xhigh`). **When `CLAUDE_EFFORT` is unset, omit the entire
` · <model> / <effort>` segment** rather than emitting a partial one.

This footer is also used to detect prior skill runs on re-invocation (grep for
`Generated with [Claude Code]` in existing threads — the substring survives everything
after it). **The order is binding:** everything variable — version, model, effort — sits
*after* that stable prefix, so detection never breaks when a model or effort tier changes.

### Output formatting for Azure DevOps rendering

When a skill emits markdown destined for Azure DevOps rendering — PR descriptions, PR thread comments, wiki posts — DO NOT hard-wrap paragraphs or bullets at 72 / 80 chars. ADO renders source line breaks verbatim (not as markdown soft wraps like GitHub does), so wrapping produces visibly choppy short lines in the rendered output. Emit one continuous line per paragraph and one continuous line per bullet; insert real `\n` only between distinct paragraphs / bullets / headings. Let the renderer wrap.

This rule applies to any skill that writes to ADO via `mcp__ado__*` — `review-pr`, `address-pr-comments`, `write-pr-description`, and any future ADO-writing skills.

### Cross-skill references

Refer to other skills by name only, no `@` paths:

> **See also:** `review-pr` for the outbound direction.

`@`-prefixed paths force-load the file into context immediately and waste tokens.

### Cross-skill composition (engine + transport)

When two skills share judgment logic but differ only in transport (local vs remote,
CLI vs API), prefer **delegation over duplication**:

- One skill is the **engine** — owns the rules, the heuristics, the output shape.
- Other skills are **transport** — handle URL parsing, fetching, posting, and invoke
  the engine via a documented sub-skill contract (flags + return shape).

Example: `code-review` is the engine; `review-pr` is transport (PR URL → diff →
call `code-review` → format findings → post via `mcp__ado__*`). The two now live in
**different plugins** — the engine in `terylon-git`, the transport in `terylon-devops` —
which changes nothing about how they compose: `review-pr` loads `code-review` **by name**,
and `terylon-devops` declares `dependencies: ["terylon-git"]` so the engine is always
present. A split like this is the normal outcome when an engine has no forge dependency:
put it in the lowest plugin that can host it, and let the transports depend upwards.

For ADO mechanics, `ado-mcp` (terylon-devops) is the canonical engine: it owns all Azure DevOps MCP recipes in `skills/ado-mcp/references/ado-mcp.md`, and every transport skill in `terylon-devops`, `terylon-product` and `terylon-dev` delegates to it (same-plugin skills via a `${CLAUDE_PLUGIN_ROOT}/skills/ado-mcp/references/ado-mcp.md` Read; cross-plugin skills by loading `ado-mcp` by name). `terylon-git` is deliberately absent from that list — it has no forge access at all. The footer/version is always resolved by the calling skill, never by `ado-mcp`.

---

## Plugin overview

| Slug | Audience | Dependencies |
|---|---|---|
| `terylon-git` | any git repository — no forge, no MCP server | none |
| `terylon-devops` | Azure DevOps layer — everyone on ADO | `terylon-git` |
| `terylon-product` | product owner / PM | `terylon-devops` |
| `terylon-dev` | developers | `terylon-git`, `terylon-devops`, `superpowers` |

`terylon-product` reaches `terylon-git` transitively through `terylon-devops`. `terylon-dev` declares it directly, because `leader` dispatches `code-reviewer` whether or not Azure DevOps is in play.

### What lives where

| Plugin | Skills | Agents |
|---|---|---|
| `terylon-git` | `create-workspace`, `code-review` | `code-reviewer` |
| `terylon-devops` | `ado-mcp`, `review-pr`, `write-pr-description`, `address-pr-comments` | `pr-reviewer` |
| `terylon-product` | `create-user-story`, `create-feature` | — |
| `terylon-dev` | `develop` | `leader`, `planner`, `developer`, `debugger`, `refactorer`, `security-reviewer`, `performance-reviewer`, `architecture-reviewer`, `edge-case-reviewer` |

The boundary between the first two is the forge: everything in `terylon-git` needs git and nothing more, everything in `terylon-devops` touches Azure DevOps. That is why the review pipeline is split — `code-review` and `code-reviewer` are local, `review-pr` and `pr-reviewer` carry the findings to ADO.

### Dispatch chain

```
develop (skill, main thread — holds the gates)
└── leader
    ├── planner
    ├── developer ──▶ debugger  (on a failing test)
    ├── security-reviewer  ┐
    ├── performance-reviewer│ parallel, read-only
    ├── architecture-reviewer
    ├── edge-case-reviewer ┘
    ├── refactorer
    └── whole-branch review:
        ├── code-reviewer   (no PR — the usual case)
        └── pr-reviewer ──▶ code-reviewer  (a PR exists)
```

`develop` is a skill rather than an agent because only the main thread can prompt the user. Everything below it is dispatched and reports back.

A new plugin is added only when at least one real skill exists for it.

### Name collision check

Before adding a new skill or agent, verify that its name does not collide with anything installed:

```bash
find ~/.claude/plugins/cache -name "SKILL.md" -path "*/skills/*" \
  | sed -E 's|.*/skills/([^/]+)/SKILL.md|\1|' | sort -u | grep -x "<proposed-name>"
```

Empty output means no skill of that name is installed — but the glob only sees skills, so widen it before trusting it:

```bash
find ~/.claude/plugins/cache \
  \( -path "*/skills/<proposed-name>/SKILL.md" \
  -o -path "*/agents/<proposed-name>.md" \
  -o -path "*/commands/<proposed-name>.md" \) -not -path "*/terylon/*"
```

The `-not -path "*/terylon/*"` matters once this marketplace is installed locally, or the check matches its own cached copy and every name looks taken.

**Check what kind of thing collides before renaming around it.** The official `code-review` plugin ships a *command*; this repo's `code-review` is a *skill*. Different namespaces, and the reference repo ran the same pair for a year without trouble. The visible cost is that typing `/code-review` offers both — noise, not breakage. An earlier rename to `review-diff` was reverted once that was actually verified.
