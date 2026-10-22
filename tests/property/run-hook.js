"use strict";

//
// Runs .claude/hooks/git-guard.js exactly as Claude Code does: a separate node process, the payload
// on stdin, the decision on stdout. The hook keeps its state at the top level, so a fresh process
// per payload is the only honest way to judge it.
//
// The process runs in a scratch directory outside any repository, and without CLAUDE_PROJECT_DIR,
// so no branch lookup can land on a real checkout's `main` and every decision comes from the
// command text alone.
//

const childProcess = require("node:child_process");
const fileSystem = require("node:fs");
const operatingSystem = require("node:os");
const path = require("node:path");

const HOOK_PATH = path.join(__dirname, "..", "..", ".claude", "hooks", "git-guard.js");

// The hook's settings.json timeout; a run that takes longer is a failure in itself.
const HOOK_TIMEOUT_MILLISECONDS = 5000;

const scratchDirectory = fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), "git-guard-property-"));

const hookEnvironment = { ...process.env };
delete hookEnvironment.CLAUDE_PROJECT_DIR;

// Run the hook on raw stdin; returns { status, stdout, stderr }.
function runHookOnInput(standardInput)
{
    const result = childProcess.spawnSync(process.execPath, [HOOK_PATH],
    {
        input: standardInput,
        cwd: scratchDirectory,
        env: hookEnvironment,
        encoding: "utf8",
        timeout: HOOK_TIMEOUT_MILLISECONDS,
    });

    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

// Run the hook on a Bash tool call, from the scratch directory.
function runHookOnCommand(command)
{
    return runHookOnInput(JSON.stringify(
    {
        tool_name: "Bash",
        tool_input: { command },
        cwd: scratchDirectory,
    }));
}

// The hook's decision: "allow" (empty stdout), { deny: reason }, or "malformed" for anything else.
function readDecision(result)
{
    if (result.stdout === "")
    {
        return "allow";
    }

    try
    {
        const response = JSON.parse(result.stdout);
        const output = response.hookSpecificOutput;

        if (output.hookEventName === "PreToolUse"
            && output.permissionDecision === "deny"
            && typeof output.permissionDecisionReason === "string")
        {
            return { deny: output.permissionDecisionReason };
        }
    }
    catch
    {
        // Unparseable or wrongly shaped stdout: reported as malformed below, which fails the property.
    }

    return "malformed";
}

function removeScratchDirectory()
{
    fileSystem.rmSync(scratchDirectory, { recursive: true, force: true });
}

module.exports = { runHookOnInput, runHookOnCommand, readDecision, removeScratchDirectory, scratchDirectory };
