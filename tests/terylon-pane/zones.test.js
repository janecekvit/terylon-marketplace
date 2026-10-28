// The terylon-pane mod's tests pass in every time zone (#39): two failed on a Prague host while a UTC runner kept them
// green. `claude plugin test` runs its tests in UTC whatever TZ or the system's zone says (measured on 2.1.308 in a
// Linux container, 2026-10-27; on Windows it reads the host's zone and ignores TZ), so a zone cannot be set from
// outside. Instead each zone below is planted in a copy of the mod: the offset the pane reads the host's time by, and
// the one the tests compute their expectations by, both fixed to the zone's. The copy's tests must stay green.
// Needs a `claude` CLI on PATH that has `plugin test`; without one every case skips and says why.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// The mod under test, from the repository root.
const MOD_ROOT = path.join(__dirname, "..", "..", "plugins", "terylon-pane");

// How long one `claude plugin test` run may take.
const RUN_TIMEOUT_MILLISECONDS = 240000;

// Where the host's offset is read: the pane's zoneOffset, and the tests' hostZoneOffset beside it.
const OFFSET_READS = [
    { file: "hooks/register.tsx", find: "  return new Date(now).getTimezoneOffset()\n" },
    { file: "tests/fixtures.ts", find: "  return new Date(moment).getTimezoneOffset()\n" },
];

// Each zone as getTimezoneOffset gives it on the fixtures' day, 2026-10-11: minutes behind UTC, east negative.
const ZONES = [
    { name: "Europe/Prague, UTC+2 in summer time", offset: -120 },
    { name: "America/New_York, UTC-4 in summer time", offset: 240 },
    { name: "Asia/Tokyo, UTC+9", offset: -540 },
];

function skipReason()
{
    const versionProbe = spawnSync("claude", ["--version"], { encoding: "utf8" });

    if (versionProbe.status !== 0)
    {
        return "the claude CLI is not on PATH, so `claude plugin test` cannot run";
    }

    const helpProbe = spawnSync("claude", ["plugin", "test", "--help"], { encoding: "utf8" });

    if (helpProbe.status !== 0 || !/claude plugin test\b/.test(`${helpProbe.stdout}${helpProbe.stderr}`))
    {
        return "claude on PATH has no 'plugin test' (too old)";
    }

    return false;
}

function copyMod()
{
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "terylon-pane-zone-"));
    const target = path.join(directory, "terylon-pane");
    fs.cpSync(MOD_ROOT, target, { recursive: true, filter: source => !source.includes(`${path.sep}.claude-plugin${path.sep}types`) });

    return target;
}

function plantOffset(target, read, offset)
{
    const file = path.join(target, read.file);
    const text = fs.readFileSync(file, "utf8");

    // Found once, or the zone would be planted in one reading and not the other, and a green run would prove nothing.
    if (text.split(read.find).length !== 2)
    {
        throw new Error(`cannot plant: ${read.file} must contain ${JSON.stringify(read.find.trim())} exactly once`);
    }

    fs.writeFileSync(file, text.replace(read.find, `  return ${offset}\n`));
}

function runTests(target)
{
    return spawnSync("claude", ["plugin", "test", target], { encoding: "utf8", timeout: RUN_TIMEOUT_MILLISECONDS });
}

const SKIP = skipReason();

for (const zone of ZONES)
{
    test(`the mod's tests pass in ${zone.name}`, { skip: SKIP, timeout: RUN_TIMEOUT_MILLISECONDS }, () =>
    {
        const target = copyMod();

        for (const read of OFFSET_READS)
        {
            plantOffset(target, read, zone.offset);
        }

        const run = runTests(target);

        assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
        fs.rmSync(path.dirname(target), { recursive: true, force: true });
    });
}
