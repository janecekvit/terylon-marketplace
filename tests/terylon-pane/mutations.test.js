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
        name: "a call Claude Code did not allow is taken for the tailnet",
        file: "hooks/register.tsx",
        find: "      if (NOT_ALLOWED.test(message)) {",
        replace: "      if (false) {",
    },
    {
        name: "a failed call no longer reaches the debug log",
        file: "hooks/register.tsx",
        find: "      $.ui.log(`terylon-pane: ${tool} on ${server} failed: ${message}`, { to: 'debug' })\n",
        replace: "",
    },
    {
        name: "a stale pane hides why the last call failed",
        file: "hooks/register.tsx",
        find: "        reason(current.problem),\n        steps(COPY.fixUnreachable(base)),\n",
        replace: "        steps(COPY.fixUnreachable(base)),\n",
    },
    {
        name: "the band no longer yields to a survey",
        file: "hooks/register.tsx",
        find: "    if (e.props.hasSurvey) {\n      return next(e)\n    }\n",
        replace: "",
    },
    {
        name: "the status line counts the briefing as an alert",
        file: "hooks/health.ts",
        find: "export const ALERT_SOURCES: readonly string[] = ['gatus', 'unit', 'host']",
        replace: "export const ALERT_SOURCES: readonly string[] = ['gatus', 'unit', 'host', 'leader']",
    },
    {
        name: "the band shows the spend again",
        file: "hooks/register.tsx",
        find: "              ...(current.alerts > 0 ? [<Text color=\"warning\">{COPY.bandAlerts(current.alerts)}</Text>] : []),\n",
        replace: "              ...pair('Today', `$${current.runningUsd}`, 'inactive'),\n              ...(current.alerts > 0 ? [<Text color=\"warning\">{COPY.bandAlerts(current.alerts)}</Text>] : []),\n",
    },
    {
        name: "the status line no longer says the machine's health",
        file: "hooks/register.tsx",
        find: "    questions: questionItems(lastBriefing),\n  }))\n  await showHealth($)\n",
        replace: "    questions: questionItems(lastBriefing),\n  }))\n",
    },
    {
        name: "the pane opens by itself at session start",
        file: "hooks/register.tsx",
        find: "    $.clock.after(0, () => tick($, true))\n",
        replace: "    void $.ui.open({ id: PANE, title: COPY.title })\n    $.clock.after(0, () => tick($, true))\n",
    },
    {
        name: "the band draws a waiting count calm",
        file: "hooks/register.tsx",
        find: "      ...pair(COPY.bandWaiting, String(current.waiting.length), current.waiting.length > 0 ? 'warning' : 'inactive'),\n      ...pair(COPY.bandRunning",
        replace: "      ...pair(COPY.bandWaiting, String(current.waiting.length), 'inactive'),\n      ...pair(COPY.bandRunning",
    },
    {
        name: "a pressed choice no longer fills the answer",
        file: "hooks/register.tsx",
        find: "{ ...value, choice, text: value.text === '' || value.text === value.choice ? choice : value.text }",
        replace: "{ ...value, choice }",
    },
    {
        name: "the allow rules name a gate",
        file: "hooks/terylon.ts",
        find: "  const lines = [...PANE_TOOLS].map(",
        replace: "  const lines = [...PANE_TOOLS, ...GATE_TOOLS].map(",
    },
    {
        name: "a gate joins the pane's own tools",
        file: "hooks/terylon.ts",
        find: "  'question_answer',\n",
        replace: "  'question_answer',\n  'story_merge',\n",
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
                find: "              onPress: () => toggle($, item.key),\n",
                replace: "              onPress: () => callTerylon($, item.kind === 'plan' ? 'plan_approve' : 'story_merge', {}),\n",
            },
        ],
    },
    {
        name: "a row's title is no longer cut at the card's edge",
        file: "hooks/register.tsx",
        find: "<Text color={input.titleTone} wrap=\"truncate-end\">{input.title}</Text>",
        replace: "<Text color={input.titleTone}>{input.title}</Text>",
    },
    {
        name: "an empty card says nothing",
        file: "hooks/register.tsx",
        find: "          current.running.length === 0 ? quiet(elements, COPY.nothingRunning) : null,\n          ...current.running.map(item =>\n            row(elements, {\n              key: `story-${item.story}`,",
        replace: "          null,\n          ...current.running.map(item =>\n            row(elements, {\n              key: `story-${item.story}`,",
    },
    {
        name: "the machine card shows a repeated notice each time",
        file: "hooks/queue.ts",
        find: "handled: lastOfEachKey(all.filter(notice => notice.handledAt != null))",
        replace: "handled: all.filter(notice => notice.handledAt != null)",
    },
    {
        name: "the Status tab is missing a fix step for not-allowed",
        file: "hooks/register.tsx",
        find: "        steps(COPY.fixNotAllowed),\n",
        replace: "",
    },
    {
        name: "the band shows Fix",
        file: "hooks/register.tsx",
        find: "label={COPY.bandOpen}",
        replace: "label={hasProblem(current) ? 'Fix' : COPY.bandOpen}",
    },
    {
        name: "the band's Open forgets the tab the owner left",
        file: "hooks/register.tsx",
        find: "onPress={() => reopenPane($)} />",
        replace: "onPress={() => openPane($, QUEUE)} />",
    },
    {
        name: "/terylon-memory opens a second pane",
        file: "hooks/register.tsx",
        find: "    await openPane($, { screen: 'memory' })\n",
        replace: "    await $.ui.open({ id: 'terylon-memory', title: 'Memory' })\n",
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
