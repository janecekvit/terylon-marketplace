# Terylon Marketplace

Internal Claude Code plugin marketplace distributed into product repositories through `extraKnownMarketplaces`.

@README.md

## Structure

```
/.claude-plugin/marketplace.json   root manifest
/plugins/<slug>/                   one directory per plugin
/plugins/CLAUDE.md                 authoring conventions — read before editing a plugin
/docs/                             the engineering knowledge base — architecture, flows, runbooks, onboarding
/docs/terylon/                     terylon working tree: intake, specs, plans, ledgers (gitignored)
/docs/superpowers/                 the same, when those skills run directly (gitignored)
```

**All of `/plugins` is the distribution boundary.** Anything inside is consumed by other repos; anything outside stays local.

## Plugins

```
terylon-core                      the root — shared conventions + measurement; no git, no forge, no MCP
└── terylon-git                   + git; no forge, no MCP server
    └── terylon-forge             the forge port — the PR workflow, written against operations; ships no adapter
        ├── terylon-ado           adapter: the ADO body of forge-ops + the ado MCP server
        ├── terylon-github        adapter: the GitHub body of forge-ops, over the gh CLI; no server
        ├── terylon-product       + user stories, Feature specs
        ├── terylon-dev           + the build pipeline (declares terylon-git and terylon-core directly)
        └── terylon-test          + verifying a test plan and acceptance criteria (declares terylon-core directly)
```

`terylon-dev` declares `terylon-git` directly as well as through `terylon-forge`, because its `leader` dispatches `code-reviewer` whether or not a forge is in play. `terylon-dev` and `terylon-test` declare `terylon-core` directly for the same reason: both invoke `measure-token-spend`, which has nothing to do with git or a forge.

**A consumer enables two keys: a role plugin and an adapter.** Nothing declares an adapter — the port ships none on purpose, because declaring one would install an Azure DevOps MCP server in every GitHub repository. `terylon-forge` **replaced `terylon-devops`**, splitting it along that seam: the portable transports became the port, the ADO mechanics became `terylon-ado`, and `ado-mcp` became `forge-ops`. See the *Migrating* note in `plugins/terylon-forge/README.md`.

`terylon-core` is the **root every other plugin sits on**, and it carries only what all of them may need: `delegate-to-repo-agents` (the capability test a persona applies before dispatching an agent the target repository ships) and `measure-token-spend`, plus a `SubagentStop` hook that records per-agent spend as a run proceeds without anything having to invoke it. It can still be enabled alone for the measurement.

**`terylon-core` replaced `terylon-metrics`, which no longer exists.** A consumer enabling `terylon-metrics@terylon` renames the key to `terylon-core@terylon`; skills are addressed by name, so nothing that loaded `measure-token-spend` changes.

**`superpowers` is no longer a dependency.** The six skills `terylon-dev` used from it are gone: three were replaced by shorter equivalents (`write-plan` and `run-build-loop`, now in `terylon-dev`; `finish-branch` in `terylon-git`), and three were dropped because the personas already carried them in full.

**A component lives in the lowest plugin that all of its consumers can reach.** Consumers are counted by plugin, not by file, and the test is what a component *exercises*, never who calls it — `delegate-to-repo-agents` is consumed by three plugins and calls no git, so it sits in the root; `write-plan` and `run-build-loop` are consumed only by `terylon-dev`, so they sit there rather than in a root that installs for everyone.

**Only one component in the marketplace is loaded up the dependency chain**, and it is `forge-ops`, reached from the port and from the two role plugins that also call it. It is a port and adapter relationship rather than an oversight, and the rules that keep it honest — the port declares no adapter, both adapters use one skill name, a transport that finds neither stops — are in `plugins/CLAUDE.md`.

Two boundaries run through this stack. Between `terylon-git` and `terylon-forge` the test is whether something reaches outside the repository: that is why the review pipeline is split, with `code-review` and `code-reviewer` local and `review-pr` and `pr-reviewer` carrying the findings outward. `terylon-test` splits on the same seam — `verify-test-plan` needs a shell and a repository, while the two `update-*-checklist` transports reach a forge and so live in `terylon-forge`. Between the port and the adapters the test is whether something **depends** on a platform: a transport that *issues* a `gh` subcommand or an `mcp__` tool call has crossed it and belongs in an adapter. Two things are not crossings — a transport's `allowed-tools` naming both surfaces, and a transport naming a difference the port declares — because hiding either is what makes a transport wrong. The rule with both carve-outs is in `plugins/CLAUDE.md`.

Component layout, the placement rule in full, the dispatch chains and the table of every cross-plugin load: `plugins/CLAUDE.md`.

## Azure DevOps

| | |
|---|---|
| Organisation | **not recorded here** — each person sets `TERYLON_ADO_ORG` in their own settings |
| Project | `Dev` |
| Repo | `TerylonMarketplace` |
| MCP server | `@azure-devops/mcp@2.9.0` (pinned) via `plugins/terylon-ado/.mcp.json` |

**No organisation name is committed anywhere in this repository except inside its own URL.** The `source.url` in the setup snippets and the `homepage` in each manifest have to name it — that is the address you install the marketplace from, and a placeholder there would point at nothing. Everywhere else it is absent on purpose: example URLs in the recipes use `contoso`, and the migration notes describe the failure a hard-coded default caused without repeating the value that caused it.

**`.claude/settings.json` deliberately carries no `env` block.** It did briefly, and the reason it does not is the same reason `.mcp.json` lost its fallback, one level up: **this repository is the marketplace source.** Anyone who forks it to point at their own copy inherits its committed settings, and a committed `TERYLON_ADO_ORG` would hand them this owner's organisation — the very outcome removing the fallback was meant to prevent, reintroduced through a file nobody thinks of as code. Whoever works on this repository sets the variable in their **own** `~/.claude/settings.json`, where a personal default belongs and where a fork cannot inherit it.

**`TERYLON_ADO_ORG` is required and has no default.** The `.mcp.json` passes `${TERYLON_ADO_ORG}` bare: unset, the server does not target anything. It used to carry a hard-coded default, which meant a consumer who forgot the variable did not fail — they silently targeted whichever organisation the marketplace author happened to use, and found out at the first call, from an authorization error naming an organisation nobody had chosen. A missing required value must fail where it is missing.

Project and repo still derive from the consuming repository's git remote at runtime, and a GitHub-hosted repository sets nothing at all: `terylon-github` reads the owner from the remote and authenticates through `gh`. See *Point it at your forge* in `README.md`.

## Documentation

Five stores coexist here, and one of them ships to other repositories. Writing into the wrong one is the common mistake.

| Store | Answers | Tracked |
|---|---|---|
| `CLAUDE.md` (root, `plugins/`, `docs/`) | *what is in the project* | yes |
| `README.md` (root) | how a consumer installs and uses the marketplace, in brief | yes |
| `plugins/<slug>/**` | what other repositories **execute** — the distribution boundary | yes |
| `docs/terylon/`, `docs/superpowers/` | one task's intake, spec, plan, ledger, spend | **gitignored** — discarded once the work ships |
| `docs/` (architecture, flows, runbooks, onboarding) | *how it works end to end, and why* | yes |

One-line test: **if the answer is "go read this code", it belongs in a `CLAUDE.md`; if the answer is a diagram, a table of rules, and the reasoning behind a decision, it belongs in `docs/`.**

The knowledge base carries what a `CLAUDE.md` structurally cannot: a **flow spans components**, so no single component's file can see the whole path, and an **ADR records reasoning that was overturned**, which orientation documents have no place for. Two rules keep the two stores honest — `claude-md-sync.md` asks whether the nearest `CLAUDE.md` still orients a reader, `docs-sync.md` asks whether an article anywhere in `docs/` still tells the truth. Both can fire on one change.

This section is the **one** statement of that boundary. `docs/README.md` links here rather than restating it, and the rule deciding which decisions earn an article of their own is stated once too, in `docs/architecture/README.md`. Authoring conventions are in `docs/README.md`.

## Language

**Everything committed to this repo is written in English** — skills, agents, reference documents, `README.md`, `CLAUDE.md`, rules, code comments, identifiers, and commit messages alike.

This holds regardless of the language the work is discussed in. Sessions are held in whatever language suits the people in them; the artifacts they produce are English either way. The repo is the product, the conversation is not, and the repo outlives the conversation that shaped it.

There are no exceptions. A file that acquires a paragraph in another language is a defect, not a dialect.

## Platforms

The repo runs on **Windows and natively on Debian**. Everything scripted must work on both:

- Hooks are **Node.js** — they run on every tool call, and Node starts in ~106 ms against pwsh's ~384 ms.
- When PowerShell is what you are writing, invoke it as **`pwsh`**, never `powershell` (it does not exist on Debian).
- Paths are case-sensitive, scripts use LF line endings, hooks have no dependencies.
- **Binaries go through Git LFS.** `.gitattributes` tracks images, PDFs and archives. The repo is text-only today, so the rules are dormant — they exist so the first binary lands as a pointer instead of a blob nobody notices until the clone is slow. Run `git lfs install` once per clone.

## Rules

Details in `.claude/rules/`:

| Rule | What it covers |
|---|---|
| `git-workflow.md` | `main` is protected, only through a PR; consent for every commit; branch names |
| `scripting.md` | Node for hooks, full names over abbreviations, Allman braces, cross-platform |
| `markdown.md` | frontmatter, no wrapping for ADO, drawing rules, references by name, language |
| `claude-md-sync.md` | when to update CLAUDE.md after a change |
| `docs-sync.md` | when an article in `docs/` stopped telling the truth, and how to find it |

In short:

- Everything committed is in English, whatever language the work is discussed in.
- Bump the version in `plugin.json` on every commit that changes the plugin — without it the consumer does not receive the change. **Patch within a branch, minor on a new branch, major only when the user asks.** The digit follows the branch, never the size of the change.
- Work happens on a feature branch; `main` is reached only through a PR. Enforced by `.claude/hooks/git-guard.js`.
- Every commit requires explicit user consent.
- Skills are referenced **by name**, never by an `@` path or a `../` import.
- **Anything with a shape is drawn, not described** — an ASCII diagram for a call chain or dependency, a table for cases and what each selects. Prose is interpretable and these documents are read as instructions; structure removes the room. Applies to what the repo generates too, not only to what it commits.
