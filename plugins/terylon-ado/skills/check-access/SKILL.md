---
name: check-access
description: "Use when Azure DevOps calls fail, hang, or answer 401, or before trusting a fresh install: reports whether this environment can reach Azure DevOps and names exactly what is missing. Read-only — it writes nothing and never prints the token."
allowed-tools: Bash(node *), Read
---

# check-access — can this environment reach Azure DevOps?

Reports the three things the server needs, says which are missing, and optionally makes one authenticated call to prove the credential works.

**It writes nothing.** `AGENTS.md` states the rule this follows: a driver names the credential that is missing and refuses. A script that configures a secret is a script that has read one.

## Usage

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/check-access/scripts/check-access.js" [--live]
```

Without `--live` it inspects the environment only, which is instant and offline. With `--live` it additionally issues one `GET /_apis/projects` and reports the status.

Exit code is `0` when everything needed is present, `1` otherwise.

## What it checks, and why each one is worth checking

| | |
|---|---|
| `TERYLON_ADO_ORG` | required, no default. Set by the consuming repository |
| `PERSONAL_ACCESS_TOKEN` | required by the `pat` type — **and its encoding is checked, not just its presence** |
| `TERYLON_ADO_AUTHENTICATION` | optional, `pat` by default; rejected if it is not a type the server accepts |

**The encoding check is the reason this exists.** Azure DevOps Basic auth puts the token in the password field and leaves the user empty, so the value wants `base64(":" + token)`. The server documents it as "base64-encoded Personal Access Token", which reads as the token alone — and that spelling answers **401 from a token that is perfectly valid**. A 401 sends a reader to check expiry, scopes and organisation: everywhere except the one line that is wrong.

```text
  PERSONAL_ACCESS_TOKEN=$(printf %s   "$PAT" | base64 -w0)   -->  401
  PERSONAL_ACCESS_TOKEN=$(printf ':%s' "$PAT" | base64 -w0)   -->  works
```

This was measured against a live organisation with one valid token, changing nothing but the encoding — and then hit again, by accident, an hour after being written down. The failure gives no hint of its own cause, which is what a check is for.

## What it deliberately does not do

- **It sets nothing.** Not the organisation, not the token, not the type.
- **It never prints the token**, in any state — not valid, not malformed, not absent. Its report says how many characters follow the colon, never what they are.
- **It does not decide the authentication type for you.** `pat` is this plugin's default because it is the only type that fails immediately when unconfigured; `azcli`, `envvar`, `env` and `interactive` are all accepted, and `interactive` is right only where a human is present to answer a prompt.

## Verification

- **Unit tests:** `node --test "plugins/terylon-ado/skills/check-access/scripts/check-access.test.js"` — pass the test **file**, not the directory. They cover the Basic-auth form, a bare token, a colon with nothing after it, a value that is not base64 at all, and that the token never reaches the reported detail in any of those states.
- **The not-base64 case is caught by a round trip rather than an exception**, because `Buffer.from` ignores what it cannot decode instead of throwing. Without it, a raw PAT pasted in unencoded would decode to bytes, fail the leading-colon test, and be reported with the wrong reason.
