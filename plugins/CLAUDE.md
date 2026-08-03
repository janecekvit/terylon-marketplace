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

This rule applies to any skill that writes to ADO via `mcp__ado__*` — `create-pr`, `review-pr`, `address-pr-comments`, `write-pr-description`, and any future ADO-writing skills.

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

**A transport names operations, never tools.** The engine owns the tool surface; a transport that restates a call shape becomes a second place to fix when the surface moves — and it moves. `@azure-devops/mcp` 2.9.0 consolidated every tool into action-based forms, renaming all but one of them and turning `projectName` into `project`; because every schema is `additionalProperties: false`, each stale name fails the whole call rather than degrading. The marketplace had those names copied across nine files and would have failed on first contact.

So a transport writes ``the `update-pr-description` operation``, not the tool it resolves to. When the server changes, one file changes.

For ADO mechanics, `ado-mcp` (terylon-devops) is the canonical engine: it owns all Azure DevOps MCP recipes in `skills/ado-mcp/references/ado-mcp.md`, and every transport skill in `terylon-devops`, `terylon-product` and `terylon-dev` delegates to it (same-plugin skills via a `${CLAUDE_PLUGIN_ROOT}/skills/ado-mcp/references/ado-mcp.md` Read; cross-plugin skills by loading `ado-mcp` by name). `terylon-git` is deliberately absent from that list — it has no forge access at all. The footer/version is always resolved by the calling skill, never by `ado-mcp`.

### Criteria state outcomes, test plans state procedures

Two checklists travel through this marketplace, and they are **different shapes of sentence** rather than two copies of one list. Writing them in the same shape is what makes them feel duplicated, and it is the author's fault rather than the reader's.

| | Acceptance criteria (work item) | Test plan (pull request) |
|---|---|---|
| Sentence shape | an **outcome** — "a ticked box means something" | a **procedure and its expected result** — "run X, expect Y" |
| Authored by | `create-user-story`, before the work | the build, rendered by `write-pr-description` |
| May name a component, path or command? | **never** — it goes stale the moment the implementation moves | yes, that is the point |
| Earns its tick | **derived** — a covering plan item executed and passed | **executed** — the run passed |
| Checked for coverage by | `planner` at design time, `tester` after the build | `tester` |

`planner` is the **only conversion point**: it turns each criterion into task test cases and emits a criterion-to-task coverage map, so a criterion nothing verifies is caught before any code exists. `tester` executes the plan and never tests a criterion directly — a criterion with no covering plan item comes back as a reported gap, never closed by an improvised check, because a tester that authors the test and then runs it has marked its own homework.

The two write-backs carry different content for the same reason: the pull request thread gets the procedure evidence, the work-item comment gets the coverage verdict and a pointer to the thread.

**When criteria change mid-flight, amend them visibly.** The contract is allowed to change; changing it silently is not. A withdrawn criterion moves to a trailing `**Superseded**` group — struck through, and with no checkbox, because withdrawn is not the same as unsatisfied — its replacement goes in the group whose outcome it states, and a comment records what was learned. The mechanics live in `create-user-story`; the discrimination that matters lives here:

| What happened | Do |
|---|---|
| an outcome the story promised changed or turned out wrong | amend the criteria |
| new outcomes were added — the work grew past the story | leave the criteria alone and open a follow-up story |

**Only the product owner amends criteria.** `tester` proposes and never applies; `planner` re-derives its coverage map against the live field rather than a cached copy; and a criterion sitting in `**Superseded**` is not a claim — neither verified, nor ticked, nor counted as a coverage gap.

---

## Plugin overview

```
terylon-core (root — no dependencies)
    ▲
    └── terylon-git  [terylon-core]
           ▲
           └── terylon-devops  [terylon-git]
                  ▲
                  ├── terylon-product  [terylon-devops]
                  ├── terylon-dev      [terylon-git, terylon-devops, terylon-core]
                  └── terylon-test     [terylon-devops, terylon-core]
```

| Slug | Audience | Dependencies |
|---|---|---|
| `terylon-core` | every repository — the shared conventions and run measurement | none |
| `terylon-git` | any git repository — no forge, no MCP server | `terylon-core` |
| `terylon-devops` | Azure DevOps layer — everyone on ADO | `terylon-git` |
| `terylon-product` | product owner / PM | `terylon-devops` |
| `terylon-dev` | developers | `terylon-git`, `terylon-devops`, `terylon-core` |
| `terylon-test` | anyone holding a checklist that decides something | `terylon-devops`, `terylon-core` |

`terylon-product` reaches everything below it transitively. `terylon-dev` and `terylon-test` declare `terylon-core` **directly** as well: both load `measure-token-spend` whether or not git or a forge is in play, and `terylon-dev` additionally declares `terylon-git`, because `leader` dispatches `code-reviewer` whether or not Azure DevOps is.

`terylon-core` is the **root**, not a second leaf. It needs neither git nor a forge, only a shell and the local session transcripts, and every other plugin sits on it. It **replaced `terylon-metrics`**, which no longer exists, and its arrival removed the `superpowers` dependency: `write-plan` and `run-build-loop` replaced two of those skills, `finish-branch` in `terylon-git` a third, and the remaining three were dropped because `developer`, `refactorer` and `debugger` already carried them in their own prose. A skill that only restates what the persona says costs cache-write to load and buys nothing.

### Where a component belongs

**A component lives in the lowest plugin that all of its consumers can reach, and a plugin declares a dependency only on what it actually loads.** Count consumers by *plugin*, not by file, and count only real loads — a prose mention that is an example is not a consumer.

| Consumers span | It lives in |
|---|---|
| one plugin | that plugin |
| several plugins | their lowest common ancestor |

Two failure modes, and both have happened here:

| Symptom | What it means | Worked example |
|---|---|---|
| A component in the root that only one plugin loads | the root installs for everyone, so everyone pays for it | `write-plan` and `run-build-loop` sat in `terylon-core` and moved to `terylon-dev` |
| A component in a plugin whose dependency it never exercises | the plugin's own boundary claim becomes false | `delegate-to-repo-agents` sat in `terylon-git` and never called git; it moved to `terylon-core` |

**The test is what a component exercises, never who calls it.** `delegate-to-repo-agents` mentions `git checkout` and `git status` three times — as examples of what a write-capable agent can do, not as calls it makes. Its `allowed-tools` is `Read, Grep, Glob`. Reading the mentions rather than the tool list is what kept it in the wrong plugin.

### What lives where

| Plugin | Skills | Agents |
|---|---|---|
| `terylon-core` | `delegate-to-repo-agents`, `measure-token-spend` | — |
| `terylon-git` | `create-workspace`, `code-review`, `finish-branch` | `code-reviewer` |
| `terylon-devops` | `ado-mcp`, `create-pr`, `review-pr`, `write-pr-description`, `address-pr-comments`, `update-pr-checklist`, `update-work-item-checklist` | `pr-reviewer` |
| `terylon-product` | `create-user-story`, `create-feature` | — |
| `terylon-dev` | `develop`, `brainstorm`, `write-plan`, `run-build-loop` | `leader`, `planner`, `developer`, `debugger`, `refactorer`, `security-reviewer`, `performance-reviewer`, `architecture-reviewer`, `edge-case-reviewer` |
| `terylon-test` | `test`, `verify-test-plan`, `run-build-and-tests`, `run-ui-flows` | `tester` |

`terylon-core` also ships the `SubagentStop` hook that records per-agent spend continuously, plus `shared/oet.js` and `shared/weights.json`.

The boundary between `terylon-git` and `terylon-devops` is the forge: everything in `terylon-git` exercises git and nothing more, everything in `terylon-devops` touches Azure DevOps. That is why the review pipeline is split — `code-review` and `code-reviewer` are local, `review-pr` and `pr-reviewer` carry the findings to ADO.

### Every cross-plugin load, and what covers it

| Loader | Loads | From | Covered by |
|---|---|---|---|
| the seven `terylon-dev` personas | `delegate-to-repo-agents` | core | `terylon-dev` → core, direct |
| `code-reviewer` | `delegate-to-repo-agents` | core | `terylon-git` → core |
| `tester`, `run-ui-flows` | `delegate-to-repo-agents` | core | `terylon-test` → core, direct |
| `develop`, `leader` | `measure-token-spend` | core | `terylon-dev` → core, direct |
| `test`, `tester` | `measure-token-spend` | core | `terylon-test` → core, direct |
| `develop`, `code-reviewer`, `pr-reviewer` | `create-workspace` | git | dev → git direct; devops → git |
| `develop` | `finish-branch` | git | dev → git |
| `review-pr`, `address-pr-comments` | `code-review` | git | devops → git |
| `develop` | `create-pr`, `ado-mcp` | devops | dev → devops |
| `tester` | `update-pr-checklist`, `update-work-item-checklist` | devops | test → devops |
| `create-user-story`, `create-feature` | `ado-mcp` | devops | product → devops |

No edge points upward, there is no cycle, and `terylon-core` loads nothing. **When you add a load, add its row** — the table is how the next placement error gets caught before it ships.

### Dispatch chain

```
develop (skill, main thread — holds the gates)
├── brainstorm (skill)   Gate 0's second mode; an item with no stated outcome
│                        └── design document + 1..N approved seed-specs
└── leader
    ├── planner
    ├── developer ──▶ debugger  (on a failing test)
    │   └── <repo-local specialist>    conditional; capability gate below
    ├── security-reviewer  ┐
    ├── performance-reviewer│ parallel, read-only
    ├── architecture-reviewer
    ├── edge-case-reviewer ┘
    │   └── <repo-local specialist>    conditional; capability gate below
    ├── refactorer
    └── whole-branch review:
        ├── code-reviewer   (no PR — the usual case)
        │   └── <repo-local specialist>    conditional; capability gate below
        └── pr-reviewer ──▶ code-reviewer  (a PR exists)
```

The `<repo-local specialist>` branches are **not ours**. A target repository may ship its own agents — a stack-specific implementer, a domain reviewer — and a persona dispatches one when it covers the technology more specifically than a generic persona can. Most repositories ship none, and the branch simply does not occur. The convention lives in the `delegate-to-repo-agents` skill in `terylon-core`, loaded by name, and **the gate is a capability test**: may the candidate change the files under examination? `Edit`, `Write` and **unrestricted `Bash`** all mean yes — `sed -i` rewrites a file as surely as `Edit` does — so `disallowedTools: [Edit, Write]` alone settles nothing. Every shorthand for this rule fails in the same direction, permissively; the skill states the test and the shorthands are not repeated here on purpose.

`develop` is a skill rather than an agent because only the main thread can prompt the user. Everything below it is dispatched and reports back. `brainstorm` is a skill for the same reason and sits at the same level: it is loaded, not dispatched, and it runs in `develop`'s own context because it does nothing but ask.

**`brainstorm` is Gate 0's second mode, not a step before it.** It ends where that gate ends — at an approved seed-spec — so making it a preceding step would put two intakes in a row. The seam against `planner` is what keeps them from overlapping: `brainstorm` settles *what and why* and may never name a file path, `planner` settles *how* and must.

### Two measured limits on dispatched agents

Both were found by running this pipeline against itself rather than by reading the specification, and both make parts of the diagrams above **aspirational rather than descriptive**. Read them before trusting a fan-out drawn here.

**A skill loaded by name carries instructions, not capability.** The `skills:` field lets an agent open a skill's prose; it does not hand over the tools that prose tells it to call. So **every agent must declare in its own `tools:` each tool the skills it loads will use** — the ADO namespace for an agent driving `update-pr-checklist`, `Bash(node *)` for one running `measure-token-spend`. The `tester` shipped a release documented as driving two ADO transports while declaring no ADO namespace at all, and its first real run returned `BLOCKED` for precisely that reason.

**`Agent` in an agent's `tools:` did not grant nested dispatch.** Measured three times in one session — `tester` twice, `leader` once — a plugin agent dispatched through the `Agent` tool came up holding no `Agent`, no `Task` and no other dispatch tool; `leader` additionally lacked the `TodoWrite` its controller role assumes. The cause is **not established**, so this is a measurement and not a claim about the specification. The consequence is not small: **only the main thread was observed to hold a dispatch tool**, so wherever these files draw an agent fanning out under its own power, that step is unproven.

An agent in that position **says the capability is absent, degrades to in-context work, and marks anything that needs a live fan-out unverifiable.** It does not quietly substitute the nearest available evidence — a unit fixture modelling N subagents is not a run of N subagents, and reporting it as one is the failure `terylon-test` exists to prevent.

Given several work items, `develop` runs this chain once per item with the leaders **concurrent** — one seed-spec, worktree and branch each. The shape does not change; it multiplies. Gates stay on the main thread and are hosted as each leader returns, which is also why every question has to name its work item.

`terylon-test` runs after all of it, on the claims rather than the code:

```
test (skill, main thread — holds the write-back gate, reports token spend)
└── tester (terylon-test — drives the run)
    ├── update-pr-checklist (read) ......... terylon-devops; the test plan, and the work item it links
    ├── update-work-item-checklist (read) .. terylon-devops; the acceptance criteria of that work item
    ├── verify-test-plan ................... engine: triage, coverage, routing, evidence
    │   └── per-claim subagents            one round; claims are independent
    │       ├── run-build-and-tests        the project's build and suite — a shell is enough
    │       ├── run-ui-flows               the interface, through browser automation
    │       └── <repo-local specialist>    conditional; capability gate below
    ├── update-pr-checklist (write) ........ terylon-devops; the thread, then the rewritten plan
    └── update-work-item-checklist (write) . terylon-devops; the comment, then the annotated criteria
```

Azure DevOps appears only at the ends, in `terylon-devops`. The two `update-*-checklist` transports read the plan and the criteria and write the answers back; they hold no `Agent`, so the verification cannot happen in their context. Two things sit above them, mirroring the development pipeline: the `tester` agent drives the run, and the `test` skill hosts the one gate a subagent cannot — consent before the write — and reports the run's token spend, exactly as `develop` and `leader` do. `code-reviewer` sits below `pr-reviewer`, so there the transport dispatches; here the caller drives and the transports only read and write.

The two executors are the **execution layer**. They run the artifact and report facts — commands, exit statuses, case names, observed state — while the engine keeps the judgment about what a result means. `run-ui-flows` is separate purely because of its dependency class: a checklist walker that needs only a shell must not drag in a browser stack, so the plugin ships no `.mcp.json` for it and reports the capability as absent instead.

It exists because the review chain above verifies the *diff* while the test plan verifies the *claims about it*, and nothing was checking the second. A tick nobody exercised reads exactly like one that was earned.

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
