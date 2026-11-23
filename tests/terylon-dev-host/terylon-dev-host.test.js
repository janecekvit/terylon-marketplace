// terylon-dev runs inside a host that already chose the model and finishes the branch itself: a background run whose
// platform pushes and opens the pull request. Two things make that work, and this file holds both: every agent
// follows the session's model unless a dispatch names a tier, and develop can end at BUILD_COMPLETE with no Gate 3.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The plugin, from this file.
const PLUGIN_ROOT = path.join(__dirname, "..", "..", "plugins", "terylon-dev");

// The frontmatter of a markdown file: the lines between its first two '---' lines.
function frontmatterOf(file)
{
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);

    assert.equal(lines[0], "---", `${file} starts with frontmatter`);
    const end = lines.indexOf("---", 1);

    assert.ok(end > 0, `${file} closes its frontmatter`);

    return lines.slice(1, end);
}

test("every terylon-dev agent follows the session's model", () =>
{
    const directory = path.join(PLUGIN_ROOT, "agents");
    const agents = fs.readdirSync(directory).filter((name) => name.endsWith(".md"));

    assert.equal(agents.length, 9, "the nine agents of terylon-dev");

    for (const agent of agents)
    {
        const models = frontmatterOf(path.join(directory, agent)).filter((line) => line.startsWith("model:"));

        assert.deepEqual(models, ["model: inherit"], `${agent} pins no model of its own`);
    }
});

test("develop ends at BUILD_COMPLETE with --no-finish and needs no adapter for prose", () =>
{
    const skill = fs.readFileSync(path.join(PLUGIN_ROOT, "skills", "develop", "SKILL.md"), "utf8");
    const description = frontmatterOf(path.join(PLUGIN_ROOT, "skills", "develop", "SKILL.md")).join("\n");
    const hosted = fs.readFileSync(path.join(PLUGIN_ROOT, "skills", "develop", "references", "hosted-run.md"), "utf8");

    assert.match(description, /--no-finish/, "the description names the flag");
    assert.match(skill, /\[--no-finish\]/, "the usage line names the flag");
    assert.match(skill, /references\/hosted-run\.md/, "the flag points at what it changes");
    assert.match(skill, /`--no-finish` — end at `BUILD_COMPLETE`, skip Gate 3/, "Gate 3 is skipped under the flag");
    assert.match(skill, /say so and stop, unless `--no-finish` allows it\./, "the adapter check defers to the flag");
    assert.match(hosted, /not needed when every item is prose or a seed-spec path/,
        "a prose item under the flag needs no adapter");
    assert.match(hosted, /no `finish-branch`, no push, no pull request/, "nothing is pushed or opened");
});
