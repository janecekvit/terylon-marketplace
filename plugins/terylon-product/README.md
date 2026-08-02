# terylon-product

Skills for product owners and PMs: turning a short brief into Azure DevOps work items ready for implementation.

## Audience

Product owners and PMs who write User Stories and Feature specifications into Azure DevOps.

## Where it sits

```
terylon-core ............. the shared conventions
    ▲
    └── terylon-git
           ▲
           └── terylon-devops ....... ado-mcp, the ADO MCP server
                  ▲
                  └── terylon-product  ← you are here
```

`terylon-devops` is the only declared dependency; the two below it arrive with it. Both skills here reach Azure DevOps through the `ado-mcp` engine and issue no call shape of their own.

## What it contains

- **`create-user-story`** — from a short brief and a parent Feature it creates a User Story **grounded in the real codebase**: concrete files, functions and integration points found in the repo, not generic phrasing. The story is created under the parent and inherits both `AreaPath` and `IterationPath`.
- **`create-feature`** — writing, reviewing and validating Feature work items against the Terylon standard (`references/feature-standard.md`): Problem → User needs → Design & proposal → UX → Requirements → Acceptance criteria → Out of scope.

## Dependencies

It declares `terylon-devops`, which is therefore installed automatically. That is where the `ado` MCP server and the `ado-mcp` engine come from, and both skills delegate all Azure DevOps mechanics to it.

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
    "terylon-product@terylon": true
  }
}
```

## Usage

```
/terylon-product:create-user-story "<brief>" --parent=<Feature-ID|URL> [--repo=<path>] [--auto | --dry-run]
/terylon-product:create-feature "<brief>"         # mode: writing a new Feature
/terylon-product:create-feature <Feature-ID|URL>  # mode: review / validation of an existing one
```
