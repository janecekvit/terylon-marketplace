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
           │  merged
           ▼
  THE MARKETPLACE  —  this repository, on the ref the consumer tracks
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
| 6 | The consumer refreshes | `autoUpdate: true` in their `extraKnownMarketplaces` entry | silently, if authentication for the background fetch is missing |
| 7 | The plugin is enabled | `enabledPlugins` in the consumer's `.claude/settings.json` | loudly — the skill is simply absent |

Two of the seven fail silently, and they are the two the runbook exists for.

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

**The marketplace source and the consumer's own forge are independent.** This repository lives on Azure DevOps whichever forge the consuming repositories are on. A GitHub-hosted product repository still fetches the marketplace over the Azure DevOps URL, and still authenticates to its own forge through `gh`.

**Background updates need git-level credentials.** Azure DevOps has no documented equivalent of `GITHUB_TOKEN`, so an unattended background fetch relies on a credential helper being configured. Without one it fails quietly and the consumer stays on the version they had — which looks exactly like a forgotten bump. See [`runbooks/consumer-did-not-get-the-update.md`](../runbooks/consumer-did-not-get-the-update.md) for telling the two apart.

**The cache is keyed by version.** Installed plugins land under `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`, so an old and a new version coexist on disk. Reading a skill from a cache directory and being surprised it is out of date usually means reading the wrong version's copy — check the directory name.

## Where it lives

| File | Role |
|---|---|
| `.claude-plugin/marketplace.json` | the marketplace manifest — `plugins[]` with `name`, `source` (repo-root relative), `description`, `category` |
| `plugins/<slug>/.claude-plugin/plugin.json` | `version` — the **only** field a consumer compares; also `dependencies` |
| `.claude/hooks/git-guard.js` | refuses `Edit` / `Write` / `git commit` on `main`, and any push targeting `main` from any branch |
| `.claude/rules/git-workflow.md` | the branch, consent and bump rules the hook backs up |
| `plugins/CLAUDE.md` | *Versioning* — the branch-scoped digit table in full |
| `README.md` | the consumer-facing `settings.json` snippet |
| `docs/onboarding/consumer-setup.md` | what a consuming repository configures, end to end |
| `docs/onboarding/marketplace-development.md` | pointing a local checkout at a feature branch to test before merging |
