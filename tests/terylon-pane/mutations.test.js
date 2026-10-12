// The terylon-pane mod's tests have teeth (#332): each mutation below is planted in a copy of the mod, and
// `claude plugin test` on that copy must fail. The unmutated copy must pass first, or a red mutation proves
// nothing. Needs the `claude` CLI on PATH; without it every case skips and says why.
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

// Each mutation: the file it edits, the text it finds, and what it puts there.
const MUTATIONS = [
    {
        name: "the done-signal is removed",
        file: "hooks/register.tsx",
        find: "    await $.prompt.submit({ text: signal.prompt })\n",
        replace: "",
    },
    {
        name: "the catch-up summary is removed",
        file: "hooks/register.tsx",
        find: "      await $.prompt.submit({ text: summary.prompt })\n",
        replace: "",
    },
    {
        name: "the guard lets a gate tool through",
        file: "hooks/terylon.ts",
        find: "  if (GATE_TOOLS.includes(tool) || !PANE_TOOLS.has(tool)) {",
        replace: "  if (false) {",
    },
    {
        name: "a waiting item approves from the pane, past an opened guard",
        edits: [
            {
                file: "hooks/terylon.ts",
                find: "  if (GATE_TOOLS.includes(tool) || !PANE_TOOLS.has(tool)) {",
                replace: "  if (false) {",
            },
            {
                file: "hooks/register.tsx",
                find: "                  <Link href={item.console} label={COPY.inConsole} />",
                replace: "                  <Button key={`approve-${item.key}`} label=\"Schválit\" onPress={() => callTerylon($, item.kind === 'plan' ? 'plan_approve' : 'story_merge', {})} />",
            },
        ],
    },
];

function hasClaude()
{
    const probe = spawnSync("claude", ["--version"], { encoding: "utf8" });

    return probe.status === 0;
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

    fs.writeFileSync(file, text.replace(edit.find, edit.replace));
}

function runTests(target)
{
    return spawnSync("claude", ["plugin", "test", target], { encoding: "utf8", timeout: RUN_TIMEOUT_MILLISECONDS });
}

const SKIP = hasClaude() ? false : "the claude CLI is not on PATH, so `claude plugin test` cannot run";

test("the unmutated mod passes its own tests", { skip: SKIP, timeout: RUN_TIMEOUT_MILLISECONDS }, () =>
{
    const target = copyMod();
    const run = runTests(target);

    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    fs.rmSync(path.dirname(target), { recursive: true, force: true });
});

for (const mutation of MUTATIONS)
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
