// The terylon-pane mod's tests have teeth (#332): each mutation below is planted in a copy of the mod, and
// `claude plugin test` on that copy must fail. The unmutated copy must pass first, or a red mutation proves
// nothing. Needs a `claude` CLI on PATH that has `plugin test`; without one every case skips and says why.
// The mutations themselves are in mutations.js. MUTATION_SHARD="<index>/<count>" runs one shard of them (shard.js);
// the unmutated baseline runs in every shard, so each shard proves its own reds mean something.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { MUTATIONS } = require("./mutations.js");
const { parseShard, selectShard } = require("./shard.js");

// The mod under test, from the repository root.
const MOD_ROOT = path.join(__dirname, "..", "..", "plugins", "terylon-pane");

// How long one `claude plugin test` run may take.
const RUN_TIMEOUT_MILLISECONDS = 240000;

// Capability, not presence: an older claude answers --version yet has no `plugin test`, and running
// it would fail every case on "unknown command 'test'" instead of skipping. Asked for help on an
// unknown subcommand, the CLI prints the parent's usage, so the probe checks the usage names it.
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
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "terylon-pane-mutation-"));
    const target = path.join(directory, "terylon-pane");
    fs.cpSync(MOD_ROOT, target, { recursive: true, filter: source => !source.includes(`${path.sep}.claude-plugin${path.sep}types`) });

    return target;
}

function plant(target, edit)
{
    const file = path.join(target, edit.file);
    const text = fs.readFileSync(file, "utf8");

    if (!text.includes(edit.find))
    {
        throw new Error(`cannot plant: ${edit.file} no longer contains ${JSON.stringify(edit.find.trim())}`);
    }

    // A text found twice would be planted at the first, which may be another screen's: the mutation would miss.
    if (text.split(edit.find).length > 2)
    {
        throw new Error(`cannot plant: ${edit.file} contains ${JSON.stringify(edit.find.trim())} more than once`);
    }

    fs.writeFileSync(file, text.replace(edit.find, edit.replace));
}

function runTests(target)
{
    return spawnSync("claude", ["plugin", "test", target], { encoding: "utf8", timeout: RUN_TIMEOUT_MILLISECONDS });
}

const SKIP = skipReason();

test("the unmutated mod passes its own tests", { skip: SKIP, timeout: RUN_TIMEOUT_MILLISECONDS }, () =>
{
    const target = copyMod();
    const run = runTests(target);

    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    fs.rmSync(path.dirname(target), { recursive: true, force: true });
});

const SHARD = parseShard(process.env.MUTATION_SHARD);

for (const mutation of selectShard(MUTATIONS, SHARD))
{
    test(`a mutation turns the tests red: ${mutation.name}`, { skip: SKIP, timeout: RUN_TIMEOUT_MILLISECONDS }, () =>
    {
        const target = copyMod();

        for (const edit of mutation.edits ?? [mutation])
        {
            plant(target, edit);
        }

        const run = runTests(target);

        assert.notEqual(run.status, 0, `the mod's tests stayed green with the mutation planted: ${mutation.name}`);
        assert.match(`${run.stdout}${run.stderr}`, /\(fail\)/, "the run failed a test rather than failing to start");
        fs.rmSync(path.dirname(target), { recursive: true, force: true });
    });
}
