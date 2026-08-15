# Migrating from the plugins that no longer exist

Two plugins were removed and their contents redistributed, and one skill moved between plugins. If a repository still enables `terylon-devops@terylon` or `terylon-metrics@terylon`, this is what to change and what changes underneath.

## The three moves at a glance

```
  terylon-devops                 terylon-metrics              terylon-core 1.0
  ├── the transports             └── measure-token-spend      ├── write-plan
  └── the ADO mechanics                                       └── run-build-loop
        │                              │                            │
        ▼                              ▼                            ▼
  terylon-forge  (the port)      terylon-core                 terylon-dev
  terylon-ado    (the adapter)   (same skill, new home)       (same skills, lower cost)
```

## `terylon-devops` became `terylon-forge` + `terylon-ado`

| What you had | What to do |
|---|---|
| `"terylon-devops@terylon": true` | replace with `"terylon-ado@terylon": true` — or `"terylon-github@terylon": true` if those repositories are on GitHub |

The port installs as the adapter's dependency, and the transports kept their names. Two things did change and they are not cosmetic:

| Was | Is |
|---|---|
| the engine skill `ado-mcp` | `forge-ops` |
| the MCP namespace `mcp__plugin_terylon-devops_ado__*` | `mcp__plugin_terylon-ado_ado__*` |

**Grep for the old namespace in anything you wrote yourself.** A check written against `mcp__ado__` or the old plugin prefix passes because it cannot fire — it matches nothing and reports success.

The plugin was split because it mixed two kinds of thing: transports, which are portable and became the port, and Azure DevOps mechanics, which are not and became the adapter. The full reasoning, including why the port declares no adapter, is in [`architecture/port-and-adapter-split.md`](../architecture/port-and-adapter-split.md).

## `terylon-metrics` became `terylon-core`

| What you had | What to do |
|---|---|
| `"terylon-metrics@terylon": true` | rename the key to `"terylon-core@terylon": true` |

**Nothing else changes.** Skills are addressed by name, so anything that loaded `measure-token-spend` keeps working. `terylon-core` is the root — no dependencies, no git, no forge, no MCP server — and every other plugin sits on it. It is still worth enabling alone, for the measurement.

`terylon-dev` also no longer requires the `claude-plugins-official` marketplace: [`architecture/superpowers-left-the-dependency-set.md`](../architecture/superpowers-left-the-dependency-set.md).

## `write-plan` and `run-build-loop` moved to `terylon-dev`

They sat in `terylon-core` and moved in `terylon-core@1.1.0`.

| Situation | Effect |
|---|---|
| You enable `terylon-dev` | nothing to do — callers address skills by name |
| You enabled `terylon-core` **alone** to get the plan format | enable `terylon-dev` as well |

Only `terylon-dev` ever consumed them, and the root installs for everyone: a component in the root that one plugin loads is a cost every consumer of every plugin pays.

## After changing the keys

| Step | Why |
|---|---|
| Run `/plugin marketplace update` | the rename is in your settings; the new plugin still has to be fetched |
| Start a fresh session | an MCP server registered by a newly enabled adapter starts at session start |
| Confirm the tools exist | on Azure DevOps, `mcp__plugin_terylon-ado_ado__*` should be present. Absent means the adapter is not enabled — see [`runbooks/ado-mcp-authorization-error.md`](../runbooks/ado-mcp-authorization-error.md), cause D |

## Gotchas

**Enabling only `terylon-forge` gets you no forge access at all.** The port ships no adapter by design. This is the intended behaviour, not an installation failure.

**`terylon-ado` requires `TERYLON_ADO_ORG`, which `terylon-devops` did not.** A repository that migrates without setting it fails at the first call, and that failure is deliberate — the reasoning is in the root [`CLAUDE.md`](../../CLAUDE.md) under *Azure DevOps*. Setting it: [consumer-setup](./consumer-setup.md).

**Both adapters may be enabled at once.** `TERYLON_FORGE` then decides which a run uses, and the engine is addressed plugin-qualified.

## Where it lives

| File | Role |
|---|---|
| `.claude-plugin/marketplace.json` | `plugins[]` — the published set; `terylon-devops` and `terylon-metrics` are absent from it |
| `plugins/terylon-forge/README.md` | the *Migrating* note from the port's side |
| `plugins/terylon-core/.claude-plugin/plugin.json` | the root manifest — successor to `terylon-metrics`, no `dependencies` key |
| `plugins/terylon-ado/.mcp.json` | the server the adapter registers, and the variable it needs |
| `plugins/terylon-dev/skills/write-plan/SKILL.md` | `write-plan` — in its current home |
| `plugins/terylon-dev/skills/run-build-loop/SKILL.md` | `run-build-loop` — in its current home |
| `README.md` | the migration callouts a first-time reader meets |
