// No slash command the terylon-pane mod registers shares a name with a skill of the mod or of a plugin it
// depends on (#332): the skill wins and the command never runs. Reads the mod's source and the skills on disk.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The plugins, from the repository root.
const PLUGINS_ROOT = path.join(__dirname, "..", "..", "plugins");

// The mod under test.
const MOD_NAME = "terylon-pane";

// A command the module registers: `$.command.register({ name: 'terylon-pane', ...`.
const REGISTERED_COMMAND = /\$\.command\.register\(\{\s*name:\s*'([^']+)'/g;

function readManifest(pluginName)
{
    const manifestPath = path.join(PLUGINS_ROOT, pluginName, ".claude-plugin", "plugin.json");

    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function skillNames(pluginName)
{
    const skillsDirectory = path.join(PLUGINS_ROOT, pluginName, "skills");

    if (!fs.existsSync(skillsDirectory))
    {
        return [];
    }

    return fs.readdirSync(skillsDirectory, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && fs.existsSync(path.join(skillsDirectory, entry.name, "SKILL.md")))
        .map(entry => entry.name);
}

function registeredCommands()
{
    const source = fs.readFileSync(path.join(PLUGINS_ROOT, MOD_NAME, "hooks", "register.tsx"), "utf8");

    return [...source.matchAll(REGISTERED_COMMAND)].map(match => match[1]);
}

test("the mod registers /terylon-pane, /terylon and /terylon-memory", () =>
{
    assert.deepEqual(registeredCommands().sort(), ["terylon", "terylon-memory", "terylon-pane"]);
});

test("no command shares a name with a skill of the mod or of a plugin it depends on", () =>
{
    const plugins = [MOD_NAME, ...(readManifest(MOD_NAME).dependencies ?? [])];
    const skills = plugins.flatMap(pluginName => skillNames(pluginName).map(skill => ({ pluginName, skill })));

    assert.ok(skills.length > 0, "found no skill at all: the check would pass because it cannot fire");

    for (const command of registeredCommands())
    {
        const collision = skills.find(entry => entry.skill === command);

        assert.equal(collision, undefined, `/${command} is also the skill ${collision?.pluginName}:${collision?.skill}`);
    }
});
