---
name: forge-ops
description: >-
  Use when a Terylon transport skill needs GitHub mechanics — URL parsing, repository identity,
  pull request and issue metadata, diffs, review threads and comments, eligibility, and the GitHub
  posting conventions. The GitHub body of the terylon-forge port. Internal mechanics library for
  other skills, not a user command.
allowed-tools: Read, Grep, Glob, Bash(git *), Bash(gh *)
---

# forge-ops — the GitHub adapter

The **GitHub body of the `terylon-forge` port**. It carries the same operations the port declares, implemented with the `gh` CLI, so a transport written against the port runs unchanged on GitHub.

This skill is a **mechanics library rather than a user command**. Its normal caller is a transport skill in `terylon-forge` that has already resolved the forge; a user invoking it directly gets a catalogue of recipes rather than an action.

Its sibling is `terylon-ado:forge-ops`, the same catalog against Azure DevOps. **Two bodies, one contract.** When the two disagree about what an operation means, the port's declaration in `terylon-forge` decides, and one of the bodies is wrong.

The single source of truth for the recipes is:

```
${CLAUDE_PLUGIN_ROOT}/skills/forge-ops/references/forge-ops.md
```

## Why the CLI and not an MCP server

| | `gh` CLI | GitHub MCP server |
|---|---|---|
| Install | already present on both platforms this repo supports | Docker image, or a hosted endpoint |
| Credentials | whatever `gh auth login` established | a personal access token in configuration |
| Context cost | none until a command runs | every tool schema, every session |
| Coverage | `gh api` reaches anything the REST and GraphQL APIs expose | the tools the server chose to expose |

The adapter therefore **registers no MCP server at all**, and a repository that enables it pays nothing for the ones it does not use.

## Prerequisites

- **`gh`**, authenticated (`gh auth login`). Verified working at 2.92.0.
- A local clone, so the diff recipes have something to diff.

**Check authentication before the first write, not after.** `gh auth status` costs one call and turns an authorization failure halfway through a posting sequence into a refusal before anything is written.

## What it owns vs. what it does NOT own

**Owns (mechanics only):** the exact `gh` invocations and their JSON field selectors; URL parsing; repository identity; pull request and issue metadata; diff recipes; review-thread and comment shapes; the inline-anchor arithmetic; label and sub-issue mechanics; raw eligibility flags and prior-run sentinel detection.

**Does NOT own (caller-side judgment):** footer stamping and version resolution; eligibility *decisions*; thread classification; the inline-versus-PR-wide choice; all generation, scoring and tone. **This skill never stamps a footer.**

## Operation catalog

| Operation | `gh` mechanism |
|---|---|
| `parse-pr-url` | string — `github.com/{owner}/{repo}/pull/{n}` |
| `parse-item-url` | string — `github.com/{owner}/{repo}/issues/{n}` |
| `resolve-repo-id` | `{owner}/{repo}`; no lookup call, unlike the ADO GUID |
| `fetch-pr-metadata` | `gh pr view <n> --json state,isDraft,author,headRefName,baseRefName,headRefOid,mergeable,body,url` |
| `eligibility-check` | the same fetch; flags are `state`, `isDraft`, `author.login` |
| `detect-prior-run` | `gh api repos/{owner}/{repo}/pulls/{n}/comments` plus `gh pr view --json comments` |
| `list-threads` | review comments grouped by `in_reply_to_id`, plus issue comments as PR-wide threads |
| `list-thread-comments` | the group from `list-threads`; there is no per-thread endpoint |
| `post-pr-thread` | inline: `gh api …/pulls/{n}/comments`; PR-wide: `gh pr comment` |
| `reply-to-thread` | `gh api …/pulls/{n}/comments -F in_reply_to=<comment-id>` |
| `update-thread-status` | GraphQL `resolveReviewThread` / `unresolveReviewThread` |
| `update-pr-description` | `gh pr edit <n> --body-file <path>` |
| `fetch-work-item` | `gh issue view <n> --json number,title,body,state,labels,comments,url` |
| `build-pr-diff` | git — identical to the ADO body, no forge involved |
| `create-work-item` | `gh issue create --title --body-file --label` |
| `link-work-item-parent` | `gh api repos/{owner}/{repo}/issues/{n}/sub_issues -F sub_issue_id=<database-id>` |
| `update-work-item` | `gh issue edit <n> --body-file <path>` |
| `create-pull-request` | `gh pr create --base --head --title --body-file` |
| `list-linked-items` | `gh pr view <n> --json closingIssuesReferences` |
| `link-work-item-to-pull-request` | a closing keyword in the PR body — `Closes #N` |
| `check-preconditions` | `gh auth status` |
| `list-pull-requests` | `gh pr list --head <branch> --state all --json number,state,isDraft,author` — returns the normalised `isOpen` / `isDraft` / `author` |
| `resolve-current-user` | `gh api user --jq .login` |
| `resolve-identity` | `gh api users/{login}` — the login **is** the identifier |
| `add-reviewers` | `gh pr edit <n> --add-reviewer <login>` |
| `set-auto-merge` | `gh pr merge <n> --auto --squash` (or `--merge` / `--rebase`) |
| `item-comments-read` | `gh issue view <n> --json comments` |
| `item-comment-post` | `gh issue comment <n> --body-file <path>` |

Read `references/forge-ops.md` for each operation's exact arguments, JSON shape and gotchas.

## The five asymmetries a transport must not paper over

These are where the two bodies genuinely differ. The port declares the difference; this table says which side GitHub is on.

| Concern | GitHub | The trap |
|---|---|---|
| Description length | ~65 536 characters | far larger than ADO's 4 000, so a transport that budgets to the smaller number is merely conservative, never wrong. **Keep the brevity rules anyway** — they exist for the reader, not for the field |
| Acceptance criteria | a section of the issue **body** | there is no dedicated field. The port normalises both to markdown, so the section heading is the contract and a transport must not invent a second location |
| Item type | a **label**, plus the sub-issue relation for hierarchy | nothing enforces it. A missing label is a convention violation, not an API error, so it fails silently |
| Line breaks | soft-wrapped by the renderer | the "never hard-wrap" rule still holds. It is right on both, for different reasons |
| Thread status | resolvable only through **GraphQL** | the REST comment object has no status field. A transport asking for one gets nothing and must not read that as "unresolved" |

**Identifiers are the other place to be careful.** GitHub carries two numbers for the same issue — the `number` a human sees and the `id` the database uses — and the sub-issue endpoint wants the second. Passing the first is accepted-looking and wrong.

## Delegation contract

`forge-ops` centralises **knowledge** only. Every transport still issues its own `gh` invocations following these recipes, holds `Bash(gh *)` in its own `allowed-tools`, and assembles its own footer. **This skill never resolves a version and never stamps a footer.**

- **Transports in `terylon-forge`** load this skill **by name**, plugin-qualified as `terylon-github:forge-ops` once `resolve-forge` has returned `github`.
- **`${CLAUDE_PLUGIN_ROOT}` is plugin-local**, so it addresses this plugin's own files and nothing else. A caller in another plugin reaches the reference by loading this skill, never by a path.

## Verification

1. `gh auth status` succeeds before any write is attempted.
2. `fetch-pr-metadata` on a real pull request returns `state`, `isDraft` and `author.login`, and the values drive the eligibility decision in the caller rather than here.
3. `post-pr-thread` with a path and a line creates an **inline** review comment on the right side; the same call without them creates a PR-wide comment.
4. `reply-to-thread` attaches to the existing thread rather than starting a second one.
5. `update-pr-description` replaces only the caller's marked region; content outside it survives.
6. `create-work-item` produces an issue whose body carries the acceptance-criteria section as a markdown task list.
7. `link-work-item-parent` establishes the sub-issue relation, and it is verified by reading the parent back rather than from the create response.
8. `build-pr-diff` produces the same output as the Azure DevOps body for the same branch — it is git, and nothing about it is forge-specific.
