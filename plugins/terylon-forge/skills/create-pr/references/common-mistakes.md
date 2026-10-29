# create-pr — common mistakes

- **Assuming a ref shape** — one forge wants full `refs/heads/<branch>` names and the other bare ones, so normalise to what `forge-ops` asks for rather than to what you remember. The stripping rule belongs to diff building, not here.
- **Assembling an identifier by hand** — the link operation wants what `resolve-repo-id` returned, and one forge rejects the names every neighbouring call accepts.
- **Validating candidate items in one batch** — where the forge nulls the whole batch on one unknown id, the good ones tell you nothing.
- **Trusting a number because it resolves** — PR ids and work-item ids collide. Run the plausibility gate.
- **Reporting auto-complete or a reviewer as set from the write response** — the response is trimmed. Read the PR back.
- **Creating the PR before the branch is pushed** — the server builds it from the remote ref.
- **Writing the description here** — it belongs to `write-pr-description`, along with the budget that keeps the forge's character cap from rejecting the call.
- **Issuing a platform call without loading `forge-ops` first** — every schema is `additionalProperties: false`, so a stale parameter name rejects the whole call.
- **Deriving the base from repo metadata instead of the detected integration branch** — the chain is `--base` → `origin/HEAD` → first of `main` / `master` / `develop`, matching `write-pr-description`. Any other rule makes the two disagree about what the PR is diffed against.
