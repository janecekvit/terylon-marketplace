"use strict";

//
// ref — which git ref the harness installs, decided before anything is created.
//
// `marketplace add <url>#<ref>` clones with `--branch <ref>`, so the ref must be a branch or a tag.
// Measured on 2026-10-04 against Azure DevOps: a commit id, full or abbreviated, is refused with
// "Remote branch <sha> not found in upstream origin". So a detached HEAD cannot be resolved to its
// commit; without --ref the harness refuses up front and names the branches that point at HEAD.
//
// `git` is injected so the decision is unit-testable without a repository.
//

// What `git rev-parse --abbrev-ref HEAD` prints on a detached HEAD.
const DETACHED = "HEAD";

function resolveRef({ explicitRef, git })
{
    if (explicitRef !== undefined && explicitRef !== "")
    {
        return { ref: explicitRef };
    }

    const current = git(["rev-parse", "--abbrev-ref", "HEAD"]);

    if (current !== DETACHED && current !== "")
    {
        return { ref: current };
    }

    const commit = git(["rev-parse", "--short", "HEAD"]);
    const candidates = git(["branch", "--all", "--points-at", "HEAD", "--format=%(refname:short)"])
        .split("\n")
        .map((line) => line.trim())
        // "(no branch)" and "(HEAD detached at …)" are how git names the detached state itself.
        .filter((line) => line !== "" && !line.startsWith("(") && !line.endsWith("/HEAD"))
        .map((line) => line.replace(/^origin\//, ""));
    const unique = [...new Set(candidates)];
    const hint = unique.length === 0 ? "" : ` (${unique.map((name) => `--ref ${name}`).join(" or ")} points here)`;

    return { error: `detached HEAD at ${commit}: pass --ref <branch-or-tag>; marketplace add cannot install a commit id${hint}` };
}

module.exports = { resolveRef };
