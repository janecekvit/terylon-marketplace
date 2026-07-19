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
 * Protocol: stdin carries JSON { tool_name, tool_input, ... }.
 *   Allow = exit 0 with no stdout.
 *   Deny  = exit 0 with a JSON payload on stdout whose
 *           hookSpecificOutput.permissionDecision is "deny".
 *
 * Runs on Windows and Debian alike — Node only, no dependencies.
 */

const { execSync } = require("node:child_process");
const fileSystem = require("node:fs");

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
 * Tokenize one invocation and, if it is a git command, return its subcommand and
 * the arguments that follow. Returns null when the invocation is not git at all.
 *
 * Strips leading `VAR=value` assignments and the global git options that consume
 * the next token, so `GIT_DIR=x git -C /repo push origin main` still resolves to
 * the subcommand `push`.
 */
function parseGitInvocation(invocation)
{
    // Quotes carry no meaning for us — `"main"` and `main` are the same refspec.
    const tokens = invocation.trim().split(/\s+/).map(token => token.replace(/^["']|["']$/g, "")).filter(Boolean);
    let index = 0;

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
        if (GIT_OPTIONS_WITH_VALUE.has(tokens[index]))
        {
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

    return { subcommand: tokens[index], args: tokens.slice(index + 1) };
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

function getCurrentBranch()
{
    const projectDirectory = process.env.CLAUDE_PROJECT_DIR || process.cwd();

    try
    {
        const branchOutput = execSync("git symbolic-ref --short HEAD",
        {
            stdio: ["ignore", "pipe", "ignore"],
            cwd: projectDirectory,
        });

        return branchOutput.toString().trim();
    }
    catch
    {
        // Detached HEAD, or not a git repository at all.
        return null;
    }
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
const toolCommand = String((payload.tool_input || {}).command || "");

const gitInvocations = toolName === "Bash"
    ? splitIntoInvocations(toolCommand).map(parseGitInvocation).filter(Boolean)
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

    if (refspecs.some(refspec => MAIN_REFSPEC_PATTERN.test(refspec))
        || flags.some(flag => PUSH_EVERYTHING_FLAGS.has(flag))
        || (noRefspecGiven && getCurrentBranch() === "main"))
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

const currentBranch = getCurrentBranch();

if (currentBranch !== "main")
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
