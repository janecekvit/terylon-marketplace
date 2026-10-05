# GitHub — canonical reference

Single source of truth for the GitHub mechanics behind the `terylon-forge` port. This is the heavy reference behind the `forge-ops` engine skill in `terylon-github`. Transport callers delegate their recipes here and issue their own `gh` invocations following them.

Its sibling is `terylon-ado:forge-ops`, the same catalog against Azure DevOps. **The port declares the operations; these two files implement them.**

---

## 1. Scope

`forge-ops` owns **all mechanical GitHub operations**: URL parsing, repository identity, pull request and issue metadata, local diff construction, review-thread and comment listing and posting, label and sub-issue mechanics, and the GitHub posting conventions.

It owns no judgment. The following always stay in the calling skill:

- **Footer and version resolution** — the caller stamps its own footer from its own `plugin.json` (§12).
- **Eligibility *decisions*** — this file returns raw flags; the caller decides the draft policy, the ownership gate and the prior-run branch (§10).
- **Thread classification** — mechanical versus inline-text versus conceptual is caller-owned.
- **All generation** — descriptions, findings, stories, tone.

---

## 2. The tool surface

Everything is the **`gh` CLI**. There is no MCP server, so there is no tool namespace to declare — a caller needs `Bash(gh *)` in its `allowed-tools` and nothing else.

Three invocation forms, and the difference matters:

| Form | Use for | Note |
|---|---|---|
| `gh pr …`, `gh issue …`, `gh repo …` | everything with a first-class command | reads take `--json <fields>`; the field list is **required**, and an unknown field name fails the call with the valid list |
| `gh api <endpoint>` | REST reach-through — review comments, sub-issues | `-f k=v` sends a **string**, `-F k=v` sends a typed value (number, boolean, or `@file`). Sending an id with `-f` makes it a string and the endpoint rejects it |
| `gh api graphql -f query=…` | what REST does not expose — resolving a review thread | node ids are opaque GraphQL ids, unrelated to REST numbers |

**Paginate deliberately.** `gh api` returns one page. Pass `--paginate` for any list that can exceed 30 entries — review comments on a large pull request routinely do, and a silently truncated list reads exactly like a short one.

**Check authentication first.** `gh auth status` before the first write. An expired token discovered halfway through a posting sequence leaves half the findings posted.

---

## 3. Three things that break silently

| Trap | Consequence |
|---|---|
| The `path` of an inline comment has **no leading slash** | the opposite of Azure DevOps, which requires one. A leading slash is accepted at the shell and rejected by the API |
| `sub_issue_id` wants the **database id**, not the issue number | both are integers and both look plausible. The wrong one either 404s or, worse, links a different issue |
| A read without `--json` returns **human-formatted text** | it parses as nothing, and a caller that greps it will keep working until the day the format changes |

---

## 4. Operation catalog

### `parse-pr-url`

- **In:** `https://github.com/{owner}/{repo}/pull/{n}`. **Out:** `owner`, `repo`, `prNumber`.

```bash
url="https://github.com/contoso/ExampleRepo/pull/12345"
OWNER=$(echo "$url" | sed -E 's#.*github\.com/([^/]+)/.*#\1#')
REPO=$(echo  "$url" | sed -E 's#.*github\.com/[^/]+/([^/]+)/.*#\1#')
PR=$(echo    "$url" | sed -E 's#.*/pull/([0-9]+).*#\1#')
```

In PowerShell:

```powershell
$url    = "https://github.com/contoso/ExampleRepo/pull/12345"
$OWNER  = ([regex]'github\.com/([^/]+)/').Match($url).Groups[1].Value
$REPO   = ([regex]'github\.com/[^/]+/([^/]+)').Match($url).Groups[1].Value
$PR     = ([regex]'/pull/(\d+)').Match($url).Groups[1].Value
```

### `parse-item-url`

- **In:** `https://github.com/{owner}/{repo}/issues/{n}`, or a bare number. **Out:** `owner`, `repo`, `issueNumber`.
- Same recipe with `/issues/` in place of `/pull/`. A bare number resolves `owner` / `repo` per §5.

**The two paths are not interchangeable.** `/pull/42` and `/issues/42` are the same object to the issues API and different objects to the pulls API: every pull request is an issue, no issue is a pull request. Reading a pull request through `gh issue view` succeeds and returns an object missing every ref field.

### `resolve-repo-id`

- **In:** nothing, or an explicit `{owner}/{repo}`. **Out:** `{owner}/{repo}`.

```bash
gh repo view --json nameWithOwner --jq .nameWithOwner
```

**There is no GUID to resolve**, unlike Azure DevOps. The string *is* the identity, so the resolve-once-and-cache invariant costs nothing here and exists only so the port reads the same on both sides.

### `fetch-pr-metadata`

**`--repo` does not supply the pull request.** `gh pr view --repo <owner>/<repo> --json …` with no positional argument fails with *argument required when using the --repo flag*: without `--repo`, `gh` infers the pull request from the current branch, and naming a repository removes that inference without replacing it. Always pass the number, URL or branch as the first argument.

```bash
gh pr view "$PR" --repo "$OWNER/$REPO" \
   --json number,title,state,isDraft,author,headRefName,baseRefName,headRefOid,body,url,mergeable,labels
```

| Field | Value |
|---|---|
| `state` | `OPEN` / `CLOSED` / `MERGED` — **words**, where Azure DevOps returns numbers |
| `isDraft` | boolean |
| `author.login` | the handle, for the ownership gate |
| `headRefOid` | the head SHA; the `commit_id` an inline comment must carry |
| `mergeable` | `MERGEABLE` / `CONFLICTING` / `UNKNOWN`. On an **open** pull request `UNKNOWN` means GitHub is still computing it, so re-read rather than treat it as a conflict. On a closed or merged one it is **terminal** — GitHub computes mergeability only while a pull request is open, and a re-read loop there never terminates. Measured `UNKNOWN` on a merged pull request. Test `isOpen` before ever re-reading this |

### `eligibility-check`

- **Out:** the **normalised verdict** below, plus the raw flags it was derived from. **Decisions stay caller-side** (§10).

**The normalised verdict is what a transport reads.** There is no `status` key here — a transport carrying Azure DevOps' vocabulary finds nothing and passes everything, and the gate fails **open**.

| Normalised | Type | Derived here from |
|---|---|---|
| `isOpen` | boolean | `state == "OPEN"`. `CLOSED` and `MERGED` are both not-open. **Upper case, and the `--state` input is lower case** — measured `"MERGED"` out of a filter written `--state all` |
| `isDraft` | boolean | `isDraft` |
| `author` | string | `author.login` — a handle, **not** an email |
| `isMergeable` | boolean | `mergeable == "MERGEABLE"`. `UNKNOWN` means still computing **only while `isOpen` is true** — on a closed or merged pull request it never resolves, so report it as unknown rather than re-reading |
| `autoMergeAlreadySet` | boolean | the auto-merge request on the pull request |

The same normalisation covers the ref names: `headRefName` / `baseRefName` here against `sourceRefName` / `targetRefName` on the other side, and this operation reports them as `sourceBranch` / `targetBranch`, already stripped of any `refs/heads/` prefix.

| Normalised | Type | Derived here from |
|---|---|---|
| `sourceBranch` | string | `headRefName` — nothing to strip |
| `targetBranch` | string | `baseRefName` — nothing to strip |
| `headSha` | string | `headRefOid` — the commit the diff's `$HEAD` must be, and the `commit_id` an inline comment must carry |

### `detect-prior-run`

Grep both comment surfaces for the version-less sentinel `Generated with [Claude Code]`:

```bash
gh api --paginate "repos/$OWNER/$REPO/pulls/$PR/comments" --jq '.[].body'   # inline review comments
gh pr view "$PR" --repo "$OWNER/$REPO" --json comments --jq '.comments[].body'  # PR-wide
```

Both are needed: a prior run may have posted only inline findings, or only a PR-wide summary.

### `list-threads`

GitHub has **no thread object over REST.** A thread is a root review comment plus every comment whose `in_reply_to_id` points at it, and this operation reconstructs it:

```bash
gh api --paginate "repos/$OWNER/$REPO/pulls/$PR/comments" \
  --jq 'group_by(.in_reply_to_id // .id) | map({root: .[0].id, path: .[0].path, line: .[0].line, comments: map({id, body, user: .user.login})})'
```

PR-wide comments are a **separate list** (`gh pr view --json comments`) and carry no file or line. This operation presents both as one set and remembers which came from where, because only the first can be replied to inline.

**The output is the normalised thread shape, key for key with the Azure DevOps body**, or a transport cannot be written once against them:

| Key | Meaning | From, here |
|---|---|---|
| `threadId` | opaque handle for replies and status changes | the root comment's `id`; for status changes the GraphQL thread node id |
| `isResolved` | boolean | `isResolved` on the review thread — **GraphQL only**. On a REST-only read it is unknown, and unknown must be reported as such rather than as `false` |
| `isSystem` | boolean | always `false` — this endpoint produces none |
| `anchor` | `null` for PR-wide, else `{ path, startLine, endLine }` **inclusive** | `path`, `start_line` (or `line` when absent), `line` — **no arithmetic**, this side already reports the last covered line |
| `comments[]` | `{ commentId, body, author }` | `{ id, body, user.login }` |

The anchor's `path` carries **no leading slash** here and a required one on the other side; the normalised shape hides that, and a transport must not re-add either.

### `list-thread-comments`

- The group produced above. **There is no per-thread endpoint**, so this operation is a filter over `list-threads` rather than a call.

### `post-pr-thread`

**Inline** — a review comment anchored to a line:

```bash
gh api "repos/$OWNER/$REPO/pulls/$PR/comments" \
  -F body=@"$BODY_FILE" \
  -f commit_id="$HEAD_SHA" \
  -f path="plugins/terylon-forge/skills/create-pr/SKILL.md" \
  -F line=42 \
  -f side=RIGHT
```

| Parameter | Rule |
|---|---|
| `path` | repository-relative, **no leading slash**, forward slashes |
| `line` | the line number **in the file**, 1-based. No off-by-one arithmetic — where Azure DevOps wants one past the last line covered, GitHub wants the line itself |
| `start_line` + `line` | a span; `start_line` is the first line, `line` the last, both inclusive |
| `side` | `RIGHT` for added and modified lines, `LEFT` only for deleted ones |
| `commit_id` | the head SHA from `fetch-pr-metadata`. A stale SHA makes the comment **outdated** on arrival, collapsed by default and easy to miss |

**PR-wide** — the same content with no anchor:

```bash
gh pr comment "$PR" --repo "$OWNER/$REPO" --body-file thread.md
```

The absence of the anchor is what makes it PR-wide; there is no separate mode.

**GitHub appends a trailing newline to every body it stores.** Measured: 1447 UTF-16 units written through `--body-file`, 1448 read back, the difference being one `
` at the end and nothing else — every backtick, quote, `$VARIABLE`, em dash and emoji survived byte for byte. It matters only for idempotence: a skill comparing what it sent against what is stored finds a difference on every run and rewrites a field nothing changed. **Normalise the trailing newline on both sides before comparing.**

**Pass bodies through `--body-file` or a file-valued field (`-F body=@<path>`), never inline.** A finding contains backticks, quotes and newlines, and shell quoting will eventually eat one of them — and the body of a review finding embeds reviewed source, so what it eats is somebody's code.

**Write those files outside the repository under test.** Every recipe here that names `thread.md`, `description.md`, `issue.md` or `comment.md` means a path in a throwaway directory — `$(mktemp -d)` or the session's scratch area — never a bare filename in the working tree, which drops untracked files into the user's clone and can collide with real ones.

### `reply-to-thread`

```bash
gh api "repos/$OWNER/$REPO/pulls/$PR/comments" -F body=@"$BODY_FILE" -F in_reply_to="$ROOT_COMMENT_ID"
```

`in_reply_to` is the **root comment's id**, and it is a number, so it goes through `-F`. This does not change the thread's resolved state.

### `update-thread-status`

REST cannot do this. GraphQL can, and it wants the thread's **node id**, which is not the REST comment id:

```bash
THREAD_ID=$(gh api graphql -f query='
  query($owner:String!,$repo:String!,$pr:Int!){
    repository(owner:$owner,name:$repo){
      pullRequest(number:$pr){ reviewThreads(first:100){ nodes{ id isResolved comments(first:1){ nodes{ databaseId } } } } }
    }}' -f owner="$OWNER" -f repo="$REPO" -F pr="$PR" --jq '...')

gh api graphql -f query='
  mutation($id:ID!){ resolveReviewThread(input:{threadId:$id}){ thread{ isResolved } } }' -f id="$THREAD_ID"
```

**Policy-guarded, exactly as on the other side: never auto-resolve a thread.** Resolving is the reviewer's or the author's judgment that the point was addressed, and a skill that resolves its own findings has closed its own tickets.

### `update-pr-description`

```bash
gh pr edit "$PR" --repo "$OWNER/$REPO" --body-file description.md
```

Overwrites the whole body, so the caller's locate-or-append logic runs first. The limit is roughly 65 536 characters, far above anything this marketplace generates — **the brevity rules still apply**, because they exist for the reader.

### Work-item keys — the authoring contract

`fetch-work-item`, `create-work-item` and `update-work-item` speak these keys, **key for key with the Azure DevOps body**, so an authoring skill is written once against them. A skill never names a label, a body section or an endpoint; it names a key, and this table says where the key lives here. A row marked *not carried* is a **declared difference**: the caller states it before writing rather than dropping the value silently.

| Key | Meaning | Here | Carried |
|---|---|---|---|
| `type` | the item's kind, in the port's vocabulary: `user-story`, `feature`, `epic` | a label — `user story`, `feature`, `epic` | yes — by convention only; nothing enforces a label |
| `title` | plain text | `title` | yes |
| `description` | markdown, everything but the criteria and the footer | the body, above the criteria section | yes |
| `acceptanceCriteria` | a markdown `- [ ]` list with no heading; absent when the item has none | a `## Acceptance criteria` section of the body | yes |
| `footer` | the caller's finished footer line — **composed by the caller, only placed here** | the body's last block, after the criteria section | yes |
| `parent` | id of the parent item, or `null` | the sub-issue relation, read from `issues/{n}/parent` | yes — confirmed live, see `link-work-item-parent` |
| `children` | `[{ id, title, description }]` | `issues/{n}/sub_issues` | yes |
| `isClosed` | boolean | `state == "CLOSED"` | yes |
| `url` | the item's web URL | `url` | yes |
| `planning` | where the item sits in the team's plan | — | **not carried.** GitHub has no area or iteration. A milestone is not one, and none is invented |
| `estimate` | a number | — | **not carried.** No field, and a label is not invented for it |
| `priority` | a number | — | **not carried.** Same reason |
| `tags` | a list of strings | labels, which must exist in the repository first | yes |

**The body is composed here, in one order**, so a reader of either side finds the same sections:

```
<description>

## Acceptance criteria

<acceptanceCriteria>

<footer>
```

The criteria section is omitted when the item carries none — a Feature keeps its criteria inside its own description, as its standard lays out.

### `fetch-work-item`

```bash
gh issue view "$ISSUE" --repo "$OWNER/$REPO" \
  --json number,title,body,state,labels,comments,url,assignees
gh api "repos/$OWNER/$REPO/issues/$ISSUE/sub_issues" --jq '.[] | {id: .number, title, description: .body}'
```

**Everything is in `body`**; the keys above are read out of it. `acceptanceCriteria` is the `## Acceptance criteria` section up to the next heading of the same level or the footer, `description` is what stands above it, and `footer` is the trailing block that carries the sentinel (§11). `children` come from the sub-issue list, `type` from the labels.

### `build-pr-diff`

The commands are git and therefore forge-agnostic; what differs is **which refs the metadata calls them by**. There are **two profiles and both exist on both sides** — a caller asking for one and silently receiving the other diffs the wrong tree, which is worse than an error because the review still produces findings.

#### Profile (a) — the review diff, for `review-pr` and `pr-reviewer`

Diffs the pull request as the server sees it, from the merge base to the pull request's own head:

```bash
SOURCE=$(gh pr view "$PR" --repo "$OWNER/$REPO" --json headRefName --jq .headRefName)
TARGET=$(gh pr view "$PR" --repo "$OWNER/$REPO" --json baseRefName --jq .baseRefName)
HEAD_SHA=$(gh pr view "$PR" --repo "$OWNER/$REPO" --json headRefOid  --jq .headRefOid)   # reported as the normalised headSha

# Take the merge-base against the HEAD SHA, never against origin/<source>.
# GitHub deletes the source branch on merge by default, so `git fetch origin <source>`
# fails on any merged pull request and the merge-base then runs against a stale
# tracking ref — measured: fetch reported "couldn't find remote ref" and the diff
# was still produced, from whatever that ref last pointed at.
git fetch origin "$TARGET"
BASE=$(git merge-base "origin/$TARGET" "$HEAD_SHA")

git fetch origin "$SOURCE" "$TARGET"
BASE=$(git merge-base "origin/$TARGET" "origin/$SOURCE")
git diff --name-only "$BASE".."$HEAD_SHA"
```

**Never substitute the local `HEAD`.** It is the reviewer's own checkout, not the pull request's, and on somebody else's pull request the two have nothing to do with each other.

There are **no `refs/heads/` prefixes to strip** here, unlike the Azure DevOps body — `headRefName` and `baseRefName` are already bare.

#### Profile (b) — the description diff, for `write-pr-description`

Diffs the local branch against its base, with full-file context for generation:

```bash
git fetch origin "$BASE"
BASE_SHA=$(git merge-base HEAD "origin/$BASE")
git diff --no-prefix --unified=100000 --minimal "$BASE_SHA"..HEAD
git log --oneline "$BASE_SHA"..HEAD
git diff --stat "$BASE_SHA"..HEAD
```

The `--no-prefix --unified=100000 --minimal` flags are load-bearing.

Both are two-dot, the author view. **Never `git diff HEAD`** — it picks up unrelated local commits. The three-dot reviewer view stays inside the `code-review` engine in `terylon-git`.

### `create-work-item`

- **In:** the work-item keys `type`, `title`, `description`, `footer`, and when given `acceptanceCriteria`, `tags` — written to `description.md`, `criteria.md` and `footer.md`. `planning`, `estimate` and `priority` are **not carried** here; the caller has already said so, and this recipe takes no argument for them. **Out:** the new issue's `id` and `url`.

```bash
# The body, in the one order the key table fixes. The criteria section is left out when there is none.
{
    cat description.md
    if [ -s criteria.md ]
    then
        printf '\n## Acceptance criteria\n\n'
        cat criteria.md
    fi
    printf '\n'
    cat footer.md
} > issue.md

# An unknown label fails the whole create, so the type label and every tag must exist first.
LABEL_ARGUMENTS=()
for LABEL in "$TYPE_LABEL" "${TAGS[@]}"
do
    gh label list --repo "$OWNER/$REPO" --search "$LABEL" --json name --jq '.[].name' | grep -qxF "$LABEL" \
        || gh label create "$LABEL" --repo "$OWNER/$REPO"
    LABEL_ARGUMENTS+=(--label "$LABEL")
done

URL=$(gh issue create --repo "$OWNER/$REPO" --title "$TITLE" --body-file issue.md "${LABEL_ARGUMENTS[@]}")
NUMBER="${URL##*/}"
```

`TYPE_LABEL` is the `type` key's label from the table: `user story`, `feature` or `epic`. Prints the new issue's URL; the number is its last path segment. The type is the **label**, and nothing enforces it — see §6.

**Creating a missing label is a write to the repository**, not only to the issue. The caller's confirmation before the create covers it, and its draft names any label that does not yet exist.

### `link-work-item-parent`

- **In:** `child`, `parent` — two issue numbers, the same two keys on both bodies. **Out:** the parent's children, read back.

GitHub's sub-issue relation, and the one operation whose identifier is not the number:

```bash
CHILD_ID=$(gh api "repos/$OWNER/$REPO/issues/$CHILD" --jq .id)     # database id, NOT the number
gh api "repos/$OWNER/$REPO/issues/$PARENT/sub_issues" -F sub_issue_id="$CHILD_ID"
```

**Verify by reading the parent back**, never from the create response:

```bash
gh api "repos/$OWNER/$REPO/issues/$PARENT/sub_issues" --jq '.[].number'
```

**Confirmed live on 2026-10-05**, on the marketplace's own public repository (#273): `create-user-story` created a story and linked it under a Feature with exactly the two calls above — the database id read with `--jq .id`, sent typed with `-F` — and the parent read back listed the child; `issues/{n}/parent` on the child named the Feature. The POST answers with the **parent** issue, so `--jq .number` on it prints the parent's number, not the child's. The fixture in `tests/forge-port/` still guards the call shape offline, against a stand-in `gh` that refuses a string id and a number passed as an id.

**When the link cannot be made, the parent is a declared difference rather than a silent loss.** A repository whose host does not offer sub-issues refuses the call. The caller then reports the item as **created and not linked**, names the parent it was asked for, and does not record the relation anywhere else — a `Parent: #N` line in the body would be a second location that nothing reads and that drifts from the relation the moment someone sets it by hand.

### `update-work-item`

- **In:** `id` and any of the work-item keys `title`, `description`, `acceptanceCriteria`, `footer`; each given key replaces what the item holds.

```bash
gh issue edit "$ISSUE" --repo "$OWNER/$REPO" --body-file issue.md
gh issue edit "$ISSUE" --repo "$OWNER/$REPO" --title "$TITLE"      # only when `title` is given
```

Whole-body overwrite, so read the item with `fetch-work-item`, replace the keys that were given, and recompose the body in the order the key table fixes. **No angle-bracket sanitising** — unlike Azure DevOps, which silently drops tag-shaped text on update, GitHub stores `feat/<slug>` verbatim. A transport that defensively rewrites placeholders for the other side produces uglier text here but never wrong text, so the defensive form is safe on both.

### `create-pull-request`

```bash
gh pr create --repo "$OWNER/$REPO" \
  --base main --head feat/my-branch \
  --title "$TITLE" --body-file description.md [--draft]
```

**Bare branch names**, where Azure DevOps wants full `refs/heads/` refs. Requires the branch to be pushed, exactly as the other side does: the pull request is built from the remote ref.

To associate an issue, put a closing keyword in the body — see below.

### `list-linked-items`

```bash
gh pr view "$PR" --repo "$OWNER/$REPO" --json closingIssuesReferences --jq '.closingIssuesReferences[].number'
```

Returns the issues the pull request's body closes. **A bare `#N` mention is not a link** and does not appear here, which is the same distinction the linking operation makes in the other direction.

### `link-work-item-to-pull-request`

There is no artifact-link call. The link is a **closing keyword in the pull request body**:

```
Closes #142
```

| Keyword | Effect |
|---|---|
| `Closes` / `Fixes` / `Resolves` `#N` | links the issue **and closes it when the pull request merges** |
| `#N` alone | a reference, no link and no close |

**This differs in kind from the other side.** Azure DevOps links a work item without deciding its state; a GitHub closing keyword links *and* transitions. A transport that wants the link without the close must say `#N` and accept that it is only a mention, and it must say which it did.


### `check-preconditions`

- **In:** nothing. **Out:** usable / not usable, with the reason.

```bash
gh auth status
```

**Run it before the first write, not after.** An expired token found halfway through a posting sequence leaves half the findings posted. There is no organisation variable to check here — that asymmetry with the Azure DevOps body is the platform's, not the port's.

### `list-pull-requests`

```bash
gh pr list --repo "$OWNER/$REPO" --head "$BRANCH" --state all \
   --json number,state,isDraft,author,title,url
```

`--state` takes `open` / `closed` / `merged` / `all` on **input**, and that asymmetry against the other side's numeric filter is real.

**The output is normalised and the raw `state` never leaves this file.** Report each pull request with the same keys `eligibility-check` returns — `isOpen` from `state == "OPEN"`, `isDraft` from `isDraft`, `author` from `author.login`. A caller forced to know that one forge words what the other numbers is reading a raw platform field, which is exactly what the normalised verdict exists to prevent.

### Referring to a pull request or an issue in posted text

One sequence numbers both here, so `#<n>` is unambiguous **within a repository** and needs no second sigil — that is the asymmetry against the other side, which numbers them separately and needs one.

**The number is still per-repository.** `#<n>` in a comment resolves against the repository the comment lives in, so it is correct inside that repository and wrong the moment the text is read from another. Cross-repository, the unambiguous forms are `owner/repo#n` or the full URL; prefer the URL in anything a person will follow from elsewhere.

### `resolve-current-user`

- **In:** nothing. **Out:** the identity of whoever the run is acting as, in the same form `eligibility-check` reports `author`.

```bash
gh api user --jq .login
```

A **handle**, not an email — comparing it against `git config user.email` never matches, which is how an ownership gate ends up permanently shut or permanently open depending on which way it is written.

### `resolve-identity`

```bash
gh api "users/$LOGIN" --jq .login
```

**The login is the identifier**, so this operation is a validation rather than a lookup — unlike Azure DevOps, where a GUID must be resolved first. An unknown login 404s; zero or several candidates is a stop-and-ask, never a guess.

### `add-reviewers`

```bash
gh pr edit "$PR" --repo "$OWNER/$REPO" --add-reviewer "$LOGIN"
```

Reviewers added this way are **optional**; required reviewers come from a branch protection rule, not from this call. Adding one **notifies immediately with no unsend**, so the caller confirms even under `--auto`.

### `set-auto-merge`

```bash
gh pr merge "$PR" --repo "$OWNER/$REPO" --auto --squash
```

**Gate before calling:** the pull request is open and not a draft, `mergeable` is `MERGEABLE` (not `UNKNOWN`, which means GitHub is still computing it — re-read rather than treat it as a conflict), and auto-merge is not already set.

**On a pull request that already satisfies its checks this merges now.** Treat it as a merge, not as scheduling. There is no bypass parameter and none should be sought. Strategy must be one the branch's own rules allow, or the merge never happens.

Linked items close through the body's closing keyword rather than through a transition flag, so there is nothing here corresponding to the other side's `transitionWorkItems`.

### `item-comments-read`

```bash
gh issue view "$ISSUE" --repo "$OWNER/$REPO" --json comments --jq '.comments[] | {id, body, author: .author.login}'
```

Doubles as the item half of `detect-prior-run`: grep the bodies for the sentinel.

### `item-comment-post`

```bash
gh issue comment "$ISSUE" --repo "$OWNER/$REPO" --body-file comment.md
```

To **update** a previous comment rather than add another, `gh api -X PATCH "repos/$OWNER/$REPO/issues/comments/$COMMENT_ID" -F body=@comment.md`. The caller supplies the finished text including its own footer.

---

## 5. Resolving `owner` / `repo` without a URL

First hit wins:

| Source | Supplies | Precedence |
|---|---|---|
| An explicit URL argument | `owner`, `repo`, number | highest |
| `gh repo view --json nameWithOwner` | `owner`, `repo` | the normal path — it reads the same remote git does |
| `git remote get-url origin` | `owner`, `repo` | fallback when `gh` cannot infer the repository |

```bash
REMOTE=$(git remote get-url origin 2>/dev/null | sed -E 's#//[^@/]+@#//#')
case "$REMOTE" in
    *github.com*)
        OWNER=$(echo "$REMOTE" | sed -E 's#.*github\.com[:/]([^/]+)/.*#\1#')
        REPO=$(echo  "$REMOTE" | sed -E 's#.*github\.com[:/][^/]+/([^/]+)#\1#')
        REPO="${REPO%.git}"
        ;;
esac
```

**There is no organisation environment variable here**, and none is needed: GitHub carries the owner in every URL and in the remote, so nothing has to be configured before the first command runs. That asymmetry with `TERYLON_ADO_ORG` is real and is the adapter's, not the port's.

---

## 6. Where the fields live

Azure DevOps has a field for each of these; GitHub has a body and some labels. **Where each authoring key lives is the key table under §4**, *Work-item keys — the authoring contract*, and it is not repeated here. Two things the table does not carry:

| Concept | GitHub location | Convention |
|---|---|---|
| Item type | a label | nothing enforces it; a missing label fails silently |
| State | `state`, plus `state_reason` | `OPEN` / `CLOSED`, coarser than an ADO workflow |

**The section heading carries what a field carried.** A transport reading criteria locates the heading and takes everything to the next heading of the same level. One heading, one section, no duplicates — two copies drift and nothing marks which is current.

---

## 7. Markdown rendering

- **Never hard-wrap.** GitHub soft-wraps, so wrapping costs nothing visible here — but the same content is written by the same transports to Azure DevOps, which renders every line break verbatim. One rule, obeyed on both.
- **Task lists** are `- [ ]` and are interactive natively; no format flag, unlike the other side.
- **Checklists stay unchecked when generated.** `- [X]` claims something was verified. The carve-out for a skill that genuinely executed the item is the port's, stated once and obeyed by both bodies: it ran the thing, it passed, what ran bears on that item, the evidence is posted where a reader can check it, and anything not executed stays unticked.
- **A generator must not erase a tick it finds.** Carry existing state across a regeneration, or leave the section alone and say so.

---

## 8. Identifiers

| Name | What it is | Where it is used |
|---|---|---|
| issue / PR `number` | what a human sees, unique per repository | every `gh pr` and `gh issue` command, and `#N` references |
| `id` | the database id, globally unique | `sub_issue_id`, and nothing else here |
| GraphQL node `id` | an opaque string | `resolveReviewThread` |
| review comment `id` | the comment's database id | `in_reply_to` |

**Numbers are shared between issues and pull requests in one sequence**, so `#67` is never ambiguous within a repository — unlike Azure DevOps, where a pull request id and a work item id collide head-on. That trap does not exist here, and the plausibility gate the ADO body needs is simply unnecessary.

---

## 9. Reviewers and auto-merge

```bash
gh pr edit "$PR" --repo "$OWNER/$REPO" --add-reviewer "$LOGIN"
gh pr merge "$PR" --repo "$OWNER/$REPO" --auto --squash
```

**Adding a reviewer notifies them immediately and there is no unsend**, so the caller confirms it even under `--auto`. **`--auto` on a mergeable pull request merges it now**, so it is a merge and not scheduling; it needs its own typed confirmation and is never taken automatically.

---

## 10. Eligibility — two phases

- **Phase 1, before any read:** fetch metadata; the caller evaluates its skip rules against `state`, `isDraft` and `author.login`.
- **Phase 2, immediately before any write:** re-fetch. A pull request merged during the analysis must not be written to. Read-only callers are exempt from the second half.

Call `detect-prior-run` **before** phase 1, so a prior post is part of the same decision rather than a later surprise.

---

## 11. Prior-run detection

The sentinel is the version-less substring `Generated with [Claude Code]`. Match the substring, never the whole footer — everything after that prefix varies per run.

Search both surfaces (§4, `detect-prior-run`). On an issue, search its comments and its body.

---

## 12. Footer contract

**This file never stamps a footer.** The calling skill assembles it from its **own** `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` plus its own name, and passes finished content into the write:

```
---
*🤖 Generated with [Claude Code](https://claude.ai/code) — <skill-name>@<plugin-version>*
```

Never substitute a concrete version here: a caller could copy the example verbatim and stamp the wrong identity.

---

## 13. Consumer index

Every caller that delegates its GitHub recipes to this file loads it **by name**, plugin-qualified as `terylon-github:forge-ops` once `resolve-forge` has returned `github`:

- `create-pr`, `review-pr`, `write-pr-description`, `address-pr-comments`, `update-pr-checklist`, `update-work-item-checklist` and the `pr-reviewer` agent, all in `terylon-forge`.
- `create-user-story` and `create-feature` in `terylon-product`.
- `develop` in `terylon-dev`.

Each issues its own `gh` invocations following these recipes; delegation centralises the **knowledge**, not the calls.
