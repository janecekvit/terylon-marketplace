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
/.github/workflows/ci.yml          unit suites, the free e2e install stage, the terylon-pane mod's tests (mutations sharded, skipped where the pane is untouched), on every PR and push to main
/.github/claude-code/              the Claude Code CI runs: an exact pin and its lockfile, installed with npm ci; Dependabot raises it
/.github/workflows/history-check.yml  warning-only, on every PR: an added code comment naming a PR, an issue, a work item or a date
/.github/workflows/versions.yml    the plugin version rules, on every PR — a changed plugin raises its version; a major needs the label `major`
/.github/workflows/release.yml     on a vX.Y.Z tag: source archive + SHA256SUMS, provenance attestation, Sigstore signatures, the GitHub release
/tests/release/                    release-notes.js — the notes a release carries (every plugin's version, the PRs since the previous tag) — and its tests
/docs/runbooks/releasing.md        cutting a release, and verifying one
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
/docs/architecture/README.md       the architecture diagrams, Mermaid flowcharts with ELK; the plugin graph is in README.md
/docs/terylon/                     terylon working tree: intake, specs, plans, ledgers (gitignored)
/docs/superpowers/                 the same, when those skills run directly (gitignored)
/tests/                            local tests of what the plugins ship, across plugin boundaries — not distributed
/tests/versions/                   the version check versions.yml runs, and its tests
/tests/architecture-diagrams/      every flowchart in the adaptive ELK style; the plugin graph's edges are plugin.json#dependencies
/tests/git-guard/                  the tests of .claude/hooks/git-guard.js, against real throwaway repositories and worktrees
/tests/published-names/            no published file names the owner's host, tailnet or forge organisation
/tests/skill-spec/                 every skill against the Agent Skills specification; runs in the Unit suites job
/tests/no-history-in-code/         the check history-check.yml runs, and its tests
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

**Design canvases, mock-ups and design inventories are not committed** (the owner, 2026-10-25): they live on the issue that carries the change, and a committed file names that issue rather than linking a copy.

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

**GitHub Actions runs the free part on every pull request and every push to `main`** (`.github/workflows/ci.yml`): `node --test "**/*.test.js"`, the `install` stage, and the `terylon-pane` mod's `plugin validate`, `plugin test`, mutation suite and zone suite. Claude Code is pinned exactly in `.github/claude-code/package.json` and installed from its lockfile with `npm ci`, to the version last measured: **2.1.308, measured 2026-10-22** — the newest release, on which `plugin validate` passed, `plugin test` passed 85 tests and the mutation suite all 35 cases, and this pull request's CI ran the install stage. It was taken on its release day, by the owner's one-off decision to start from the newest engine; later releases come like every other dependency, from Dependabot after a 14-day cooldown. Dependabot's pull request's CI is the measurement, and this figure moves when it lands. The stage needs no secret — measured on 2026-10-04 with an empty environment and an empty `HOME`: 82 checks green, $0, and each install-stage planted defect (`skill-frontmatter`, `hook-path`, `mcp-organisation`) turned it red. Since #332 the stage has 104 checks — `terylon-ado`'s `connect` registering `ado` against the stand-in, `ado` and `terylon-os`'s `terylon` connecting — and `connect-client-id` replaced `mcp-organisation` (measured 2026-10-11: caught, 1 failing check). A CI checkout is a detached HEAD, which the harness refuses, so the job names the commit as a local branch and passes `--ref`. The model-driven stages stay manual; why is in `README.md`, under *Continuous integration*.

**The pane's mutation and zone suites run only where they can see a change** (#42). `tests/terylon-pane/needs-pane-suites.js` reads the paths a pull request changes, and the suites run when one is under `plugins/terylon-pane/`, `tests/terylon-pane/` or `.github/claude-code/`, or is `.github/workflows/ci.yml`; a push to `main` always runs them. When they run, the mutations are split into four shards by position (`MUTATION_SHARD=<index>/<count>`), each a matrix job on a runner of its own, one run after another within it, beside a job for the zones. The required check `terylon-pane mod (validate, test, mutations)` keeps its name: it runs `validate` and `plugin test` on every pull request, then reports red if the plan, any shard or the zones failed or were cancelled, and green when they passed or were skipped. **Each shard runs the unmutated baseline too**, so a shard's reds mean something on their own; the cost is that `acts.test.ts`'s load-dependent failure (#39), which only an unmutated run can show, now has five chances per CI run where it had two. It hit shard 3 on #45's first run, on the slow runner: every case passed, then *the file ran to its end* failed on `$.state.get refused: no hooks module of that name is loaded`, a promise settling after the file unloaded; the re-run passed.

| Suite | Command | Proves | Cost |
|---|---|---|---|
| contract + fixture | `node --test tests/forge-port/forge-port.test.js` | both `forge-ops` bodies declare the same work-item keys; the authoring skills name no platform field; the GitHub recipes, run verbatim against a stand-in `gh`, write what they should; the recipe runs skip, saying `jq not on PATH`, where `jq` is missing — and fail instead under `CI` | free, seconds |
| terylon-pane mod | `claude plugin test plugins/terylon-pane` | the band in every state and yielding to a survey; the status line with the health of Agentic OS and only its worst problem; the Status tab with every problem's fix in steps; one pane, opening only when asked; one-line rows and quiet empty cards; the queue, a story with its phases and *Now working* from `progress.stage`, a question answered, goals, plans, the bell with a notice marked handled and the band's bell count, and the memory, each row opening its subject and ‹ walking back; colours and labels on the desktop and the terminal; no button calls the gate, merge; the owner's acts (S27, #27), each called on its press and never on render, a needed note before Rethink or Return, *…ing* with the card's other buttons waiting, Terylon's answer, its refusal word for word and Claude Code's refusal each on its card, merge only a link; the S32 drawing (#25): each row one Button with its kind a chip, no card filled, every word and link on a card that waits or warns at 4.5:1 in both themes (computed from the canvas's palette), the Desktop proofs at the defaults the owner's walk set, no word or theme colour inside an `Svg` and each at its own height, the compact stepper in a dock of about 435 px, each label of the wide stepper within half a node gap of its node at ~660 and ~1060 px, a blocked story timed as blocked, no phase now without a stage, the narrow dock, the pickers, no dashed slot left, the band's digits tabular; the owner's walk of 1.5.0 (#35): a new task handed over whole and said word for word, ✓ drawn with what it changed while Terylon's reads lag, the danger acts red, a plan's order from `after` by titles, the row and the card on one answer, *Now working* for every run, a running time without the time blocked; the retest of 1.6.0 (#39): a repository goal's task declaring 1 to 30 *Files*, checked before it is sent, a list goal's `files: []`, a verified list story waiting for *accept* while a repository story keeps its merge, a plan's chain only for an order with no size beside it; Open and Closed goals as two buttons (#41): *Open · N* and *Closed · M* on the desktop, the terminal and the narrow dock, `goals_list` with `closedCount` (Terylon S44) and without it, the closed goals read only on a press of *Closed* and kept until a changed `closedCount`, a plan only under an open goal, *Closed* drawing only the closed goals' plans (#48), the closed list empty, loading and failed with *Try again*; the owner's walk of 1.7.2: the done-signal reaching `events_since` where the store refuses or never answers, a failed `events_since` said on the Status tab with its fix in steps, a watchdog saying one unanswered for more than three ticks, a verified list story's done-signal and catch-up waiting for Accept, the card drawn accepted right after Accept, *Done today* saying accepted, an ended story's phases saying how it ended, a row's console link beside its text, a closed goal's title dim, the Status tab drawn from a snapshot 1.8.3 kept, a part of it that throws one problem card while the rest draws, an accepted list story's card saying accepted, a verified story never under Running beside its Waiting row, the Status tab drawn minimal or without a named part from `TERYLON_PANE_STATUS` and saying in the debug log what it draws, the pane's own log on the Queue tab from `TERYLON_PANE_STATUS=log`, a drawn tree's keys used twice and props with no finite value named, a reason drawn as one clean line, the done-signal's state as typed plain text under Diagnostics, ⚠ only for a part that is drawn, an S43 page of `events_since` and a plan with no stories read without a problem; the done-signal telling each story's latest move as `story_get` reads it right before the post, several of one read as one summary, nothing asked under a dropped goal, goal 35's runs as one summary with no Accept asked; a torn store file named from its refusal with the step to delete it, and its reason drawn whole | free, seconds; no session, no network |
| terylon-pane teeth | `node --test tests/terylon-pane/mutations.test.js`; one shard of four: `MUTATION_SHARD=2/4` before it | each planted mutation — no done-signal, no catch-up, the band ignoring a survey or showing the spend, the status line counting the briefing as an alert, the pane opening by itself, a gate among the pane's tools or its allow rules, the guard opened, a waiting item merging, merge among the owner's acts, an act taken on render, a story returned without a note, merge drawn as a button, an act sent twice while Terylon answers, a Desktop proof's default flipped, a word inside an `Svg`, a phase drawn now with no stage, a card filled again, an amber word on a waiting card, the wide stepper's nodes apart from its labels, a blocked story called running, and since the owner's walk of 1.5.0 (#35) a new task's title cut or an empty Criteria filled, a card acted on drawn stale, a danger act grey, a plan drawn as one chain, the row and the card on two answers, the stopped hour counted as running, and since the retest of 1.6.0 (#39) a repository goal's task sent without its files, a blank line or a 31st file sent, a verified list story waiting for a merge, a plan of one story drawing its chain, the sizes beside the chain, and since #41 the closed goals read on every poll, `closedCount` ignored, the count and filter before S44 removed, a plan kept under a goal S44 does not list as open, and since #48 the open goals' plans listed under *Closed*, and since the owner's walk of 1.7.2 a failed `events_since` hidden from the Status tab or dropped by the next read of the queue, the watchdog on `events_since` removed, a refusing store stopping the done-signal, the events path silent in the debug log, a list story's done-signal waiting for a merge, the card after Accept drawn verified, an accepted story called merged, a row's link laid over its text, an ended story's phases saying no stage reported, a done-signal field of another shape read as it is, a throwing part taking the Status tab down, two cards sharing one key, an accepted list story's card saying merged, a verified or ended story drawn under Running, the Status tab's debug line silenced, the pane's own log not drawn, the tree check blind to a key used twice, a Status draw's beginning unsaid, a reason's control characters drawn, ⚠ for a part left out, the Diagnostics lines removed, the done-signal's title red again, a story's moves of one read told one by one, a signal posted without reading the story again, a story under a dropped goal asking again, one prompt per signal again, the store card's delete step or its file lost, a reason cut to one line — turns the mod's tests red; skips, saying why, where no `claude` on PATH has `plugin test` — absent, or too old to have it | free, 88 runs of `plugin test`, one after another: all 88 took about 31 minutes in a cloud container on 2.1.308 (measured 2026-10-26, #35), where 67 had taken about 16½ minutes on the operator's own host (2026-10-25, S27); in CI, until #42 one job ran them one after another on the locked 2.1.308: 88 took 24¾ minutes on one run and were cancelled at the 30-minute limit on the next (measured 2026-10-26, #38), and 98 held the required check for 43 minutes on #37. Since #42 four shards of 24 or 25 run on runners of their own, each with a 30-minute limit: on #45, which touches `ci.yml` and so runs everything, three shards took 6 to 7½ minutes and the fourth 13½ on a runner about twice as slow, and the CI run took 14¾ minutes from push to the required check; a pull request that touches no pane path skips them, and its CI run took 58 seconds (both measured 2026-10-28) |
| terylon-pane zones | `node --test tests/terylon-pane/zones.test.js` | the mod's tests pass with Prague's, New York's and Tokyo's offset planted in a copy, both where the pane reads the host's offset and where the tests compute their expectations (#39); `plugin test` runs in UTC on Linux whatever `TZ` says, so no zone can be set from outside; skips like the teeth | free, 3 runs of `plugin test`, about a minute; in CI a job of its own beside the shards, 53 seconds with its install, skipped with them where the pane is untouched (measured 2026-10-28, #45) |
| terylon-pane tool table | `node --test tests/terylon-pane/tool-table.test.js` | the pane's owner acts are exactly the former gates Terylon PR 228 made owner writes and its gate list is merge alone, both held to the copy of Terylon's tool table in `mcp-tool-table.json`; the README's allow rules are exactly `PANE_TOOLS`, merge in neither. With `TERYLON_SOURCE` set to a Terylon checkout, the copy is also held to the C# | free, milliseconds |
| terylon-pane CI plan | `node --test tests/terylon-pane/needs-pane-suites.test.js tests/terylon-pane/shard.test.js` | a pull request touching any pane path runs the mutation and zone suites, one touching none or with an empty diff skips them, a push to `main` always runs them, a pull request without its paths is refused; four shards cover every mutation in `mutations.js` exactly once, none in two, and a malformed `MUTATION_SHARD` throws rather than running all or nothing (#42) | free, milliseconds |
| terylon-pane commands | `node --test tests/terylon-pane/commands.test.js` | no command the mod registers shares a name with a skill of the mod or of `terylon-os` | free, milliseconds |
| terylon-pane version | `node --test tests/terylon-pane/version.test.js` | the version the Status tab says is the one `plugin.json` ships | free, milliseconds |
| published names | `node --test tests/published-names/published-names.test.js` | no tracked file under `plugins/` or `docs/` names the owner's host, tailnet or forge organisation, and a planted name is caught (#32) | free, milliseconds |
| terylon-os plugin | `node --test tests/terylon-os/terylon-os-plugin.test.js` | the `terylon-os` plugin's one server is `${TERYLON_URL}/mcp` with no header or token, every prompt Terylon's `/mcp` serves has exactly one skill mirroring it, merge is the one gate its skills and README name — confirmed with the passkey in the console — while the thirteen owner's acts are called only on the owner's word, never called a gate nor sent to a form (a planted text saying so is caught), every text that says `accepted: null` says not to send the write again and names `leader_answer` with the `commandId` (#39, a planted "do not retry" is caught), and nothing published names a host | free, milliseconds |
| skill spec | `node --test tests/skill-spec/skill-spec.test.js` | every skill follows the Agent Skills specification: only its frontmatter keys, the name equal to its directory and well-formed, a `Use when` description of 1–1024 characters, `allowed-tools` space-separated, a body under 500 lines and about 5000 tokens, only `references/`, `assets/` and `scripts/` beside `SKILL.md`, every file reference inside the skill, one level deep and existing, and marked copies of a reference identical; each rule's planted breach is caught | free, milliseconds |
| no history in code | `node --test tests/no-history-in-code/no-history-in-code.test.js` | an added comment line naming a PR, an issue, a work item or a date is annotated as a warning and the script still exits 0; code, strings and prose are left alone; its own error exits 1 | free, about a second |
| plugin versions | `node --test tests/versions/check-plugin-versions.test.js` | a changed plugin without a raised version fails, a patch or minor raise passes, a major raise fails without the label `major` and passes with it, a new plugin passes from 1.0.0 up, a deleted one passes, a malformed version fails, and a version `marketplace.json` lists must equal `plugin.json`'s — the pure rules, and the command line end to end in a throwaway repository | free, seconds |
| architecture diagrams | `node --test tests/architecture-diagrams/architecture-diagrams.test.js` | every Mermaid block in `docs/architecture/` and the root `README.md`'s plugin graph is a flowchart; no block in `README.md` and `docs/` opens with front matter; every flowchart there opens with its keyword and, on the next line, the ELK init directive with its `padding: 16`, and sets no `theme`, `themeVariables` or `fontFamily` and no HTML in a label; every subgraph has a `style` with an explicit `color:` and a dashed stroke, and that title reaches 3.75:1 on its tinted fill over both GitHub backgrounds, `#ffffff` and `#0d1117`, with the colours #48 found unreadable in dark mode caught; the adaptive style of `.claude/rules/markdown.md`; no `.d2` or `.svg` is left there, and the plugin graph draws exactly the edges every `plugin.json#dependencies` declares, dashed exactly where the chain already reaches the target; whether a block parses is checked by hand with mermaid-cli, since no job starts a browser | free, milliseconds |
| git guard | `node --test tests/git-guard/git-guard.test.js` | `.claude/hooks/git-guard.js` refuses a commit, an `Edit`/`Write` or a push of `HEAD` on `main` and any push naming `main`, follows `cd` and `git -C` through `$VAR`, `${VAR}`, `%VAR%`, earlier assignments and `~`, names a target it cannot resolve in the refusal, and passes everything else — against real throwaway repositories and a linked worktree | free, seconds |
| property tests | `npm ci && npm test` in `tests/property/` | over generated inputs: `git-guard.js` never crashes and always answers allow or a well-formed deny, refuses a push to `main` in any quoting and behind any chain separator, allows a branch that merely contains `main`; `compareVersions` is the numeric total order and `parseVersion` accepts one spelling per version; `resolveRef` never passes a detached HEAD on. fast-check is the only npm dependency in the repository and lives only in that folder; the root `node --test` skips these files with a stated reason, and `.github/workflows/property.yml` runs them | free, about 30 seconds |
| harness unit checks | `node --test tests/e2e/ref.test.js tests/e2e/long-paths.test.js` | which ref the harness installs, and that a detached HEAD is refused rather than passed on as `HEAD`; that `core.longpaths=true` is appended to the `GIT_CONFIG_*` entries already set and a real git reads it, and that on Windows git's partial-checkout message, or Claude Code's refused rename of the clone past `MAX_PATH`, becomes one line naming the path too long and the fix (#48) | free, milliseconds |
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
- **On Windows, a long `--out` broke the install stage with only git's *"You can inspect what was checked out with 'git status'"*** (the test round of 2026-10-28, #48): the clone's deepest file passed `MAX_PATH`, 260 characters, under a 162-character scratch path, while `--out C:/t/e2e` passed. `marketplace add` checks out into `plugins/marketplaces/temp_git_<ms>_<id>..clone/` first, a longer name than `terylon/`, and its git inherits the environment: it appends 38 entries of its own to `GIT_CONFIG_COUNT`, and `core.longpaths` still read `true` in that clone (measured 2026-10-29 on 2.1.312, on Linux, with a git wrapper on `PATH`). So `run.js` sets `core.longpaths=true` through `GIT_CONFIG_COUNT/KEY/VALUE` for every child. **On Windows that gets git's checkout through, and the install still fails**: Claude Code's own move of the clone to its final name is refused, `EPERM: operation not permitted, rename '…\plugins\marketplaces\temp_git_…' -> '…\terylon'`, and nothing the harness sets reaches it (measured by the owner on 2026-10-29, Windows 11, 2.1.309, a 120-character scratch folder projecting 291 characters; `--out C:/t/e50` passed 104 of 104). So the install stage says up front when the projected path passes `MAX_PATH`, and when the clone fails on either message it names the path too long and a shorter `--out` in one line (`tests/e2e/lib/long-paths.js`). **A short `--out` is the only fix.**
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
| `comments.md` | what a code comment may say: 2 lines inline, 10 in a summary, no PR, issue, work-item reference or date |
| `documentation.md` | documentation states the current state; a dated measurement is the one exception; ADRs are exempt |

In short:

- Everything committed is in English, whatever language the work is discussed in.
- **Every rule has one owner; every other mention points at it without restating it.** Why, and what the first sweep found: `docs/architecture/every-rule-has-one-owner.md`.
- Bump the version in `plugin.json` on every commit that changes the plugin — without it the consumer does not receive the change. **Which digit moves is stated once, under *Versioning* in `plugins/CLAUDE.md`.**
- Work happens on a feature branch; `main` is reached only through a PR. Enforced by `.claude/hooks/git-guard.js`.
- Every commit requires explicit user consent.
- Skills are referenced **by name**, never by an `@` path or a `../` import.
- **Anything with a shape is drawn, not described** — an ASCII diagram for a call chain or dependency, a table for cases and what each selects. Prose is interpretable and these documents are read as instructions; structure removes the room. Applies to what the repo generates too, not only to what it commits.
