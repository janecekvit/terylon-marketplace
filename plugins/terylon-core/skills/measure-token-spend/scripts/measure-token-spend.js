#!/usr/bin/env node
"use strict";

const fileSystem = require("fs");
const path = require("path");
const operatingSystem = require("os");
const oet = require("../../../shared/oet.js");
const transcript = require("../../../shared/transcript.js");

// Which records carry usage, which three counters make it up, and how a response's repeated records
// are collapsed into one all live in shared/transcript.js — the hook reads transcripts too, and the
// two must not answer any of those differently. Non-cached input is deliberately left out: it is a
// rounding error against cache-read (about 1.4k in a 546M-cache-read session).

const TRANSCRIPT_SUFFIX = ".jsonl";
const META_SUFFIX = ".meta.json";

// Inserts a comma every three digits from the right (thousands separators) for readable totals.
const DIGIT_GROUP_SEPARATOR = /\B(?=(\d{3})+(?!\d))/g;

// How many individual agent runs the report lists by OET. Aggregating by type alone hides the
// difference between fourteen even runs and one runaway, which is the question the table exists
// to answer.
const DEFAULT_TOP_RUNS = 10;

function parseArguments(argumentVector)
{
    const parsed = { directory: null, project: null, session: null, outputPath: null, topRuns: DEFAULT_TOP_RUNS };

    for (let index = 0; index < argumentVector.length; index += 1)
    {
        const argument = argumentVector[index];

        // `?? null` guards a flag given as the last token: `argumentVector[++index]` is then
        // undefined, and the null checks in resolveSession would otherwise let it reach path.join.
        if (argument === "--dir") { parsed.directory = argumentVector[++index] ?? null; }
        else if (argument === "--project") { parsed.project = argumentVector[++index] ?? null; }
        else if (argument === "--session") { parsed.session = argumentVector[++index] ?? null; }
        else if (argument === "--out") { parsed.outputPath = argumentVector[++index] ?? null; }
        else if (argument === "--top")
        {
            const requested = Number.parseInt(argumentVector[++index] ?? "", 10);
            parsed.topRuns = Number.isFinite(requested) && requested >= 0 ? requested : DEFAULT_TOP_RUNS;
        }
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
    // `model` is carried alongside the sums because the main thread has no .meta.json to read it
    // from — its records are the only place the model appears, and OET needs it to weight them.
    const totals = { output: 0, cacheRead: 0, cacheWrite: 0, assistantRecords: 0, model: null };

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

    // The grouping lives in shared/transcript.js, so this report and the SubagentStop hook cannot
    // drift apart on it. A whole file is read at once here, so there is no carry to thread through.
    const summed = transcript.sumAssistantUsage(content, null);

    totals.output = summed.totals.output;
    totals.cacheRead = summed.totals.cacheRead;
    totals.cacheWrite = summed.totals.cacheWrite;
    totals.assistantRecords = summed.totals.assistantRecords;
    totals.model = summed.totals.model;

    return totals;
}

function readAgentMeta(metaPath)
{
    try
    {
        const meta = JSON.parse(fileSystem.readFileSync(metaPath, "utf8"));
        return { type: meta.agentType || "unknown", model: typeof meta.model === "string" ? meta.model : null };
    }
    catch
    {
        // No meta file, or unreadable: the transcript still counts, only its label is unknown.
        // A null model falls back to the default weight, which never under-counts.
        return { type: "unknown", model: null };
    }
}

function aggregateByType(subagents)
{
    const byType = new Map();

    for (const subagent of subagents)
    {
        const existing = byType.get(subagent.type)
            || { type: subagent.type, count: 0, output: 0, cacheRead: 0, cacheWrite: 0, oet: 0 };

        existing.count += 1;
        existing.output += subagent.usage.output;
        existing.cacheRead += subagent.usage.cacheRead;
        existing.cacheWrite += subagent.usage.cacheWrite;
        existing.oet += subagent.oet;
        byType.set(subagent.type, existing);
    }

    const rows = Array.from(byType.values());
    rows.sort((left, right) => right.oet - left.oet);
    return rows;
}

function topRunsByOet(subagents, limit)
{
    // Sorted by OET, not by output: a run whose cost is cache-write must not sort below a chattier
    // but cheaper one, which is exactly the inversion the per-type table alone cannot show.
    const rows = subagents.slice();
    rows.sort((left, right) => right.oet - left.oet);
    return rows.slice(0, limit);
}

function grandTotals(mainTotals, subagents, mainOet)
{
    const totals =
    {
        output: mainTotals.output,
        cacheRead: mainTotals.cacheRead,
        cacheWrite: mainTotals.cacheWrite,
        oet: mainOet || 0,
    };

    for (const subagent of subagents)
    {
        totals.output += subagent.usage.output;
        totals.cacheRead += subagent.usage.cacheRead;
        totals.cacheWrite += subagent.usage.cacheWrite;
        totals.oet += subagent.oet;
    }

    return totals;
}

function measureSession(projectDirectory, sessionId, options)
{
    const settings = options || {};
    const weights = settings.weights || oet.loadWeights();
    const topRuns = typeof settings.topRuns === "number" ? settings.topRuns : DEFAULT_TOP_RUNS;

    const mainTotals = sumUsage(path.join(projectDirectory, sessionId + TRANSCRIPT_SUFFIX));
    const mainOet = oet.outputEquivalentTokens(mainTotals, mainTotals.model, weights);

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
        const meta = readAgentMeta(path.join(subagentsDirectory, identifier + META_SUFFIX));

        // The .meta.json model wins; the transcript's own is the fallback for a meta file that
        // never named one.
        const model = meta.model || usage.model;

        subagents.push({ identifier, type: meta.type, model, usage, oet: oet.outputEquivalentTokens(usage, model, weights) });
    }

    return {
        main: mainTotals,
        mainOet,
        subagents,
        byType: aggregateByType(subagents),
        topRuns: topRunsByOet(subagents, topRuns),
        totals: grandTotals(mainTotals, subagents, mainOet),
        weightsReadOn: weights.readOn || "unknown",
    };
}

function groupDigits(value)
{
    return String(value).replace(DIGIT_GROUP_SEPARATOR, ",");
}

function usageRow(label, output, cacheRead, cacheWrite, oetValue)
{
    return "| " + label + " | " + groupDigits(output) + " | " + groupDigits(cacheRead)
        + " | " + groupDigits(cacheWrite) + " | " + groupDigits(oetValue) + " |";
}

function formatReport(measurement, sessionId)
{
    const subagentOutput = measurement.totals.output - measurement.main.output;
    const subagentCacheRead = measurement.totals.cacheRead - measurement.main.cacheRead;
    const subagentCacheWrite = measurement.totals.cacheWrite - measurement.main.cacheWrite;
    const subagentOet = measurement.totals.oet - measurement.mainOet;

    const lines = [];

    lines.push("# Token spend — session " + sessionId);
    lines.push("");
    lines.push("Measured from transcripts (`type == \"assistant\"`), not from notification figures.");
    lines.push("");
    lines.push("**OET** — output-equivalent tokens — is the derived quantity proportional to cost;");
    lines.push("the three raw sums beside it are the measured facts. Weights read on `"
        + measurement.weightsReadOn + "`.");
    lines.push("");
    lines.push("| Tier | output | cache-read | cache-write | OET |");
    lines.push("|---|---:|---:|---:|---:|");
    lines.push(usageRow("main thread", measurement.main.output, measurement.main.cacheRead, measurement.main.cacheWrite, measurement.mainOet));
    lines.push(usageRow(measurement.subagents.length + " subagents", subagentOutput, subagentCacheRead, subagentCacheWrite, subagentOet));
    lines.push(usageRow("**total**", measurement.totals.output, measurement.totals.cacheRead, measurement.totals.cacheWrite, measurement.totals.oet));
    lines.push("");
    lines.push("## By agent type");
    lines.push("");
    lines.push("| Type | n | output | cache-read | cache-write | OET |");
    lines.push("|---|---:|---:|---:|---:|---:|");

    for (const typeRow of measurement.byType)
    {
        lines.push("| `" + typeRow.type + "` | " + typeRow.count + " | "
            + groupDigits(typeRow.output) + " | " + groupDigits(typeRow.cacheRead) + " | "
            + groupDigits(typeRow.cacheWrite) + " | " + groupDigits(typeRow.oet) + " |");
    }

    if (measurement.topRuns.length > 0)
    {
        lines.push("");
        lines.push("## Costliest individual runs");
        lines.push("");
        lines.push("| Agent | Type | model | output | cache-read | cache-write | OET |");
        lines.push("|---|---|---|---:|---:|---:|---:|");

        for (const run of measurement.topRuns)
        {
            lines.push("| `" + run.identifier + "` | `" + run.type + "` | " + (run.model || "unknown") + " | "
                + groupDigits(run.usage.output) + " | " + groupDigits(run.usage.cacheRead) + " | "
                + groupDigits(run.usage.cacheWrite) + " | " + groupDigits(run.oet) + " |");
        }
    }

    lines.push("");
    return lines.join("\n");
}

function main()
{
    const parsed = parseArguments(process.argv.slice(2));
    const resolved = resolveSession(parsed);
    const measurement = measureSession(resolved.directory, resolved.session, { topRuns: parsed.topRuns });
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
    readAgentMeta,
    aggregateByType,
    topRunsByOet,
    grandTotals,
    measureSession,
    formatReport,
};

if (require.main === module)
{
    main();
}
