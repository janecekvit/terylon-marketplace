# Terylon Marketplace

Internal Claude Code plugin marketplace distributed into product repositories through `extraKnownMarketplaces`.

@README.md

## Structure

```
/.claude-plugin/marketplace.json   root manifest
/plugins/<slug>/                   one directory per plugin
/plugins/CLAUDE.md                 authoring conventions — read before editing a plugin
/docs/terylon/                     terylon working tree: intake, specs, plans, ledgers (gitignored)
```

**All of `/plugins` is the distribution boundary.** Anything inside is consumed by other repos; anything outside stays local.

## Plugins

```
terylon-core                      methodology + measurement — no git, no forge, no MCP server
terylon-git                       git only — no forge, no MCP server
├── terylon-devops                + Azure DevOps
│   ├── terylon-product           + user stories, Feature specs
│   └── terylon-test              + verifying a test plan and acceptance criteria (pulls terylon-core)
└── terylon-dev                   + the build pipeline (pulls terylon-core)
```

`terylon-dev` declares `terylon-git` directly as well as through `terylon-devops`, because its `leader` dispatches `code-reviewer` whether or not Azure DevOps is in play.

`terylon-core`, like `terylon-git`, is a leaf with no dependencies and can be enabled on its own. It carries the methodology the pipeline runs on — `write-plan` for the plan format, `run-build-loop` for the controller mechanics — and the measurement: `measure-token-spend` plus a `SubagentStop` hook that records per-agent spend as a run proceeds, without anything having to invoke it. `terylon-dev` and `terylon-test` both pull it.

**`terylon-core` replaced `terylon-metrics`, which no longer exists.** A consumer enabling `terylon-metrics@terylon` renames the key to `terylon-core@terylon`; skills are addressed by name, so nothing that loaded `measure-token-spend` changes.

**`superpowers` is no longer a dependency.** The six skills `terylon-dev` used from it are gone: three were replaced by shorter equivalents (`write-plan`, `run-build-loop` in `terylon-core`, `finish-branch` in `terylon-git`), and three were dropped because the personas already carried them in full.

The boundary between the first two is the forge: everything in `terylon-git` needs git and nothing more. That is why the review pipeline is split — `code-review` and `code-reviewer` are local, `review-pr` and `pr-reviewer` carry the findings to ADO. `terylon-test` splits on the same seam: `verify-test-plan` needs a shell and a repository, while `update-pr-checklist` and `update-work-item-checklist` need Azure DevOps and so live in `terylon-devops` with the rest of it.

Component layout and the full dispatch chain: `plugins/CLAUDE.md`.

## Azure DevOps

| | |
|---|---|
| Organisation | `janecekvit` (default; override with the `TERYLON_ADO_ORG` env var) |
| Project | `Dev` |
| Repo | `TerylonMarketplace` |
| MCP server | `@azure-devops/mcp@2.9.0` (pinned) via `plugins/terylon-devops/.mcp.json` |

The table above is this repository's **own** identity. A consuming repository targets its own organisation by setting `TERYLON_ADO_ORG`; the `.mcp.json` reads it at server startup (`${TERYLON_ADO_ORG:-janecekvit}`), and project / repo derive from the consuming repository's git remote at runtime. See the *Point it at your Azure DevOps organization* section in `README.md`.

## Language

**Everything committed to this repo is written in English** — skills, agents, reference documents, `README.md`, `CLAUDE.md`, rules, code comments, identifiers, and commit messages alike.

This holds regardless of the language the work is discussed in. Sessions are held in whatever language suits the people in them; the artifacts they produce are English either way. The repo is the product, the conversation is not, and the repo outlives the conversation that shaped it.

There are no exceptions. A file that acquires a paragraph in another language is a defect, not a dialect.

## Platforms

The repo runs on **Windows and natively on Debian**. Everything scripted must work on both:

- Hooks are **Node.js** — they run on every tool call, and Node starts in ~106 ms against pwsh's ~384 ms.
- When PowerShell is what you are writing, invoke it as **`pwsh`**, never `powershell` (it does not exist on Debian).
- Paths are case-sensitive, scripts use LF line endings, hooks have no dependencies.
- **Binaries go through Git LFS.** `.gitattributes` tracks images, PDFs and archives. The repo is text-only today, so the rules are dormant — they exist so the first binary lands as a pointer instead of a blob nobody notices until the clone is slow. Run `git lfs install` once per clone.

## Rules

Details in `.claude/rules/`:

| Rule | What it covers |
|---|---|
| `git-workflow.md` | `main` is protected, only through a PR; consent for every commit; branch names |
| `scripting.md` | Node for hooks, full names over abbreviations, Allman braces, cross-platform |
| `markdown.md` | frontmatter, no wrapping for ADO, references by name, language |
| `claude-md-sync.md` | when to update CLAUDE.md after a change |

In short:

- Everything committed is in English, whatever language the work is discussed in.
- Bump the version in `plugin.json` on every commit that changes the plugin — without it the consumer does not receive the change. **Patch within a branch, minor on a new branch, major only when the user asks.** The digit follows the branch, never the size of the change.
- Work happens on a feature branch; `main` is reached only through a PR. Enforced by `.claude/hooks/git-guard.js`.
- Every commit requires explicit user consent.
- Skills are referenced **by name**, never by an `@` path or a `../` import.
- **Anything with a shape is drawn, not described** — an ASCII diagram for a call chain or dependency, a table for cases and what each selects. Prose is interpretable and these documents are read as instructions; structure removes the room. Applies to what the repo generates too, not only to what it commits.
