# Terylon Marketplace

Claude Code plugin marketplace distributed into product repositories through `extraKnownMarketplaces`. **Public on GitHub** (`janecekvit/terylon-marketplace`, Apache-2.0), its only home: code, issues, pull requests and releases live there, and consumers install from there. See *GitHub* below.

@README.md

## Structure

```
/.claude-plugin/marketplace.json   root manifest
/LICENSE                           Apache-2.0, the canonical text (MIT until 2026-10-12) — every plugin manifest says "license": "Apache-2.0"
/NOTICE                            the copyright notice Apache-2.0 carries: Terylon Marketplace, copyright the operator
/SECURITY.md                       how to report a vulnerability — GitHub private vulnerability reporting
/CONTRIBUTING.md                   how a change is made: an issue first, a branch, one PR per issue, squash merge
/.editorconfig                     the code conventions of .claude/rules/ for every editor: UTF-8, LF, indentation per file type
/.github/workflows/ci.yml          unit suites, the free e2e install stage, the terylon-pane mod's tests, on every PR and push to main
/.github/claude-code/              the Claude Code CI runs: an exact pin and its lockfile, installed with npm ci; Dependabot raises it
/.github/workflows/versions.yml    the plugin version rules, on every PR — a changed plugin raises its version; a major needs the label `major`
/.github/workflows/release.yml     on a vX.Y.Z tag: source archive + SHA256SUMS, provenance attestation, Sigstore signatures, the GitHub release
/tests/release/                    release-notes.js — the notes a release carries (every plugin's version, the PRs since the previous tag) — and its tests
/docs/runbooks/releasing.md        cutting a release, and verifying one
/.github/workflows/diagrams.yml    renders every docs/**/*.d2 with the pinned D2; red on a bad source or a stale SVG
/Scripts/render-diagrams.js        formats, validates and renders each .d2 to a light-and-dark .svg beside it; --check is CI's
/.github/workflows/docs.yml        Markdown lint + link check over every tracked .md, on every PR and push to main
/.markdownlint-cli2.jsonc          the Markdown lint rules — .claude/rules/markdown.md, encoded
/lychee.toml                       the link check: relative links, anchors, external links; what is excluded and why
/.github/ISSUE_TEMPLATE/           the issue form (the need, the plugins, acceptance criteria); blank issues off
/.github/PULL_REQUEST_TEMPLATE.md  Why / What changes / How to verify / Closes #
/.github/workflows/security.yml    CodeQL (JavaScript and the workflows) + zizmor, on every PR, push to main and weekly
/.github/workflows/scorecard.yml   OpenSSF Scorecard, on main and weekly, published for the README badge
/.github/dependabot.yml            raises the SHA-pinned actions weekly, one grouped pull request, and the CI's Claude Code; 14-day cooldown
/.github/CODEOWNERS                every file the maintainer's to review
/codecov.yml                       Codecov: coverage of the unit suites is informational, never a gate; stubs and fixtures ignored
/plugins/<slug>/                   one directory per plugin
/plugins/CLAUDE.md                 authoring conventions — read before editing a plugin
/docs/                             the engineering knowledge base — architecture, flows, runbooks, onboarding
/docs/architecture/*.d2            structure drawn in D2, the rendered .svg committed beside each; flows are Mermaid
/docs/terylon/                     terylon working tree: intake, specs, plans, ledgers (gitignored)
/docs/superpowers/                 the same, when those skills run directly (gitignored)
/tests/                            local tests of what the plugins ship, across plugin boundaries — not distributed
/tests/versions/                   the version check versions.yml runs, and its tests
/tests/git-guard/                  the tests of .claude/hooks/git-guard.js, against real throwaway repositories and worktrees
/tests/property/                   property tests with fast-check — the repository's one npm dependency, confined here
```

**All of `/plugins` is the distribution boundary.** Anything inside is consumed by other repos; anything outside stays local.

## Plugins

```
terylon-core                      the root — shared conventions + measurement; no git, no forge, no MCP
└── terylon-git                   + git; no forge, no MCP server
    └── terylon-forge             the forge port — the PR workflow, written against operations; ships no adapter
        ├── terylon-ado           adapter: the ADO body of forge-ops; connect registers the remote ado server
        ├── terylon-github        adapter: the GitHub body of forge-ops, over the gh CLI; no server
        ├── terylon-product       + user stories, Feature specs
        ├── terylon-dev           + the build pipeline (declares terylon-git and terylon-core directly)
        └── terylon-test          + verifying a test plan and acceptance criteria (declares terylon-core directly)

terylon-os                        Terylon itself, the agentic OS extension: its /mcp server + one skill per prompt; no dependencies
└── terylon-pane                  a mod: the band above the prompt and the Desktop pane over that server
```

**`terylon-os` and its mod `terylon-pane` stand outside the chain** (#332): it is the owner's product, not a role in the development workflow, and it needs nothing below it. It was `terylon` until the operator renamed it on 2026-10-12 — `terylon@terylon` collided with the marketplace's name, and every other plugin is `terylon-<area>`; its server is still named `terylon`, so its tools are `mcp__plugin_terylon-os_terylon__*`. `terylon-pane` is the marketplace's first **mod** — a hooks module the engine runs in a session, drawing a pane — and `plugins/CLAUDE.md` says how one is written and tested, under *A mod*.

`terylon-dev` declares `terylon-git` directly as well as through `terylon-forge`, because its `leader` dispatches `code-reviewer` whether or not a forge is in play. `terylon-dev` and `terylon-test` declare `terylon-core` directly for the same reason: both invoke `measure-token-spend`, which has nothing to do with git or a forge.

**A consumer enables two keys: a role plugin and an adapter.** Nothing declares an adapter — the port ships none on purpose, because declaring one would install an Azure DevOps MCP server in every GitHub repository. `terylon-forge` **replaced `terylon-devops`**, splitting it along that seam: the portable transports became the port, the ADO mechanics became `terylon-ado`, and `ado-mcp` became `forge-ops`. See the *Migrating* note in `plugins/terylon-forge/README.md`.

`terylon-core` is the **root every other plugin sits on**, and it carries only what all of them may need: `delegate-to-repo-agents` (the capability test a persona applies before dispatching an agent the target repository ships) and `measure-token-spend`, plus a `SubagentStop` hook that records per-agent spend as a run proceeds without anything having to invoke it. It can still be enabled alone for the measurement.

**`terylon-core` replaced `terylon-metrics`, which no longer exists.** A consumer enabling `terylon-metrics@terylon` renames the key to `terylon-core@terylon`; skills are addressed by name, so nothing that loaded `measure-token-spend` changes.

**`superpowers` is no longer a dependency.** The six skills `terylon-dev` used from it are gone: three were replaced by shorter equivalents (`write-plan` and `run-build-loop`, now in `terylon-dev`; `finish-branch` in `terylon-git`), and three were dropped because the personas already carried them in full.

**A component lives in the lowest plugin that all of its consumers can reach.** How consumers are counted, the test that decides it and the worked examples are stated once, in `plugins/CLAUDE.md`, under *Where a component belongs*.

**Only one component in the marketplace is loaded up the dependency chain**, and it is `forge-ops`, reached from the port and from the two role plugins that also call it. It is a port and adapter relationship rather than an oversight, and the rules that keep it honest are stated once, in `plugins/CLAUDE.md`, under *The one exception: a port and its adapters*.

Two boundaries run through this stack. Between `terylon-git` and `terylon-forge` the test is whether something reaches outside the repository: that is why the review pipeline is split, with `code-review` and `code-reviewer` local and `review-pr` and `pr-reviewer` carrying the findings outward. `terylon-test` splits on the same seam — `verify-test-plan` needs a shell and a repository, while the two `update-*-checklist` transports reach a forge and so live in `terylon-forge`. Between the port and the adapters the test is whether something **depends** on a platform: a transport that *issues* a `gh` subcommand or an `mcp__` tool call has crossed it and belongs in an adapter. What is **not** a crossing is stated once, in `plugins/CLAUDE.md`, beside the table of the two boundaries.

Component layout, the placement rule in full, the dispatch chains and the table of every cross-plugin load: `plugins/CLAUDE.md`.

## GitHub

| | |
|---|---|
| Repository | `janecekvit/terylon-marketplace`, public — code, issues, pull requests and releases |
| Remote | **one**, `origin`, on GitHub. Nothing is mirrored anywhere |
| A change | starts as an issue stating the need, with its acceptance criteria as a checklist; is made on a `feat/`, `fix/` or `docs/` branch; ends as a pull request that says `Closes #N` |
| Merge | **squash only**, by the maintainer (`janecekvit`), once CI is green; the branch is deleted on merge |
| `main` | the repository ruleset refuses deleting it and force-pushing it, requires a linear history, a pull request (squash only, every review thread resolved), the CI checks green and no high or higher CodeQL alert; every pull request also gets Copilot code review |
| Releases | a `vX.Y.Z` tag the maintainer pushes; each plugin keeps its own version in `plugin.json` |

```
  issue  the need, acceptance criteria as a checklist
     │
     ▼
  feat/ fix/ docs/<slug> ──▶ pull request "Closes #N" ──▶ CI green ──▶ maintainer squash-merges
                                                                              │
  evidence for each criterion: a comment on the issue                         ▼
                                                                main ──▶ consumers, on the next bump
```

**The flow is stated once, in `CONTRIBUTING.md`**, with the version and secret rules a contributor needs; the issue and pull request templates under `.github/` carry its shape. Locally, `.claude/hooks/git-guard.js` still refuses any push to `main`.

**This repository has lived only on GitHub since 2026-10-22.** It was developed in a private Azure DevOps repository until then, with `main` pushed to GitHub by hand after each merge; that repository is frozen and will be archived, and the history was rewritten when it moved. A `#<number>` in a commit or document from before the move names an Azure DevOps work item, not an issue here.

**Everything committed is published.** Before the first push the tree **and the full history** were scanned for secrets, private host and tailnet names, personal e-mail addresses and internal-only references (#273); nothing secret was found. Keep it that way: no host name, tailnet name, home directory, personal address or organisation name goes into a commit — measured records say *the operator's own host*, test fixtures use `alice` and `contoso`, and a plugin author is named without an e-mail address.

## Azure DevOps, as a consumer's forge

**The plugins serve repositories on Azure DevOps; this repository is not one of them.** `terylon-ado` is the adapter, and these are the facts that bind it here:

| | |
|---|---|
| Organisation | **not recorded here** — each person sets `ADO_ORGANIZATION` in their own settings |
| MCP server | Microsoft's remote server at `https://mcp.dev.azure.com`, over OAuth — registered at the user scope as `ado` by `terylon-ado`'s `connect` skill (#332); tools `mcp__ado__*` |

**No Azure DevOps organisation name is committed anywhere in this repository.** Until #273 it appeared inside the repository's own URL, in the setup snippets and each manifest's `homepage`, because that was the address you installed from. The address is now the public GitHub repository, so the exception is gone: a published file never links a reader to a private organisation, and example URLs in the recipes use `contoso`. Older commits still carry the URL; the history is published as it is.

**`.claude/settings.json` deliberately carries no `env` block.** It did briefly, and the reason it does not is the same reason the organisation lost its fallback, one level up: **this repository is the marketplace source.** Anyone who forks it to point at their own copy inherits its committed settings, and a committed `ADO_ORGANIZATION` would hand them this owner's organisation — the very outcome removing the fallback was meant to prevent, reintroduced through a file nobody thinks of as code. The same holds for `ADO_MCP_CLIENT_ID` and `ADO_MCP_TENANT_ID`, which name the owner's own Entra app registration and tenant: they are configuration, not code. Whoever works on this repository sets all three in their **own** `~/.claude/settings.json`, where a personal value belongs and where a fork cannot inherit it — and `connect` registers the server from them at the user scope, which is also why the plugin ships no `.mcp.json` for it (the measurement is in `plugins/terylon-ado/shared/ado-server.js`).

**`ADO_ORGANIZATION` is required and has no default.** It is the bare name, and every `mcp__ado__*` call passes it as `orgName` — never in the server's URL. Unset, no call targets anything. The organisation used to carry a hard-coded default, which meant a consumer who forgot the variable did not fail — they silently targeted whichever organisation the marketplace author happened to use, and found out at the first call, from an authorization error naming an organisation nobody had chosen. A missing required value must fail where it is missing.

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

The suites under `/tests/`, none distributed, and a mod's own tests beside it. **Run the end-to-end harness before a change reaches `main`**, and before anything moves to a new host.

**GitHub Actions runs the free part on every pull request and every push to `main`** (`.github/workflows/ci.yml`): `node --test "**/*.test.js"`, the `install` stage, and the `terylon-pane` mod's `plugin validate`, `plugin test` and mutation suite. Claude Code is pinned exactly in `.github/claude-code/package.json` and installed from its lockfile with `npm ci`, to the version last measured: **2.1.308, measured 2026-10-22** — the newest release, on which `plugin validate` passed, `plugin test` passed 85 tests and the mutation suite all 35 cases, and this pull request's CI ran the install stage. It was taken on its release day, by the owner's one-off decision to start from the newest engine; later releases come like every other dependency, from Dependabot after a 14-day cooldown. Dependabot's pull request's CI is the measurement, and this figure moves when it lands. The stage needs no secret — measured on 2026-10-04 with an empty environment and an empty `HOME`: 82 checks green, $0, and each install-stage planted defect (`skill-frontmatter`, `hook-path`, `mcp-organisation`) turned it red. Since #332 the stage has 104 checks — `terylon-ado`'s `connect` registering `ado` against the stand-in, `ado` and `terylon-os`'s `terylon` connecting — and `connect-client-id` replaced `mcp-organisation` (measured 2026-10-11: caught, 1 failing check). A CI checkout is a detached HEAD, which the harness refuses, so the job names the commit as a local branch and passes `--ref`. The model-driven stages stay manual; why is in `README.md`, under *Continuous integration*.

| Suite | Command | Proves | Cost |
|---|---|---|---|
| contract + fixture | `node --test tests/forge-port/forge-port.test.js` | both `forge-ops` bodies declare the same work-item keys; the authoring skills name no platform field; the GitHub recipes, run verbatim against a stand-in `gh`, write what they should; the recipe runs skip, saying `jq not on PATH`, where `jq` is missing — and fail instead under `CI` | free, seconds |
| terylon-pane mod | `claude plugin test plugins/terylon-pane` | the band in every state and yielding to a survey; the status line with the health of Agentic OS and only its worst problem; the Status tab with every problem's fix in steps; one pane, opening only when asked; one-line rows and quiet empty cards; the queue, a story with its phases and *Now working* from `progress.stage`, a question answered, goals, plans, the bell with a notice marked handled and the band's bell count, and the memory, each row opening its subject and ‹ walking back; colours and labels on the desktop and the terminal; no button calls a gate; the S32 drawing (#25): each row one Button with its kind a chip, no card filled, every word and link on a card that waits or warns at 4.5:1 in both themes (computed from the canvas's palette), the Desktop proofs at the defaults the owner's walk set, no word or theme colour inside an `Svg` and each at its own height, the compact stepper in a dock of about 435 px, no phase now without a stage, the narrow dock, the pickers, the dashed S27 slots, the band's digits tabular | free, seconds; no session, no network |
| terylon-pane teeth | `node --test tests/terylon-pane/mutations.test.js` | each planted mutation — no done-signal, no catch-up, the band ignoring a survey or showing the spend, the status line counting the briefing as an alert, the pane opening by itself, a gate among the pane's tools or its allow rules, the guard opened, a waiting item approving, a Desktop proof's default flipped, a word inside an `Svg`, a phase drawn now with no stage, a card filled again, an amber word on a waiting card — turns the mod's tests red; skips, saying why, where no `claude` on PATH has `plugin test` — absent, or too old to have it | free, about 14 minutes locally on 2.1.308: 58 runs of `plugin test`, one after another (measured 2026-10-23); CI's pane job runs them on the locked 2.1.308, 48 of them in 7½ minutes (measured 2026-10-23) |
| terylon-pane commands | `node --test tests/terylon-pane/commands.test.js` | no command the mod registers shares a name with a skill of the mod or of `terylon-os` | free, milliseconds |
| terylon-pane version | `node --test tests/terylon-pane/version.test.js` | the version the Status tab says is the one `plugin.json` ships | free, milliseconds |
| terylon-os plugin | `node --test tests/terylon-os/terylon-os-plugin.test.js` | the `terylon-os` plugin's one server is `${TERYLON_URL}/mcp` with no header or token, every prompt Terylon's `/mcp` serves has exactly one skill mirroring it, and nothing published names a host | free, milliseconds |
| plugin versions | `node --test tests/versions/check-plugin-versions.test.js` | a changed plugin without a raised version fails, a patch or minor raise passes, a major raise fails without the label `major` and passes with it, a new plugin passes from 1.0.0 up, a deleted one passes, a malformed version fails, and a version `marketplace.json` lists must equal `plugin.json`'s — the pure rules, and the command line end to end in a throwaway repository | free, seconds |
| diagrams | `node --test tests/diagrams/render-diagrams.test.js` | the render script's arguments, where a source renders to, how git's path listings are read, and that the D2 it pins is the one `diagrams.yml` installs; the D2 calls themselves run in the Diagrams workflow | free, milliseconds |
| git guard | `node --test tests/git-guard/git-guard.test.js` | `.claude/hooks/git-guard.js` refuses a commit, an `Edit`/`Write` or a push of `HEAD` on `main` and any push naming `main`, follows `cd` and `git -C` through `$VAR`, `${VAR}`, `%VAR%`, earlier assignments and `~`, names a target it cannot resolve in the refusal, and passes everything else — against real throwaway repositories and a linked worktree | free, seconds |
| property tests | `npm ci && npm test` in `tests/property/` | over generated inputs: `git-guard.js` never crashes and always answers allow or a well-formed deny, refuses a push to `main` in any quoting and behind any chain separator, allows a branch that merely contains `main`; `compareVersions` is the numeric total order and `parseVersion` accepts one spelling per version; `resolveRef` never passes a detached HEAD on. fast-check is the only npm dependency in the repository and lives only in that folder; the root `node --test` skips these files with a stated reason, and `.github/workflows/property.yml` runs them | free, about 30 seconds |
| harness unit checks | `node --test tests/e2e/ref.test.js` | which ref the harness installs, and that a detached HEAD is refused rather than passed on as `HEAD` | free, milliseconds |
| release notes | `node --test tests/release/release-notes.test.js` | the tag check, the previous tag chosen by number, every plugin's version and change, the pull requests from squash and merge subjects — against fixtures and a throwaway repository with real tags | free, about a second |
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
| `tests/e2e/stubs/mcp-http-stub.js` `/ado/mcp` — the remote Azure DevOps server's work-item tools, typed, refusing any call without `orgName` | the server `ado`: in the install stage registered by `terylon-ado`'s own `connect` into the scratch config; in a headless run given by `--mcp-config` under `--strict-mcp-config` | every `tools/call`, per scenario |
| `tests/e2e/stubs/mcp-http-stub.js` `/terylon/mcp` — Terylon's `/mcp`, connecting and offering nothing | the `terylon-os` plugin's own server, `TERYLON_URL` pointing at it | nothing |
| `tests/forge-port/fake-gh.js` | a `gh` wrapper first on `PATH` | every invocation, and the issues it stores |

**No credential appears anywhere in the harness.** Stage 1 runs in the scratch config, which holds no login — the init event it reads arrives before the first API call. The headless stages run under the operator's **own** Claude Code login, never read or copied, with the consumer-installed plugins loaded by `--plugin-dir`; forge tokens are stripped from their environment, and every forge call goes to a stand-in.

Things that were measured, and bite:

- **Haiku cannot carry these skills.** Authoring on haiku never loaded `forge-ops`; the GitHub-only refusals passed on one run and failed on the next. Every headless stage runs on sonnet; `--model` overrides it.
- **`--strict-mcp-config` drops a `--plugin-dir` plugin's own `.mcp.json`** (measured 2026-10-04). Until #332 that kept the harness off it, because the `ado` server was a plugin's; since #332 `ado` is a user-scope server, so a headless run takes the stand-in by `--mcp-config` **under** `--strict-mcp-config` — which also keeps the operator's own, real `ado` out of the run. The account's claude.ai connectors stay out with `ENABLE_CLAUDEAI_MCP_SERVERS=false`, and any turn that sees another server fails.
- **An agent's `skills:` are preloaded only when it is dispatched as a subagent.** Run as the session's own agent (`--agent`), `planner` could not load `resolve-forge` at all. The harness dispatches agents through the Agent tool, as `leader` does, and judges the subagent's own report.
- **A model that cannot find a skill goes looking on disk**, and found the operator's own, older, installed copies. Reads of the operator's plugin cache are denied, and a turn that tried fails.
- **`marketplace add` refuses `file://` and clones shallow**, so a local source is served through `git http-backend` on 127.0.0.1.
- **`marketplace add` installs a branch or a tag, never a commit.** It clones with `--branch`, so a commit id is refused as a missing branch. From a detached checkout, pass `--ref`; without it the harness refuses in one line and names the branches pointing at HEAD. A defect that cannot be planted is reported `SETUP FAILED`, never as caught.
- **`marketplace add` records a github.com URL with `.git` appended**, then refuses the add — *"its source doesn't match its extraKnownMarketplaces entry"* — when the declaration names the URL without it. `run.js` appends the suffix before declaring (measured 2026-10-05). The `owner/repo` shorthand is recorded as a `github` source instead, and installs cleanly.
- **A planted defect a capable model can see through proves nothing.** Stripping the criteria section from the GitHub recipe was missed: sonnet wrote it from the skill's template. The defects in `tests/e2e/lib/defects.js` change what only the plugin knows.

The headless runs execute model-chosen shell commands in throwaway fixture repositories; run the harness where you would let an agent work. Transcripts, stub logs and `report.json` (every check, every run's cost) land in the output directory it prints.

## Rules

Details in `.claude/rules/`:

| Rule | What it covers |
|---|---|
| `git-workflow.md` | `main` is protected, only through a PR; consent for every commit; branch names |
| `scripting.md` | Node for hooks, full names over abbreviations, Allman braces, cross-platform |
| `markdown.md` | frontmatter, no wrapping for forge-bound text, drawing rules, references by name, language |
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
