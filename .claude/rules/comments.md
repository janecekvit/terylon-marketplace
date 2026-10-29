---
paths:
  - "**/*.js"
  - "**/*.cjs"
  - "**/*.mjs"
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.yml"
  - "**/*.yaml"
  - "**/*.sh"
---

# Code comments

Applies to every comment in code: the Node.js scripts, hooks and tests, the pane's TypeScript, the workflows' YAML and any shell script. Layout and naming are `scripting.md`'s; this file owns what a comment may say.

| Comment | Rule |
|---|---|
| **Inline**, inside a body | **at most 2 lines**. It says *why*, never *what* the next line does |
| **Summary**, above a function, a constant or a file | only where it adds what the name does not say; **at most 10 lines** |
| A named constant (`scripting.md`, *Remaining layout rules*) | what it matches and why, in one line or two |
| An expected failure caught on purpose | says so on the `catch` (`scripting.md`, *Error handling*) |

**Code carries no history.** No pull request, issue or work-item reference (`#42`, `PR 42`, `pull/42`, `work item 42`) and no date in a comment. A comment states what is true of the code now; why it changed, and when, is the commit's, the pull request's and the issue's, which stay true because they are never edited. A test named after the defect it holds is named for the behaviour, not for the issue.

**A dated measurement belongs to documentation, not to a comment** — `documentation.md` owns its form. A comment that needs one points at the document that carries it.

**Enforcement is a warning.** `.github/workflows/history-check.yml` runs `tests/no-history-in-code/no-history-in-code.js` on every pull request: it reads the added lines of the diff, keeps the comments, and annotates each that names a reference or a date. It never fails the build and is never a required check, because a false positive must not block a merge.

The rule binds the lines a change adds. Existing comments are brought to it when their file is touched for another reason, not in a sweep.
