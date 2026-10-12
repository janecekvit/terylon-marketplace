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

// The owner's gates: a skill may name them, never in a way that tells the model to call one unasked.
const GATE_TOOLS = ["plan_approve", "plan_rethink", "story_merge", "story_return", "story_unblock", "story_abandon", "story_stop", "story_accept", "leader_pause", "leader_resume"];

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

test("a skill that names a gate says the person confirms it", () =>
{
    for (const skill of Object.values(PROMPT_TO_SKILL))
    {
        const text = readSkill(skill);
        const named = GATE_TOOLS.filter(gate => text.includes(gate));

        if (named.length > 0)
        {
            assert.match(text, /person confirms|confirm[a-z]* .*in (Terylon's|its) own form|in Terylon's form/i, `${skill} names ${named.join(", ")}`);
        }
    }
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
