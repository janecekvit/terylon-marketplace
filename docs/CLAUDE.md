# docs — the knowledge base

`docs/` holds the tracked engineering knowledge base plus two gitignored scratch trees. Know which one you are in.

```
docs/
├── README.md        authoring standard — read it before adding an article
├── architecture/    ADRs — why the marketplace is shaped this way
├── flows/           how something travels end to end
├── runbooks/        what to do when something is broken
├── onboarding/      getting a repository, a person or an agent productive
├── terylon/         GITIGNORED — one task's intake, spec, plan, ledger, monitoring
└── superpowers/     GITIGNORED — the same, when those skills run directly
```

## Read the knowledge base before the source

When a question maps to a section above, **read the article first** — do not answer from the plugin sources or from general knowledge without consulting it. The knowledge base is authoritative for how this marketplace actually behaves; the sources are authoritative for what it currently contains, which is a different question.

If the knowledge base does not cover it, answer normally, then ask whether the answer is durable enough to become an article.

## Do not file task material here

`docs/terylon/` and `docs/superpowers/` are **not** part of the knowledge base. They are gitignored task scratch — a design, a plan, a ledger, a spend measurement — discarded once the work ships. An article filed there is an article that disappears; a plan filed in a section is a plan that outlives its task and starts lying.

## The two rules that bind here

| Rule | Asks |
|---|---|
| [`.claude/rules/docs-sync.md`](../.claude/rules/docs-sync.md) | does an article anywhere in `docs/` still tell the truth? A search, not a look upward |
| [`.claude/rules/claude-md-sync.md`](../.claude/rules/claude-md-sync.md) | does the nearest `CLAUDE.md` still orient a reader? |

Both can fire on one change, and when they do they want different edits in different files.

Authoring conventions — the article skeleton, the mandatory `## Where it lives` table, the register, naming — live in [`README.md`](./README.md) beside this file. They are not repeated here.
