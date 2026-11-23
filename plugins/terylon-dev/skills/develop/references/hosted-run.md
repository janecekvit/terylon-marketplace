# develop — a hosted run (`--no-finish`)

**`--no-finish` is for a host that finishes the branch itself**: a background run whose platform pushes the branch and opens the pull request, with the run working in the checkout it was given. It is used with `--auto --here`.

| What | Under `--no-finish` |
|---|---|
| **Gate 3** | skipped whole: no `finish-branch`, no push, no pull request. The run ends at `BUILD_COMPLETE` and reports the branch, its commits and the ledger path, then the token-spend report |
| **an adapter** | not needed when every item is prose or a seed-spec path: nothing is fetched from a forge and nothing is written to one. An item URL still needs its adapter, and without one the run says so and stops |
| **the per-task commits** | still made; the host's own instructions say whether each needs consent |
| **the working files** | the seed-spec, design, plan and ledger under `docs/terylon/` are the pipeline's, never the change's: commit none of them unless the host says otherwise |
| **the agents** | dispatched in the foreground, so the run's own turn waits for each return |
