"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fileSystem = require("fs");
const path = require("path");
const operatingSystem = require("os");
const childProcess = require("child_process");

const hook = require("./prompt-knowledge-search.js");

const HOOK_PATH = path.join(__dirname, "prompt-knowledge-search.js");
const HOOKS_JSON_PATH = path.join(__dirname, "hooks.json");

// The start context is read by every run and chat; it stays short so it costs little.
const START_CONTEXT_LIMIT = 600;

function temporaryDirectory()
{
    return fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), "knowledge-hook-"));
}

// A world with nothing of Terylon's in it, and the directories the hook may read and write.
function world()
{
    const configurationDirectory = temporaryDirectory();
    const stateDirectory = temporaryDirectory();

    return {
        configurationDirectory,
        stateDirectory,
        none: { CLAUDE_CONFIG_DIR: configurationDirectory },
        chat: { CLAUDE_CONFIG_DIR: configurationDirectory, TERYLON_URL: "https://terylon.example" },
        run()
        {
            fileSystem.writeFileSync(path.join(configurationDirectory, "terylon-mcp-servers.json"), "{}", "utf8");
            return { CLAUDE_CONFIG_DIR: configurationDirectory };
        },
    };
}

function startPayload()
{
    return { session_id: "session-a", hook_event_name: "SessionStart", source: "startup" };
}

function failurePayload(overrides)
{
    return Object.assign(
    {
        session_id: "session-a",
        hook_event_name: "PostToolUseFailure",
        tool_name: "Bash",
        tool_input: { command: "npm test" },
        error: "Exit code 1\nError: Cannot find module 'express'",
        is_interrupt: false,
    }, overrides);
}

function contextOf(response)
{
    return JSON.parse(response).hookSpecificOutput.additionalContext;
}

// Runs the hook as Claude Code does, with only the given environment and the state directory as the OS temp directory.
function runHook(input, environment, stateDirectory, extraArguments)
{
    const childEnvironment = Object.assign(
    {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TMPDIR: stateDirectory,
        TEMP: stateDirectory,
        TMP: stateDirectory,
    }, environment);

    return childProcess.spawnSync(process.execPath, [...(extraArguments || []), HOOK_PATH],
    {
        input,
        env: childEnvironment,
        encoding: "utf8",
    });
}

test("without Terylon's knowledge tools the hook prints nothing and writes nothing", () =>
{
    const setting = world();

    for (const payload of [startPayload(), failurePayload()])
    {
        const result = runHook(JSON.stringify(payload), setting.none, setting.stateDirectory);

        assert.strictEqual(result.status, 0);
        assert.strictEqual(result.stdout, "");
    }

    assert.deepStrictEqual(fileSystem.readdirSync(setting.stateDirectory), []);
});

test("an empty TERYLON_URL is not a chat connected to Terylon", () =>
{
    const setting = world();

    assert.strictEqual(hook.detectSessionKind({ CLAUDE_CONFIG_DIR: setting.configurationDirectory, TERYLON_URL: " " }), null);
});

test("a story's run is told at its start, with the run's tool names, in under 600 characters", () =>
{
    const setting = world();
    const result = runHook(JSON.stringify(startPayload()), setting.run(), setting.stateDirectory);
    const parsed = JSON.parse(result.stdout);
    const context = parsed.hookSpecificOutput.additionalContext;

    assert.strictEqual(result.status, 0);
    assert.strictEqual(parsed.hookSpecificOutput.hookEventName, "SessionStart");
    assert.ok(context.includes("`mcp__terylon__knowledge_search`"), context);
    assert.ok(context.includes("`mcp__terylon__knowledge_propose`"), context);
    assert.ok(!context.includes("mcp__plugin_terylon-os_terylon__"), context);
    assert.ok(context.length < START_CONTEXT_LIMIT, `${context.length} characters`);
});

test("a chat connected to Terylon is told at its start, with the plugin's tool names, in under 600 characters", () =>
{
    const setting = world();
    const result = runHook(JSON.stringify(startPayload()), setting.chat, setting.stateDirectory);
    const context = contextOf(result.stdout);

    assert.strictEqual(result.status, 0);
    assert.ok(context.includes("`mcp__plugin_terylon-os_terylon__knowledge_search`"), context);
    assert.ok(context.includes("`mcp__plugin_terylon-os_terylon__knowledge_propose`"), context);
    assert.ok(context.length < START_CONTEXT_LIMIT, `${context.length} characters`);
});

test("the start context says when to search and when to propose, and that a proposal waits for the owner", () =>
{
    const context = hook.startContext("run");

    assert.match(context, /task's words before you start/);
    assert.match(context, /error's words before you work around a failure/);
    assert.match(context, /propose one note .* for what cost real time, none when nothing did/);
    assert.match(context, /waits for the owner's confirmation/);
});

test("a run's configuration wins over TERYLON_URL: the run's server is the one it has", () =>
{
    const setting = world();
    const environment = Object.assign(setting.run(), { TERYLON_URL: "https://terylon.example" });

    assert.strictEqual(hook.detectSessionKind(environment), "run");
});

test("a failed tool call is reminded once per distinct failure", () =>
{
    const setting = world();
    const first = runHook(JSON.stringify(failurePayload()), setting.chat, setting.stateDirectory);
    const parsed = JSON.parse(first.stdout);

    assert.strictEqual(parsed.hookSpecificOutput.hookEventName, "PostToolUseFailure");
    assert.match(parsed.hookSpecificOutput.additionalContext, /search the knowledge base with the words of the error/);
    assert.ok(!parsed.hookSpecificOutput.additionalContext.includes("\n"), "the reminder is one line");

    const repeated = runHook(JSON.stringify(failurePayload()), setting.chat, setting.stateDirectory);

    assert.strictEqual(repeated.status, 0);
    assert.strictEqual(repeated.stdout, "");
});

test("the same exit code with another error is another failure; the same error from another tool is too", () =>
{
    const setting = world();
    const environment = setting.chat;

    assert.notStrictEqual(hook.respond(failurePayload(), environment, setting.stateDirectory), null);
    assert.notStrictEqual(hook.respond(failurePayload({ error: "Exit code 1\nfatal: not a git repository" }), environment, setting.stateDirectory), null);
    assert.notStrictEqual(hook.respond(failurePayload({ tool_name: "PowerShell" }), environment, setting.stateDirectory), null);
});

test("the first line names the failure: a bare exit code line is skipped", () =>
{
    assert.strictEqual(hook.failureLine("Exit code 2\n\nmake: *** [all] Error 2\nmore"), "make: *** [all] Error 2");
    assert.strictEqual(hook.failureLine("File does not exist."), "File does not exist.");
    assert.strictEqual(hook.failureLine("Exit code 1"), "Exit code 1");
});

test("reminders stop at the cap per session, and another session has its own", () =>
{
    const setting = world();
    const given = [];

    for (let index = 0; index < hook.REMINDERS_PER_SESSION + 2; index++)
    {
        given.push(hook.respond(failurePayload({ error: `Error: failure number ${index}` }), setting.chat, setting.stateDirectory));
    }

    assert.strictEqual(given.filter((response) => response !== null).length, hook.REMINDERS_PER_SESSION);
    assert.notStrictEqual(hook.respond(failurePayload({ session_id: "session-b" }), setting.chat, setting.stateDirectory), null);
});

test("a failed knowledge or memory tool, and an aborted call, get no reminder", () =>
{
    const setting = world();
    const silentTools = [
        "mcp__terylon__knowledge_search",
        "mcp__terylon__memory_propose",
        "mcp__plugin_terylon-os_terylon__knowledge_get",
        "mcp__plugin_terylon-os_terylon__memory_search",
    ];

    for (const toolName of silentTools)
    {
        assert.strictEqual(hook.respond(failurePayload({ tool_name: toolName }), setting.chat, setting.stateDirectory), null, toolName);
    }

    assert.strictEqual(hook.respond(failurePayload({ is_interrupt: true }), setting.chat, setting.stateDirectory), null);
    assert.notStrictEqual(hook.respond(failurePayload({ tool_name: "mcp__terylon__story_get" }), setting.chat, setting.stateDirectory), null);
});

test("the state file holds hashes only: no error text, no environment value", () =>
{
    const setting = world();
    const secretError = "Error: token abc-secret-123 refused by https://terylon.example";

    hook.respond(failurePayload({ error: secretError }), setting.chat, setting.stateDirectory);

    const files = fileSystem.readdirSync(setting.stateDirectory);

    assert.strictEqual(files.length, 1);
    assert.ok(!files[0].includes("session-a"), files[0]);

    const content = fileSystem.readFileSync(path.join(setting.stateDirectory, files[0]), "utf8");

    assert.ok(!content.includes("abc-secret-123"), content);
    assert.ok(!content.includes("terylon.example"), content);
    assert.ok(!content.includes("Bash"), content);
    assert.match(content, /^\{"reminded":\["[0-9a-f]{64}"\]\}\n$/);
});

test("fails open: malformed input, an unknown event and a payload with no session exit 0 with no output", () =>
{
    const setting = world();
    const inputs = [
        "{ this is not json",
        "",
        "[]",
        "null",
        JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", session_id: "session-a" }),
        JSON.stringify(failurePayload({ session_id: undefined })),
        JSON.stringify(failurePayload({ tool_name: 42 })),
    ];

    for (const input of inputs)
    {
        const result = runHook(input, setting.chat, setting.stateDirectory);

        assert.strictEqual(result.status, 0, input);
        assert.strictEqual(result.stdout, "", input);
    }
});

test("fails open: a corrupt state file reads as nothing reminded, and an unwritable state directory gives no output", () =>
{
    const setting = world();

    fileSystem.writeFileSync(hook.statePath("session-a", setting.stateDirectory), "not json", "utf8");
    assert.notStrictEqual(hook.respond(failurePayload(), setting.chat, setting.stateDirectory), null);

    const missingDirectory = path.join(setting.stateDirectory, "does-not-exist");
    const result = runHook(JSON.stringify(failurePayload({ session_id: "session-c" })), setting.chat, missingDirectory);

    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, "");
});

test("sends nothing anywhere: no network module is loaded and no connection is attempted", () =>
{
    const setting = world();
    const probeDirectory = temporaryDirectory();
    const probeLog = path.join(probeDirectory, "network.log");
    const probePath = path.join(probeDirectory, "network-probe.js");

    // Preloaded into the hook's process: every way out of the machine records itself before it could go anywhere.
    fileSystem.writeFileSync(probePath,
        "const fs = require('fs');\n"
        + `const log = ${JSON.stringify(probeLog)};\n`
        + "const note = (what) => () => { fs.appendFileSync(log, what + '\\n'); throw new Error('network refused'); };\n"
        + "for (const name of ['http', 'https', 'http2']) { const mod = require(name); mod.request = note(name); mod.get = note(name); if (mod.connect) { mod.connect = note(name); } }\n"
        + "const net = require('net'); net.connect = note('net'); net.createConnection = note('net'); net.Socket.prototype.connect = note('net');\n"
        + "const tls = require('tls'); tls.connect = note('tls');\n"
        + "const dns = require('dns'); dns.lookup = note('dns'); dns.resolve = note('dns');\n"
        + "require('dgram').createSocket = note('dgram');\n"
        + "globalThis.fetch = note('fetch');\n",
        "utf8");

    const start = runHook(JSON.stringify(startPayload()), setting.chat, setting.stateDirectory, ["--require", probePath]);
    const failure = runHook(JSON.stringify(failurePayload()), setting.chat, setting.stateDirectory, ["--require", probePath]);

    assert.notStrictEqual(start.stdout, "", start.stderr);
    assert.notStrictEqual(failure.stdout, "", failure.stderr);
    assert.strictEqual(fileSystem.existsSync(probeLog), false);

    const source = fileSystem.readFileSync(HOOK_PATH, "utf8");
    const required = [...source.matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1]).sort();

    assert.deepStrictEqual(required, ["crypto", "fs", "os", "path"]);
    assert.ok(!/\bfetch\s*\(/.test(source), "the hook calls fetch");
});

test("hooks.json registers the hook for SessionStart and PostToolUseFailure, beside SubagentStop", () =>
{
    const registered = JSON.parse(fileSystem.readFileSync(HOOKS_JSON_PATH, "utf8")).hooks;

    for (const eventName of ["SessionStart", "PostToolUseFailure"])
    {
        const commands = registered[eventName].flatMap((matcher) => matcher.hooks.map((entry) => entry.command));

        assert.deepStrictEqual(commands, ["node \"${CLAUDE_PLUGIN_ROOT}/hooks/prompt-knowledge-search.js\""], eventName);
    }

    assert.ok(registered.SubagentStop, "the spend hook is still registered");
});
