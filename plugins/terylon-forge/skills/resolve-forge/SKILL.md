---
name: resolve-forge
description: >-
  Use before any forge operation to decide which hosting platform a run targets and which adapter
  fills the port — Azure DevOps or GitHub. Resolves from an explicit URL, then TERYLON_FORGE, then
  the git remote's host, and stops rather than guessing. Internal mechanics library for the transport
  skills, not a user command.
allowed-tools: Read, Grep, Glob, Bash(git *), Bash(node *)
---

# resolve-forge — which forge, and which adapter

Every transport in this plugin is written against the **port**, an operation catalog with two bodies. This skill answers the one question the port cannot: **which body**.

It is a **mechanics library rather than a user command**. Its normal caller is another skill or agent; a user invoking it directly gets an answer and nothing else.

## The resolution order

First hit wins. **There is no default and no guess.**

```
1  an explicit URL the user passed          a PR or item URL names its own forge
        │ dev.azure.com | visualstudio.com  ──▶  ado
        │ github.com                        ──▶  github
        ▼ none given
2  TERYLON_FORGE                            ado | github
        ▼ unset
3  host of `git remote get-url origin`      same host mapping as step 1
        ▼ no remote, or an unrecognised host
4  stop and ask                             never assume one
```

| Source | Supplies | Precedence |
|---|---|---|
| An explicit URL argument | the forge, plus the coordinates in it | highest — a pasted URL always wins |
| `TERYLON_FORGE` | the forge | the setting, for a repository whose remote is not the whole story |
| `git remote get-url origin` | the forge, plus owner / project / repo | the normal path |
| nothing resolves | — | **stop**, name what was tried, and ask |

**A URL outranks the environment variable on purpose.** Reviewing a GitHub pull request from a checkout of an Azure DevOps repository is an ordinary thing to do, and the URL is the more specific statement of intent.

The environment variable is the reason this skill holds `Bash(node *)`: `Bash(git *)` covers `git remote get-url` and nothing else, and **nothing in `Read` / `Grep` / `Glob` can read an environment variable at all**. One node invocation reads the variable and the remote together, which is narrower than the shell form it replaces:

```bash
node -e '
const { execSync } = require("child_process");
let remote = "";
try { remote = execSync("git remote get-url origin", { stdio: ["ignore", "pipe", "ignore"] }).toString(); } catch {}

const fromRemote =
    /dev\.azure\.com|visualstudio\.com/.test(remote) ? "ado" :
    /github\.com/.test(remote)                       ? "github" : "";

console.log(process.env.TERYLON_FORGE || fromRemote || "");
'
```

An empty result is step 4: stop and ask. The variable outranks the remote; a pasted URL outranks both and is decided before this runs.

## Which adapter the answer names

| `FORGE` | Adapter plugin | Engine skill | Server |
|---|---|---|---|
| `ado` | `terylon-ado` | `terylon-ado:forge-ops` | the `ado` MCP server, needs `TERYLON_ADO_ORG` |
| `github` | `terylon-github` | `terylon-github:forge-ops` | none — the `gh` CLI |

**Address the engine plugin-qualified whenever this skill returned a value.** Both adapters ship a skill named `forge-ops`; with only one installed the bare name resolves, but with both enabled it is ambiguous, and the qualified form is correct in either case.

## When the adapter is missing

`terylon-forge` declares **no adapter**, and must not: declaring one would install an Azure DevOps MCP server in a GitHub repository, which is the whole reason the port exists.

So a transport can resolve a forge and still find no engine. **Say so and stop.**

| Situation | Do |
|---|---|
| The forge resolved, its adapter is installed | proceed |
| The forge resolved, its adapter is **not** installed | stop. Name the forge, name the missing plugin, and say what to enable. Do **not** fall back to the other adapter, and do **not** issue calls of your own |
| No forge resolved | stop. Say what was tried — URL, variable, remote — and ask |

**Never hand-roll the mechanics.** A transport that issues its own platform calls because the engine was absent puts the call shapes in a second place, and the copy is the one that goes stale. The port exists to keep exactly one.

## Reporting

Say which forge you resolved and from what, in one line, before the first operation: `Forge: github (from the git remote).` A wrong resolution is cheap to correct at that point and expensive afterwards, because everything downstream is addressed to the wrong platform.

## Common mistakes

- **Defaulting to `ado` because this marketplace grew up there.** There is no default. Step 4 is to stop.
- **Reading the environment variable before the URL.** A pasted URL is the more specific statement.
- **Loading `forge-ops` by bare name with both adapters enabled.** Qualify it.
- **Falling back to the other adapter** when the resolved one is missing. That silently targets the wrong platform with the right-looking output.
- **Resolving once and assuming it holds for a second item.** Several items in one run may name different forges; resolve per item.

## Verification

1. In an Azure DevOps checkout with `TERYLON_FORGE` unset, the skill returns `ado` and names the remote as the source.
2. In a GitHub checkout with `TERYLON_FORGE` unset, it returns `github`.
3. With `TERYLON_FORGE=github` in an Azure DevOps checkout, it returns `github` — the variable outranks the remote.
4. Given a `github.com` pull request URL in an Azure DevOps checkout with `TERYLON_FORGE=ado`, it returns `github` — the URL outranks both.
5. With no remote and no variable, it stops and asks, naming all three sources it tried.
6. With the forge resolved but its adapter not installed, it stops, names the plugin to enable, and issues no platform call.
7. With both adapters enabled, the engine is addressed plugin-qualified.
