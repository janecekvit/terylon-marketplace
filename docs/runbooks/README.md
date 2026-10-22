# Runbooks

What to do when something is broken. One symptom per file.

**A runbook is named for its symptom**, because the symptom is what someone types into a search box while something is broken. `consumer-did-not-get-the-update` finds itself; `plugin-versioning-troubleshooting` does not.

## Articles

| Runbook | Symptom |
|---|---|
| [consumer-did-not-get-the-update](./consumer-did-not-get-the-update.md) | "I changed a skill, merged it, and the product repository still runs the old one" |
| [releasing](./releasing.md) | you are about to push a release tag, a release run failed, or you hold a `terylon-marketplace-vX.Y.Z.tar.gz` and need to know it is the one this repository built |
| [ado-mcp-authorization-error](./ado-mcp-authorization-error.md) | an authorization or "not found" error naming an Azure DevOps organisation nobody chose, the `ado` sign-in failing or waiting in `/mcp` — or the `ado` tools missing entirely |

## Writing one

The shape is fixed, because someone reads it under pressure:

```
## Symptom      exactly as it appears — the error text, or the silent wrong behaviour
## Diagnosis    a decision tree that separates the causes, cheapest check first
## Fix          per cause, the specific action
## Why it happens   the mechanism, last — after the reader is unblocked
```

**Symptom first, mechanism last.** A runbook that opens with an explanation of the architecture makes a reader scroll while production is down.

**The diagnosis is a tree, not a list.** A list of possible causes leaves the reader to guess the order; a tree with the cheapest discriminating check at the top does not.

**Every cause is distinguishable.** If two causes produce the identical symptom and the runbook cannot tell them apart, say so explicitly and give the check that would — an unstated ambiguity is how someone applies the wrong fix and concludes the runbook is wrong.
