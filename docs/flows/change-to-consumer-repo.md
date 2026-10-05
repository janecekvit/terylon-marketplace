# How a change reaches a consumer repository

An edit to a skill in this repository does nothing for anyone until seven things have happened. One of them is a single digit in a JSON file, and it is the one that gets forgotten — **a push to `main` without a version bump ships nothing.** This article follows the whole path so that "I changed it and the product repository still sees the old one" has an answer that is not guesswork.

## The path

```
  YOU, in this repository
  ┌──────────────────────────────────────────────────────────────────────┐
  │ 1  feature branch            git-guard.js refuses Edit/Write on main │
  │        │                                                              │
  │ 2  edit the skill / agent / manifest                                  │
  │        │                                                              │
  │ 3  BUMP plugins/<slug>/.claude-plugin/plugin.json#version             │
  │        │                     which digit: plugins/CLAUDE.md           │
  │        │                                                              │
  │ 4  commit  (explicit user consent, every time)                        │
  │        │                                                              │
  │ 5  pull request ──▶ main    git-guard.js refuses any push to main     │
  └────────┼─────────────────────────────────────────────────────────────┘
           │  merged on Azure DevOps (private — where review happens)
           │
           │  5b the operator pushes that main, unchanged, to GitHub
           ▼
  THE MARKETPLACE  —  github.com/janecekvit/terylon-marketplace, on the ref the consumer tracks
           │
           │  6  the consumer's Claude Code refreshes the marketplace
           │     autoUpdate: true  ──▶  in the background
           │     autoUpdate absent  ──▶  only on /plugin marketplace update
           ▼
  THE CONSUMER REPOSITORY
           │  7  enabledPlugins names the plugin; the new version is fetched
           ▼
     ~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/…
           │
           ▼
     the skill the session loads

  ── the one that is skipped ──▶  step 3 omitted: steps 4-7 all succeed,
                                  and the consumer receives nothing at all
```

## Each hop, and what enforces it

| # | Hop | Enforced by | Fails how |
|---|---|---|---|
| 1 | Work happens on a feature branch | `.claude/hooks/git-guard.js` refuses `Edit` / `Write` and `git commit` while HEAD is on `main` | loudly, at the tool call |
| 3 | The version is bumped | **nothing** — it is a convention with no guard | **silently** |
| 4 | Each commit has explicit consent | `git-workflow.md`, plus the hook | loudly |
| 5 | `main` is reached only through a pull request | the hook refuses **any** push targeting `main`, from any branch — including `git push origin HEAD:main` from a feature branch | loudly |
| 5b | The merged `main` reaches GitHub | **nothing** — the operator pushes it by hand, see below | **silently** — Azure DevOps shows the merge, consumers see nothing |
| 6 | The consumer refreshes | `autoUpdate: true` in their `extraKnownMarketplaces` entry | silently, if the background fetch cannot reach GitHub |
| 7 | The plugin is enabled | `enabledPlugins` in the consumer's `.claude/settings.json` | loudly — the skill is simply absent |

Three hops fail silently, and they are the ones the runbook exists for.

## How `main` reaches GitHub

**Two remotes, one history.** Azure DevOps is `origin` and stays where every pull request is reviewed and merged. GitHub is the second remote, `github`, and receives `main` exactly as Azure DevOps holds it — the same commits, never a rebased or squashed copy.

```
  origin  (Azure DevOps, private)          github  (GitHub, public)
  feature branches, pull requests, merges   main and release tags only
            │                                        ▲
            └── main ──── pushed unchanged ──────────┘
```

| When | Command, run by the operator in their own clone |
|---|---|
| once per clone | `git remote add github https://github.com/janecekvit/terylon-marketplace.git` |
| **once ever — the first push** | `git fetch origin` then `git push --force github origin/main:refs/heads/main` |
| after every later merge on Azure DevOps | `git fetch origin` then `git push github origin/main:refs/heads/main` — plain, never forced |
| to check | `git ls-remote origin refs/heads/main` and `git ls-remote github refs/heads/main` print the same commit |
| on a release | `git tag -a v<date> origin/main` then `git push github v<date>`, and the release notes on GitHub |

**The operator pushes, not an agent.** `.claude/hooks/git-guard.js` refuses any push that targets `main`, whichever remote it names — on purpose, since the rule it backs is that `main` moves only through a reviewed pull request, and the GitHub copy is that same `main`.

**The first push is forced, once.** The GitHub repository was created holding a single commit — GitHub's generated `LICENSE` — that the Azure DevOps history does not have, so the first `main` from Azure DevOps cannot fast-forward over it. Forcing replaces that one commit with the reviewed history, whose own `LICENSE` is the same MIT licence. It is made after the #273 merge, by the operator.

**Never force any later push.** A rejected push means GitHub's `main` holds a commit Azure DevOps does not. Find where it came from and bring it through a pull request; forcing would delete it from the public history.

**Only `main` and tags go to GitHub.** A feature branch stays on Azure DevOps, so testing a branch before it merges points at that remote — see [`onboarding/marketplace-development.md`](../onboarding/marketplace-development.md).

## The version field is the whole contract

**A consumer re-fetches a plugin only when `plugin.json#version` changes.** There is no content hash, no timestamp comparison, no "the branch moved" signal. The field is the only thing being compared.

**Which digit moves does not affect this flow at all** — any change to the field triggers the fetch, and the digit is a convention for readers rather than an input to the mechanism. The rule deciding it is a table in `plugins/CLAUDE.md`.

**A change spanning several plugins bumps each of them.** The consumer fetches per plugin, so a bumped `terylon-forge` and an unbumped `terylon-ado` ships half the change — and the half that arrives is the one written against the half that did not.

## What the consumer configures

```json
{
  "extraKnownMarketplaces": {
    "terylon": {
      "source": { "source": "git", "url": "<this repository>", "ref": "main" },
      "autoUpdate": true
    }
  },
  "enabledPlugins": {
    "terylon-ado@terylon": true,
    "terylon-dev@terylon": true
  }
}
```

| Key | Decides |
|---|---|
| `source.ref` | **which branch the consumer tracks.** `main` for everyone; a feature branch only in a gitignored `settings.local.json`, for testing the marketplace itself |
| `autoUpdate` | whether the refresh at step 6 happens in the background or only on `/plugin marketplace update`. It is a **sibling** of `source`, not a field inside it |
| `enabledPlugins` | which plugins are installed. Two keys: a role plugin and the adapter for wherever their repositories live |

`source.source` is `"git"`. `"git-subdir"` is a different schema, used in `marketplace.json#plugins[].source` to declare where each plugin lives inside this repository — the client rejects it here.

## Gotchas

**Dependencies are not inherited, they are declared.** A consumer enabling `terylon-dev` gets `terylon-git`, `terylon-forge` and `terylon-core` automatically, because `terylon-dev` declares them. They get **no adapter**, because the port declares none on purpose — see [port-and-adapter-split](../architecture/port-and-adapter-split.md).

**The marketplace source and the consumer's own forge are independent.** Every consumer fetches the marketplace from the public GitHub repository, whichever forge its own repositories are on. An Azure DevOps-hosted product repository still installs from GitHub, and still authenticates to its own forge through the `ado` server.

**Background updates need no credential.** The marketplace is public, so an unattended fetch authenticates as nobody. What can still stop it quietly is the network — a proxy, an offline machine — and then the consumer stays on the version they had, which looks exactly like a forgotten bump. See [`runbooks/consumer-did-not-get-the-update.md`](../runbooks/consumer-did-not-get-the-update.md) for telling the causes apart.

**The cache is keyed by version.** Installed plugins land under `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`, so an old and a new version coexist on disk. Reading a skill from a cache directory and being surprised it is out of date usually means reading the wrong version's copy — check the directory name.

## Where it lives

| File | Role |
|---|---|
| `.claude-plugin/marketplace.json` | the marketplace manifest — `plugins[]` with `name`, `source` (repo-root relative), `description`, `category` |
| `plugins/<slug>/.claude-plugin/plugin.json` | `version` — the **only** field a consumer compares; also `dependencies` |
| `.claude/hooks/git-guard.js` | refuses `Edit` / `Write` / `git commit` on `main`, and any push targeting `main` from any branch |
| `.claude/rules/git-workflow.md` | the branch, consent and bump rules the hook backs up |
| `plugins/CLAUDE.md` | *Versioning* — the branch-scoped digit table in full |
| `README.md` | the consumer-facing `settings.json` snippet, and *Where it is developed* — the two remotes for a public reader |
| `git remote -v` in a clone | `origin` on Azure DevOps; `github` added by hand, once per clone, by whoever pushes `main` to GitHub |
| `docs/onboarding/consumer-setup.md` | what a consuming repository configures, end to end |
| `docs/onboarding/marketplace-development.md` | pointing a local checkout at a feature branch to test before merging |
