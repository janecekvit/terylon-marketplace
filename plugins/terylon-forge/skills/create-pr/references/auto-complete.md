# create-pr — auto-complete

Refuse unless all hold, re-checked immediately before the write:

- the pull request is **active and not a draft** — a draft runs no policies, so auto-merge on a draft is a landmine that fires on publish
- it is **mergeable** — conflicts block it
- auto-merge is **not already set** by someone else

**Read those three the way `forge-ops` documents them, never from their English names.** One forge returns them as numbers and the other as words, so a gate written against `"active"` matches nothing on the numeric side and passes everything through. This is the likeliest way for this step to silently do nothing.

Then the `set-auto-merge` operation, with the strategy, whether to delete the source branch, and whether merging should transition the linked items.

- **Completion options may be sent whole.** Anything a human previously chose and you omit is reset. Read the current options first and echo them back.
- **Decide the item transition explicitly.** Where it defaults to on, merging advances every linked item on the board — a side effect outside git that the human must consent to.
- **Never send a policy-bypass reason.** It is the API equivalent of overriding branch policies, a permission-gated human decision. If asked, refuse and point at the forge's own interface.
- Pick a strategy the target branch's policy actually allows — a merge-commit strategy against a squash-only policy sits un-merged forever.

**The write's response cannot confirm this**, because it may strip the very fields it set. Read the pull request back and report what you observed. The same applies to *cancelling* auto-merge: if the setting survives the read-back, say the cancel did not take.
