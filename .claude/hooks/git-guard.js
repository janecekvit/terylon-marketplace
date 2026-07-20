#!/usr/bin/env node

/**
 * PreToolUse hook — enforces the branch rules from .claude/rules/git-workflow.md.
 *
 * Blocks, from any branch:
 *   - pushing to main (main is reached only through a pull request), including
 *     --all, --mirror, and a bare `git push` while HEAD is on main
 *   - force pushing without explicit per-operation consent, including the
 *     `+refspec` spelling
 *
 * Blocks, while HEAD is on main:
 *   - Edit / Write
 *   - git commit
 *
 * The command is tokenized rather than pattern-matched against raw text. An
 * earlier regex-only version was bypassed by `git -C <path> push origin main`,
 * `git push origin "main"`, `git push origin +main`, and anything chained behind
 * `&&` — all of which now reach the same check.
 *
 * This is defence in depth, not a sandbox: it guards against an honest slip, not
 * against a determined attempt to evade it. Shell metaprogramming (variable
 * expansion, aliases, a script that pushes) still gets through, which is why
 * .claude/settings.json carries the same rules in permissions.deny.
 *
 * The branch is resolved from the directory the operation actually targets, not
 * from CLAUDE_PROJECT_DIR. That variable keeps pointing at the original checkout
 * even when the session works inside a linked worktree, so reading it made the
 * guard see `main` and refuse every Edit/Write in a worktree that was correctly
 * on a feature branch — blocking the very isolation create-workspace sets up.
 *
 * Protocol: stdin carries JSON { tool_name, tool_input, ... }.
 *   Allow = exit 0 with no stdout.
 *   Deny  = exit 0 with a JSON payload on stdout whose
 *           hookSpecificOutput.permissionDecision is "deny".
 *
 * Runs on Windows and Debian alike — Node only, no dependencies.
 */

const { execSync } = require("node:child_process");
const fileSystem = require("node:fs");
const path = require("node:path");

/**
 * Match `main` only as a whole refspec token, never as a fragment of a longer
 * branch name — `fix/domain-main-fix` must stay pushable. Covers `main`,
 * `HEAD:main`, `<source>:main`, `main:<destination>`, the `refs/heads/main`
 * long form of each, and the `+main` force variant.
 */
const MAIN_REFSPEC_PATTERN = /^\+?(([^:]*):)?(refs\/heads\/)?main$/;

/** Force push in any of its spellings. `+<refspec>` is force too, and easy to miss. */
const FORCE_PUSH_FLAGS = new Set(["--force", "-f", "--force-with-lease", "--force-if-includes"]);

/** Pushes everything, so it pushes main. Same for --mirror. */
const PUSH_EVERYTHING_FLAGS = new Set(["--all", "--mirror"]);

/**
 * Git options that take a value, so the token after them is an argument rather
 * than the subcommand. `git -C <path> push …` is the one that matters in practice.
 */
const GIT_OPTIONS_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"]);

/**
 * The subset of those that point git at a different repository. Each one moves
 * the operation somewhere other than the shell's own directory, so each one
 * moves the branch the guard must ask about. Capturing only `-C` left
 * `git --git-dir <main>/.git commit` free to land on main from a worktree.
 */
const GIT_OPTIONS_THAT_REDIRECT = new Set(["-C", "--git-dir", "--work-tree"]);

/** Bound on the upward walk to an existing ancestor — a cycle must not spin here. */
const MAXIMUM_ANCESTOR_WALK_DEPTH = 64;

const FILE_WRITING_TOOLS = ["Edit", "Write"];

/**
 * Split a shell command into its separate invocations. A guard that only reads
 * the first one is bypassed by `true && git push origin main`.
 */
function splitIntoInvocations(command)
{
    return command.split(/&&|\|\||;|\||\n/);
}

/**
 * Tokenize one invocation and, if it is a git command, return its subcommand, the
 * arguments that follow, and the directory it redirects to when it names one.
 * Returns null when the invocation is not git at all.
 *
 * Strips leading `VAR=value` assignments and the global git options that consume
 * the next token, so `GIT_DIR=x git -C /repo push origin main` still resolves to
 * the subcommand `push`.
 *
 * The redirecting options are kept rather than merely skipped: `git -C <worktree>
 * commit` operates on that worktree's branch, so the guard must ask that
 * directory and not the shell's. Both the separated (`-C <path>`) and joined
 * (`--git-dir=<path>`) spellings are captured — skipping either leaves a
 * redirection the guard cannot see.
 */
function parseGitInvocation(invocation)
{
    // Quotes carry no meaning for us — `"main"` and `main` are the same refspec.
    const tokens = invocation.trim().split(/\s+/).map(token => token.replace(/^["']|["']$/g, "")).filter(Boolean);
    let index = 0;
    let explicitDirectory = null;

    while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index]))
    {
        index++;
    }

    if (tokens[index] !== "git")
    {
        return null;
    }

    index++;

    while (index < tokens.length && tokens[index].startsWith("-"))
    {
        const joinedMatch = tokens[index].match(/^(--[a-z-]+)=(.*)$/);

        if (joinedMatch !== null && GIT_OPTIONS_THAT_REDIRECT.has(joinedMatch[1]))
        {
            explicitDirectory = joinedMatch[2] || explicitDirectory;
            index++;
        }
        else if (GIT_OPTIONS_WITH_VALUE.has(tokens[index]))
        {
            if (GIT_OPTIONS_THAT_REDIRECT.has(tokens[index]))
            {
                explicitDirectory = tokens[index + 1] || explicitDirectory;
            }

            index += 2;
        }
        else
        {
            index++;
        }
    }

    if (index >= tokens.length)
    {
        return null;
    }

    return { subcommand: tokens[index], args: tokens.slice(index + 1), directory: explicitDirectory };
}

/**
 * Walk the invocations of one shell command in order and return the git ones,
 * each tagged with the directory it will actually run in.
 *
 * Order matters because `cd` persists: in `cd <main-checkout> && git commit`, the
 * commit lands on main even though the shell started in a worktree. Reading the
 * payload's cwd alone answers for where the command *began*, not where each
 * invocation *runs*, and a guard that trusts a directory the operation has
 * already left is not guarding it.
 *
 * `pushd`/`popd` are not tracked; they would need a directory stack, and nothing
 * in this repo's workflows uses them. A `cd` whose target cannot be determined
 * clears the running directory, so resolution falls back rather than trusting a
 * stale one.
 */
function parseCommandChain(command, startDirectory)
{
    const gitInvocations = [];
    let runningDirectory = startDirectory;

    for (const invocation of splitIntoInvocations(command))
    {
        const tokens = invocation.trim().split(/\s+/).map(token => token.replace(/^["']|["']$/g, "")).filter(Boolean);

        if (tokens[0] === "cd")
        {
            const target = tokens[1];

            runningDirectory = target
                ? path.resolve(runningDirectory || process.cwd(), target)
                : null;

            continue;
        }

        const parsed = parseGitInvocation(invocation);

        if (parsed === null)
        {
            continue;
        }

        gitInvocations.push(
        {
            subcommand: parsed.subcommand,
            args: parsed.args,
            directory: parsed.directory || runningDirectory,
        });
    }

    return gitInvocations;
}

function readStandardInput()
{
    try
    {
        return fileSystem.readFileSync(0, "utf8");
    }
    catch
    {
        // Unreadable stdin must not block the user's work.
        return "";
    }
}

function parsePayload(rawInput)
{
    if (!rawInput)
    {
        return null;
    }

    try
    {
        return JSON.parse(rawInput);
    }
    catch
    {
        // Malformed payload — fail open rather than blocking on our own bug.
        return null;
    }
}

/**
 * Walk up from `startDirectory` to the nearest directory that exists. A Write can
 * name a file in a directory that is not there yet; asking git about a path that
 * does not exist yields nothing, and a guard that answers "no branch" is a guard
 * that lets the write through.
 *
 * The ancestor is not guaranteed to be in the same worktree — under the default
 * `.worktrees/<slug>` layout, walking far enough up leaves the worktree and
 * reaches the main checkout. That direction is safe: it reports `main` and the
 * write is refused. The unsafe direction would be reporting a feature branch for
 * an operation on main, which walking upward cannot produce.
 *
 * A relative path is anchored to `baseDirectory` (the shell's own cwd), never to
 * wherever this hook process happens to be running.
 */
function nearestExistingDirectory(startDirectory, baseDirectory)
{
    let directory = path.resolve(baseDirectory || process.cwd(), startDirectory);

    for (let depth = 0; depth < MAXIMUM_ANCESTOR_WALK_DEPTH; depth++)
    {
        if (fileSystem.existsSync(directory))
        {
            return directory;
        }

        const parent = path.dirname(directory);

        if (parent === directory)
        {
            return null;
        }

        directory = parent;
    }

    return null;
}

/** Branch lookups are memoized per directory — both guards may ask for the same one. */
const branchCache = new Map();

function getCurrentBranch(directory, baseDirectory)
{
    const resolvedDirectory = nearestExistingDirectory(directory || baseDirectory || process.cwd(), baseDirectory);

    if (resolvedDirectory === null)
    {
        return null;
    }

    if (branchCache.has(resolvedDirectory))
    {
        return branchCache.get(resolvedDirectory);
    }

    let branch = null;

    try
    {
        const branchOutput = execSync("git symbolic-ref --short HEAD",
        {
            stdio: ["ignore", "pipe", "ignore"],
            cwd: resolvedDirectory,
        });

        branch = branchOutput.toString().trim();
    }
    catch
    {
        // Detached HEAD, or not a git repository at all.
        branch = null;
    }

    branchCache.set(resolvedDirectory, branch);

    return branch;
}

/**
 * The directory whose branch governs this tool call.
 *
 * Edit/Write are governed by the worktree holding the target file. Bash is
 * governed by `git -C <path>` when given, otherwise by the shell's own cwd as
 * reported in the payload. CLAUDE_PROJECT_DIR is the last resort only: it names
 * the original checkout, which is the wrong answer inside a linked worktree.
 */
function resolveGoverningDirectory(toolInput, payloadWorkingDirectory, explicitDirectory)
{
    if (explicitDirectory)
    {
        return explicitDirectory;
    }

    const filePath = toolInput.file_path;

    if (typeof filePath === "string" && filePath.length > 0)
    {
        return path.dirname(filePath);
    }

    return payloadWorkingDirectory || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function denyWithReason(reason)
{
    const response =
    {
        hookSpecificOutput:
        {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: reason,
        },
    };

    process.stdout.write(JSON.stringify(response));
    process.exit(0);
}

const payload = parsePayload(readStandardInput());

if (payload === null)
{
    process.exit(0);
}

const toolName = payload.tool_name || "";
const toolInput = payload.tool_input || {};
const toolCommand = String(toolInput.command || "");
const payloadWorkingDirectory = typeof payload.cwd === "string" ? payload.cwd : null;

const gitInvocations = toolName === "Bash"
    ? parseCommandChain(toolCommand, payloadWorkingDirectory)
    : [];

// ---------------------------------------------------------------------------
// Guard 1 — pushes to main are refused from ANY branch, not just while on main.
// Without this, a feature branch could still run `git push origin HEAD:main`
// and bypass the pull request entirely.
//
// Works off the tokenized command rather than the raw text: `git -C <path> push`,
// a quoted refspec, and a push hidden behind `&&` all reach the same check.
// ---------------------------------------------------------------------------

for (const invocation of gitInvocations.filter(candidate => candidate.subcommand === "push"))
{
    const refspecs = invocation.args.filter(argument => !argument.startsWith("-"));
    const flags = invocation.args.filter(argument => argument.startsWith("-"));

    // `git push` with no refspec pushes the current branch per push.default, and
    // on main that is a push to main. Treated as targeting main to stay safe.
    const noRefspecGiven = refspecs.length <= 1;

    const pushDirectory = resolveGoverningDirectory(toolInput, payloadWorkingDirectory, invocation.directory);

    // `git push origin HEAD` names no branch either — on main it is a push to main.
    const pushesHead = refspecs.some(refspec => refspec === "HEAD" || refspec === "+HEAD");

    if (refspecs.some(refspec => MAIN_REFSPEC_PATTERN.test(refspec))
        || flags.some(flag => PUSH_EVERYTHING_FLAGS.has(flag))
        || ((noRefspecGiven || pushesHead) && getCurrentBranch(pushDirectory, payloadWorkingDirectory) === "main"))
    {
        denyWithReason(
            "Refuse to push to main — main is reached only through a pull request " +
            "(see .claude/rules/git-workflow.md)."
        );
    }

    if (flags.some(flag => FORCE_PUSH_FLAGS.has(flag))
        || refspecs.some(refspec => refspec.startsWith("+")))
    {
        denyWithReason(
            "Refuse to force-push without explicit per-operation consent " +
            "(see .claude/rules/git-workflow.md)."
        );
    }
}

// ---------------------------------------------------------------------------
// Guard 2 — the remaining rules apply only while HEAD is actually on main.
// Establish first whether either rule could fire; if not, exit before paying for
// the git spawn (~33 ms measured, a third of Node's own startup).
// ---------------------------------------------------------------------------

const isFileWritingTool = FILE_WRITING_TOOLS.includes(toolName);
const isGitCommit = gitInvocations.some(invocation => invocation.subcommand === "commit");

if (!isFileWritingTool && !isGitCommit)
{
    process.exit(0);
}

// EVERY commit in the chain is checked, not just the first. Reading only the
// first meant `git -C <worktree> commit && git commit` was governed by the
// worktree alone while the second commit landed on main — and a `-C` pointing
// nowhere disarmed the guard just as well. Guard 1 loops for the same reason.
const governingDirectories = isFileWritingTool
    ? [resolveGoverningDirectory(toolInput, payloadWorkingDirectory, null)]
    : gitInvocations
        .filter(invocation => invocation.subcommand === "commit")
        .map(invocation => resolveGoverningDirectory(toolInput, payloadWorkingDirectory, invocation.directory));

const landsOnMain = governingDirectories.some(
    directory => getCurrentBranch(directory, payloadWorkingDirectory) === "main"
);

if (!landsOnMain)
{
    process.exit(0);
}

if (isFileWritingTool)
{
    denyWithReason(
        "Refuse to modify files while on main — create a feature branch first " +
        "(see .claude/rules/git-workflow.md)."
    );
}

if (isGitCommit)
{
    denyWithReason(
        "Refuse to commit on main — create a feature branch first " +
        "(see .claude/rules/git-workflow.md)."
    );
}

process.exit(0);
