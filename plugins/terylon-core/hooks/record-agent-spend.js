#!/usr/bin/env node
"use strict";

// SubagentStop hook — appends one spend event per completed subagent to the run's event log.
//
// Why a hook and not a skill call: measurement that has to be remembered is measurement that
// stops happening. A run that dies before its final gate was never measured at all, and a run
// that was measured yielded one lump total with nothing attributing it to the phase that spent it.
//
// Why an offset scan and not the payload's agent id: whether SubagentStop carries the id of the
// agent that just finished is not established, and the hook must not depend on it. Tracking a byte
// offset per transcript reads only what is new, so the total work across a run is one pass over
// the data either way — and the naive alternative (re-reading every transcript on every stop) is
// gigabytes re-read dozens of times, well past the 5-second hook timeout.
//
// Fail-open throughout: a hook that jams blocks the user's work, and a hook that blocks gets
// disabled, after which it measures nothing at all. Every failure path exits 0 with no stdout.

const fileSystem = require("fs");
const path = require("path");
const operatingSystem = require("os");
const oet = require("../shared/oet.js");
const transcript = require("../shared/transcript.js");

const TRANSCRIPT_SUFFIX = ".jsonl";
const META_SUFFIX = ".meta.json";

// Where the events and the offset state live, relative to the repository the run works in.
const MONITORING_DIRECTORY = path.join("docs", "terylon", "monitoring");
const EVENTS_SUFFIX = "-spend.jsonl";
const STATE_SUFFIX = "-spend.state.json";

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
    try
    {
        const parsed = JSON.parse(rawInput);
        return parsed && typeof parsed === "object" ? parsed : {};
    }
    catch
    {
        // A malformed payload is not a reason to stop the agent that just finished.
        return {};
    }
}

function projectSlug(workingDirectory)
{
    // Claude Code names a project folder after its absolute path with every separator and colon
    // replaced by a dash: "D:\Git\Repo" becomes "D--Git-Repo".
    return workingDirectory.replace(/[\\/:]/g, "-");
}

function resolveSubagentsDirectory(payload)
{
    // The transcript path in the payload is the authoritative locator when present; the working
    // directory is the fallback, and it is what makes this work when the payload shape differs
    // from what is assumed here.
    if (typeof payload.transcript_path === "string" && payload.transcript_path.endsWith(TRANSCRIPT_SUFFIX))
    {
        const withoutSuffix = payload.transcript_path.slice(0, -TRANSCRIPT_SUFFIX.length);
        return { directory: path.join(withoutSuffix, "subagents"), sessionId: path.basename(withoutSuffix) };
    }

    const sessionId = typeof payload.session_id === "string" ? payload.session_id : null;
    const workingDirectory = typeof payload.cwd === "string" ? payload.cwd : process.cwd();

    if (sessionId === null)
    {
        return null;
    }

    const projectDirectory = path.join(operatingSystem.homedir(), ".claude", "projects", projectSlug(workingDirectory));

    return { directory: path.join(projectDirectory, sessionId, "subagents"), sessionId };
}

// A session's events and its offset state must live in ONE place for the whole run, and the working
// directory is not that place: it changes the moment the run moves into a git worktree, which
// create-workspace makes routine. The new location has no state file, so every transcript restarts
// from offset zero and everything already counted is counted again.
//
// The anchor is the OUTERMOST ancestor holding a `.git` entry. A linked worktree carries a `.git`
// file rather than a directory, and this repository nests its worktrees inside the checkout, so
// walking past them lands on the main repository either way — without parsing a gitdir pointer.
// A working directory with no repository above it keeps today's behaviour rather than failing.
function resolveRepositoryRoot(workingDirectory)
{
    let candidate = null;
    let current = path.resolve(workingDirectory);

    for (;;)
    {
        if (fileSystem.existsSync(path.join(current, ".git")))
        {
            candidate = current;
        }

        const parent = path.dirname(current);

        if (parent === current) { break; }

        current = parent;
    }

    return candidate === null ? workingDirectory : candidate;
}

function readJsonFile(filePath, fallback)
{
    try
    {
        return JSON.parse(fileSystem.readFileSync(filePath, "utf8"));
    }
    catch
    {
        // A missing or corrupt state file means the run starts its offsets from zero, which
        // re-reads once and then settles — wasteful, never wrong.
        return fallback;
    }
}

function sumNewUsage(transcriptPath, startOffset, carryIn)
{
    const carried = carryIn === undefined ? null : carryIn;
    const totals = { output: 0, cacheRead: 0, cacheWrite: 0, assistantRecords: 0, model: null };

    let size;

    try
    {
        size = fileSystem.statSync(transcriptPath).size;
    }
    catch
    {
        return { totals, offset: startOffset, carry: carried, changed: false };
    }

    if (size <= startOffset)
    {
        return { totals, offset: size, carry: carried, changed: false };
    }

    let content;
    let descriptor = null;

    try
    {
        descriptor = fileSystem.openSync(transcriptPath, "r");

        const buffer = Buffer.alloc(size - startOffset);
        const bytesRead = fileSystem.readSync(descriptor, buffer, 0, buffer.length, startOffset);

        content = buffer.slice(0, bytesRead).toString("utf8");
    }
    catch
    {
        return { totals, offset: startOffset, carry: carried, changed: false };
    }
    finally
    {
        if (descriptor !== null)
        {
            try { fileSystem.closeSync(descriptor); } catch { /* already closed or never opened */ }
        }
    }

    // A read that stops mid-line leaves a partial record; rewind the offset to the last complete
    // newline so the next run re-reads that line whole instead of dropping it.
    const lastNewline = content.lastIndexOf("\n");

    if (lastNewline === -1)
    {
        return { totals, offset: startOffset, carry: carried, changed: false };
    }

    const complete = content.slice(0, lastNewline);

    // The grouping and the carry both live in shared/transcript.js, so the hook and the whole-session
    // report cannot drift apart on the one thing they both have to get right.
    const summed = transcript.sumAssistantUsage(complete, carried);

    const offset = startOffset + Buffer.byteLength(complete, "utf8") + 1;

    // A slice whose records only repeat usage already counted contributes nothing. Recording a
    // zero-valued event would put a row in the log that no spend corresponds to.
    const contributed = summed.totals.output !== 0 || summed.totals.cacheRead !== 0 || summed.totals.cacheWrite !== 0;

    return { totals: summed.totals, offset, carry: summed.carry, changed: summed.totals.assistantRecords > 0 && contributed };
}

function readAgentMeta(metaPath)
{
    const meta = readJsonFile(metaPath, null);

    if (meta === null)
    {
        return { type: "unknown", model: null };
    }

    return { type: meta.agentType || "unknown", model: typeof meta.model === "string" ? meta.model : null };
}

function collectEvents(subagentsDirectory, state, weights, timestamp)
{
    let entries;

    try
    {
        entries = fileSystem.readdirSync(subagentsDirectory);
    }
    catch
    {
        // No subagents directory yet: nothing has fanned out, and there is nothing to record.
        return { events: [], offsets: state.offsets, carries: state.carries || {} };
    }

    const offsets = Object.assign({}, state.offsets);
    const carries = Object.assign({}, state.carries);
    const events = [];

    for (const entry of entries)
    {
        if (!entry.endsWith(TRANSCRIPT_SUFFIX)) { continue; }

        const identifier = entry.slice(0, -TRANSCRIPT_SUFFIX.length);
        const startOffset = typeof offsets[identifier] === "number" ? offsets[identifier] : 0;
        const carryIn = carries[identifier] || null;
        const scanned = sumNewUsage(path.join(subagentsDirectory, entry), startOffset, carryIn);

        offsets[identifier] = scanned.offset;

        // The carry is persisted whether or not the slice produced an event: a read that contributed
        // nothing still moved through records whose usage must not be counted again.
        if (scanned.carry === null)
        {
            delete carries[identifier];
        }
        else
        {
            carries[identifier] = scanned.carry;
        }

        if (!scanned.changed) { continue; }

        const meta = readAgentMeta(path.join(subagentsDirectory, identifier + META_SUFFIX));
        const model = meta.model || scanned.totals.model;

        events.push(
        {
            at: timestamp,
            agent: identifier,
            type: meta.type,
            model: model,
            output: scanned.totals.output,
            cacheRead: scanned.totals.cacheRead,
            cacheWrite: scanned.totals.cacheWrite,
            oet: oet.outputEquivalentTokens(scanned.totals, model, weights),
        });
    }

    return { events, offsets, carries };
}

function appendEvents(monitoringDirectory, sessionId, events)
{
    if (events.length === 0) { return; }

    const eventsPath = path.join(monitoringDirectory, sessionId + EVENTS_SUFFIX);
    const payload = events.map((event) => JSON.stringify(event)).join("\n") + "\n";

    fileSystem.mkdirSync(monitoringDirectory, { recursive: true });
    fileSystem.appendFileSync(eventsPath, payload, "utf8");
}

function main()
{
    const payload = parsePayload(readStandardInput());
    const located = resolveSubagentsDirectory(payload);

    if (located === null) { return; }

    const workingDirectory = typeof payload.cwd === "string" ? payload.cwd : process.cwd();
    const monitoringDirectory = path.join(resolveRepositoryRoot(workingDirectory), MONITORING_DIRECTORY);
    const statePath = path.join(monitoringDirectory, located.sessionId + STATE_SUFFIX);

    const state = readJsonFile(statePath, { offsets: {} });

    if (!state.offsets || typeof state.offsets !== "object") { state.offsets = {}; }

    // A state file written before carries existed reads as an empty set, so the first pass after an
    // upgrade behaves exactly as it did before and settles from there.
    if (!state.carries || typeof state.carries !== "object") { state.carries = {}; }

    const weights = oet.loadWeights();
    const timestamp = new Date().toISOString();
    const collected = collectEvents(located.directory, state, weights, timestamp);

    appendEvents(monitoringDirectory, located.sessionId, collected.events);

    fileSystem.mkdirSync(monitoringDirectory, { recursive: true });
    fileSystem.writeFileSync(statePath, JSON.stringify({ offsets: collected.offsets, carries: collected.carries }) + "\n", "utf8");
}

module.exports =
{
    parsePayload,
    projectSlug,
    resolveRepositoryRoot,
    resolveSubagentsDirectory,
    sumNewUsage,
    readAgentMeta,
    collectEvents,
};

if (require.main === module)
{
    try
    {
        main();
    }
    catch
    {
        // Nothing this hook can fail at is worth interrupting a run for.
    }

    process.exit(0);
}
