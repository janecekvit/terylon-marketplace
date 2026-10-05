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
  "author": { "name": "Vít Janeček" },
  "homepage": "https://github.com/janecekvit/terylon-marketplace/tree/main/plugins/terylon-<role>",
  "repository": "https://github.com/janecekvit/terylon-marketplace",
  "license": "MIT",
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
| `pr-reviewer` | a whole pull request — fetches it, dispatches `code-reviewer`, writes the findings back | `terylon-forge` |

Read top to bottom it goes dimension → code → pull request. A new reviewer belongs somewhere on that ladder; if it does not, it is probably not a reviewer.

The single-dimension lenses are read-only and propose rather than edit. Keep that property when adding one.

### No redundant prefixes

Do not prefix a component with its plugin's topic. The plugin slug already namespaces it, so `terylon-ado:ado-fetch-work-item` says "ado" twice. The plugin boundary carries that information; the component name should carry only what is specific to it.

`forge-ops` is not an exception either: it is named for the **port** it implements, not for a platform, which is exactly why both adapters can ship a skill under that one name.

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
4. Bump the version on every commit — see *Versioning* above.
5. Open a PR against `main`, following `.claude/rules/git-workflow.md`.

## Skill conventions

These conventions apply to every `SKILL.md` under `plugins/terylon-<role>/skills/<skill>/`.

### Frontmatter

**The frontmatter rules for skills and agents — the fields, `description` starting with `Use when …`, and never setting `disable-model-invocation` — are stated once, in `.claude/rules/markdown.md`, under *Frontmatter*.**

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
plugin. See `plugins/terylon-ado/.mcp.json` for the canonical example.

**A server belongs to the plugin whose boundary it matches, not to the plugin whose skills call it.** The `ado` server sits in `terylon-ado` rather than in the port that uses it, because a GitHub repository enabling the port must not start it. When a server would install for consumers who cannot authenticate to it, that server marks a plugin boundary.

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

### Output formatting for forge rendering

Markdown a skill writes to a forge is never hard-wrapped. **The rule, its reason and the skills it binds are stated once, in `.claude/rules/markdown.md`, under *Never hard-wrap ADO-bound markdown*.**

### Cross-skill references

**Skills are referenced by name, never by an `@` path or a `../` import — stated once, with the reason, in `.claude/rules/markdown.md`, under *Cross-references*.**

### Cross-skill composition (engine + transport)

When two skills share judgment logic but differ only in transport (local vs remote,
CLI vs API), prefer **delegation over duplication**:

- One skill is the **engine** — owns the rules, the heuristics, the output shape.
- Other skills are **transport** — handle URL parsing, fetching, posting, and invoke
  the engine via a documented sub-skill contract (flags + return shape).

Example: `code-review` is the engine; `review-pr` is transport (PR URL → diff →
call `code-review` → format findings → post through the `post-pr-thread` operation). The two now live in
**different plugins** — the engine in `terylon-git`, the transport in `terylon-forge` —
which changes nothing about how they compose: `review-pr` loads `code-review` **by name**,
and `terylon-forge` declares `dependencies: ["terylon-git"]` so the engine is always
present. A split like this is the normal outcome when an engine has no forge dependency:
put it in the lowest plugin that can host it, and let the transports depend upwards.

**A transport names operations, never tools.** The engine owns the tool surface; a transport that restates a call shape becomes a second place to fix when the surface moves — and it moves. `@azure-devops/mcp` 2.9.0 consolidated every tool into action-based forms, renaming all but one of them and turning `projectName` into `project`; because every schema is `additionalProperties: false`, each stale name fails the whole call rather than degrading. The marketplace had those names copied across nine files and would have failed on first contact.

So a transport writes ``the `update-pr-description` operation``, not the tool it resolves to. When the server changes, one file changes.

For platform mechanics, `forge-ops` is the canonical engine — and there are **two of it**, one per adapter, implementing the same catalog:

| Body | Plugin | Mechanism |
|---|---|---|
| Azure DevOps | `terylon-ado` | the `ado` MCP server, `mcp__plugin_terylon-ado_ado__*` |
| GitHub | `terylon-github` | the `gh` CLI |

Every transport in `terylon-forge`, plus `create-user-story` and `create-feature` in `terylon-product` and `develop` and `planner` in `terylon-dev`, delegates to it. Inside the port, `resolve-forge` names the adapter; a caller outside the port that has not run it loads `forge-ops` **by name** — plugin-qualified when both adapters are enabled — and then issues its own calls following the recipes. `terylon-git` is deliberately absent from that list; it has no forge access at all. The footer and version are always resolved by the calling skill, never by `forge-ops`.

**Where the two bodies genuinely differ, the port declares the difference rather than hiding it** — description limits, where acceptance criteria live, how an item's type is expressed, how a thread is resolved. A transport reads the declared value; it never learns which platform produced it. The asymmetry tables are in each `forge-ops`, and they must agree: when they disagree, one of them is wrong, and the port's declaration decides which.

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
           └── terylon-forge  [terylon-git]          the port; ships no adapter
                  ▲
                  ├── terylon-ado      [terylon-forge]   adapter: forge-ops + the ado MCP server
                  ├── terylon-github   [terylon-forge]   adapter: forge-ops over the gh CLI
                  ├── terylon-product  [terylon-forge]
                  ├── terylon-dev      [terylon-git, terylon-forge, terylon-core]
                  └── terylon-test     [terylon-forge, terylon-core]
```

| Slug | Audience | Dependencies |
|---|---|---|
| `terylon-core` | every repository — the shared conventions and run measurement | none |
| `terylon-git` | any git repository — no forge, no MCP server | `terylon-core` |
| `terylon-forge` | the forge port — everyone working through pull requests | `terylon-git` |
| `terylon-ado` | repositories on Azure DevOps | `terylon-forge` |
| `terylon-github` | repositories on GitHub | `terylon-forge` |
| `terylon-product` | product owner / PM | `terylon-forge` |
| `terylon-dev` | developers | `terylon-git`, `terylon-forge`, `terylon-core` |
| `terylon-test` | anyone holding a checklist that decides something | `terylon-forge`, `terylon-core` |

`terylon-product` reaches everything below it transitively. `terylon-dev` and `terylon-test` declare `terylon-core` **directly** as well: both load `measure-token-spend` whether or not git or a forge is in play, and `terylon-dev` additionally declares `terylon-git`, because `leader` dispatches `code-reviewer` whether or not a forge is.

**The two adapters are siblings of the role plugins, not layers under them.** Nothing declares an adapter: the consumer enables the one their repositories are hosted on, and the port arrives as its dependency. A consumer therefore enables **two** keys — a role plugin and an adapter.

`terylon-forge` **replaced `terylon-devops`**, which no longer exists. That plugin mixed two things: the transports, which were portable and are now the port, and the Azure DevOps mechanics, which were not and are now `terylon-ado`. The engine skill `ado-mcp` became `forge-ops`, and the MCP namespace moved with the server, from `mcp__plugin_terylon-devops_ado__*` to `mcp__plugin_terylon-ado_ado__*`.

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

#### The one exception: a port and its adapters

**`terylon-forge` loads `forge-ops`, which lives in a plugin above it. Every upward load in this marketplace is that one load, made from three different places, and it is deliberate.**

The rule above would put a component every transport loads into the lowest plugin that reaches it. Applied here it would put the Azure DevOps mechanics into the port, and every GitHub repository would install an Azure DevOps MCP server it has no account on. That is the outcome the split exists to prevent, so the placement rule yields to a **port and adapter** relationship:

| Side | Declares | Holds |
|---|---|---|
| `terylon-forge` — the port | the operation catalog, and a dependency on `terylon-git` only | the transports, `pr-reviewer`, `resolve-forge` |
| `terylon-ado`, `terylon-github` — the adapters | a dependency on `terylon-forge` | one skill each, both named `forge-ops` |

So the **dependency** edge still points down; only the **load** points up. Three rules keep that honest, and none of them is optional:

- **The port declares no adapter.** Ever. The moment it does, the platform it names installs for everyone.
- **Both adapters implement the same catalog under the same skill name.** A caller loads `forge-ops` and does not branch. `resolve-forge` picks which, and addresses it plugin-qualified when both are enabled.
- **A transport that finds no adapter says so and stops.** It does not fall back to the other one and does not issue platform calls of its own. A second copy of the call shapes is a second place to fix, and the copy goes stale.

**Do not read this as licence for a second upward load.** It is here because the alternative was worse for a specific, stated reason. A new one needs the same argument made out loud, and a row in the load table below saying which side of the port it sits on.

### What lives where

| Plugin | Skills | Agents |
|---|---|---|
| `terylon-core` | `delegate-to-repo-agents`, `measure-token-spend` | — |
| `terylon-git` | `create-workspace`, `code-review`, `finish-branch` | `code-reviewer` |
| `terylon-forge` | `resolve-forge`, `create-pr`, `review-pr`, `write-pr-description`, `address-pr-comments`, `update-pr-checklist`, `update-work-item-checklist` | `pr-reviewer` |
| `terylon-ado` | `forge-ops` (the ADO body) | — |
| `terylon-github` | `forge-ops` (the GitHub body) | — |
| `terylon-product` | `create-user-story`, `create-feature` | — |
| `terylon-dev` | `develop`, `brainstorm`, `write-plan`, `run-build-loop`, `background-run` | `leader`, `planner`, `developer`, `debugger`, `refactorer`, `security-reviewer`, `performance-reviewer`, `architecture-reviewer`, `edge-case-reviewer` |
| `terylon-test` | `test`, `verify-test-plan`, `run-build-and-tests`, `run-ui-flows` | `tester` |

`terylon-core` also ships the `SubagentStop` hook that records per-agent spend continuously, plus `shared/oet.js`, `shared/weights.json` and `shared/transcript.js`. The last is the one place that reads a transcript's usage: the hook and `measure-token-spend` both call it, so neither can drift on how a response's repeated records are collapsed — a question they answered wrong, identically and in two copies, until the module existed.

`background-run` is the one component in `terylon-dev` that the pipeline never calls. It exercises git and the `claude --bg` CLI, so the *exercises* test alone would allow it in `terylon-git` — and that is exactly the failure mode the placement rule warns about, because `terylon-git` is a dependency of everything and would install it for every consumer. Its only audience is the operator driving this plugin, so it lives beside them. Being unreachable from `develop` is not evidence of a misplacement; it is a skill the operator invokes, not a persona the loop dispatches.

`terylon-ado` also ships the `.mcp.json` that registers the `ado` server. `terylon-github` ships no server at all — the `gh` CLI needs none.

Two boundaries, and they are different in kind:

| Boundary | Between | The test |
|---|---|---|
| the forge | `terylon-git` and `terylon-forge` | does it reach outside the repository? Everything in `terylon-git` exercises git and nothing more; that is why the review pipeline is split, with `code-review` and `code-reviewer` local and `review-pr` and `pr-reviewer` carrying the findings outward |
| the platform | `terylon-forge` and the adapters | does it **depend** on a platform? A transport that issues a `gh` subcommand or an `mcp__` tool call has crossed it and belongs in an adapter |

The second is the one that erodes. A transport gains one platform-specific line at a time, each defensible on its own, until the port is a port in name only. **Grep before finishing a change to a transport** — and grep for the runtime forms, `mcp__plugin_terylon-ado_ado__*` rather than `mcp__ado__`, or the check passes because it cannot fire.

**Two things are not crossings, and a grep that flags them is miscalibrated.** A transport's `allowed-tools` names both surfaces on purpose, since an absent one is inert and the grant cannot be resolved at runtime. And a transport **naming** a difference the port declares — that one forge numbers what the other words, that one wants a leading slash — is the port doing its job; hiding those is what makes a transport wrong. What must not appear is a transport *issuing* a platform call, or reading a raw platform field instead of the normalised value the operation returns.

### Every cross-plugin load, and what covers it

| Loader | Loads | From | Covered by |
|---|---|---|---|
| the seven `terylon-dev` personas | `delegate-to-repo-agents` | core | `terylon-dev` → core, direct |
| `code-reviewer` | `delegate-to-repo-agents` | core | `terylon-git` → core |
| `tester`, `run-ui-flows` | `delegate-to-repo-agents` | core | `terylon-test` → core, direct |
| `develop`, `leader` | `measure-token-spend` | core | `terylon-dev` → core, direct |
| `test`, `tester` | `measure-token-spend` | core | `terylon-test` → core, direct |
| `develop`, `code-reviewer`, `pr-reviewer` | `create-workspace` | git | dev → git direct; forge → git |
| `develop` | `finish-branch` | git | dev → git |
| `review-pr`, `address-pr-comments` | `code-review` | git | forge → git |
| `develop` | `create-pr` | forge | dev → forge |
| `tester` | `update-pr-checklist`, `update-work-item-checklist` | forge | test → forge |
| every transport, `pr-reviewer` | `resolve-forge` | forge | same plugin |
| `develop`, `planner` | `resolve-forge` | forge | dev → forge |
| `create-user-story`, `create-feature` | `resolve-forge` | forge | product → forge |
| every transport, `pr-reviewer` | `forge-ops` | **an adapter** | **the port exception** — the adapter declares forge, not the reverse |
| `develop`, `planner`, `developer` | `forge-ops` | **an adapter** | **the port exception** — enabled by the consumer, never declared |
| `create-user-story`, `create-feature` | `forge-ops` | **an adapter** | **the port exception** |

`terylon-core` loads nothing, and there is no cycle. **Exactly three rows point up**, all of them at `forge-ops`, all of them covered by the port exception above; every other edge points down its dependency chain. **When you add a load, add its row** — the table is how the next placement error gets caught before it ships, and a fourth upward row without an argument beside it is the error.

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
    ├── performance-reviewer│ all four from one message, read-only
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

### One measured limit on dispatched agents

Found by running this pipeline against itself rather than by reading the specification.

**A skill loaded by name carries instructions, not capability.** The `skills:` field lets an agent open a skill's prose; it does not hand over the tools that prose tells it to call. So **every agent must declare in its own `tools:` each tool the skills it loads will use** — the ADO namespace for an agent driving `update-pr-checklist`, `Bash(node *)` for one running `measure-token-spend`. The `tester` shipped a release documented as driving two ADO transports while declaring no ADO namespace at all, and its first real run returned `BLOCKED` for precisely that reason.

**When a capability an agent needs really is absent**, it says so, degrades to in-context work, and marks anything that needed the missing capability unverifiable. It does not quietly substitute the nearest available evidence — a unit fixture modelling N subagents is not a run of N subagents, and reporting it as one is the failure `terylon-test` exists to prevent.

#### Retired: nested dispatch, and the tester's ADO namespace

This section used to carry two further limits in the present tense. **Both were re-probed on 2026-08-14 against the installed plugins and neither holds.** They are recorded here as history so the next reader does not rediscover them from a stale claim.

| Retired claim | What the probe returned |
|---|---|
| `Agent` in an agent's `tools:` does not grant nested dispatch; only the main thread was observed to hold a dispatch tool | `Agent=HELD` on both `terylon-dev:leader` and `terylon-test:tester`; the leader then **invoked** it and its child returned `PONG`. Proven by invocation, not by introspection. |
| `tester` declares no ADO namespace and returns `BLOCKED` | `ADO_NAMESPACE: HELD` — fixed in a later release. |

**The fan-outs drawn throughout these files are therefore descriptive, not aspirational.** They were qualified for as long as the first claim stood; that qualification is gone.

One narrower finding from the same probe **does** still hold, and is not retired: `leader` reports `TODOWRITE: ABSENT`, so a controller cannot keep a visible task list of its own. The ledger is what it has instead, which is why `run-build-loop` specifies the ledger the way it does.

Given several work items, `develop` runs this chain once per item with the leaders **concurrent** — one seed-spec, worktree and branch each. The shape does not change; it multiplies. Gates stay on the main thread and are hosted as each leader returns, which is also why every question has to name its work item.

`terylon-test` runs after all of it, on the claims rather than the code:

```
test (skill, main thread — holds the write-back gate, reports token spend)
└── tester (terylon-test — drives the run)
    ├── update-pr-checklist (read) ......... terylon-forge; the test plan, and the work item it links
    ├── update-work-item-checklist (read) .. terylon-forge; the acceptance criteria of that work item
    ├── verify-test-plan ................... engine: triage, coverage, routing, evidence
    │   └── per-claim subagents            all from one message; claims are independent
    │       ├── run-build-and-tests        the project's build and suite — a shell is enough
    │       ├── run-ui-flows               the interface, through browser automation
    │       └── <repo-local specialist>    conditional; capability gate below
    ├── update-pr-checklist (write) ........ terylon-forge; the thread, then the rewritten plan
    └── update-work-item-checklist (write) . terylon-forge; the comment, then the annotated criteria
```

The forge appears only at the ends, in `terylon-forge`, and which forge is `resolve-forge`'s answer. The two `update-*-checklist` transports read the plan and the criteria and write the answers back; they hold no `Agent`, so the verification cannot happen in their context. Two things sit above them, mirroring the development pipeline: the `tester` agent drives the run, and the `test` skill hosts the one gate a subagent cannot — consent before the write — and reports the run's token spend, exactly as `develop` and `leader` do. `code-reviewer` sits below `pr-reviewer`, so there the transport dispatches; here the caller drives and the transports only read and write.

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
