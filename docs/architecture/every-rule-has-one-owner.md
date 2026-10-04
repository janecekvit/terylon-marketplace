# Every rule has one owner

**Status:** accepted, 2026-10-04, on work item #271 (the former #151). **Every rule stated in this repository's rule files and orientation files has exactly one owner. Every other mention points at the owner and does not paraphrase it.** A mention that states a requirement in the form its own reader needs is not a copy and stays; what is never repeated is the **argument**.

## Context

Copies of a rule drift, silently, and the people who introduce the drift are careful people actively removing duplication. That is not a forecast:

| Where | What had drifted |
|---|---|
| verification of #150 | three statements of one labelling rule disagreed, and one carried a literal date frozen into what should have been a placeholder |
| the same change | a fourth copy of the version-digit rule was added to a file being rewritten to **remove** duplication, and only an outside count caught it |
| this sweep | `plugins/CLAUDE.md` bound the never-hard-wrap rule to four skills writing to Azure DevOps; its owner binds eight, on both forges |
| this sweep | the new-plugin checklist said "bump version when ready to ship"; the owner says every commit |

The arrangement that produced it — one rule, several full statements, nothing marking which is current:

```
  plugins/CLAUDE.md ── the table + why ───┐
  CLAUDE.md ────────── the rule in prose ─┤
  git-workflow.md ──── the rule in prose ─┼──  four answers to one question;
  onboarding page ──── half the rule ─────┤    a reader cannot tell which is current
  flow diagram ─────── the rule, abridged ┘
```

## The alternatives

| Option | What it costs | Chosen |
|---|---|---|
| Keep the copies and keep them in agreement by review | a reviewer has to know every copy exists; the evidence above is what that produces | no |
| A mechanical check that refuses a duplicated rule | no such check exists that is not a grep for phrasings someone already thought of — see *Open question* | no |
| **One owner per rule; every other mention a pointer that does not paraphrase** | a reader follows one link for the argument | **yes** |

## Decision

| A mention that… | Is |
|---|---|
| states the rule with its argument, in the file a maintainer of that rule goes to | **the owner** — exactly one per rule |
| names the owner and stops | a pointer — fine |
| names the owner **and** restates what it says | a copy wearing a pointer — cut to the pointer |
| states the requirement in the form its own reader needs, without the argument | not a copy — keep it. A quickstart row saying a variable is required, and a runbook naming the mechanism behind a symptom, are different jobs from the rule |
| uses a rule owned elsewhere as an **example** | a copy — illustrate with a rule the same file owns |

## Consequences

| | |
|---|---|
| **Good** | a rule changes in one file, and every reader reaches the current form by following one link |
| **Cost** | a reader of a pointer opens a second file for the reasoning |
| **Constraint** | **writing "the rule is in X — <the rule again>" undoes this decision.** The paraphrase is the copy, and the copy is what drifts. Name the section and stop |
| **Constraint** | an example drawn from a rule another file owns is a copy too. `markdown.md` illustrated the table-over-prose rule with the version-digit table, which is how that rule's fifth copy existed |

## The sweep

Every rule file in `.claude/rules/` and every orientation file — the root `CLAUDE.md`, `plugins/CLAUDE.md`, `docs/CLAUDE.md`, the root `README.md`, `docs/README.md` — was read for rules stated more than once. **What was found is recorded here whether it was changed or left alone.**

### Given one owner

| Rule | Owner | Copies cut to a pointer |
|---|---|---|
| which version digit moves | `plugins/CLAUDE.md` — *Versioning* | root `CLAUDE.md`, `.claude/rules/git-workflow.md`, `README.md`, `docs/onboarding/marketplace-development.md`, the diagram in `docs/flows/change-to-consumer-repo.md`, the example table in `.claude/rules/markdown.md`, and the drifted new-plugin checklist step |
| never hard-wrap forge-bound markdown | `.claude/rules/markdown.md` | `plugins/CLAUDE.md` — **drifted** |
| skill and agent frontmatter, `disable-model-invocation` | `.claude/rules/markdown.md` — *Frontmatter* | `plugins/CLAUDE.md` |
| reference skills by name, never by path | `.claude/rules/markdown.md` — *Cross-references* | `plugins/CLAUDE.md` |
| when a skill's tables move to `references/` | `plugins/CLAUDE.md` — *Heavy reference* | `.claude/rules/markdown.md` |
| everything committed is English | root `CLAUDE.md` — *Language* | `.claude/rules/markdown.md` |
| branch, consent and `main` | `.claude/rules/git-workflow.md` | the new-plugin checklist in `plugins/CLAUDE.md` |
| Node for hooks, `pwsh` never `powershell`, and why | `.claude/rules/scripting.md` | root `CLAUDE.md` *Platforms*, the enforcement note in `.claude/rules/git-workflow.md` |
| the placement rule | `plugins/CLAUDE.md` — *Where a component belongs* | root `CLAUDE.md` |
| the rules that keep the port's upward load honest | `plugins/CLAUDE.md` — *The one exception* | root `CLAUDE.md` |
| what is not a platform-boundary crossing | `plugins/CLAUDE.md` | root `CLAUDE.md` |
| edit only what is affected; replace a stale sentence; keep a claim beside its evidence | `.claude/rules/claude-md-sync.md` — *How to update* | `.claude/rules/docs-sync.md`, where one sentence stood twice |

### Found and left alone

| Mention | Why it stays |
|---|---|
| the *In short* list in the root `CLAUDE.md` | one line per rule, no argument, under a pointer to the rule files — the orientation its reader needs |
| "every commit that changes a plugin bumps its version" in `.claude/rules/git-workflow.md` and the root `CLAUDE.md` | the requirement, in the form the committer needs at the moment of committing; the digit rule and its argument are only pointed at |
| `TERYLON_ADO_ORG` is required, in the README quickstart, the onboarding pages and the runbook | requirement-form for each reader; the argument lives once in the root `CLAUDE.md`, as `docs/architecture/README.md` already records |
| "keep every claim next to its evidence" in `docs/README.md` | the article author's form of it, with what an article must carry; the editing rule itself is owned by `claude-md-sync.md` |
| the `terylon-` slug prefix in `README.md` and `plugins/CLAUDE.md` | the README states what a consumer gets from it; the authoring rule and its reason are in `plugins/CLAUDE.md` only |
| the dependency facts (`terylon-dev` declaring `terylon-git` and `terylon-core` directly) in every orienting document | facts, not rules — and `.claude/rules/markdown.md` requires every orienting document to carry them |
| repetitions **inside the distributed plugins** — the wrapping rule and the checkbox rule in both `forge-ops` references and in the skills | out of this decision's scope: a plugin's files answer to another repository's reader, and their overlaps deserve their own examination |

## Open question — can anything beyond review catch the next instance?

**Unsettled.** A rule is not a string. A grep for the version-digit rule finds the phrasings someone thought to search for — "patch within a branch" — and misses "the minor digit counts branches", which states the same rule. Every copy this sweep found was found by reading, not by searching.

What exists, and what it does not cover:

| Mechanism | Catches | Does not catch |
|---|---|---|
| review | whatever the reviewer has read | a copy in a file the reviewer did not open — the fourth copy on #150 |
| `tests/forge-port/forge-port.test.js` | an authoring skill naming a platform field | anything about rule duplication; it is evidence that a narrow, nameable class *can* be checked, not that this one can |
| a phrase grep | a known phrasing coming back | a new phrasing of a known rule, or a new rule |

**What would settle it:** a check run against this repository's own history that flags the drifted copies recorded above — the #150 labelling rule, the wrapping rule's skill list, the "ready to ship" step — while flagging none of the requirement-form mentions in *Found and left alone*. Until one exists and has been run that way, single ownership is held by review, and this article is what a reviewer counts against.

## Where it lives

| File | Role |
|---|---|
| `plugins/CLAUDE.md` | *Versioning* — the version-digit rule's owner; also owns *Heavy reference*, placement and the port exception |
| `.claude/rules/markdown.md` | owner of wrapping, frontmatter and cross-reference rules; its table example now uses its own rule |
| `.claude/rules/git-workflow.md` | owner of branch and consent rules; points at *Versioning* for the digit |
| `.claude/rules/scripting.md` | owner of the scripting platform rules and the startup measurement |
| `.claude/rules/claude-md-sync.md` | *How to update* — owner of the editing rules both documentation stores share |
| `.claude/rules/docs-sync.md` | points at `claude-md-sync.md` for the shared editing rules |
| `CLAUDE.md` | owner of *Language*; its *Plugins*, *Platforms* and *In short* sections point rather than restate |
| `README.md` | *Versioning* — points at `plugins/CLAUDE.md` for the digit |
| `docs/onboarding/marketplace-development.md` | the branch-install page; points at *Versioning* for the digit |
| `docs/flows/change-to-consumer-repo.md` | the path diagram; step 3 points at `plugins/CLAUDE.md` |
