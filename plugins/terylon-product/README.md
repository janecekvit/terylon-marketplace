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
           └── terylon-forge ....... the forge port: transports + resolve-forge
                  ▲
                  ├── terylon-ado ....... adapter: ADO mechanics + the ado MCP server
                  ├── terylon-github .... adapter: gh CLI mechanics, no server
                  └── terylon-product  ← you are here
```

Swap `terylon-ado@terylon` for `terylon-github@terylon` on GitHub. **One of the two is required**: the port ships no adapter, so without one every forge operation stops. `terylon-forge`, `terylon-git` and `terylon-core` install automatically as dependencies.

`terylon-forge` is the only declared dependency; the ones below it arrive with it. **An adapter is not declared and must be enabled by the consumer**, because the port ships none.

> **Both skills here are written against Azure DevOps today.** They reach the forge through `forge-ops`, but their bodies still name Azure DevOps fields — work item types, the acceptance-criteria field, area and iteration paths — which have no counterpart in the GitHub body. Enable `terylon-github` and the transports in `terylon-forge` work; **these two do not**. Porting them is separate work and is not claimed here.

## What it contains

- **`create-user-story`** — from a short brief and a parent Feature it creates a User Story **grounded in the real codebase**: concrete files, functions and integration points found in the repo, not generic phrasing. The story is created under the parent and inherits both `AreaPath` and `IterationPath`.
- **`create-feature`** — writing, reviewing and validating Feature work items against the Terylon standard (`references/feature-standard.md`): Problem → User needs → Design & proposal → UX → Requirements → Acceptance criteria → Out of scope.

## Dependencies

It declares `terylon-forge`, which is therefore installed automatically. The port carries no platform mechanics: those come from an adapter the consumer enables — `terylon-ado` or `terylon-github` — and both skills here delegate every call shape to the `forge-ops` engine it supplies.

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
    "terylon-product@terylon": true,
    "terylon-ado@terylon": true
  }
}
```

## Usage

```
/terylon-product:create-user-story "<brief>" --parent=<Feature-ID|URL> [--repo=<path>] [--auto | --dry-run]
/terylon-product:create-feature "<brief>"         # mode: writing a new Feature
/terylon-product:create-feature <Feature-ID|URL>  # mode: review / validation of an existing one
```
