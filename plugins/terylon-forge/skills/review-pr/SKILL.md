---
name: review-pr
description: Use when the user provides a pull request URL from either forge (dev.azure.com/…/pullrequest/N
  or github.com/…/pull/N) and asks for a code review, or asks to post review comments / suggestions to it.
  Optional flags --auto and --dry-run.
allowed-tools: Bash(git *), Bash(gh *), Read, Grep, Glob, Write, Agent, mcp__plugin_terylon-ado_ado__*
---

# Pull Request Code Review

You review a pull request end-to-end, on either forge, and post findings back to it
as inline `` ```suggestion `` blocks for line-scoped issues, or PR-wide threads for
conceptual ones. Per-language rules are handled by `code-review` from the conventions of
the surrounding code.

## Usage

```
/review-pr <PR-URL> [--auto | --dry-run]
```

- `<PR-URL>` — required, in either forge's PR URL — `dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}` or `github.com/{owner}/{repo}/pull/{n}`. Its host is what `resolve-forge` reads first.
- `--auto` — post any issue scored ≥80 immediately, no confirmation.
- `--dry-run` — never post; only report in chat.
- Default — summarize in chat, wait for explicit user confirmation ("push", "post"), then post.

## Prerequisites

- **An adapter enabled** — `terylon-ado` or `terylon-github`. The port registers no server of its own: the adapter supplies `forge-ops`, and on Azure DevOps the `ado` MCP server with it. `resolve-forge` decides which one a run targets, and a missing adapter stops the run rather than being worked around.
- The PR's repo cloned locally; current working directory is that clone (so `git diff` works against fetched refs).
- **REQUIRED SUB-SKILL: `code-review`** (from `terylon-git`, loaded by name). This skill delegates review judgment to `code-review`; it handles only transport (PR URL → diff → ADO threads). `terylon-forge` declares `dependencies: ["terylon-git"]`, so the engine is always installed alongside it.

## Workflow

### 1. Parse PR URL & resolve the repo

Resolve the forge first (`resolve-forge`), then load that adapter's mechanics once — its `forge-ops` skill, by name and plugin-qualified. It is the single source of truth for parsing the PR URL into its coordinates and for resolving the repository identity. Follow its `parse-pr-url` and `resolve-repo-id` operations, issuing the calls yourself with whatever tool or command each recipe names. Keep what `resolve-repo-id` returned and pass it on unchanged.

### 2. Eligibility check

Fetch PR metadata and list existing threads using the `fetch-pr-metadata`, `list-threads`, and `detect-prior-run` operations, following the adapter's `forge-ops` reference; you issue the calls yourself.

Skip with a chat message if any of:

- `isOpen` is false — the pull request is completed, abandoned, closed or merged.
- `isDraft` is true.
- A prior Claude review already exists — the `detect-prior-run` recipe greps existing threads for the version-less sentinel `Generated with [Claude Code]`. If found, re-running should be opt-in (ask the user to confirm before proceeding).

**Read `eligibility-check`'s normalised verdict, never a raw field.** One forge reports this as a number and the other has no field of that name at all, so a test written against the English words matches nothing on both and the gate fails **open** — which is how a run posts to a pull request somebody already merged.

### 3. Build the diff locally

Follow the `build-pr-diff` recipe, **profile (a)**, in the adapter's `forge-ops` reference: merge-base `origin/<target>` `origin/<source>` for `$BASE`, the PR's normalised **`headSha`** for `$HEAD`, then `git diff --name-only $BASE..$HEAD`. Both forges report a head commit; only its field name differs, and the normalised key is why this line does not have to know which.

Never use `git diff HEAD` — it picks up unrelated commits. Always merge-base of the PR's source/target branches.

`<target>` and `<source>` are the PR's own **`targetBranch` / `sourceBranch`** — the normalised keys, already stripped of whatever ref prefix their forge uses — never a hard-coded branch name. If `targetBranch` is absent or does not resolve locally, detect the repo's default branch instead:

```bash
BASE_BRANCH=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')
# fallback: first of main / master / develop that resolves via `git rev-parse --verify origin/<ref>`
```

Report the branch you settled on before diffing.

### 4. Delegate review to `code-review`

Invoke the `code-review` skill (from `terylon-git`, **loaded by name** — never by path) with:
- `--scope=pr`
- `--base=<merge-base sha>` (from the `git merge-base` step above)
- `--head=<headSha>` — the PR's normalised head commit, from step 3
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

The PR may have been completed mid-review. Re-fetch metadata via the `fetch-pr-metadata` recipe in the adapter's `forge-ops` reference; abort posting if `isOpen` went false or `isDraft` flipped true.

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
  location, span ≤ 10 lines, single file. Anchor it with the file path and the span, **in the
  shape `forge-ops` documents** — the leading slash and the end-line arithmetic differ between
  forges, and each is rejected by the other.
- **PR-wide** (top-level thread, no anchor) — only when (a) there is no concrete
  single-spot patch, (b) the change is genuinely multi-file with no representative anchor
  location, or (c) the finding is an open design question with no committed fix yet.

Before posting, Read the adapter's `forge-ops` reference and follow its `post-pr-thread` recipe for the exact request shape, anchor fields and status enums — that one recipe covers both the inline (anchored) and PR-wide shapes. Issue the `post-pr-thread` call yourself, with the tool that recipe names — never a tool name copied from here, which is exactly how a server upgrade breaks nine files at once.

## Comment formatting (mandatory)

Every comment body:

1. Body explains the *why* in 1–4 sentences. Cite specific file/line/commit-sha.
2. For inline: include a `` ```suggestion `` block with the proposed replacement text.
   The block content REPLACES the lines the anchor covers — make sure indentation
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

- Writing the comment's file path in the shape the *other* forge wants — one requires a leading `/` and rejects the request without it, the other requires its absence. `forge-ops` states which
  (returns 200 but creates a non-inline thread).
- Mismatched indentation in the suggestion block — preview shows wrong replacement, author rejects.
- Skipping the second eligibility check — posting on a just-completed PR creates noise.
- `git diff HEAD..origin/<branch>` picks up unrelated base-branch commits. Always use `git merge-base`.
- Hard-coding a base branch name. The base is the PR's own `targetBranch`; where no PR metadata is available, detect it via `git symbolic-ref --short refs/remotes/origin/HEAD`.
- Re-running the skill on a PR you already reviewed will spam threads. The eligibility check
  prevents this — do not bypass it.
- The `update-thread-status` operation cannot move an anchor. A PR-wide
  thread cannot be promoted to inline — you have to close it and create a new inline thread,
  which leaves the closed PR-wide as visible clutter on the PR. Commit to inline-vs-PR-wide
  on the first pass; do not post PR-wide "to be safe" with a plan to demote later.

## Verification

> The `<PR-URL>` / `<id>` below are **placeholders** — substitute any open PR in a repo you have cloned locally. This is an illustrative example, not a fixed test target.

1. `/review-pr <PR-URL> --dry-run` from a local clone of the PR's repo. Expect: a chat summary of findings (confidence ≥80) and **no** comments posted to the PR (its thread count is unchanged).
2. Re-run without `--dry-run`. Expect: the same summary, a confirmation prompt, then on `push` a `post-pr-thread` call carrying a `` ```suggestion `` block for a line-scoped finding.
3. Confirm with the `list-threads` operation for `<id>`: the new thread comes back anchored to the file and span you intended.
