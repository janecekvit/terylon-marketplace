# Terylon Marketplace

Claude Code plugin marketplace distributed into product repositories through `extraKnownMarketplaces`. **Public on GitHub** (`janecekvit/terylon-marketplace`, MIT) and installed from there; reviewed and merged on a private Azure DevOps repository. See *Two remotes* below.

@README.md

## Structure

```
/.claude-plugin/marketplace.json   root manifest
/LICENSE                           MIT, copyright the operator — every plugin manifest says "license": "MIT"
/plugins/<slug>/                   one directory per plugin
/plugins/CLAUDE.md                 authoring conventions — read before editing a plugin
/docs/                             the engineering knowledge base — architecture, flows, runbooks, onboarding
/docs/terylon/                     terylon working tree: intake, specs, plans, ledgers (gitignored)
/docs/superpowers/                 the same, when those skills run directly (gitignored)
/tests/                            local tests of what the plugins ship, across plugin boundaries — not distributed
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

**A component lives in the lowest plugin that all of its consumers can reach.** How consumers are counted, the test that decides it and the worked examples are stated once, in `plugins/CLAUDE.md`, under *Where a component belongs*.

**Only one component in the marketplace is loaded up the dependency chain**, and it is `forge-ops`, reached from the port and from the two role plugins that also call it. It is a port and adapter relationship rather than an oversight, and the rules that keep it honest are stated once, in `plugins/CLAUDE.md`, under *The one exception: a port and its adapters*.

Two boundaries run through this stack. Between `terylon-git` and `terylon-forge` the test is whether something reaches outside the repository: that is why the review pipeline is split, with `code-review` and `code-reviewer` local and `review-pr` and `pr-reviewer` carrying the findings outward. `terylon-test` splits on the same seam — `verify-test-plan` needs a shell and a repository, while the two `update-*-checklist` transports reach a forge and so live in `terylon-forge`. Between the port and the adapters the test is whether something **depends** on a platform: a transport that *issues* a `gh` subcommand or an `mcp__` tool call has crossed it and belongs in an adapter. What is **not** a crossing is stated once, in `plugins/CLAUDE.md`, beside the table of the two boundaries.

Component layout, the placement rule in full, the dispatch chains and the table of every cross-plugin load: `plugins/CLAUDE.md`.

## Azure DevOps

| | |
|---|---|
| Organisation | **not recorded here** — each person sets `TERYLON_ADO_ORG` in their own settings |
| Project | `Dev` |
| Repo | `TerylonMarketplace` |
| MCP server | `@azure-devops/mcp@2.9.0` (pinned) via `plugins/terylon-ado/.mcp.json` |

**No Azure DevOps organisation name is committed anywhere in this repository.** Until #273 it appeared inside the repository's own URL, in the setup snippets and each manifest's `homepage`, because that was the address you installed from. The address is now the public GitHub repository, so the exception is gone: a published file never links a reader to the private organisation, example URLs in the recipes use `contoso`, and the one snippet that must reach a feature branch on Azure DevOps (`docs/onboarding/marketplace-development.md`) tells the reader to run `git remote get-url origin` instead. Older commits still carry the URL; the history is published as it is.

## Two remotes

| Remote | Holds | Who moves it |
|---|---|---|
| `origin` — Azure DevOps, private | feature branches, pull requests, merges | pull requests only; `git-guard.js` refuses any push to `main` |
| `github` — `github.com/janecekvit/terylon-marketplace`, public | `main` and release tags, nothing else | the operator, by hand, after each merge — never forced |

**`main` is the same commit on both.** The commands, the check that both heads match and why an agent never makes the push are in `docs/flows/change-to-consumer-repo.md`, under *How `main` reaches GitHub*. Every manifest's `homepage` and `repository` name the GitHub repository.

**Everything committed is published.** Before the first push the tree **and the full history** were scanned for secrets, private host and tailnet names, personal e-mail addresses and internal-only references (#273); nothing secret was found. Keep it that way: no host name, tailnet name, home directory, personal address or organisation name goes into a commit — measured records say *the operator's own host*, test fixtures use `alice` and `contoso`, and a plugin author is named without an e-mail address.

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

- Hooks are **Node.js**; PowerShell is invoked as **`pwsh`**, never `powershell`; paths are case-sensitive, scripts use LF line endings, hooks have no dependencies. **The reasons, and the startup latency measured behind the first, are in `.claude/rules/scripting.md`** and are not repeated here.
- **Binaries go through Git LFS.** `.gitattributes` tracks images, PDFs and archives. The repo is text-only today, so the rules are dormant — they exist so the first binary lands as a pointer instead of a blob nobody notices until the clone is slow. Run `git lfs install` once per clone.

## Testing

Three suites under `/tests/`, none distributed. **Run the end-to-end harness before a change reaches `main`**, and before anything moves to a new host.

| Suite | Command | Proves | Cost |
|---|---|---|---|
| contract + fixture | `node --test tests/forge-port/forge-port.test.js` | both `forge-ops` bodies declare the same work-item keys; the authoring skills name no platform field; the GitHub recipes, run verbatim against a stand-in `gh`, write what they should | free, seconds |
| harness unit checks | `node --test tests/e2e/ref.test.js` | which ref the harness installs, and that a detached HEAD is refused rather than passed on as `HEAD` | free, milliseconds |
| end-to-end | `node tests/e2e/run.js` | the marketplace installs from a git ref as a consumer installs it, everything loads, and the skills — followed by a model, headless — write the right things or refuse with the right reason | about **$2.60–3.25** per full run on sonnet, 4–8 min (measured 2026-10-04) |

```
node tests/e2e/run.js                                   all stages, this branch on origin
node tests/e2e/run.js --source .                        the local checkout, served over http on 127.0.0.1
node tests/e2e/run.js --stages install                  stage 1 only — free, no model reached
node tests/e2e/run.js --teeth                           plant every defect; green only if each one turns it red
node tests/e2e/run.js --stages author --scenarios github-story   one scenario
```

```
run.js
├── install ....... scratch CLAUDE_CONFIG_DIR; extraKnownMarketplaces + `marketplace add <url>#<ref>`;
│                   every plugin installed; --strict validation; the init event's inventory
│                   checked against every skill, agent, hook and MCP server the clone carries
├── author ........ create-user-story, create-feature — two turns each (draft, then "push"),
│                   on an Azure DevOps fixture and a GitHub fixture
└── github-only ... develop, planner, create-feature, review-pr handed an Azure DevOps item
                    with only terylon-github loaded; then the ado server made unreachable
```

| Stand-in | Reached through | Records |
|---|---|---|
| `tests/e2e/stubs/ado-mcp-stub.js` — the 2.9.0 work-item tools, typed | an `npx` shim first on `PATH`, which the adapter's `.mcp.json` launches | every `tools/call` |
| `tests/forge-port/fake-gh.js` | a `gh` wrapper first on `PATH` | every invocation, and the issues it stores |

**No credential appears anywhere in the harness.** Stage 1 runs in the scratch config, which holds no login — the init event it reads arrives before the first API call. The headless stages run under the operator's **own** Claude Code login, never read or copied, with the consumer-installed plugins loaded by `--plugin-dir`; forge tokens are stripped from their environment, and every forge call goes to a stand-in.

Things that were measured, and bite:

- **Haiku cannot carry these skills.** Authoring on haiku never loaded `forge-ops`; the GitHub-only refusals passed on one run and failed on the next. Every headless stage runs on sonnet; `--model` overrides it.
- **`--strict-mcp-config` drops a `--plugin-dir` plugin's own `.mcp.json`**, so the `ado` server never starts. The harness keeps the account's claude.ai connectors out with `ENABLE_CLAUDEAI_MCP_SERVERS=false` instead, and fails any turn that sees another server.
- **An agent's `skills:` are preloaded only when it is dispatched as a subagent.** Run as the session's own agent (`--agent`), `planner` could not load `resolve-forge` at all. The harness dispatches agents through the Agent tool, as `leader` does, and judges the subagent's own report.
- **A model that cannot find a skill goes looking on disk**, and found the operator's own, older, installed copies. Reads of the operator's plugin cache are denied, and a turn that tried fails.
- **`marketplace add` refuses `file://` and clones shallow**, so a local source is served through `git http-backend` on 127.0.0.1.
- **`marketplace add` installs a branch or a tag, never a commit.** It clones with `--branch`, so a commit id is refused as a missing branch. From a detached checkout, pass `--ref`; without it the harness refuses in one line and names the branches pointing at HEAD. A defect that cannot be planted is reported `SETUP FAILED`, never as caught.
- **A planted defect a capable model can see through proves nothing.** Stripping the criteria section from the GitHub recipe was missed: sonnet wrote it from the skill's template. The defects in `tests/e2e/lib/defects.js` change what only the plugin knows.

The headless runs execute model-chosen shell commands in throwaway fixture repositories; run the harness where you would let an agent work. Transcripts, stub logs and `report.json` (every check, every run's cost) land in the output directory it prints.

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
- **Every rule has one owner; every other mention points at it without restating it.** Why, and what the first sweep found: `docs/architecture/every-rule-has-one-owner.md`.
- Bump the version in `plugin.json` on every commit that changes the plugin — without it the consumer does not receive the change. **Which digit moves is stated once, under *Versioning* in `plugins/CLAUDE.md`.**
- Work happens on a feature branch; `main` is reached only through a PR. Enforced by `.claude/hooks/git-guard.js`.
- Every commit requires explicit user consent.
- Skills are referenced **by name**, never by an `@` path or a `../` import.
- **Anything with a shape is drawn, not described** — an ASCII diagram for a call chain or dependency, a table for cases and what each selects. Prose is interpretable and these documents are read as instructions; structure removes the room. Applies to what the repo generates too, not only to what it commits.
