# terylon-git

The git-only foundation of the `terylon` marketplace. Nothing here knows about Azure DevOps, GitHub, or any other forge — it depends on git and nothing else, so it works in any repository regardless of where that repository is hosted.

`terylon-devops` declares it as a dependency and adds the Azure DevOps layer on top.

## Audience

Anyone working in a git repository. Directly for local review and worktree isolation; indirectly as the foundation the other Terylon plugins build on.

## What it contains

**Skills:**

- **`create-workspace`** — an isolated git worktree on a new branch. Detects existing isolation first (never nests), prefers any native worktree tooling the environment exposes, and falls back to `git worktree add` into a project-local `.claude/worktrees/` (the same root native tooling uses). The base branch is detected from the repo, never hard-coded.
- **`code-review`** — the review engine. Local mode walks a priority chain (working tree → staged → branch vs. detected base); sub-skill mode takes an explicit scope and returns structured YAML findings. It carries the judgment and writes nowhere.
- **`delegate-to-repo-agents`** — the convention for using agents the *target* repository ships. The Terylon personas are generic by design; a repo may carry a stack-specific implementer or a domain reviewer that knows more. This says how to find one, when delegating beats doing the work yourself, and what the delegation may not break — chiefly a capability test: may the candidate change the files under examination? `Edit`, `Write` and unrestricted `Bash` all mean yes. Loaded by name by the personas in this plugin and in `terylon-dev`; not a user command.

**Agent:**

- **`code-reviewer`** — the thorough review pass: isolated worktree off the base branch, several independent review lenses in parallel, then adversarial verification of every candidate finding. Returns only what survives. It takes a base ref and a diff — no PR URL, no forge access — so it works on a local branch just as well as on a pull request.

## Why this is its own plugin

The split runs along a real boundary: these three components need git and nothing more. Keeping them separate means a repository that is not on Azure DevOps can still use worktree isolation and the review pipeline without pulling in an ADO MCP server it has no use for.

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
