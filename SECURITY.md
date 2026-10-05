# Security policy

## Reporting a vulnerability

**Do not open a public issue for a vulnerability.** Report it privately through GitHub: on [the repository's Security tab](https://github.com/janecekvit/terylon-marketplace/security), choose **Report a vulnerability**. Only the maintainer sees the report.

Include what you can of:

| What | Why it helps |
|---|---|
| the plugin and its version, from its `plugin.json` | the marketplace ships eight plugins, each versioned on its own |
| what a skill, agent or hook did that it should not have | a prompt, a command it ran, a file or a forge it wrote to |
| how to reproduce it | the smallest repository and request that shows it |

A confirmed issue is fixed in a new version of the plugin it affects, and the fix is named in the release notes.

## What is in scope

Everything under `plugins/` — the skills, agents, hooks and MCP server configuration that a consuming repository installs and runs. The tests under `tests/` are not distributed, but a defect there that could leak a credential is in scope too.

## Supported versions

Only the latest version of each plugin on `main` is supported. Claude Code re-fetches a plugin when its version changes, so a fix reaches a consumer through the normal update.
