# Terylon Marketplace

A [Claude Code](https://code.claude.com/docs) plugin marketplace for the whole development workflow — user stories and Feature specs, a test-first build pipeline with review agents, pull request review and checklist verification — on **Azure DevOps or on GitHub**. MIT licensed.

Eight plugins, one dependency chain. You enable **two** of them: the role you work in, and the adapter for wherever your repositories are hosted. Everything else arrives as a dependency.

## Plugins

```
terylon-core (root — no dependencies)
    ▲
    └── terylon-git
           ▲
           └── terylon-forge          the forge port — ships no adapter
                  ▲
                  ├── terylon-ado        adapter: Azure DevOps
                  ├── terylon-github     adapter: GitHub
                  ├── terylon-product
                  ├── terylon-dev
                  └── terylon-test
```

| Plugin | Audience | Dependencies |
|---|---|---|
| `terylon-core` | every repository — the shared conventions and token-spend measurement | none |
| `terylon-git` | any git repository — worktree isolation, review engine, code reviewer | `terylon-core` |
| `terylon-forge` | everyone working through pull requests — the PR workflow, written against operations rather than a platform | `terylon-git` |
| `terylon-ado` | repositories on Azure DevOps — ADO mechanics and the ADO MCP server | `terylon-forge` |
| `terylon-github` | repositories on GitHub — the same mechanics over the `gh` CLI, no server | `terylon-forge` |
| `terylon-product` | product owner / PM — user stories, Feature specs | `terylon-forge` |
| `terylon-dev` | developers — brainstorm → plan → build (TDD) → finish | `terylon-git`, `terylon-forge`, `terylon-core` |
| `terylon-test` | anyone holding a checklist — verifies a test plan and acceptance criteria against the artifact | `terylon-forge`, `terylon-core` |

`terylon-core` is the **root**: no git, no forge, no MCP server, and everything else sits on it. `terylon-git` is deliberately forge-agnostic — everything in it exercises git and nothing more.

**`terylon-forge` is a port and ships no adapter, on purpose.** Declaring one would install an Azure DevOps MCP server in every GitHub repository. That is why you enable two keys, and why the adapters are siblings of the role plugins rather than layers under them.

## Quickstart

**Try it in one session.** In Claude Code, inside the repository you want to work on:

```text
/plugin marketplace add janecekvit/terylon-marketplace
/plugin install terylon-github@terylon
/plugin install terylon-dev@terylon
```

Swap `terylon-github` for `terylon-ado` if that repository is on Azure DevOps, and `terylon-dev` for `terylon-product` or `terylon-test` for another role.

**Share it with a team.** Into `.claude/settings.json` of your product repository — commit it, and everyone who opens the repository is offered the same plugins:

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "extraKnownMarketplaces": {
    "terylon": {
      "source": {
        "source": "git",
        "url": "https://github.com/janecekvit/terylon-marketplace.git",
        "ref": "main"
      },
      "autoUpdate": true
    }
  },
  "enabledPlugins": {
    "terylon-ado@terylon": true,
    "terylon-dev@terylon": true
  }
}
```

On GitHub, swap `terylon-ado@terylon` for `terylon-github@terylon`.

Then point it at your forge:

| Your repositories are on | Do |
|---|---|
| **GitHub** | `gh auth login`, once per machine. Nothing else — the owner comes from the git remote and the adapter registers no server |
| **Azure DevOps** | set `TERYLON_ADO_ORG` to your bare organisation **name**. It is required and has no default |

Everything else resolves at runtime: the forge from a pasted URL, then `TERYLON_FORGE`, then the git remote's host; the project and repository from the remote; the target from the URL you pass a skill.

## Where to go next

| Question | Read |
|---|---|
| How do I wire up a repository, in full? | [`docs/onboarding/consumer-setup.md`](./docs/onboarding/consumer-setup.md) |
| I enable `terylon-devops` or `terylon-metrics` — what changed? | [`docs/onboarding/migrating.md`](./docs/onboarding/migrating.md) |
| I want to change the marketplace and test a branch | [`docs/onboarding/marketplace-development.md`](./docs/onboarding/marketplace-development.md) |
| I merged a change and the consumer still runs the old one | [`docs/runbooks/consumer-did-not-get-the-update.md`](./docs/runbooks/consumer-did-not-get-the-update.md) |
| The Azure DevOps tools error, or name an organisation I did not choose | [`docs/runbooks/ado-mcp-authorization-error.md`](./docs/runbooks/ado-mcp-authorization-error.md) |
| How does any of this actually work, and why? | [`docs/`](./docs/README.md) — the engineering knowledge base |
| I am writing a plugin | [`plugins/CLAUDE.md`](./plugins/CLAUDE.md) — directory conventions, versioning, the engine/transport pattern |

## Versioning

Every `plugin.json` carries a `version`, and a consumer re-fetches **only** when that field changes — a push to `main` without a bump ships nothing. Which digit moves is stated in [`plugins/CLAUDE.md`](./plugins/CLAUDE.md), under *Versioning*.

Every slug carries the `terylon-` prefix, redundantly with the `@terylon` marketplace suffix, so that typing `/terylon` shows commands from every plugin in one filtered list.

## Where it is developed

```
  feature branch ──▶ pull request, reviewed and merged on a private Azure DevOps repository
                            │
                            ▼  main, pushed unchanged
  github.com/janecekvit/terylon-marketplace   ◀── what you install from
```

This GitHub repository is the **public home** of the marketplace and the address you install from. Changes are reviewed in a private Azure DevOps repository, and each merged `main` is pushed here as it stands, so the history on both is the same history. How that push is made is in [`docs/flows/change-to-consumer-repo.md`](./docs/flows/change-to-consumer-repo.md).

## Continuous integration

[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs on every pull request and every push to `main`:

| Job | Runs | Needs |
|---|---|---|
| Unit suites | `node --test "**/*.test.js"` — the forge-port contract and fixture tests, the harness's ref checks, the hook and measurement scripts | nothing |
| End-to-end install stage | `node tests/e2e/run.js --stages install` — installs the marketplace from the commit under test as a consumer does, and checks every plugin, skill, agent, hook and MCP server loads | nothing — no login, no token, no model call |

**The harness's other two stages stay manual, on purpose.** `author` and `github-only` drive the skills through a model, headless, and judge what it writes:

- they need a Claude login, and putting one in CI means a repository secret that any workflow change could reach — on a public repository, the wrong trade for a check a maintainer can run;
- they cost about $3 a run, and on every push that is a bill for unchanged skills;
- a model's run varies between two identical attempts, and a check that flakes on a pull request teaches people to re-run it rather than read it.

They are run by hand before a change reaches `main`; the commands are in [`CLAUDE.md`](./CLAUDE.md), under *Testing*.

## Security

Report a vulnerability privately, as [`SECURITY.md`](./SECURITY.md) describes — not in a public issue.

## Licence

[MIT](./LICENSE), copyright Vít Janeček.
