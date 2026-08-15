# Terylon knowledge base

Engineering deep dives for this marketplace — **how it actually works end to end, and why it was built that way**.

This is not a folder inventory and not a coding standard. Those live elsewhere; see *Where does my documentation go?* below.

> **Kick-off state.** Every section below is real but small. A section with one honest article beats seven placeholders, so articles land as the knowledge appears rather than as a skeleton to fill in later.

## Sections

| Section | Answers questions about |
|---|---|
| [architecture](./architecture/README.md) | **Why** the marketplace is shaped the way it is — the static view. **Architecture Decision Records live here**, one decision per file |
| [flows](./flows/README.md) | **How** something travels end to end — the dynamic view. A change reaching a product repository; a run choosing its forge |
| [runbooks](./runbooks/README.md) | What to do when something is broken. One symptom per file, and the symptom is the title |
| [onboarding](./onboarding/README.md) | Getting a repository, a person or an agent productive against this marketplace |

## Where does my documentation go?

Five documentation stores coexist in this repository, and one of them ships to other repositories. **The boundary between all five is stated once, in the root [`CLAUDE.md`](../CLAUDE.md), under *Documentation*** — the table of what each store answers, and the test that routes a fact to one of them. Read it there; it is not repeated here.

What that leaves for this file is the one boundary the table cannot express, because it is about subject rather than about store:

**Never document a product repository's workflow here.** This knowledge base covers the marketplace itself. How a consuming repository builds, tests or releases belongs in that repository.

## Article structure

### Simple article

A single file directly in the section folder:

```
architecture/port-and-adapter-split.md
```

### Article with images or attachments

A folder with `README.md` and the assets beside it:

```
flows/change-to-consumer-repo/
├── README.md
└── diagram.png
```

Both Azure DevOps and GitHub render `README.md` automatically when a folder is opened, so navigation stays seamless. Reference an asset with a relative path: `![Description](./diagram.png)`. Binaries go through Git LFS — see `.gitattributes`.

### The skeleton

```
# Title

One paragraph: what this is, who reads it, why they should care.

## <the shape>        a diagram of the flow, the split, the decision tree
## <detail sections>  tables of rules and cases, not paragraphs
## Gotchas            what will bite you (optional)
## Where it lives     a File | Role table (mandatory)
```

An ADR replaces the middle with `Context`, `The alternatives`, `Decision`, `Consequences`; a runbook replaces it with `Symptom`, `Diagnosis`, `Fix`, `Why it happens`. Both still end with `Where it lives`. Each section's `README.md` states what its own shape has to carry, and the seeded articles are the worked examples — read the nearest one rather than starting from a blank file.

### `## Where it lives` is mandatory

It is a table, never a bullet list:

```markdown
| File | Role |
|---|---|
| `plugins/terylon-forge/skills/resolve-forge/SKILL.md` | `resolve-forge` — the four-step precedence and the stop condition |
| `plugins/terylon-ado/.mcp.json` | registers the `ado` server; passes `${TERYLON_ADO_ORG}` bare |
```

**The Role column leads with the type or symbol**, not with a description of the file. `resolve-forge — the four-step precedence` tells a reader what to open and what to look for inside it; "the forge logic" does not.

The section does three jobs, and the third is the one that decides how you write it:

1. It is the jump table from the article into the code.
2. It is a staleness detector — a path that no longer resolves means the article is out of date.
3. **It is the reverse index `docs-sync.md` greps.** `grep -rn "<path you changed>" docs/` is the only reliable way to find the articles a diff invalidates, so **name paths literally**. A path spelled loosely is a path the search will miss.

**Never elide a shared prefix.** Stating it once above the table and shortening the rows reads better and defeats the search: `grep -rn "plugins/terylon-core/shared/oet.js" docs/` finds nothing when the row says `shared/oet.js`. Repetition is the price of the reverse index, and it is a low one.

## The register

Four rules, and they are rules rather than preferences.

**An article describes a whole, not a shard.** One article is one thing a reader can understand without opening a second. If the explanation breaks across two files, either it is one article split wrongly, or they are two things and each deserves its own.

**Definite, not hedged.** Write "the adapter is chosen from the git remote", not "is usually chosen from". Where a fact is genuinely uncertain, mark it `unverified` and say what would settle it — an explicit open question is information, a qualifier is not.

**A diagram beats a table, and a table beats a paragraph.** In that order of preference. Prose is the fallback, not the default; it carries the reasoning that neither of the other two can. The drawing rules — the character set, the fencing, the width ceiling, what not to draw — are in [`.claude/rules/markdown.md`](../.claude/rules/markdown.md) and are not restated here.

**Keep every claim next to its evidence.** A number that was measured says so and says by what. A claim with no visible provenance invites the next reader to simplify it away.

## Naming

Lowercase kebab-case for folders and files: `architecture/port-and-adapter-split.md`, `runbooks/consumer-did-not-get-the-update.md`.

**A runbook is named for its symptom**, because the symptom is what someone types into a search box while something is broken. `consumer-did-not-get-the-update` finds itself; `plugin-versioning-troubleshooting` does not.

**An ADR is named for the decision**, not for the problem: `superpowers-left-the-dependency-set`, not `dependency-review`.

English only. Relative links only — Azure DevOps does not render `[[wiki-links]]`.

## When you add an article

1. Put it in the section whose question it answers.
2. Add its line to that section's `README.md` index. **An article no index points at is an article nobody finds.**
3. Fill in `## Where it lives` with literal paths.

## Keeping it true

[`.claude/rules/docs-sync.md`](../.claude/rules/docs-sync.md) fires on architectural changes and asks whether an article here still tells the truth. Two things in it are worth knowing before you write:

- **Find the affected article by grepping, not by remembering.** The knowledge base is cross-cutting: a line changed in one plugin can invalidate a paragraph in a flow, a row in a runbook and a consequence in an ADR, none of which live anywhere near the file you edited.
- **An assumption recorded here is a debt.** This knowledge base is allowed to state open questions, so it collects them — and settling one carries an obligation, stated in [`.claude/rules/claude-md-sync.md`](../.claude/rules/claude-md-sync.md) and binding here too. An article still saying "unverified" about a measured fact costs the next reader the whole experiment again.
