# Architecture

Why this marketplace is shaped the way it is — the static view. **Architecture Decision Records live here**, one decision per file.

An ADR records a decision *and the reasoning that was overturned to reach it*. That is what separates it from the rest of the knowledge base: a flow describes what happens now, an ADR describes why the alternative was rejected.

## Articles

| Article | Records |
|---|---|
| [port-and-adapter-split](./port-and-adapter-split.md) | why `terylon-devops` broke into a port and two adapters, and why the port declares no adapter |
| [spend-measured-on-output-tokens](./spend-measured-on-output-tokens.md) | why a run's cost is measured from its own transcripts, weighted, rather than from the harness's figures |
| [superpowers-left-the-dependency-set](./superpowers-left-the-dependency-set.md) | why a dependency on a foreign marketplace was removed, and what replaced its six skills |
| [every-rule-has-one-owner](./every-rule-has-one-owner.md) | why a rule is stated once and pointed at everywhere else, what the first sweep found, and why nothing but review enforces it yet |

## Writing one

The shape, in order: a status line and the decision stated as a fact, `Context` (what forced it, with the arrangement that broke drawn), `The alternatives` (a table, one row per option, the chosen one marked), `Decision` (a rule in the present tense), `Consequences` (a table keyed good / cost / **constraint**), optional `Gotchas`, and `Where it lives`.

**The `Consequences` constraint rows are the ones that matter.** Name the specific act that would undo the decision, so the next person recognises it before committing it.

Three further things bind:

**Name the file for the decision, not the problem.** `superpowers-left-the-dependency-set`, not `dependency-review`.

**A reversed decision is superseded, never edited away.** An ADR is a record of what was decided when. Mark the old one superseded, link to the new one, and leave the overturned reasoning readable — the next person needs to see the argument that lost, or they will make it again.

**State the alternative you rejected and why.** An ADR whose Context section admits no other option was available is not recording a decision.

## What does not get an ADR

A decision already stated in full — with its failure mode and its reasoning — in the root `CLAUDE.md`, in `plugins/CLAUDE.md` or in a rule. A second copy diverges from the first, and the reader cannot tell which one is current.

The worked example: **`TERYLON_ADO_ORG` having no default gets no ADR.** The root `CLAUDE.md` states that decision in full — the silent failure it prevents, and why a missing required value must fail where it is missing. Every other mention states the requirement in whatever form its own reader needs, and re-argues none of it. An ADR would be one more copy of one argument.
