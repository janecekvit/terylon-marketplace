#!/usr/bin/env node
"use strict";

const fileSystem = require("fs");
const path = require("path");
const operatingSystem = require("os");

// Only assistant-turn records carry the model's own token usage. User, system, tool-result and
// summary records must never be summed, or the total counts context as if it were spend.
const ASSISTANT_RECORD_TYPE = "assistant";

// The three usage counters that make up a record's token cost. Non-cached input is deliberately
// left out: it is a rounding error against cache-read (about 1.4k in a 546M-cache-read session).
const OUTPUT_FIELD = "output_tokens";
const CACHE_READ_FIELD = "cache_read_input_tokens";
const CACHE_WRITE_FIELD = "cache_creation_input_tokens";

const TRANSCRIPT_SUFFIX = ".jsonl";
const META_SUFFIX = ".meta.json";

// Inserts a comma every three digits from the right (thousands separators) for readable totals.
const DIGIT_GROUP_SEPARATOR = /\B(?=(\d{3})+(?!\d))/g;

function parseArguments(argumentVector)
{
    const parsed = { directory: null, project: null, session: null, outputPath: null };

    for (let index = 0; index < argumentVector.length; index += 1)
    {
        const argument = argumentVector[index];

        // `?? null` guards a flag given as the last token: `argumentVector[++index]` is then
        // undefined, and the null checks in resolveSession would otherwise let it reach path.join.
        if (argument === "--dir") { parsed.directory = argumentVector[++index] ?? null; }
        else if (argument === "--project") { parsed.project = argumentVector[++index] ?? null; }
        else if (argument === "--session") { parsed.session = argumentVector[++index] ?? null; }
        else if (argument === "--out") { parsed.outputPath = argumentVector[++index] ?? null; }
    }

    return parsed;
}

function projectsRoot()
{
    return path.join(operatingSystem.homedir(), ".claude", "projects");
}

function listSessionTranscripts(projectDirectory)
{
    // Session transcripts are the top-level "<id>.jsonl" files; the "<id>/" folders beside them
    // hold the subagents. Return { id, mtimeMs } for each, newest first.
    let entries;

    try
    {
        entries = fileSystem.readdirSync(projectDirectory);
    }
    catch
    {
        return [];
    }

    const sessions = [];

    for (const entry of entries)
    {
        if (!entry.endsWith(TRANSCRIPT_SUFFIX)) { continue; }

        const fullPath = path.join(projectDirectory, entry);

        try
        {
            const stats = fileSystem.statSync(fullPath);

            if (stats.isFile())
            {
                sessions.push({ id: entry.slice(0, -TRANSCRIPT_SUFFIX.length), mtimeMs: stats.mtimeMs });
            }
        }
        catch
        {
            // An entry that vanished or turned unreadable between readdir and stat is skipped.
            continue;
        }
    }

    sessions.sort((left, right) => right.mtimeMs - left.mtimeMs);
    return sessions;
}

function findLatestSession(root)
{
    // No project given: scan every project folder and pick the session with the newest transcript.
    let projectNames;

    try
    {
        projectNames = fileSystem.readdirSync(root);
    }
    catch
    {
        return null;
    }

    let best = null;

    for (const projectName of projectNames)
    {
        const projectDirectory = path.join(root, projectName);

        try
        {
            if (!fileSystem.statSync(projectDirectory).isDirectory()) { continue; }
        }
        catch
        {
            // A project entry that vanished or is unreadable is skipped, not fatal.
            continue;
        }

        const sessions = listSessionTranscripts(projectDirectory);

        if (sessions.length === 0) { continue; }

        const candidate = sessions[0];

        if (best === null || candidate.mtimeMs > best.mtimeMs)
        {
            best = { directory: projectDirectory, session: candidate.id, mtimeMs: candidate.mtimeMs };
        }
    }

    return best;
}

function resolveSession(parsed)
{
    // Precedence: an explicit --dir wins; then --project under the projects root; then auto-detect
    // the newest session across every project.
    let directory = parsed.directory;
    let session = parsed.session;

    if (directory === null && parsed.project !== null)
    {
        directory = path.join(projectsRoot(), parsed.project);
    }

    if (directory === null)
    {
        const latest = findLatestSession(projectsRoot());

        if (latest === null)
        {
            throw new Error("No session transcripts found under " + projectsRoot());
        }

        directory = latest.directory;

        if (session === null) { session = latest.session; }
    }

    if (session === null)
    {
        const sessions = listSessionTranscripts(directory);

        if (sessions.length === 0)
        {
            throw new Error("No " + TRANSCRIPT_SUFFIX + " session transcript in " + directory);
        }

        session = sessions[0].id;
    }

    return { directory, session };
}

function sumUsage(transcriptPath)
{
    const totals = { output: 0, cacheRead: 0, cacheWrite: 0, assistantRecords: 0 };

    let content;

    try
    {
        content = fileSystem.readFileSync(transcriptPath, "utf8");
    }
    catch
    {
        // A missing transcript (e.g. an agent that never wrote one) contributes nothing.
        return totals;
    }

    for (const line of content.split("\n"))
    {
        if (line.trim() === "") { continue; }

        let record;

        try
        {
            record = JSON.parse(line);
        }
        catch
        {
            // A truncated final line from an agent that died mid-response is skipped, not fatal.
            continue;
        }

        if (record.type !== ASSISTANT_RECORD_TYPE) { continue; }

        const usage = record.message && record.message.usage;

        if (!usage) { continue; }

        totals.output += usage[OUTPUT_FIELD] || 0;
        totals.cacheRead += usage[CACHE_READ_FIELD] || 0;
        totals.cacheWrite += usage[CACHE_WRITE_FIELD] || 0;
        totals.assistantRecords += 1;
    }

    return totals;
}

function readAgentType(metaPath)
{
    try
    {
        const meta = JSON.parse(fileSystem.readFileSync(metaPath, "utf8"));
        return meta.agentType || "unknown";
    }
    catch
    {
        // No meta file, or unreadable: the transcript still counts, only its label is unknown.
        return "unknown";
    }
}

function aggregateByType(subagents)
{
    const byType = new Map();

    for (const subagent of subagents)
    {
        const existing = byType.get(subagent.type)
            || { type: subagent.type, count: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

        existing.count += 1;
        existing.output += subagent.usage.output;
        existing.cacheRead += subagent.usage.cacheRead;
        existing.cacheWrite += subagent.usage.cacheWrite;
        byType.set(subagent.type, existing);
    }

    const rows = Array.from(byType.values());
    rows.sort((left, right) => right.output - left.output);
    return rows;
}

function grandTotals(mainTotals, subagents)
{
    const totals = { output: mainTotals.output, cacheRead: mainTotals.cacheRead, cacheWrite: mainTotals.cacheWrite };

    for (const subagent of subagents)
    {
        totals.output += subagent.usage.output;
        totals.cacheRead += subagent.usage.cacheRead;
        totals.cacheWrite += subagent.usage.cacheWrite;
    }

    return totals;
}

function measureSession(projectDirectory, sessionId)
{
    const mainTotals = sumUsage(path.join(projectDirectory, sessionId + TRANSCRIPT_SUFFIX));

    const subagentsDirectory = path.join(projectDirectory, sessionId, "subagents");
    const subagents = [];

    let subagentEntries;

    try
    {
        subagentEntries = fileSystem.readdirSync(subagentsDirectory);
    }
    catch
    {
        subagentEntries = [];
    }

    for (const entry of subagentEntries)
    {
        if (!entry.endsWith(TRANSCRIPT_SUFFIX)) { continue; }

        const identifier = entry.slice(0, -TRANSCRIPT_SUFFIX.length);
        const usage = sumUsage(path.join(subagentsDirectory, entry));
        const type = readAgentType(path.join(subagentsDirectory, identifier + META_SUFFIX));

        subagents.push({ identifier, type, usage });
    }

    return {
        main: mainTotals,
        subagents,
        byType: aggregateByType(subagents),
        totals: grandTotals(mainTotals, subagents),
    };
}

function groupDigits(value)
{
    return String(value).replace(DIGIT_GROUP_SEPARATOR, ",");
}

function usageRow(label, output, cacheRead, cacheWrite)
{
    return "| " + label + " | " + groupDigits(output) + " | " + groupDigits(cacheRead) + " | " + groupDigits(cacheWrite) + " |";
}

function formatReport(measurement, sessionId)
{
    const subagentOutput = measurement.totals.output - measurement.main.output;
    const subagentCacheRead = measurement.totals.cacheRead - measurement.main.cacheRead;
    const subagentCacheWrite = measurement.totals.cacheWrite - measurement.main.cacheWrite;

    const lines = [];

    lines.push("# Token spend — session " + sessionId);
    lines.push("");
    lines.push("Measured from transcripts (`type == \"assistant\"`), not from notification figures.");
    lines.push("");
    lines.push("| Tier | output | cache-read | cache-write |");
    lines.push("|---|---:|---:|---:|");
    lines.push(usageRow("main thread", measurement.main.output, measurement.main.cacheRead, measurement.main.cacheWrite));
    lines.push(usageRow(measurement.subagents.length + " subagents", subagentOutput, subagentCacheRead, subagentCacheWrite));
    lines.push(usageRow("**total**", measurement.totals.output, measurement.totals.cacheRead, measurement.totals.cacheWrite));
    lines.push("");
    lines.push("## By agent type");
    lines.push("");
    lines.push("| Type | n | output | cache-read | cache-write |");
    lines.push("|---|---:|---:|---:|---:|");

    for (const typeRow of measurement.byType)
    {
        lines.push("| `" + typeRow.type + "` | " + typeRow.count + " | "
            + groupDigits(typeRow.output) + " | " + groupDigits(typeRow.cacheRead) + " | " + groupDigits(typeRow.cacheWrite) + " |");
    }

    lines.push("");
    return lines.join("\n");
}

function main()
{
    const parsed = parseArguments(process.argv.slice(2));
    const resolved = resolveSession(parsed);
    const measurement = measureSession(resolved.directory, resolved.session);
    const report = formatReport(measurement, resolved.session);

    process.stdout.write(report + "\n");

    if (parsed.outputPath !== null)
    {
        fileSystem.mkdirSync(path.dirname(parsed.outputPath), { recursive: true });
        fileSystem.writeFileSync(parsed.outputPath, report + "\n", "utf8");
        process.stderr.write("Wrote " + parsed.outputPath + "\n");
    }
}

module.exports = {
    parseArguments,
    resolveSession,
    sumUsage,
    readAgentType,
    aggregateByType,
    grandTotals,
    measureSession,
    formatReport,
};

if (require.main === module)
{
    main();
}
