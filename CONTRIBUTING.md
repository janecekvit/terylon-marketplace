# Contributing

This repository is the marketplace's only home: code, issues, pull requests and releases all live here. A change follows one path.

```
  an issue: the need ──▶ a branch ──▶ one pull request, "Closes #N" ──▶ CI green ──▶ squash merge by the maintainer
```

## 1. Open an issue first

**Every change starts as an issue that states the need**, before any code. Use the *Change* form: what is missing or wrong and for whom, which plugins it touches, and the acceptance criteria as a checklist. A pull request with no issue behind it is asked to open one.

When the work is done, put the evidence for each criterion on the issue as a comment — what you ran and what it printed — and tick the criterion it proves. A criterion nothing proves stays unticked.

**A vulnerability is never an issue.** Report it privately, as [`SECURITY.md`](./SECURITY.md) describes.

## 2. Work on a branch

| Branch | For |
|---|---|
| `feat/<slug>` | new functionality: a plugin, a skill, an agent |
| `fix/<slug>` | a correction to something that exists |
| `docs/<slug>` | documentation only |

Keep the slug short and kebab-case. Never commit to `main`; the full git rules are in [`.claude/rules/git-workflow.md`](./.claude/rules/git-workflow.md).

## 3. One pull request per issue

- The description says why, what changes and how to verify it, and ends with `Closes #N` — the template carries that shape.
- **CI must be green**: [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs the unit suites and the free install stage. Run `node --test "**/*.test.js"` locally first.
- **The maintainer merges, squashed.** Nobody else merges, and `main` is never pushed to directly or force-pushed.

## Versions and releases

- **Bump `plugin.json#version` in every plugin your change touches.** A consumer re-fetches a plugin only when that field changes, so a change without a bump ships nothing. Which digit moves is stated once, under *Versioning* in [`plugins/CLAUDE.md`](./plugins/CLAUDE.md).
- **The major version of anything is raised only by the maintainer.** Propose a breaking change in its issue and wait.
- A release is a `vX.Y.Z` tag the maintainer pushes. Each plugin keeps its own version; the tag does not replace it.

## What never goes into a commit

- **No secret and no private key** — no token, no password, no credential file. Only public keys belong in a repository.
- **No private host, tailnet or organisation name, home directory or personal e-mail address.** Everything committed is public; test fixtures use `alice` and `contoso`.
- **Nothing in a language other than English** — code, comments, documents and commit messages alike.

The conventions for what you write — scripts, markdown, diagrams, skills — are in [`CLAUDE.md`](./CLAUDE.md) and the rules under [`.claude/rules/`](./.claude/rules/).
