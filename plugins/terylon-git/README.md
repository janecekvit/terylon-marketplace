# terylon-git

The git foundation of the `terylon` marketplace. Nothing here knows about Azure DevOps, GitHub, or any other forge — everything in it exercises git and nothing beyond it, so it works in any repository regardless of where that repository is hosted.

## Where it sits

```
terylon-core .................. the shared conventions; no git, no forge
    ▲
    └── terylon-git  ← you are here
           ▲
           └── terylon-devops ....... adds the Azure DevOps layer
                  ▲
                  ├── terylon-product
                  ├── terylon-dev
                  └── terylon-test
```

It depends on **`terylon-core`** for one thing: `delegate-to-repo-agents`, which `code-reviewer` loads by name. That skill exercises neither git nor a forge, and the same convention is used by the personas in `terylon-dev` and `terylon-test`, so it belongs in the root rather than here. `terylon-core` carries no dependency of its own, so this costs nothing but the download.

## Audience

Anyone working in a git repository. Directly for local review and worktree isolation; indirectly as the layer the forge-aware Terylon plugins build on.

## What it contains

**Skills:**

- **`create-workspace`** — an isolated git worktree on a new branch. Detects existing isolation first (never nests), prefers any native worktree tooling the environment exposes, and falls back to `git worktree add` into a project-local `.claude/worktrees/` (the same root native tooling uses). The base branch is detected from the repo, never hard-coded.
- **`code-review`** — the review engine. Local mode walks a priority chain (working tree → staged → branch vs. detected base); sub-skill mode takes an explicit scope and returns structured YAML findings. It carries the judgment and writes nowhere.
- **`finish-branch`** — integrating a finished branch: verify the suite on the tree being integrated, detect whether the work sits in a worktree, present merge / push-for-a-pull-request / keep-as-is, and clean up only worktrees this marketplace created. Pure git; opening the pull request on a specific forge belongs to the transport above it.
**Agent:**

- **`code-reviewer`** — the thorough review pass: isolated worktree off the base branch, several independent review lenses in parallel, then adversarial verification of every candidate finding. Returns only what survives. It takes a base ref and a diff — no PR URL, no forge access — so it works on a local branch just as well as on a pull request.

## Why this is its own plugin

The split runs along a real boundary: **everything here exercises git, and nothing here touches a forge.** Keeping them separate means a repository that is not on Azure DevOps can still use worktree isolation and the review pipeline without pulling in an ADO MCP server it has no use for.

The boundary is enforced by the same test in both directions. `delegate-to-repo-agents` shipped here until `1.4.x` and moved to `terylon-core`, because it never called git — its three mentions of `git checkout` and `git status` are examples of what a write-capable agent can do, not calls it makes. A component that would sit here without exercising git belongs one level down.

## Setup

```json
{
  "extraKnownMarketplaces": {
    "terylon": {
      "source": {
        "source": "git",
        "url": "https://dev.azure.com/janecekvit/Dev/_git/TerylonMarketplace",
        "ref": "main"
      },
      "autoUpdate": true
    }
  },
  "enabledPlugins": {
    "terylon-git@terylon": true
  }
}
```

## Usage

```
/terylon-git:create-workspace "<name>" [--branch=<branch>] [--from=<base-ref>] [--into=<dir>] [--setup]
/terylon-git:code-review
```

`code-reviewer` is an agent, not a command — it is dispatched by `pr-reviewer` (in `terylon-devops`) or directly when you want a thorough pass over a local branch.
