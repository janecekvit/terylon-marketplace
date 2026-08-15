"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fileSystem = require("fs");
const path = require("path");
const operatingSystem = require("os");
const childProcess = require("child_process");

const recorder = require("./record-agent-spend.js");
const oet = require("../shared/oet.js");

const HOOK_PATH = path.join(__dirname, "record-agent-spend.js");

function temporaryDirectory()
{
    return fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), "spend-hook-"));
}

function writeJsonLines(filePath, records)
{
    const content = records.map((record) => JSON.stringify(record)).join("\n") + "\n";
    fileSystem.mkdirSync(path.dirname(filePath), { recursive: true });
    fileSystem.writeFileSync(filePath, content, "utf8");
}

function usage(output, cacheRead, cacheWrite)
{
    return { output_tokens: output, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: cacheWrite };
}

function runHook(payload, workingDirectory)
{
    return childProcess.spawnSync(process.execPath, [HOOK_PATH],
    {
        input: payload,
        cwd: workingDirectory,
        encoding: "utf8",
    });
}

test("a malformed payload exits 0 with no stdout — the hook fails open", () =>
{
    const workingDirectory = temporaryDirectory();
    const result = runHook("{ this is not json", workingDirectory);

    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, "");
});

test("empty stdin exits 0 with no stdout", () =>
{
    const workingDirectory = temporaryDirectory();
    const result = runHook("", workingDirectory);

    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, "");
});

test("a payload naming a session with no subagents directory exits 0 and writes no events", () =>
{
    const workingDirectory = temporaryDirectory();
    const transcript = path.join(workingDirectory, "sess.jsonl");
    fileSystem.writeFileSync(transcript, "", "utf8");

    const result = runHook(JSON.stringify({ transcript_path: transcript, cwd: workingDirectory }), workingDirectory);

    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, "");
    assert.strictEqual(fileSystem.existsSync(path.join(workingDirectory, "docs", "terylon", "monitoring", "sess-spend.jsonl")), false);
});

test("the hook writes one event per subagent, and never blocks", () =>
{
    const workingDirectory = temporaryDirectory();
    const transcript = path.join(workingDirectory, "sess.jsonl");
    fileSystem.writeFileSync(transcript, "", "utf8");

    const subagents = path.join(workingDirectory, "sess", "subagents");
    writeJsonLines(path.join(subagents, "agent-a.jsonl"), [{ type: "assistant", message: { model: "claude-opus-5", usage: usage(100, 1000, 40) } }]);
    fileSystem.writeFileSync(path.join(subagents, "agent-a.meta.json"), JSON.stringify({ agentType: "developer", model: "claude-sonnet-4-5" }), "utf8");

    const result = runHook(JSON.stringify({ transcript_path: transcript, cwd: workingDirectory }), workingDirectory);

    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, "");

    const eventsPath = path.join(workingDirectory, "docs", "terylon", "monitoring", "sess-spend.jsonl");
    const events = fileSystem.readFileSync(eventsPath, "utf8").trim().split("\n").map((line) => JSON.parse(line));

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].agent, "agent-a");
    assert.strictEqual(events[0].type, "developer");
    // The meta file's model wins over the transcript's, so the sonnet factor applies.
    assert.strictEqual(events[0].model, "claude-sonnet-4-5");
    assert.strictEqual(events[0].output, 100);
    assert.strictEqual(events[0].cacheRead, 1000);
    assert.strictEqual(events[0].cacheWrite, 40);
    assert.strictEqual(events[0].oet, oet.outputEquivalentTokens({ output: 100, cacheRead: 1000, cacheWrite: 40 }, "claude-sonnet-4-5"));
    assert.match(events[0].at, /^\d{4}-\d{2}-\d{2}T/);
});

test("a second run records only what is new — no double counting", () =>
{
    const workingDirectory = temporaryDirectory();
    const transcript = path.join(workingDirectory, "sess.jsonl");
    fileSystem.writeFileSync(transcript, "", "utf8");

    const subagents = path.join(workingDirectory, "sess", "subagents");
    const agentTranscript = path.join(subagents, "agent-a.jsonl");
    writeJsonLines(agentTranscript, [{ type: "assistant", message: { usage: usage(100, 0, 0) } }]);

    const payload = JSON.stringify({ transcript_path: transcript, cwd: workingDirectory });
    const eventsPath = path.join(workingDirectory, "docs", "terylon", "monitoring", "sess-spend.jsonl");

    runHook(payload, workingDirectory);

    // Nothing changed between the two runs: the second must append nothing at all.
    runHook(payload, workingDirectory);

    let events = fileSystem.readFileSync(eventsPath, "utf8").trim().split("\n");
    assert.strictEqual(events.length, 1);

    // Now the agent produces another turn; only that turn's tokens may be recorded.
    fileSystem.appendFileSync(agentTranscript, JSON.stringify({ type: "assistant", message: { usage: usage(7, 0, 0) } }) + "\n", "utf8");
    runHook(payload, workingDirectory);

    events = fileSystem.readFileSync(eventsPath, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[1].output, 7);
});

test("sumNewUsage rewinds a partial trailing line so it is read whole next time", () =>
{
    const root = temporaryDirectory();
    const transcriptPath = path.join(root, "t.jsonl");

    const complete = JSON.stringify({ type: "assistant", message: { usage: usage(10, 0, 0) } }) + "\n";
    fileSystem.writeFileSync(transcriptPath, complete + "{\"type\":\"assist", "utf8");

    const first = recorder.sumNewUsage(transcriptPath, 0);

    assert.strictEqual(first.totals.output, 10);
    // The offset stops at the end of the complete line, not at end-of-file.
    assert.strictEqual(first.offset, Buffer.byteLength(complete, "utf8"));

    // Completing the partial line makes it countable on the next pass, and only once.
    fileSystem.writeFileSync(transcriptPath, complete + JSON.stringify({ type: "assistant", message: { usage: usage(3, 0, 0) } }) + "\n", "utf8");

    const second = recorder.sumNewUsage(transcriptPath, first.offset);
    assert.strictEqual(second.totals.output, 3);
});

test("non-assistant records are excluded from an event's totals", () =>
{
    const root = temporaryDirectory();
    const transcriptPath = path.join(root, "t.jsonl");

    writeJsonLines(transcriptPath,
    [
        { type: "assistant", message: { usage: usage(10, 0, 0) } },
        { type: "user", message: { usage: usage(999, 999, 999) } },
    ]);

    assert.strictEqual(recorder.sumNewUsage(transcriptPath, 0).totals.output, 10);
});

test("projectSlug matches Claude Code's project folder naming on both platforms", () =>
{
    assert.strictEqual(recorder.projectSlug("D:\\Git\\TerylonMarketplace"), "D--Git-TerylonMarketplace");
    assert.strictEqual(recorder.projectSlug("/home/vitja/git/repo"), "-home-vitja-git-repo");
});

test("resolveSubagentsDirectory falls back to cwd and session id when no transcript path is given", () =>
{
    const fromTranscript = recorder.resolveSubagentsDirectory({ transcript_path: path.join("x", "sess.jsonl") });
    assert.strictEqual(fromTranscript.sessionId, "sess");
    assert.ok(fromTranscript.directory.endsWith(path.join("sess", "subagents")));

    const fromSession = recorder.resolveSubagentsDirectory({ session_id: "abc", cwd: "/repo" });
    assert.strictEqual(fromSession.sessionId, "abc");
    assert.ok(fromSession.directory.includes("-repo"));

    // Neither locator present: the hook has nothing to measure and says so rather than guessing.
    assert.strictEqual(recorder.resolveSubagentsDirectory({}), null);
});

test("a response split across content blocks is recorded once, not three times", () =>
{
    const workingDirectory = temporaryDirectory();
    const transcript = path.join(workingDirectory, "sess.jsonl");
    fileSystem.writeFileSync(transcript, "", "utf8");

    const subagents = path.join(workingDirectory, "sess", "subagents");

    // One API response, three records — thinking, text, tool_use — each repeating the same usage.
    writeJsonLines(path.join(subagents, "agent-a.jsonl"),
    [
        { type: "assistant", message: { id: "msg_a", model: "claude-opus-5", usage: usage(1, 0, 49491) } },
        { type: "assistant", message: { id: "msg_a", model: "claude-opus-5", usage: usage(1, 0, 49491) } },
        { type: "assistant", message: { id: "msg_a", model: "claude-opus-5", usage: usage(183, 0, 49491) } },
    ]);

    runHook(JSON.stringify({ transcript_path: transcript, cwd: workingDirectory }), workingDirectory);

    const eventsPath = path.join(workingDirectory, "docs", "terylon", "monitoring", "sess-spend.jsonl");
    const events = fileSystem.readFileSync(eventsPath, "utf8").trim().split("\n").map((line) => JSON.parse(line));

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].output, 183);
    assert.strictEqual(events[0].cacheWrite, 49491);
    assert.strictEqual(events[0].cacheRead, 0);
});

test("a message that grew between two invocations is counted once across both", () =>
{
    const workingDirectory = temporaryDirectory();
    const transcript = path.join(workingDirectory, "sess.jsonl");
    fileSystem.writeFileSync(transcript, "", "utf8");

    const subagents = path.join(workingDirectory, "sess", "subagents");
    const agentTranscript = path.join(subagents, "agent-a.jsonl");

    writeJsonLines(agentTranscript, [{ type: "assistant", message: { id: "msg_a", usage: usage(1, 100, 200) } }]);

    const payload = JSON.stringify({ transcript_path: transcript, cwd: workingDirectory });

    runHook(payload, workingDirectory);

    // The same response continues; its later records repeat the usage the first read already saw.
    fileSystem.appendFileSync(agentTranscript,
        JSON.stringify({ type: "assistant", message: { id: "msg_a", usage: usage(183, 100, 200) } }) + "\n", "utf8");

    runHook(payload, workingDirectory);

    const eventsPath = path.join(workingDirectory, "docs", "terylon", "monitoring", "sess-spend.jsonl");
    const events = fileSystem.readFileSync(eventsPath, "utf8").trim().split("\n").map((line) => JSON.parse(line));

    assert.strictEqual(events.reduce((sum, event) => sum + event.output, 0), 183);
    assert.strictEqual(events.reduce((sum, event) => sum + event.cacheRead, 0), 100);
    assert.strictEqual(events.reduce((sum, event) => sum + event.cacheWrite, 0), 200);
});

test("a state file written before carries existed still records and does not throw", () =>
{
    const workingDirectory = temporaryDirectory();
    const transcript = path.join(workingDirectory, "sess.jsonl");
    fileSystem.writeFileSync(transcript, "", "utf8");

    const subagents = path.join(workingDirectory, "sess", "subagents");
    writeJsonLines(path.join(subagents, "agent-a.jsonl"), [{ type: "assistant", message: { id: "msg_a", usage: usage(10, 20, 30) } }]);

    const monitoring = path.join(workingDirectory, "docs", "terylon", "monitoring");
    fileSystem.mkdirSync(monitoring, { recursive: true });
    fileSystem.writeFileSync(path.join(monitoring, "sess-spend.state.json"), JSON.stringify({ offsets: {} }) + "\n", "utf8");

    const result = runHook(JSON.stringify({ transcript_path: transcript, cwd: workingDirectory }), workingDirectory);

    assert.strictEqual(result.status, 0);

    const events = fileSystem.readFileSync(path.join(monitoring, "sess-spend.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].output, 10);
});

test("sumNewUsage keeps its two-argument form for callers that track no carry", () =>
{
    const root = temporaryDirectory();
    const transcriptPath = path.join(root, "t.jsonl");

    writeJsonLines(transcriptPath,
    [
        { type: "assistant", message: { id: "msg_a", usage: usage(1, 5, 5) } },
        { type: "assistant", message: { id: "msg_a", usage: usage(9, 5, 5) } },
    ]);

    assert.strictEqual(recorder.sumNewUsage(transcriptPath, 0).totals.output, 9);
});

test("a working directory change inside one repository keeps one events file", () =>
{
    const repositoryRoot = temporaryDirectory();
    fileSystem.mkdirSync(path.join(repositoryRoot, ".git"), { recursive: true });

    // A linked worktree nested inside the checkout, as create-workspace makes them.
    const worktree = path.join(repositoryRoot, ".claude", "worktrees", "feature");
    fileSystem.mkdirSync(worktree, { recursive: true });
    fileSystem.writeFileSync(path.join(worktree, ".git"), "gitdir: " + path.join(repositoryRoot, ".git"), "utf8");

    const transcript = path.join(repositoryRoot, "sess.jsonl");
    fileSystem.writeFileSync(transcript, "", "utf8");

    const subagents = path.join(repositoryRoot, "sess", "subagents");
    writeJsonLines(path.join(subagents, "agent-a.jsonl"), [{ type: "assistant", message: { id: "msg_a", usage: usage(10, 1000, 40) } }]);

    runHook(JSON.stringify({ transcript_path: transcript, cwd: repositoryRoot }), repositoryRoot);
    runHook(JSON.stringify({ transcript_path: transcript, cwd: worktree }), worktree);

    const rootEvents = path.join(repositoryRoot, "docs", "terylon", "monitoring", "sess-spend.jsonl");
    const worktreeEvents = path.join(worktree, "docs", "terylon", "monitoring", "sess-spend.jsonl");

    assert.strictEqual(fileSystem.existsSync(rootEvents), true);
    assert.strictEqual(fileSystem.existsSync(worktreeEvents), false);

    const events = fileSystem.readFileSync(rootEvents, "utf8").trim().split("\n").map((line) => JSON.parse(line));

    assert.strictEqual(events.reduce((sum, event) => sum + event.output, 0), 10);
    assert.strictEqual(events.reduce((sum, event) => sum + event.cacheRead, 0), 1000);
});

test("a working directory with no repository above it keeps today's location", () =>
{
    const workingDirectory = temporaryDirectory();
    const transcript = path.join(workingDirectory, "sess.jsonl");
    fileSystem.writeFileSync(transcript, "", "utf8");

    const subagents = path.join(workingDirectory, "sess", "subagents");
    writeJsonLines(path.join(subagents, "agent-a.jsonl"), [{ type: "assistant", message: { id: "msg_a", usage: usage(5, 0, 0) } }]);

    runHook(JSON.stringify({ transcript_path: transcript, cwd: workingDirectory }), workingDirectory);

    assert.strictEqual(fileSystem.existsSync(path.join(workingDirectory, "docs", "terylon", "monitoring", "sess-spend.jsonl")), true);
});
