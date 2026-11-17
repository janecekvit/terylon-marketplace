#!/usr/bin/env node
"use strict";

// SessionStart and PostToolUseFailure hook — points a session that has Terylon's knowledge base at it.
//
// Why a hook: a search the model has to think of is a search that rarely happens. Said at the start, and again
// at the moment a tool call fails, the search becomes the default before the session works around an obstacle.
//
// Only a session with Terylon's knowledge tools hears anything: a story's run, known by the MCP configuration
// the worker writes, or a chat with the terylon-os plugin, known by TERYLON_URL. Every other session gets no
// output and no file. The hook only adds context; it sends nothing anywhere, and fails open throughout.

const fileSystem = require("fs");
const path = require("path");
const operatingSystem = require("os");
const crypto = require("crypto");

// The file Terylon's worker writes into the Claude configuration directory of every story's run.
const RUN_MCP_CONFIGURATION = "terylon-mcp-servers.json";

// The knowledge tools as each kind of session knows them: the run's server is "terylon", the chat's is the plugin's.
const TOOL_NAMES = Object.freeze(
{
    run: { search: "mcp__terylon__knowledge_search", propose: "mcp__terylon__knowledge_propose" },
    chat: { search: "mcp__plugin_terylon-os_terylon__knowledge_search", propose: "mcp__plugin_terylon-os_terylon__knowledge_propose" },
});

// A failure of Terylon's own knowledge or memory tools is not a reason to search the knowledge base.
const KNOWLEDGE_OR_MEMORY_TOOL = /^mcp__.*terylon.*__(knowledge|memory)_/;

// Bash and PowerShell open a failure with "Exit code N", which says nothing about which failure it was.
const EXIT_CODE_LINE = /^Exit code -?\d+$/;

// How many failure reminders one session hears at most.
const REMINDERS_PER_SESSION = 3;

const STATE_PREFIX = "terylon-knowledge-reminders-";

function readStandardInput()
{
    try
    {
        return fileSystem.readFileSync(0, "utf8");
    }
    catch
    {
        // Unreadable stdin is not a reason to block a session.
        return "";
    }
}

function parsePayload(rawInput)
{
    try
    {
        const parsed = JSON.parse(rawInput);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    }
    catch
    {
        // A malformed payload gets no output.
        return null;
    }
}

function claudeConfigurationDirectory(environment)
{
    return environment.CLAUDE_CONFIG_DIR || path.join(operatingSystem.homedir(), ".claude");
}

// "run", "chat" or null: which of Terylon's sessions this is, if any.
function detectSessionKind(environment)
{
    if (fileSystem.existsSync(path.join(claudeConfigurationDirectory(environment), RUN_MCP_CONFIGURATION)))
    {
        return "run";
    }

    if (typeof environment.TERYLON_URL === "string" && environment.TERYLON_URL.trim() !== "")
    {
        return "chat";
    }

    return null;
}

function startContext(sessionKind)
{
    const tools = TOOL_NAMES[sessionKind];

    return "Terylon's knowledge base of confirmed notes (gotchas, fix recipes, conventions) is connected. "
        + `Search it with \`${tools.search}\`: with the task's words before you start, and with an error's words before you work around a failure. `
        + `At the end, propose one note with \`${tools.propose}\` for what cost real time, none when nothing did; `
        + "a proposal waits for the owner's confirmation.";
}

function failureReminder(sessionKind)
{
    return `That call failed: before working around it, search the knowledge base with the words of the error (\`${TOOL_NAMES[sessionKind].search}\`).`;
}

function hash(text)
{
    return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

// The first line that names the failure, skipping a bare exit code line.
function failureLine(errorText)
{
    const lines = errorText.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "");
    const named = lines.find((line) => !EXIT_CODE_LINE.test(line));

    return named === undefined ? (lines[0] || "") : named;
}

function failureKey(toolName, errorText)
{
    return hash(toolName + "\n" + failureLine(errorText));
}

// The session id is hashed into the file name, so no value from the payload becomes a path.
function statePath(sessionId, temporaryDirectory)
{
    return path.join(temporaryDirectory, STATE_PREFIX + hash(sessionId).slice(0, 32) + ".json");
}

function readReminded(filePath)
{
    try
    {
        const parsed = JSON.parse(fileSystem.readFileSync(filePath, "utf8"));
        return Array.isArray(parsed.reminded) ? parsed.reminded.filter((key) => typeof key === "string") : [];
    }
    catch
    {
        // A missing or corrupt state file means nothing was reminded yet.
        return [];
    }
}

// True when this failure earns a reminder, recorded before it is given; false when throttled or the state cannot be kept.
function claimReminder(sessionId, toolName, errorText, temporaryDirectory)
{
    const filePath = statePath(sessionId, temporaryDirectory);
    const reminded = readReminded(filePath);
    const key = failureKey(toolName, errorText);

    if (reminded.includes(key) || reminded.length >= REMINDERS_PER_SESSION)
    {
        return false;
    }

    try
    {
        fileSystem.writeFileSync(filePath, JSON.stringify({ reminded: [...reminded, key] }) + "\n", "utf8");
    }
    catch
    {
        // Without its state the throttle cannot hold, so the reminder is not given.
        return false;
    }

    return true;
}

function output(eventName, additionalContext)
{
    return JSON.stringify({ hookSpecificOutput: { hookEventName: eventName, additionalContext } });
}

// What the hook prints for a payload, or null for nothing.
function respond(payload, environment, temporaryDirectory)
{
    if (payload === null) { return null; }

    const sessionKind = detectSessionKind(environment);

    if (sessionKind === null) { return null; }

    if (payload.hook_event_name === "SessionStart")
    {
        return output("SessionStart", startContext(sessionKind));
    }

    if (payload.hook_event_name !== "PostToolUseFailure") { return null; }

    const toolName = typeof payload.tool_name === "string" ? payload.tool_name : "";
    const sessionId = typeof payload.session_id === "string" ? payload.session_id : "";
    const errorText = typeof payload.error === "string" ? payload.error : "";

    // An abort is not an obstacle to search for, and a failed knowledge search would only be told to search again.
    if (toolName === "" || sessionId === "" || payload.is_interrupt === true || KNOWLEDGE_OR_MEMORY_TOOL.test(toolName))
    {
        return null;
    }

    if (!claimReminder(sessionId, toolName, errorText, temporaryDirectory)) { return null; }

    return output("PostToolUseFailure", failureReminder(sessionKind));
}

module.exports =
{
    REMINDERS_PER_SESSION,
    TOOL_NAMES,
    parsePayload,
    detectSessionKind,
    startContext,
    failureReminder,
    failureLine,
    statePath,
    respond,
};

if (require.main === module)
{
    try
    {
        const response = respond(parsePayload(readStandardInput()), process.env, operatingSystem.tmpdir());

        if (response !== null)
        {
            process.stdout.write(response + "\n");
        }
    }
    catch
    {
        // Nothing this hook can fail at is worth interrupting a session for.
    }

    process.exit(0);
}
