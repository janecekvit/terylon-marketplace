# terylon-dev

Developer pipeline: from a user story (a link to an Azure DevOps work item or a plain description) to implemented and tested code through **plan → build (TDD) → finish**, with human approval at the plan and at the merge.

## Audience

Developers who want a complete gated loop: clarify the story, plan it against the real codebase, build it test-first task by task, and close the PR.

## What it contains

**Skill:**

- **`develop`** — the entry point on the main thread. It parses flags, runs the intake clarification, dispatches `leader` and hosts the gates. It is a skill and not an agent, because **only the main thread can ask the user**.

**Agents:**

- **`leader`** — owns the iteration loop: dispatches the other agents, reads their reports, decides on the next round, keeps the ledger. At a gate it returns control upwards. For the whole-branch review at the end it dispatches `terylon-git:code-reviewer`, or `terylon-devops:pr-reviewer` when a pull request already exists and the findings should land there.
- **`planner`** — turns an agreed brief into a design and a bite-sized TDD plan, grounded in the codebase via `Explore`. It never guesses — when something is unclear it returns `NEEDS_CLARIFICATION`.
- **`developer`** — implements a single task test-first: red → green → refactor → commit → self-review.
- **`debugger`** — on a test failure it proceeds systematically: hypothesis → reproduction → minimal fix.
- **`refactorer`** — once the tests are green it goes through the diff for simplification, reuse and consistency.
- **`edge-case-reviewer`**, **`security-reviewer`**, **`performance-reviewer`**, **`architecture-reviewer`** — read-only review lenses running in parallel, each with its own angle. They propose, they do not edit.

## Reuse

The plugin is deliberately thin. The build phase **runs** `superpowers:subagent-driven-development` (its controller loop, ledger and final review); it further uses `writing-plans`, `test-driven-development`, `requesting-code-review` and `finishing-a-development-branch`, plus the built-in one-shot agents `Explore` and `Plan`. Isolation goes through `create-workspace` from `terylon-git`. Only the orchestration, the personas and the Azure DevOps wiring are its own.

## Dependencies

- **`terylon-devops`** — the `ado` MCP server, the `ado-mcp` engine, `review-pr`, `write-pr-description`. Installed automatically.
- **`terylon-git`** — `create-workspace`, `code-review`, and the `code-reviewer` agent that `leader` dispatches for the whole-branch review. Declared directly rather than relied on transitively, because `leader` uses it whether or not a pull request is in play.
- **`superpowers`** from the `claude-plugins-official` marketplace — reused skills. Requires that marketplace to be enabled.

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
    "terylon-devops@terylon": true,
    "terylon-dev@terylon": true
  }
}
```

## Usage

```
/terylon-dev:develop <ADO-URL | "description"> [--auto | --dry-run] [--here]
```

- `--dry-run` — stops after the plan is approved (a plan, no code)
- `--auto` — skips the pauses at the gates; `leader` runs the whole loop on its own. The git rules still apply.
- `--here` — stay in the current checkout instead of an isolated worktree
