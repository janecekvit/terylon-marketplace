---
name: create-pr
description: >-
  Use when the user wants to open an Azure DevOps pull request for the current branch — creates the
  PR, associates the work items it belongs to, fills the description via write-pr-description, and
  can add reviewers and set auto-complete. Triggers on phrasings like "create a PR", "open a pull
  request", "raise a PR for this branch", "PR for this work item". Optional flags --auto and --dry-run.
allowed-tools: Bash(git *), Read, Grep, Glob, mcp__plugin_terylon-devops_ado__*
---

# create-pr

Opens a pull request for the current branch and wires up what belongs around it: the work items, the description, optionally reviewers and auto-complete.

**This skill owns the PR *shell*; `write-pr-description` owns the PR *body*.** Never generate a description here — delegate it. The split keeps the length budget and the brevity rules in exactly one place.

## Usage

```
/create-pr [--base=<ref>] [--title=<text>] [--draft]
           [--work-items=<id>[,<id>…] | --no-work-items]
           [--reviewers=<email>[,<email>…]]
           [--auto-complete[=<strategy>]] [--delete-source-branch]
           [--auto | --dry-run]
```

| Flag | Behaviour |
|---|---|
| `--base=<ref>` | Target branch. Default: the detected integration branch (step 1). |
| `--title=<text>` | PR title verbatim. Default: derived from the commits (step 6). |
| `--draft` | Create as a draft. |
| `--work-items=<ids>` | Associate exactly these ids, skipping detection. `--no-work-items` associates none. Default: detect and propose. |
| `--reviewers=<emails>` | Add these people as **optional** reviewers. Required reviewers are not settable here — see step 9. |
| `--auto-complete[=<strategy>]` | Set auto-complete. `no-ff` (default), `squash`, `rebase`, `rebase-merge`. **Never applied without a typed confirmation.** |
| `--delete-source-branch` | Delete the source branch when auto-complete merges. Only meaningful with `--auto-complete`. |
| `--auto` | Apply the mechanical steps — create, associate work items — without pausing. Does **not** cover push, reviewers, or auto-complete. |
| `--dry-run` | Never write. Print the plan and stop. |
| _(default)_ | Print the plan, wait for `push` / `apply` / `go`. |

## Prerequisites

- A local clone, checked out on the branch the PR opens from.
- The `ado` MCP server, auto-registered by this plugin's `.mcp.json`.

## Required sub-skills

Both are hard dependencies. This skill is transport: it owns the *sequence* and the *gates*, nothing else.

- **`ado-mcp`** (same plugin) — owns every Azure DevOps mechanic used here: repository-id resolution, PR metadata and creation, work-item detection and linking, identity resolution, reviewers, auto-complete, field encodings and enums. **Load it before the first `mcp__ado__*` call of the run.** The call shapes restated below are a convenience copy; **where the two disagree, `ado-mcp` wins** — it is the file corrected when the pinned `@azure-devops/mcp` version is bumped, and the tool schemas do change between versions.
- **`write-pr-description`** (same plugin) — owns description generation, the length budget, the sentinel and the locate-or-append logic. This skill calls it and posts what it returns.

At runtime the tools are namespaced `mcp__plugin_terylon-devops_ado__*`; the bare `mcp__ado__*` names below are shorthand for that form.

## Shape of a run

```
create-pr
├── 1  preflight — branch, remote, repository id, base
├── 2  existing PR? ──▶ top-up mode (skip 8, run 8b/8c)
├── 3  is the branch pushed? ......... asks ✓ always
├── 4  detect work items
├── 5  description ──▶ write-pr-description
├── 6  title
├── 7  confirm the plan ............. asks ✓ (--auto skips, for 8 and 8b only)
├── 8  create the PR      │ 8b link work items (top-up)
│                         │ 8c delegate the description (top-up)
├── 9  reviewers .................... asks ✓ always, even under --auto
├── 10 auto-complete ............... asks ✓ typed confirmation, never under --auto
└── 11 report
```

---

## Workflow

### 1. Preflight

Refuse and stop if any holds:

| Condition | Why |
|---|---|
| HEAD is the integration branch | Work happens on a feature branch. Offer to create one. |
| HEAD is detached | No source ref to open a PR from. |
| No commits ahead of the base | Nothing to review. Report "no commits ahead of `<base>`". |

This skill takes no URL, so derive the coordinates from the clone:

```bash
git remote get-url origin        # https://dev.azure.com/{org}/{project}/_git/{repo}
```

An `ssh://` remote (`git@ssh.dev.azure.com:v3/{org}/{project}/{repo}`) carries the same three segments in the same order. If the remote is not an Azure DevOps URL, stop — there is no PR to create here. **If it names an organisation other than the one the `ado` server was launched with** (`TERYLON_ADO_ORG`), stop and say so rather than issuing calls against the wrong org.

Resolve the repository once — one call yields everything later steps need:

```
repo_repository(action="get", repositoryNameOrId=<repo>, project=<project>)
```

- `id` → `repositoryId` (GUID) for every `repo_*` call
- `project.id` → `projectId` (GUID), mandatory for work-item linking

**Resolve the base by the same chain `write-pr-description` uses**, so the two never disagree about what the PR is diffed against:

1. `--base=<ref>` if given.
2. Otherwise the detected integration branch:

   ```bash
   BASE=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')
   ```

3. If `origin/HEAD` is unset, the first of `main`, `master`, `develop` that resolves.

**Report the chosen base** so a wrong guess is visible. Then:

```bash
git fetch origin <base>
BASE_SHA=$(git merge-base HEAD origin/<base>)
git log --oneline $BASE_SHA..HEAD
```

### 2. Is there already a PR?

```
repo_pull_request(action="list", repositoryId, project,
                  sourceRefName="refs/heads/<branch>", status="All")
```

| Result | Mode |
|---|---|
| An **active** PR exists | **Top-up mode.** Skip step 8; use 8b for work items and 8c for the description. Apply only the steps whose inputs are missing and say which parts were already in place. **Re-derive `<base>` from the PR's own `targetRefName`** (strip `refs/heads/`) unless `--base` was given — the existing PR's target is the truth, not step 1's guess — and redo the `merge-base` against it. |
| Only **completed / abandoned** PRs | Report them and ask before opening a new one from the same branch. |
| None | Normal creation. |

Top-up is the common case after a half-finished run: the branch is pushed and the shell exists, but the description or the work-item link never landed.

### 3. Is the branch pushed?

PR creation reads the source branch **from the server**, so an unpushed or stale branch produces a PR of the wrong code.

```bash
git fetch origin <branch>                            # may fail — the branch may not exist there yet
git merge-base --is-ancestor HEAD origin/<branch>    # exit 0 => the server has everything local has
```

Fetch first; comparing against a stale tracking ref proves nothing.

| Outcome | Meaning | Action |
|---|---|---|
| exits **0** | `origin/<branch>` contains `HEAD` | Proceed. |
| exits **1** | Local commits missing from the server, or diverged | **Stop and ask permission to push.** |
| `origin/<branch>` does not resolve | Never pushed | **Stop and ask permission to push.** |

**Note the direction:** `HEAD` must be the *ancestor*. Testing it the other way round passes exactly the case this step exists to catch.

Every individual push needs a green light, so `--auto` does **not** cover this. Never `--force`.

### 4. Detect work items

Skipped entirely under `--no-work-items`. With `--work-items=<ids>` the user has spoken — validate them, but do not run the ladder.

Read what is already linked from metadata you fetch anyway: `repo_pull_request(action="get", …, includeWorkItemRefs=true)` → `workItemRefs: [{ id, url }]`. **Ids come back as strings** — coerce before comparing. Already-linked items are reported as such and are never link targets.

| Rung | Source | Pattern | Confidence |
|---|---|---|---|
| A | Branch name | `^[a-z]+/(\d{4,7})-` | high |
| B | Commit subjects and bodies in `$BASE_SHA..HEAD` with a strong verb (`Implements`, `Fixes`, `Closes`, `Resolves`) | `(^\|[^A-Za-z0-9_/#-])#(\d{4,6})\b` | high |
| C | Same range, bare mention | same | medium — propose, never auto-select |

```bash
git log --format='%s%n%b' $BASE_SHA..HEAD | grep -vE '^Merged PR [0-9]+:'
```

The `[^A-Za-z0-9_/#-]` guard before `#` is load-bearing — it rejects `AB#123` and `github.com/org/repo#456`. Dropping the `Merged PR` lines matters on branches that merged the base back in.

**Plausibility gate — mandatory.** A work item existing proves nothing: Azure DevOps PR ids and work-item ids are separate sequences that collide head-on, so a branch named `fix/review-23678` can resolve to a real but unrelated work item from years earlier. Demote a candidate to **low** — propose with a warning, never auto-select — when any holds:

- `System.CreatedDate` predates the repo's first commit (`git log --reverse --format=%aI origin/<base> | head -1`)
- `System.WorkItemType` is one that cannot be implemented by a branch, such as `Code Review Response`
- the number appears in history as `Merged PR <id>:` — it is a PR id, not a work item

**Validate one candidate per call.** `wit_work_item(action="get_batch")` returns `null` for the **entire batch** if a single id is unknown, so a batch of untrusted ids tells you nothing about the good ones. A `null` conflates not-found, deleted and no-permission — report "could not be resolved", never "does not exist".

Present survivors as `#<id> — <type>: <title> (<state>)` and let the user drop any.

### 5. The description — delegate, and let the mode decide who posts it

The description always comes from **`write-pr-description`**. The mode decides *who writes the field*:

| Mode | Here | Who writes it |
|---|---|---|
| **Creation** | Invoke `write-pr-description --dry-run --base=<base>` now and take its output **verbatim** — do not rewrite, re-wrap or append. | **This skill**, in step 8. |
| **Top-up** | Nothing yet; note in the plan that it is delegated. | **The sub-skill**, in step 8c, after the plan is confirmed. |

Why top-up waits: the PR already exists, so the sub-skill must do the write itself — it fetches the current description, measures the budget against what is already there, and runs its locate-or-append logic so a CI block or a hand-written note survives. Reproducing any of that here would duplicate the one thing the split exists to keep in one place. And because it writes, it runs its own confirmation, so invoking it before this skill's gate would post before the author agreed to the plan.

In creation mode there is no such hazard: `--dry-run` posts nothing and the region is the whole field.

**Skip the description entirely in top-up mode** when the PR already carries the sub-skill's start sentinel and the author did not ask for a refresh. Say which branch you took.

### 6. Generate the title

`--title=<text>` wins. Otherwise:

- **One commit ahead** — its subject verbatim.
- **Several** — one conventional-commit-style line for the dominant theme, at most 120 characters.

Do not put `#<id>` in the title. The work-item association already shows the link, and a duplicated id goes stale the moment the association changes.

### 7. Confirm the plan

Print it and stop. `--dry-run` stops here permanently; `--auto` proceeds past this gate **for creation and work items only**.

```markdown
### Create PR — <branch> → <base> (<N> commits, +X / -Y)

**Title:**  <title>
**Draft:**  <yes|no>
**Work items:**  #<id> — <type>: <title>   (or "none")
**Reviewers:**  <name> (optional)          (or "none")
**Auto-complete:**  <strategy>, delete source branch: <yes|no>   (or "not set")

<creation mode: the region from step 5, verbatim>
<top-up mode: "Description — delegated to write-pr-description (it will ask before posting)">
```

### 8. Create the PR — creation mode only

```
repo_pull_request_write(
  action        = "create",
  repositoryId  = <repo GUID>,
  project       = <project>,
  sourceRefName = "refs/heads/<branch>",       # full ref — do NOT strip refs/heads/
  targetRefName = "refs/heads/<base>",
  title         = <title>,
  description   = <region from step 5>,        # rejected outright above 4000 characters
  isDraft       = <bool>,
  workItems     = "<id> <id>"                  # space-separated bare digits, or omit
)
```

`workItems` associates every item in one call at creation, so creation mode never needs step 8b.

**The 4000-character cap is enforced by the API, not by a warning.** A description one character over is rejected and the whole call fails — the PR is not created. `write-pr-description` measures against that cap, which is the other reason not to hand-write the field here.

### 8b. Associate work items — top-up mode only

One call per work item; there is no batch form.

```
wit_work_item_link_write(
  action = "link_to_pull_request",
  projectId = <project GUID>, repositoryId = <repo GUID>,   # GUIDs — names are rejected
  pullRequestId = <prId>, workItemId = <id>)
```

Never pass `labels` in a call that also changes something else — the update path replaces the label set wholesale.

### 8c. Write the description — top-up mode only

Invoke `write-pr-description <PR-URL>` — no `--dry-run`, no `--auto`. It owns the fetch, the budget arithmetic, the locate-or-append decision and the update write, and it prompts for its own confirmation.

**Do not pass `--base` unless the user supplied it explicitly.** Given a PR URL the sub-skill reads the base from the PR's own `targetRefName`; forwarding step 1's guess would override the truth and generate the body against a base the PR does not target.

### 9. Reviewers — optional only

```
core_get_identity_ids(searchFilter = "<email | display name>")  → [{ id, displayName }]
repo_pull_request_write(action = "update_reviewers", repositoryId, pullRequestId, project,
                        reviewerIds = ["<identity GUID>"], reviewerAction = "add")
```

`reviewerIds` takes **identity GUIDs**, never emails. Zero or several matches → stop and ask; never guess which colleague was meant.

**Reviewers added here are optional, and this skill cannot make them required.** The tool builds its request body as `{ id }` only — no `isRequired` parameter — and Azure DevOps defaults any reviewer added without that flag to optional. A required reviewer comes from a branch policy or a human ticking the box. Say so rather than implying otherwise.

Adding a reviewer **emails them immediately and there is no unsend**, so this step waits for confirmation **including under `--auto`**.

Read back with `repo_pull_request(action="get")`. Optional reviewers **omit** `isRequired` entirely rather than reporting `false`; never test for an explicit `false`.

### 10. Auto-complete — gated

Only when `--auto-complete` was passed, and only after a **typed confirmation in the same turn**. **Never under `--auto`.** On a PR that already satisfies its policies this merges the branch immediately — treat it as a merge, not as scheduling.

Refuse unless all hold, re-checked immediately before the write:

- `status == 1` (active) and `isDraft == false` — a draft runs no policies, so auto-complete on a draft is a landmine that fires on publish
- `mergeStatus == 3` (succeeded) — conflicts block it
- `autoCompleteSetBy` is absent — it may already be on

**Those fields come back as numbers, not strings.** A PR payload carries `status: 1` and `mergeStatus: 3`, never `"active"` / `"succeeded"`; comparing against the words silently never matches, so the gate would pass everything. The enums live in the `ado-mcp` reference. The one place a *word* is correct is the `status` **input** of `repo_pull_request(action="list")` in step 2.

```
repo_pull_request_write(
  action = "update", repositoryId, pullRequestId, project,
  autoComplete = true,
  mergeStrategy = "NoFastForward" | "Squash" | "Rebase" | "RebaseMerge",
  deleteSourceBranch = <bool>, transitionWorkItems = <bool>)
```

- **`completionOptions` is sent whole.** Anything a human previously chose and you omit is reset. Read the current options first and echo them back.
- **Pass `transitionWorkItems` explicitly.** It defaults to `true`, which advances every associated work item on the board when the merge lands — a side effect outside git that the human must consent to.
- **Never send `bypassReason`.** Any non-empty string flips `bypassPolicy: true`, the API equivalent of overriding branch policies. That is a permission-gated human decision; if asked, refuse and point at the ADO UI.
- Pick the strategy the target branch's policy actually allows — a `NoFastForward` auto-complete against a squash-only policy sits un-merged forever.

**The update response cannot confirm this.** It strips `autoCompleteSetBy` and `completionOptions`. Read back with `repo_pull_request(action="get")` and report what you observed. The same applies to *cancelling* auto-complete: if `autoCompleteSetBy` survives the read-back, say the cancel did not take.

### 11. Report

Print the PR link — `https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}` — and one line per action. Steps 8 to 10 are independent: **a failure in one does not roll back the others**, so report each honestly rather than summarising as one success.

In any text destined for Azure DevOps, refer to a pull request as `!<id>` — `#<id>` links a *work item* with that number, and the two sequences collide.

### 12. Do not commit

This skill reads the local history and may push (step 3, with permission). It never commits, amends, rebases or merges.

---

## Safety summary

| Action | Reversible | Outward-facing | Under `--auto` |
|---|---|---|---|
| Create the PR | Abandon | Notifies watchers | Yes |
| Associate a work item | Yes | Visible on the board | Yes, high-confidence candidates only |
| Push the branch | No | No | **No — always ask** |
| Add reviewers | Yes | **Emails them, no unsend** | **No — always ask** |
| Set auto-complete | **No — it merges** | **Merges, may delete the branch, transitions work items** | **Never** |
| `bypassReason` | — | — | **Prohibited outright** |

## Common mistakes

- **Stripping `refs/heads/`** — creation wants full ref names in `sourceRefName` / `targetRefName`. The stripping rule belongs to diff building, not here.
- **Passing a project *name* to `wit_work_item_link_write`** — that one tool demands GUIDs for both `projectId` and `repositoryId`, unlike almost every other call.
- **Validating candidate work items in one batch** — a single unknown id nulls the entire response.
- **Trusting a number because it resolves** — PR ids and work-item ids collide. Run the plausibility gate.
- **Reporting auto-complete or a reviewer as set from the write response** — the response is trimmed. Read the PR back.
- **Creating the PR before the branch is pushed** — the server builds it from the remote ref.
- **Writing the description here** — it belongs to `write-pr-description`, along with the budget that keeps the 4000-character cap from rejecting the call.
- **Issuing an ADO call without loading `ado-mcp` first** — every schema is `additionalProperties: false`, so a stale parameter name rejects the whole call.
- **Deriving the base from repo metadata instead of the detected integration branch** — the chain is `--base` → `origin/HEAD` → first of `main` / `master` / `develop`, matching `write-pr-description`. Any other rule makes the two disagree about what the PR is diffed against.

## Verification

1. `/create-pr --dry-run` on a branch named `feat/<id>-<slug>` with two or more commits. Expect the work item detected from the branch name at high confidence, a description from `write-pr-description`, and no `mcp__ado__*` writes.
2. Same on a branch whose name carries a *pull request* id. Expect the candidate demoted by the plausibility gate and **not** auto-selected, with the reason named.
3. `/create-pr` on an unpushed branch. Expect a stop at step 3 asking permission to push — no PR, and no push under `--auto`.
4. `/create-pr` on a branch that already has an active PR. Expect top-up mode: no second PR, only the missing pieces filled, each reported.
5. `/create-pr --reviewers=<colleague>`. Expect a confirmation before the add; afterwards the read-back shows `isRequired` **absent** and the chat says "optional".
6. `/create-pr --auto-complete=squash --auto`. Expect creation and association to proceed while auto-complete still stops for a typed confirmation.
7. `/create-pr --auto-complete` on a draft PR. Expect refusal naming `isDraft` as the reason.

> **See also:** `write-pr-description` for the body, `review-pr` for the review pass, `address-pr-comments` for the inbound direction.
