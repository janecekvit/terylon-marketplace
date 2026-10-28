---
paths:
  - "**/CLAUDE.md"
  - "README.md"
  - "CONTRIBUTING.md"
  - "docs/**"
  - ".claude/rules/**"
  - "plugins/**/SKILL.md"
  - "plugins/**/references/*.md"
  - "plugins/**/assets/*"
  - "plugins/**/agents/*.md"
  - "plugins/**/README.md"
---

# Documentation states the current state

Applies to the `CLAUDE.md` files, `README.md`, `docs/`, the rules, the skills with their references, the agents and the plugin READMEs.

| Statement | Allowed |
|---|---|
| what is true now, and why | **yes** — the whole job |
| a dated measurement: the figure, `measured <date>`, and **one line of evidence** (by what, on which version) | **yes** — the one exception, because a reader must be able to tell a measured fact from a guess and re-measure it |
| what used to be true, a rename's former name, "until", "since #N", "was reversed on" | **no** — the commit, the pull request and the issue carry it |
| the reasoning a decision overturned | **only in an ADR** under `docs/architecture/`, which exists to keep it |

**ADRs are exempt.** An ADR records a decision when it was made, the alternatives it rejected and, once superseded, that it was; its history is its content. `docs/architecture/README.md` says how one is written.

**A reversed decision is two edits**: the current state replaces the stale sentence where it stood, and the overturned reasoning goes into an ADR, which the current text may link. `claude-md-sync.md`, under *A decision was reversed*, says when.

**A migration note a consumer needs** — a renamed plugin key they must change — is current state for that consumer, and lives in `docs/onboarding/migrating.md`.

The labelling of a fact's confidence is stated in `claude-md-sync.md`, under *Something was VERIFIED*; a code comment's rules are in `comments.md`. Existing text is brought to this rule when its file is touched for another reason, not in a sweep.
