---
name: review-pr
description: Use when the user provides an Azure DevOps pull request URL (dev.azure.com/…/pullrequest/N)
  and asks for a code review, or asks to post review comments / suggestions to an Azure DevOps PR.
  Optional flags --auto and --dry-run.
allowed-tools: Bash(git *), Read, Grep, Glob, Write, mcp__plugin_terylon-devops_ado__*, mcp__ado__*
---

# Azure DevOps PR Code Review

You review an Azure DevOps pull request end-to-end and post findings back to the PR
as inline `` ```suggestion `` blocks for line-scoped issues, or PR-wide threads for
conceptual ones. Per-language rules are handled by `code-review` from the conventions of
the surrounding code.

## Usage

```
/review-pr <PR-URL> [--auto | --dry-run]
```

- `<PR-URL>` — required, of form `https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}`.
- `--auto` — post any issue scored ≥80 immediately, no confirmation.
- `--dry-run` — never post; only report in chat.
- Default — summarize in chat, wait for explicit user confirmation ("push", "post"), then post.

## Prerequisites

- The `ado` MCP server registered (see `plugins/terylon-devops/README.md`). Invoked on demand by the MCP host — no manual install needed beyond the `.mcp.json` entry.
- The PR's repo cloned locally; current working directory is that clone (so `git diff` works against fetched refs).
- **REQUIRED SUB-SKILL: `code-review`** (from `terylon-git`, loaded by name). This skill delegates review judgment to `code-review`; it handles only transport (PR URL → diff → ADO threads). `terylon-devops` declares `dependencies: ["terylon-git"]`, so the engine is always installed alongside it.

## Workflow

### 1. Parse PR URL & resolve the repo

Load the Azure DevOps mechanics reference once — Read `${CLAUDE_PLUGIN_ROOT}/skills/ado-mcp/references/ado-mcp.md` (sibling skill in this plugin). It is the single source of truth for parsing the PR URL into `org` / `project` / `repoName` / `prId` and for resolving `repositoryId`. Follow its `parse-pr-url` and `resolve-repo-id` recipes, issuing the `mcp__plugin_terylon-devops_ado__*` calls yourself. Keep the resolved `repositoryId` for all subsequent calls.

### 2. Eligibility check

Fetch PR metadata and list existing threads using the `fetch-pr-metadata`, `list-threads`, and `detect-prior-run` recipes in `${CLAUDE_PLUGIN_ROOT}/skills/ado-mcp/references/ado-mcp.md` (issue the `mcp__plugin_terylon-devops_ado__*` calls yourself).

Skip with a chat message if any of:

- `status` is `completed` or `abandoned`.
- `isDraft` is `true`.
- A prior Claude review already exists — the `detect-prior-run` recipe greps existing threads for the version-less sentinel `Generated with [Claude Code]`. If found, re-running should be opt-in (ask the user to confirm before proceeding).

### 3. Build the diff locally

Follow the `build-pr-diff` recipe, **profile (a)**, in `${CLAUDE_PLUGIN_ROOT}/skills/ado-mcp/references/ado-mcp.md`: merge-base `origin/<target>` `origin/<source>` for `$BASE`, the PR's `lastMergeSourceCommit.commitId` for `$HEAD`, then `git diff --name-only $BASE..$HEAD`.

Never use `git diff HEAD` — it picks up unrelated commits. Always merge-base of the PR's source/target branches.

`<target>` and `<source>` are the PR's own `targetRefName` / `sourceRefName` (strip the `refs/heads/` prefix) — never a hard-coded branch name. If `targetRefName` is missing or does not resolve locally, detect the repo's default branch instead:

```bash
BASE_BRANCH=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')
# fallback: first of main / master / develop that resolves via `git rev-parse --verify origin/<ref>`
```

Report the branch you settled on before diffing.

### 4. Delegate review to `code-review`

Invoke the `code-review` skill (from `terylon-git`, **loaded by name** — never by path) with:
- `--scope=pr`
- `--base=<merge-base sha>` (from the `git merge-base` step above)
- `--head=<lastMergeSourceCommit.commitId>`
- `--repo=<absolute path to the local clone>`

Per-language rules are handled by `code-review` from the conventions of the surrounding code. It also picks up the target repo's root and per-folder `CLAUDE.md` on its own — pass nothing extra for rules.

Receive structured findings (YAML):

```yaml
findings:
  - file: <path-relative-to-repo>
    startLine: <int>
    endLine: <int>
    kind: line | conceptual
    severity: blocker | issue | nit
    why: <1-3 sentence rationale>
    suggestedReplacement: |   # omit for conceptual
      <exact replacement text>
```

### 5. Score confidence (Haiku, 0–100)

For each finding returned by `code-review`, dispatch a Haiku agent with this rubric verbatim:

- **0** — false positive under light scrutiny, or pre-existing issue not introduced by this PR.
- **25** — possibly real, agent could not verify. Stylistic + not in CLAUDE.md.
- **50** — verified real but a nitpick or rare in practice.
- **75** — real, hits in practice, the PR's approach is insufficient. CLAUDE.md violations land here.
- **100** — definitely real, will happen frequently, evidence directly confirms it.

Filter to issues scoring ≥80.

### 6. Re-run eligibility check (defensive)

The PR may have been completed mid-review. Re-fetch metadata via the `fetch-pr-metadata` recipe in `${CLAUDE_PLUGIN_ROOT}/skills/ado-mcp/references/ado-mcp.md`; abort posting if `status` is no longer active or `isDraft` flipped true.

### 7. Post (or summarize)

Branch on flags:

- `--dry-run` → chat only, in the format below. Stop.
- `--auto` → post all filtered issues immediately. Print thread IDs.
- default → print chat summary in the format below. Wait for the user to say "push" / "post" /
  similar. Then post.

## Inline vs PR-wide decision

**Default to inline whenever a concrete patch exists at a single location.** The
`suggestion` block carries the patch; the body carries rationale, including "conceptual"
arguments and alternatives. A finding being conceptually motivated is not a reason to go
PR-wide — if there is one primary mechanical fix, post it inline and discuss alternatives
in prose underneath.

- **Inline** (`` ```suggestion `` block) — there is a concrete patch to propose at a single
  location, span ≤ 10 lines, single file. Use `threadContext` with `filePath` (must start
  with `/`), `rightFileStart`, `rightFileEnd`.
- **PR-wide** (top-level thread, no `threadContext`) — only when (a) there is no concrete
  single-spot patch, (b) the change is genuinely multi-file with no representative anchor
  location, or (c) the finding is an open design question with no committed fix yet.

Before posting, Read `${CLAUDE_PLUGIN_ROOT}/skills/ado-mcp/references/ado-mcp.md` and follow its `post-pr-thread` recipe for the exact thread JSON, `threadContext` fields, and `commentType` / `status` enums — that one recipe covers both the inline (with `threadContext`) and PR-wide (no `threadContext`) shapes. Issue the `mcp__plugin_terylon-devops_ado__repo_create_pull_request_thread` call yourself.

## Comment formatting (mandatory)

Every comment body:

1. Body explains the *why* in 1–4 sentences. Cite specific file/line/commit-sha.
2. For inline: include a `` ```suggestion `` block with the proposed replacement text.
   The block content REPLACES the lines covered by `threadContext` — make sure indentation
   (tabs vs spaces) matches the file exactly, otherwise the diff preview shows whitespace churn.
3. End with this footer, exactly:

```
---
*🤖 Generated with [Claude Code](https://claude.ai/code) — review-pr@<plugin-version> · <model> / <effort>*
```

`<plugin-version>` is read at runtime from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` (parse the `version` field once at the start of the run). `<model>` is the model the run executes under (e.g. `opus-4.8`) — the skill knows it from itself, as no environment variable exposes it. `<effort>` comes from the `CLAUDE_EFFORT` environment variable (e.g. `xhigh`); **when `CLAUDE_EFFORT` is unset, omit the entire ` · <model> / <effort>` segment.** The substring `Generated with [Claude Code]` is the sentinel for prior-run detection — everything variable sits after that stable prefix.

## Chat summary format (default + --dry-run)

```markdown
### PR review — <PR title> (#<id>)

Found <N> issues (confidence ≥80):

1. **<short title>** — <file>:<line>
   <2-line why>
   _Posting as: inline suggestion / PR-wide thread_

2. ...
```

Then: `Reply "push" to post these to the PR, or tell me which to skip.`

## Common mistakes

- Forgetting leading `/` in `threadContext.filePath` — Azure DevOps rejects the request silently
  (returns 200 but creates a non-inline thread).
- Mismatched indentation in the suggestion block — preview shows wrong replacement, author rejects.
- Skipping the second eligibility check — posting on a just-completed PR creates noise.
- `git diff HEAD..origin/<branch>` picks up unrelated base-branch commits. Always use `git merge-base`.
- Hard-coding a base branch name. The base is the PR's own `targetRefName`; where no PR metadata is available, detect it via `git symbolic-ref --short refs/remotes/origin/HEAD`.
- Re-running the skill on a PR you already reviewed will spam threads. The eligibility check
  prevents this — do not bypass it.
- `mcp__ado__repo_update_pull_request_thread` cannot change `threadContext`. A PR-wide
  thread cannot be promoted to inline — you have to close it and create a new inline thread,
  which leaves the closed PR-wide as visible clutter on the PR. Commit to inline-vs-PR-wide
  on the first pass; do not post PR-wide "to be safe" with a plan to demote later.

## Verification

> The `<PR-URL>` / `<id>` below are **placeholders** — substitute any open PR in a repo you have cloned locally. This is an illustrative example, not a fixed test target.

1. `/review-pr <PR-URL> --dry-run` from a local clone of the PR's repo. Expect: a chat summary of findings (confidence ≥80) and **no** comments posted to the PR (its thread count is unchanged).
2. Re-run without `--dry-run`. Expect: the same summary, a confirmation prompt, then on `push` a `mcp__ado__repo_create_pull_request_thread` call carrying a `` ```suggestion `` block for a line-scoped finding.
3. Confirm via `mcp__ado__repo_list_pull_request_threads(pullRequestId=<id>, ...)`: the new thread's `threadContext.filePath` starts with a leading `/`.
