# The Azure DevOps tools fail, or name an organisation nobody chose

An `mcp__ado__*` call fails on authorization or "not found", the organisation in the message is not one you work in, the sign-in to the `ado` server fails — or the `ado` tools are not present at all. Since #332 the server is Microsoft's remote one at `https://mcp.dev.azure.com`, registered at the user scope by `terylon-ado`'s `connect` skill and signed in once per person with OAuth; the organisation travels as `orgName` in **every call**, from `ADO_ORGANIZATION`.

## Symptom

One of four:

```
1  an authorization / not-found error naming an organisation you did not configure,
   or a call refused because orgName is empty

2  /mcp lists ado as "Needs authentication", or every ado call answers unauthorized

3  the browser sign-in for ado ends on an AADSTS error page
   (AADSTS9010010, or one naming the "organizations" authority, the client or the redirect URI)

4  no mcp__ado__* tools exist in the session at all
```

Symptom 4 is not an authentication problem — jump to cause D.

## Diagnosis

Run `terylon-ado`'s `check-access` first; it covers causes A, B and D in one read-only pass and prints no id:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/check-access/scripts/check-access.js"
```

```
  do mcp__ado__* tools exist in this session?
        │ no  ──▶ cause D — terylon-ado is not enabled, or connect never registered the server
        ▼ yes
  check-access: is ADO_ORGANIZATION set?
        │ no  ──▶ cause A — the required value is missing
        ▼ yes
  check-access: is it the bare organisation NAME, not a URL?
        │ no  ──▶ cause B — a URL was given where a name is expected
        ▼ yes
  /mcp: is ado connected?
        │ "Needs authentication"            ──▶ cause E — nobody has signed in on this machine
        │ sign-in fails with AADSTS9010010  ──▶ cause F — the server was registered with an organisation URL
        │ sign-in fails with another AADSTS ──▶ cause G — the tenant metadata, the ids or the app registration
        ▼ connected
  does the organisation match the repository you are targeting?
              ──▶ cause C — ADO_ORGANIZATION names somebody else's organisation
```

| Check | How | Reading it |
|---|---|---|
| What is set, and is the registration right? | `check-access`, as above | it names each missing or malformed variable, and whether the user-scope `ado` registration matches them. Exit `0` means all present and matching |
| Is the server registered at all? | `node "${CLAUDE_PLUGIN_ROOT}/skills/connect/scripts/connect.js" --check` | changes nothing; says whether `ado` is registered, missing or differs |
| Is anyone signed in? | `/mcp` | `ado` connected, or *Needs authentication* |
| What is the repository's own organisation? | `git remote get-url origin` | the first path segment after `dev.azure.com/` is the organisation `ADO_ORGANIZATION` should name |

## Fix

| Cause | Fix |
|---|---|
| **A** — unset | Set `ADO_ORGANIZATION` under `env` in your **own** `~/.claude/settings.json`. There is no default and there must not be one. The old `TERYLON_ADO_ORG` is ignored |
| **B** — a URL instead of a name | Use the bare name — the first path segment of `https://dev.azure.com/`**`contoso`**`/…`, not the URL. It goes into each call as `orgName`, never into the server's URL |
| **C** — the wrong organisation | Correct `ADO_ORGANIZATION`. `ADO_PROJECT` does not fix this — see *Gotchas* |
| **D** — no tools | Enable `terylon-ado@terylon` in `enabledPlugins` — `terylon-forge` **declares no adapter on purpose**, so the port alone registers nothing. Then set `ADO_MCP_CLIENT_ID` and `ADO_MCP_TENANT_ID`, run the `connect` skill, and start a new session |
| **E** — not signed in | In an interactive session: `/mcp` → `ado` → **Authenticate**, and finish the browser sign-in. On a remote box, forward the callback port first — `ssh -L 3118:localhost:3118 <box>` — and open the link in your PC's browser. A headless run cannot sign in; its token comes from Terylon's connector through its proxy (Terylon work item #337) |
| **F** — `AADSTS9010010` | The server was registered with `https://mcp.dev.azure.com/<org>`, whose RFC 8707 resource does not match the `.default` scope. Re-run `connect`: it registers the **root** URL, replacing the wrong entry, and you sign in again |
| **G** — another `AADSTS` error | Check, in order: `ADO_MCP_TENANT_ID` is the tenant the app registration lives in, and `connect` was re-run after it changed (an error naming the `organizations` authority means the metadata is not pinned to the tenant — a registration not made by `connect`, or made from the wrong tenant); `ADO_MCP_CLIENT_ID` is that app's client id; the app is a public client with the redirect `http://localhost:3118/callback`; and its delegated permissions on the *Azure DevOps MCP* enterprise app are admin-consented |

**Start a new session after changing a variable in your settings** — `env` is read when a session starts. After changing either id, re-run `connect` as well: a changed registration is removed and added again, and needs a new sign-in. With nothing changed, `connect` touches nothing and the sign-in is kept.

## Why it happens

The plugin ships no `.mcp.json` for the server. Inside a plugin `.mcp.json`'s `oauth` block neither `${VAR}` nor `${user_config.KEY}` is substituted — measured on Claude Code 2.1.296 and recorded in `plugins/terylon-ado/shared/ado-server.js` — and the client and tenant ids are configuration, not code. So `connect` registers the server at the user scope from your environment, and every failure above is one of three things being absent or wrong: the variables, the registration made from them, or the sign-in made through it.

```
  ADO_MCP_CLIENT_ID, ADO_MCP_TENANT_ID ──▶ connect ──▶ user-scope ado        causes D, F, G
                                                         │ /mcp sign-in      cause E
  ADO_ORGANIZATION ──▶ orgName in EVERY call ────────────┘                   causes A, B, C
```

Two values in the registration were forced by failures: the **root** URL, because an organisation URL fails with `AADSTS9010010`, and the metadata **pinned to the tenant**, because the root's own metadata names the `organizations` authority, which a single-tenant app cannot use.

**The organisation used to carry a hard-coded fallback, and removing it is why cause A now fails loudly** instead of silently targeting the marketplace author's organisation. That silent targeting was the old behaviour behind symptom 1 — worth knowing, because an old checkout of the marketplace can still produce it. The decision and its reasoning, along with why this repository commits no `env` block of its own, are in the root `CLAUDE.md` under *Azure DevOps*.

Everything else about an Azure DevOps target resolves on its own: project and repository from the consuming repository's git remote at runtime, and the forge itself from [`flows/forge-resolution.md`](../flows/forge-resolution.md).

## Gotchas

**`ADO_PROJECT` exists but is almost never the answer.** It overrides the project for the rare repository whose git remote is not its Azure DevOps project. Setting it to work around cause C hides a wrong organisation behind a right-looking project.

**A write refused in a headless run is not this runbook.** A write through `ado` from `claude -p` was refused by the auto-mode classifier as a write to an external system; it goes through in an interactive session or with an operator's permission rule. Reads in the same run succeed, which is how to tell it apart.

**A GitHub-hosted repository needs none of this.** `terylon-github` registers no server and reads the owner from the remote; authentication is whatever `gh auth login` established.

**Symptom 4 with both adapters enabled is a different problem.** Enabling both is supported; the run picks one via `TERYLON_FORGE`, and the engine must be addressed plugin-qualified. Tools missing there means the *other* adapter was selected, not that anything failed.

## Where it lives

| File | Role |
|---|---|
| `plugins/terylon-ado/skills/check-access/SKILL.md` | `check-access` — the read-only diagnosis of the four variables and the registration |
| `plugins/terylon-ado/skills/connect/SKILL.md` | `connect` — registers the `ado` server at the user scope; `--check` changes nothing |
| `plugins/terylon-ado/shared/ado-server.js` | `wantedServer` — the root URL, the pinned metadata, and the measurement that keeps the server out of a `.mcp.json` |
| `plugins/terylon-ado/README.md` | the consumer-facing setup for this adapter |
| `plugins/terylon-forge/.claude-plugin/plugin.json` | `dependencies` — no adapter, which is why the port alone registers no server |
| `plugins/terylon-forge/skills/resolve-forge/SKILL.md` | `resolve-forge` — what a run does when the forge resolves but the adapter is absent or unreachable |
| `CLAUDE.md` | *Azure DevOps* — why there is no default organisation and no committed `env` block |
| `docs/flows/forge-resolution.md` | how the platform is chosen, and why the organisation is not part of that choice |
