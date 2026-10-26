// The terylon-os plugin (#332; `terylon` until 2026-10-12): its one server is Terylon's /mcp, reached by the owner's tailnet identity
// with no header or token, and every prompt that endpoint serves has exactly one skill mirroring it.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The plugin under test, from the repository root.
const PLUGIN_ROOT = path.join(__dirname, "..", "..", "plugins", "terylon-os");

// The prompts Terylon's /mcp serves (Terylon, src/Terylon.Web.Host/Mcp/McpPrompts.cs), each to the skill mirroring it.
const PROMPT_TO_SKILL = {
    "briefing": "briefing",
    "hand-over": "hand-over",
    "merge-gate": "merge-gate",
    "goal": "add-goal",
    "plan-review": "review-plan",
    "story": "show-story",
};

// The one gate Terylon's /mcp exposes (Terylon PR 228): over MCP it never applies anything, it answers pending with the
// console's merge-sheet link, and the owner confirms the exact commit with the passkey in the console.
const GATE = ["story_merge"];

// The owner's acts: writes that are not gates and show no form, which Claude in a session calls only on the owner's word.
const OWNER_ACTS = ["plan_approve", "plan_rethink", "story_return", "story_unblock", "story_abandon", "story_stop", "story_accept", "leader_pause", "leader_resume", "goal_drop", "memory_confirm", "memory_drop", "policy_save"];

// The phrase a skill naming an owner's act must carry, so the model never takes one to be helpful.
const OWNER_WORD_PATTERN = /only on the owner's word/i;

// A form the owner is sent to: none exists any more, for the gate or for an owner's act.
const FORM_PATTERN = /\bform\b/i;

// Splits a text into sentences and clauses, so a gate named in one clause is not read into its neighbour.
const CLAUSE_SEPARATOR = /(?<=[.;!?])\s+|\n+/;

// The problems in a text that names Terylon's tools: an owner's act called a gate, a form, the gate without its passkey
// and console, an owner's act without the owner's word. Pure, so the planted texts below can show each one caught.
function gateProblemsIn(text)
{
    const problems = [];
    const namedActs = OWNER_ACTS.filter(act => text.includes(act));

    if (FORM_PATTERN.test(text))
    {
        problems.push("sends the owner to a form");
    }

    for (const clause of text.split(CLAUSE_SEPARATOR))
    {
        const actsInClause = OWNER_ACTS.filter(act => clause.includes(act));

        if (actsInClause.length > 0 && /\bgates?\b/i.test(clause))
        {
            problems.push(`calls ${actsInClause.join(", ")} a gate`);
        }
    }

    if (namedActs.length > 0 && !OWNER_WORD_PATTERN.test(text))
    {
        problems.push(`names ${namedActs.join(", ")} without saying it is called only on the owner's word`);
    }

    if (GATE.some(gate => text.includes(gate)) && !(/passkey/i.test(text) && /console/i.test(text)))
    {
        problems.push("names story_merge without the passkey in the console");
    }

    return problems;
}

function readSkill(skillName)
{
    return fs.readFileSync(path.join(PLUGIN_ROOT, "skills", skillName, "SKILL.md"), "utf8");
}

test("the server is Terylon's /mcp over HTTP, addressed by TERYLON_URL, with no header and no token", () =>
{
    const configuration = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, ".mcp.json"), "utf8"));
    const names = Object.keys(configuration.mcpServers);

    assert.deepEqual(names, ["terylon"]);
    assert.equal(configuration.mcpServers.terylon.type, "http");
    assert.equal(configuration.mcpServers.terylon.url, "${TERYLON_URL}/mcp");
    assert.equal(configuration.mcpServers.terylon.headers, undefined);
    assert.equal(configuration.mcpServers.terylon.oauth, undefined);
});

test("every prompt has exactly one skill, and no skill mirrors a prompt that does not exist", () =>
{
    const skills = fs.readdirSync(path.join(PLUGIN_ROOT, "skills")).sort();

    assert.deepEqual(skills, Object.values(PROMPT_TO_SKILL).sort());

    for (const [prompt, skill] of Object.entries(PROMPT_TO_SKILL))
    {
        const text = readSkill(skill);

        assert.match(text, new RegExp(`^name: ${skill}$`, "m"), `${skill}: frontmatter name`);
        assert.match(text, /^description: "Use when /m, `${skill}: description starts with Use when`);
        assert.ok(text.includes(`**Mirrors the MCP prompt \`${prompt}\`**`), `${skill} names the prompt ${prompt}`);
        assert.match(text, /^allowed-tools: .*mcp__plugin_terylon-os_terylon__\*.*mcp__terylon__\*/m, `${skill}: both tool spellings`);
    }
});

test("merge is the one gate, confirmed with the passkey in the console; every other act is the owner's, taken only on their word", () =>
{
    for (const skill of Object.values(PROMPT_TO_SKILL))
    {
        assert.deepEqual(gateProblemsIn(readSkill(skill)), [], skill);
    }

    assert.deepEqual(gateProblemsIn(fs.readFileSync(path.join(PLUGIN_ROOT, "README.md"), "utf8")), [], "README.md");
});

test("the merge-gate skill still takes story_merge through the one gate", () =>
{
    const text = readSkill("merge-gate");

    assert.ok(text.includes("story_merge"));
    assert.match(text, /merge is the one gate/i);
    assert.match(text, /Terylon asks me to confirm the exact commit/);
});

test("teeth: an owner's act called a gate confirmed in Terylon's form is caught", () =>
{
    const planted = "Offer, never act. `story_unblock` and `story_stop` are gates the person confirms in Terylon's form.";
    const problems = gateProblemsIn(planted);

    assert.ok(problems.includes("sends the owner to a form"), problems.join("; "));
    assert.ok(problems.some(problem => problem.startsWith("calls story_unblock, story_stop a gate")), problems.join("; "));
    assert.ok(problems.some(problem => problem.includes("only on the owner's word")), problems.join("; "));
});

test("teeth: story_merge without the passkey in the console is caught", () =>
{
    assert.deepEqual(gateProblemsIn("Then call story_merge; the person confirms it."), ["names story_merge without the passkey in the console"]);
});

test("teeth: a clean text passes", () =>
{
    const clean = "Offer `story_unblock`, and call it only on the owner's word; merge is the one gate. `story_merge` answers pending with the console's link, and the owner confirms with the passkey.";

    assert.deepEqual(gateProblemsIn(clean), []);
});

test("the published plugin names no host, tailnet or organisation", () =>
{
    const files = [];
    const walk = directory =>
    {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true }))
        {
            const full = path.join(directory, entry.name);

            if (entry.isDirectory())
            {
                walk(full);
            }
            else
            {
                files.push(full);
            }
        }
    };
    walk(PLUGIN_ROOT);

    for (const file of files)
    {
        const text = fs.readFileSync(file, "utf8");

        assert.doesNotMatch(text, /tail[0-9a-f]{5}\.ts\.net|terylonlab|janecekvit\/Dev|dev\.azure\.com\/janecekvit/i, file);
    }
});
