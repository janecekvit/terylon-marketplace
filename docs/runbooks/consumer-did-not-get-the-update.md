# A consumer repository is still running the old version of a skill

You changed a skill, merged it to `main`, and a product repository that enables the plugin still behaves the old way. Nothing errored.

## Symptom

```
no error at all — the merged change is simply absent

the session loads the skill, follows the previous wording,
and every command it issues succeeds
```

This failure is silent by construction. Nothing in the path from a merge to a consumer session reports "you are behind", so the only signal is behaviour that does not match the file you edited.

## Diagnosis

Cheapest discriminating check first.

```
  did plugin.json#version change in the merge?
        │ no  ──▶ cause A — the bump was forgotten           (most common)
        ▼ yes
  is that merge on GitHub's main, not only on Azure DevOps?
        │ no  ──▶ cause F — main was never pushed to GitHub
        ▼ yes
  does the consumer's marketplace entry have autoUpdate: true?
        │ no  ──▶ cause B — nothing ever refreshes
        ▼ yes
  does the consumer's source.ref point at the branch you merged into?
        │ no  ──▶ cause C — they track a different ref
        ▼ yes
  can that machine fetch the marketplace repository non-interactively?
        │ no  ──▶ cause D — the background fetch fails quietly
        ▼ yes
  does enabledPlugins actually name the plugin you changed?
              ──▶ cause E — a sibling plugin was bumped, this one was not
```

| Check | Command | Reading it |
|---|---|---|
| Was the version bumped? | `git log -p -1 -- plugins/<slug>/.claude-plugin/plugin.json` | no `version` line in the diff means cause A |
| Did `main` reach GitHub? | `git ls-remote origin refs/heads/main` and `git ls-remote github refs/heads/main` | two different commits means cause F |
| What does the consumer track? | read their `.claude/settings.json`, and any `.claude/settings.local.json` beside it | `source.ref`, and whether `autoUpdate` is present as a **sibling** of `source` |
| Can that machine fetch? | `git ls-remote <marketplace url>` on the consumer's machine | a prompt or a failure means cause D |
| Which version is installed? | `ls ~/.claude/plugins/cache/<marketplace>/<plugin>/` | the directory names are the versions on disk |

**Causes A, F and D produce an identical symptom** — the consumer stays on the version they had, with nothing said. The `git log` and `git ls-remote` checks separate them, and they come first for that reason.

## Fix

| Cause | Fix |
|---|---|
| **A** — the bump was forgotten | Bump `plugins/<slug>/.claude-plugin/plugin.json#version` on a new branch and merge it. Patch if you are still on the branch that made the change, minor if the branch is new. A commit that only bumps the version is a legitimate commit |
| **B** — no `autoUpdate` | Add `"autoUpdate": true` as a **sibling** of `source` in the consumer's `extraKnownMarketplaces.<name>` entry — not inside `source`. Until then they must run `/plugin marketplace update` by hand |
| **C** — wrong `ref` | Point `source.ref` at the branch you merged into, normally `main`. A `settings.local.json` overriding `ref` for local testing outranks the committed file and is the usual culprit |
| **D** — the background fetch cannot reach the marketplace | The marketplace is public on GitHub, so no credential is involved: look for a proxy, a firewall or an offline machine, and run `/plugin marketplace update` by hand once it can reach `github.com` |
| **F** — merged on Azure DevOps, not pushed to GitHub | Push `main` to GitHub as [`flows/change-to-consumer-repo.md`](../flows/change-to-consumer-repo.md) describes under *How `main` reaches GitHub*, then check that both heads print the same commit |
| **E** — the wrong plugin was bumped | Bump every plugin the change touched. A consumer fetches per plugin, so a bumped port with an unbumped adapter ships the half that was written against the half that did not arrive |

After any of these, confirm from the consumer's side: the cache directory for the new version exists, and a fresh session picks it up.

## Why it happens

**A consumer re-fetches a plugin only when `plugin.json#version` changes.** There is no content hash, no timestamp, no "the branch moved" signal — that one field is the entire contract, and nothing guards it. Every other step in the path fails loudly; this one does not fail at all.

The full path, with each hop's owner and which of them are silent, is in [`flows/change-to-consumer-repo.md`](../flows/change-to-consumer-repo.md).

## Gotchas

**A `settings.local.json` is gitignored and outranks the committed settings.** Someone testing a marketplace branch locally, months ago, is the most common cause C — and it is invisible in the repository.

**The cache keeps every version.** `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/` means an old and a new copy sit side by side. Reading a skill out of the cache to check whether the change arrived, and reading the older directory, produces a very convincing wrong answer.

**Bumping without merging changes nothing**, and neither does merging into a branch nobody tracks. The version must be on the ref in `source.ref`.

## Where it lives

| File | Role |
|---|---|
| `plugins/<slug>/.claude-plugin/plugin.json` | `version` — the only field a consumer compares |
| `.claude-plugin/marketplace.json` | `plugins[]` — which plugins this marketplace publishes and where each one lives |
| `README.md` | the consumer-facing `settings.json` snippet, including `autoUpdate` as a sibling of `source` |
| `plugins/CLAUDE.md` | *Versioning* — the branch-scoped digit table |
| `.claude/rules/git-workflow.md` | *Plugin version bumps* — the rule the bump belongs to |
| `docs/flows/change-to-consumer-repo.md` | the whole path, and which hops fail silently |
| `docs/onboarding/marketplace-development.md` | the local `ref` override that causes C |
