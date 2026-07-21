"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fileSystem = require("fs");
const path = require("path");
const operatingSystem = require("os");

const measurer = require("./measure-token-spend.js");

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

function buildFixture()
{
    const root = fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), "token-spend-"));
    const sessionId = "sess";

    // Main thread: two assistant records that count, and one NON-assistant record that carries a
    // usage block. The type filter must exclude it; if the filter were removed its 999s would leak
    // into the totals, so the fixed assertions below only hold while the guard is in place.
    writeJsonLines(path.join(root, sessionId + ".jsonl"),
    [
        { type: "assistant", message: { usage: usage(100, 1000, 10) } },
        { type: "user", message: { usage: usage(999, 999, 999) } },
        { type: "assistant", message: { usage: usage(50, 500, 5) } },
    ]);

    const subagentsDirectory = path.join(root, sessionId, "subagents");

    // Two Explore subagents (accumulation + count), one larger developer (must sort first), and one
    // with no meta file (falls back to "unknown").
    writeJsonLines(path.join(subagentsDirectory, "agent-a.jsonl"), [{ type: "assistant", message: { usage: usage(200, 2000, 20) } }]);
    fileSystem.writeFileSync(path.join(subagentsDirectory, "agent-a.meta.json"), JSON.stringify({ agentType: "Explore" }), "utf8");

    writeJsonLines(path.join(subagentsDirectory, "agent-b.jsonl"), [{ type: "assistant", message: { usage: usage(20, 200, 2) } }]);
    fileSystem.writeFileSync(path.join(subagentsDirectory, "agent-b.meta.json"), JSON.stringify({ agentType: "Explore" }), "utf8");

    writeJsonLines(path.join(subagentsDirectory, "agent-c.jsonl"), [{ type: "assistant", message: { usage: usage(300, 3000, 30) } }]);
    fileSystem.writeFileSync(path.join(subagentsDirectory, "agent-c.meta.json"), JSON.stringify({ agentType: "developer" }), "utf8");

    // agent-d: transcript but no meta.json.
    writeJsonLines(path.join(subagentsDirectory, "agent-d.jsonl"), [{ type: "assistant", message: { usage: usage(5, 50, 1) } }]);

    return { root, sessionId };
}

test("main thread sums only assistant records, even when a non-assistant record carries usage", () =>
{
    const fixture = buildFixture();
    const measurement = measurer.measureSession(fixture.root, fixture.sessionId);

    assert.strictEqual(measurement.main.output, 150);
    assert.strictEqual(measurement.main.cacheRead, 1500);
    assert.strictEqual(measurement.main.cacheWrite, 15);
    assert.strictEqual(measurement.main.assistantRecords, 2);
});

test("subagents are totalled, typed from meta, and aggregated by type", () =>
{
    const fixture = buildFixture();
    const measurement = measurer.measureSession(fixture.root, fixture.sessionId);

    assert.strictEqual(measurement.subagents.length, 4);

    // byType sorts by output descending: developer (300) > Explore (220) > unknown (5).
    assert.deepStrictEqual(measurement.byType.map((row) => row.type), ["developer", "Explore", "unknown"]);

    const explore = measurement.byType.find((row) => row.type === "Explore");
    assert.strictEqual(explore.count, 2);
    assert.strictEqual(explore.output, 220);

    const unknown = measurement.byType.find((row) => row.type === "unknown");
    assert.strictEqual(unknown.count, 1);
    assert.strictEqual(unknown.output, 5);
});

test("grand total is the main thread plus every subagent", () =>
{
    const fixture = buildFixture();
    const measurement = measurer.measureSession(fixture.root, fixture.sessionId);

    assert.strictEqual(measurement.totals.output, 675);
    assert.strictEqual(measurement.totals.cacheRead, 6750);
    assert.strictEqual(measurement.totals.cacheWrite, 68);
});

test("a truncated final line is skipped, not fatal", () =>
{
    const root = fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), "token-spend-"));
    fileSystem.writeFileSync(
        path.join(root, "s.jsonl"),
        "{\"type\":\"assistant\",\"message\":{\"usage\":{\"output_tokens\":7}}}\n{truncated",
        "utf8");

    const measurement = measurer.measureSession(root, "s");
    assert.strictEqual(measurement.main.output, 7);
});

test("the report names the tiers, the agent types, and the subagent-tier subtraction", () =>
{
    const fixture = buildFixture();
    const measurement = measurer.measureSession(fixture.root, fixture.sessionId);
    const report = measurer.formatReport(measurement, fixture.sessionId);

    assert.match(report, /main thread \| 150 \|/);
    // subagent tier is total (675) minus main (150) = 525; pins the subtraction, not just a total.
    assert.match(report, /4 subagents \| 525 \|/);
    assert.match(report, /\*\*total\*\* \| 675 \|/);
    assert.match(report, /`developer`/);
    assert.match(report, /`Explore`/);
});

test("parseArguments pairs flags and nulls a trailing flag with no value", () =>
{
    assert.deepStrictEqual(
        measurer.parseArguments(["--project", "p", "--session", "s", "--out", "o", "--dir", "d"]),
        { directory: "d", project: "p", session: "s", outputPath: "o" });

    // A flag given as the last token must resolve to null, not undefined (the crash guard).
    assert.deepStrictEqual(
        measurer.parseArguments(["--project"]),
        { directory: null, project: null, session: null, outputPath: null });
});

test("resolveSession honours an explicit session and otherwise picks the newest by mtime", () =>
{
    const root = fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), "token-spend-"));
    writeJsonLines(path.join(root, "older.jsonl"), [{ type: "assistant", message: { usage: usage(1, 1, 1) } }]);
    writeJsonLines(path.join(root, "newer.jsonl"), [{ type: "assistant", message: { usage: usage(1, 1, 1) } }]);

    // Force a deterministic mtime ordering rather than relying on write timing.
    fileSystem.utimesSync(path.join(root, "older.jsonl"), 1000000, 1000000);
    fileSystem.utimesSync(path.join(root, "newer.jsonl"), 2000000, 2000000);

    assert.deepStrictEqual(
        measurer.resolveSession({ directory: root, project: null, session: null, outputPath: null }),
        { directory: root, session: "newer" });

    assert.deepStrictEqual(
        measurer.resolveSession({ directory: root, project: null, session: "older", outputPath: null }),
        { directory: root, session: "older" });
});
