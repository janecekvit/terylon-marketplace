# create-pr — verification

1. `/create-pr --dry-run` on a branch named `feat/<id>-<slug>` with two or more commits. Expect the forge reported in one line, the item detected from the branch name at high confidence, a description from `write-pr-description`, and **no writes of any kind**.
2. Same on a branch whose name carries a *pull request* id. Expect the candidate demoted by the plausibility gate and **not** auto-selected, with the reason named.
3. `/create-pr` on an unpushed branch. Expect a stop at step 3 asking permission to push — no PR, and no push under `--auto`.
4. `/create-pr` on a branch that already has an active PR. Expect top-up mode: no second PR, only the missing pieces filled, each reported.
5. `/create-pr --reviewers=<colleague>`. Expect a confirmation before the add; afterwards the read-back shows `isRequired` **absent** and the chat says "optional".
6. `/create-pr --auto-complete=squash --auto`. Expect creation and association to proceed while auto-complete still stops for a typed confirmation.
7. `/create-pr --auto-complete` on a draft PR. Expect refusal naming `isDraft` as the reason.

> **See also:** `write-pr-description` for the body, `review-pr` for the review pass, `address-pr-comments` for the inbound direction.
