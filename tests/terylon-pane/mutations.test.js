// The terylon-pane mod's tests have teeth (#332): each mutation below is planted in a copy of the mod, and
// `claude plugin test` on that copy must fail. The unmutated copy must pass first, or a red mutation proves
// nothing. Needs a `claude` CLI on PATH that has `plugin test`; without one every case skips and says why.
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
        find: "              ...(current.alerts > 0 ? [<Text color=\"warning\" tabular>{COPY.bandAlerts(current.alerts)}</Text>] : []),\n",
        replace: "              ...pair('Today', `$${current.runningUsd}`, 'inactive'),\n              ...(current.alerts > 0 ? [<Text color=\"warning\" tabular>{COPY.bandAlerts(current.alerts)}</Text>] : []),\n",
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
        find: "          current.running.length === 0 ? quiet(elements, COPY.nothingRunning) : null,\n          ...current.running.map(item =>\n            rowOf({\n              key: `story-${item.story}`,",
        replace: "          null,\n          ...current.running.map(item =>\n            rowOf({\n              key: `story-${item.story}`,",
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
    // S24 (#360): the live run, the bell handled from the pane, and its count on the band.
    {
        name: "the phases are inferred from the timeline again",
        file: "hooks/queue.ts",
        find: "  const at = stage === null ? -1 : (STAGES as readonly string[]).indexOf(stage)\n",
        replace: "  const inferred = [...list(document.timeline)].reverse().map(event => /→\\s*([a-z-]+)/.exec(String(event.summary ?? ''))?.[1]).find(found => found !== undefined)\n  const at = (STAGES as readonly string[]).indexOf(({ 'pr-open': 'pr', verifying: 'verify', verified: 'merge' } as Record<string, string>)[inferred ?? ''] ?? stage ?? '')\n",
    },
    {
        name: "Mark handled sends nothing",
        file: "hooks/register.tsx",
        find: "                        onPress={() => handleNotice($, notice.id)}\n",
        replace: "                        onPress={() => toggle($, `notice-${notice.id}`)}\n",
    },
    {
        name: "the band drops the bell's count",
        file: "hooks/register.tsx",
        find: "              ...pair(COPY.bandBell, String(current.notices), current.notices > 0 ? 'warning' : 'inactive'),\n              ...(current.alerts",
        replace: "              ...(current.alerts",
    },
    {
        name: "the band never reads the bell again after a notice is handled",
        file: "hooks/register.tsx",
        find: "    notices: (notices.kind === 'ok' ? number(notices.value.unhandled) : null) ?? number(lastBriefing.unhandledNotices) ?? previous.notices,\n",
        replace: "    notices: previous.notices,\n",
    },
    {
        name: "goal_drop, a gate, joins the pane's own tools",
        file: "hooks/terylon.ts",
        find: "  'notice_handle',\n])",
        replace: "  'notice_handle',\n  'goal_drop',\n])",
    },
    {
        name: "the gate list copied from McpGates.cs loses goal_drop",
        file: "hooks/terylon.ts",
        find: "  'leader_resume',\n  'goal_drop',\n]",
        replace: "  'leader_resume',\n]",
    },
    // The operator's Desktop walk of 1.1.1 (2026-10-21, #360).
    {
        name: "the goals tab's load is no longer bounded",
        file: "hooks/register.tsx",
        find: "  await bounded($, 'goals', () => readGoalsFromTerylon($),",
        replace: "  await readGoalsFromTerylon($); void (async () => undefined)(",
    },
    {
        name: "the bell's load is no longer bounded",
        file: "hooks/register.tsx",
        find: "  await bounded($, 'the bell', () => readBellFromTerylon($),",
        replace: "  await readBellFromTerylon($); void (async () => undefined)(",
    },
    {
        name: "the pane's prompts are no longer posted once",
        file: "hooks/register.tsx",
        find: "  if (last !== undefined && now - last < PROMPT_REPEAT_MILLISECONDS) {\n    return\n  }\n",
        replace: "",
    },
    {
        name: "an answer can be sent again while it is being sent",
        file: "hooks/register.tsx",
        find: "  if (isAnswerSending) {\n    return\n  }\n",
        replace: "",
    },
    {
        name: "an answer sent by Enter is read from before its last keystroke again",
        file: "hooks/register.tsx",
        find: "onSubmit={value => sendAnswer($, value)}",
        replace: "onSubmit={() => sendAnswer($)}",
    },
    {
        name: "an added goal no longer says how the leader reads it",
        file: "hooks/register.tsx",
        find: ": isAccepted ? COPY.goalAdded(why(answered)) : why(answered),",
        replace: ": why(answered),",
    },
    {
        name: "one story is said as stories again",
        file: "hooks/copy.ts",
        find: "`${count === 1 ? 'story' : 'stories'}",
        replace: "`${'stories'}",
    },
    // S32 (#25): the drawing on the 2.1.304 mod API.
    {
        name: "a running row with no progress.stage draws its first phase to come as now",
        file: "hooks/drawing.ts",
        find: "  const parts = phases.map((phase, index) => {\n    const x = round(index * (size + gap))\n",
        replace: "  const parts = phases.map((given, index) => {\n    const phase = nowOf(phases) < 0 && index === phases.findIndex(item => item.status === 'next') ? { ...given, status: 'now' as const } : given\n    const x = round(index * (size + gap))\n",
    },
    {
        name: "a gate creeps into the allow rules the Status tab draws",
        file: "hooks/register.tsx",
        find: "<Code key=\"allow-rules\" source={allowRules()}",
        replace: "<Code key=\"allow-rules\" source={allowRules().replace('\"\\n  ]', '\",\\n    \"mcp__plugin_terylon-os_terylon__story_merge\"\\n  ]')}",
    },
    {
        name: "input-rows, which the owner proved, is off again",
        file: "hooks/drawing.ts",
        find: "export const PROOF_DEFAULTS: Proofs = { inputRows: true, hoverReveal: true, svgTooltips: true }",
        replace: "export const PROOF_DEFAULTS: Proofs = { inputRows: false, hoverReveal: true, svgTooltips: true }",
    },
    {
        name: "hover-reveal, which the owner proved, is off again",
        file: "hooks/drawing.ts",
        find: "export const PROOF_DEFAULTS: Proofs = { inputRows: true, hoverReveal: true, svgTooltips: true }",
        replace: "export const PROOF_DEFAULTS: Proofs = { inputRows: true, hoverReveal: false, svgTooltips: true }",
    },
    {
        name: "svg-tooltips, which the owner proved, is off again",
        file: "hooks/drawing.ts",
        find: "export const PROOF_DEFAULTS: Proofs = { inputRows: true, hoverReveal: true, svgTooltips: true }",
        replace: "export const PROOF_DEFAULTS: Proofs = { inputRows: true, hoverReveal: true, svgTooltips: false }",
    },
    {
        name: "a word is drawn inside an Svg, where the theme cannot reach it",
        file: "hooks/drawing.ts",
        find: "viewBox=\"0 0 ${width} ${height}\">${body}</svg>`",
        replace: "viewBox=\"0 0 ${width} ${height}\">${body}<text x=\"0\" y=\"8\">now</text></svg>`",
    },
    {
        name: "the band's digits are no longer tabular",
        file: "hooks/register.tsx",
        find: "      <Text color={color} tabular>{value}</Text>,\n",
        replace: "      <Text color={color}>{value}</Text>,\n",
    },
    {
        name: "the narrow dock is drawn as the wide pane",
        file: "hooks/register.tsx",
        find: "      isNarrow: e.props.bodyColumns < NARROW_COLUMNS,\n",
        replace: "      isNarrow: false,\n",
    },
    {
        name: "the new goal's priority picked is not what goal_add sends",
        file: "hooks/register.tsx",
        find: "onSelect={value => update($, goals, (state: PaneGoals): PaneGoals => ({ ...state, priority: value }))}",
        replace: "onSelect={() => undefined}",
    },
    {
        name: "the new task's size picked is not what tasks_add sends",
        file: "hooks/register.tsx",
        find: "    size: COPY.sizes.includes(form.size) ? form.size : 'M',\n",
        replace: "    size: 'M',\n",
    },
    {
        name: "one of S27's buttons is drawn in the story's slot",
        file: "hooks/register.tsx",
        find: "            <Button key=\"summarise\" label={COPY.summariseInSession}",
        replace: "            <Button key=\"story-stop\" label=\"Stop\" onPress={() => undefined} />\n            <Button key=\"summarise\" label={COPY.summariseInSession}",
    },
    {
        name: "a row's kind and detail fall outside its one Button",
        file: "hooks/register.tsx",
        find: "        <Button key={input.key} plain onPress={input.onPress}>\n          {children}\n        </Button>\n",
        replace: "        {children.slice(0, -1)}\n        <Button key={input.key} plain onPress={input.onPress}>\n          {children.slice(-1)}\n        </Button>\n",
    },
    // The owner's walk of 1.2.0 in Desktop 3.6556.2.0 (engine 2.1.308), 2026-10-23.
    {
        name: "a card that waits for the owner is filled again",
        file: "hooks/register.tsx",
        find: "      borderColor={toneKey}\n",
        replace: "      borderColor={toneKey}\n      backgroundColor={look.isGraphic && tone !== 'plain' ? toneKey : undefined}\n",
    },
    {
        name: "a card that waits for the owner loses its coloured stroke",
        file: "hooks/register.tsx",
        find: "  const toneKey = tone === 'wait' ? 'warning' : tone === 'bad' ? 'error' : 'subtle'\n",
        replace: "  const toneKey = 'subtle'\n",
    },
    {
        name: "a row's kind chip loses its grey",
        file: "hooks/register.tsx",
        find: " color={CHIP_WORD} backgroundColor={CHIP_BACKGROUND}>",
        replace: " color={CHIP_WORD}>",
    },
    {
        name: "a chip's word is drawn in the kind's colour again, unreadable on the chip",
        file: "hooks/register.tsx",
        find: "<Text size=\"caption\" color={CHIP_WORD} backgroundColor={CHIP_BACKGROUND}>",
        replace: "<Text size=\"caption\" color={input.kindTone ?? 'subtle'} backgroundColor={CHIP_BACKGROUND}>",
    },
    {
        name: "a problem card's title is amber again",
        file: "hooks/register.tsx",
        find: "color={tone === 'bad' ? 'error' : 'text'}",
        replace: "color=\"warning\"",
    },
    {
        name: "the waiting card's count is amber again",
        file: "hooks/register.tsx",
        find: "current.waiting.length > 0 ? 'text' : 'inactive', stale)",
        replace: "current.waiting.length > 0 ? 'warning' : 'inactive', stale)",
    },
    {
        name: "the stepper shrinks as a whole in a dock of about 435 px again",
        file: "hooks/register.tsx",
        find: "      isCompact: e.props.bodyColumns < STEPPER_COLUMNS,\n",
        replace: "      isCompact: false,\n",
    },
    {
        name: "a story's state chip is filled in its own colour again",
        file: "hooks/register.tsx",
        find: "backgroundColor={look.isGraphic ? CHIP_BACKGROUND : undefined} paddingX",
        replace: "backgroundColor={look.isGraphic ? shownStory.stateTone : undefined} paddingX",
    },
    {
        name: "the hover reveal is laid over an open row",
        file: "hooks/register.tsx",
        find: " && !isOpen && ",
        replace: " && ",
    },
    {
        name: "an Svg is left to size its own box",
        file: "hooks/register.tsx",
        find: " height={value.height}",
        replace: "",
    },
    {
        name: "the answer field names a second way to send",
        file: "hooks/register.tsx",
        find: "submitLabel={look.isGraphic ? '' : 'answer'}",
        replace: "submitLabel=\"answer\"",
    },
    {
        name: "the wide stepper's nodes are a strip of fixed width again, apart from the labels",
        file: "hooks/drawing.ts",
        find: "    : `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100%\" height=\"${height}\">${parts.join('')}</svg>`",
        replace: "    : svg(456, height, parts.join(''))",
    },
    {
        name: "a blocked story's header says it is running again",
        file: "hooks/queue.ts",
        find: "  const timed = state === 'blocked'",
        replace: "  const timed = state === 'never'",
    },
];

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
