// Every skill the marketplace ships follows the Agent Skills specification, and a planted bad skill is caught.
// The rules and why each one exists are in skill-spec.js.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fileSystem = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { checkSkill, checkSharedReferences, parseFrontmatter, COPY_MARKER } = require("./skill-spec.js");

// The repository root, from this file.
const REPOSITORY_ROOT = path.join(__dirname, "..", "..");

// A skill that passes every check; each planted defect below starts from it.
const GOOD_FRONTMATTER = "---\nname: good-skill\ndescription: Use when a test needs a skill that passes. Does nothing.\nallowed-tools: Read Grep Bash(git *)\n---\n";
const GOOD_BODY = "# good-skill\n\nRead [the guide](references/guide.md), then run `node \"${CLAUDE_SKILL_DIR}/scripts/run.js\"`.\n";

// Every skill directory, as git lists the SKILL.md files.
function shippedSkillDirectories()
{
    const listing = childProcess.execFileSync("git", ["ls-files", "-z", "--", "plugins/*/skills/*/SKILL.md"],
    {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
    });

    return listing.split("\0").filter(Boolean).map((file) => path.join(REPOSITORY_ROOT, path.dirname(file)));
}

// A throwaway skill directory holding the given files, named by its last path segment.
function plantSkill(files, directoryName = "good-skill")
{
    const root = fileSystem.mkdtempSync(path.join(os.tmpdir(), "skill-spec-"));
    const skillDirectory = path.join(root, directoryName);

    for (const [relativePath, content] of Object.entries(files))
    {
        const target = path.join(skillDirectory, relativePath);

        fileSystem.mkdirSync(path.dirname(target), { recursive: true });
        fileSystem.writeFileSync(target, content);
    }

    return skillDirectory;
}

function goodFiles(overrides = {})
{
    return {
        "SKILL.md": GOOD_FRONTMATTER + GOOD_BODY,
        "references/guide.md": "# guide\n",
        "scripts/run.js": "\"use strict\";\n",
        ...overrides,
    };
}

test("every shipped skill follows the specification", () =>
{
    const skillDirectories = shippedSkillDirectories();
    const problems = [];

    assert.ok(skillDirectories.length > 0, "git listed no skills");

    for (const skillDirectory of skillDirectories)
    {
        for (const problem of checkSkill(skillDirectory))
        {
            problems.push(`${path.relative(REPOSITORY_ROOT, skillDirectory)}: ${problem}`);
        }
    }

    assert.deepEqual(problems, []);
});

test("copies of a reference within one plugin are identical", () =>
{
    const byPlugin = new Map();

    for (const skillDirectory of shippedSkillDirectories())
    {
        const plugin = path.basename(path.dirname(path.dirname(skillDirectory)));

        byPlugin.set(plugin, [...(byPlugin.get(plugin) || []), skillDirectory]);
    }

    const problems = [...byPlugin].flatMap(([plugin, directories]) => checkSharedReferences(directories).map((problem) => `${plugin}: ${problem}`));

    assert.deepEqual(problems, []);
});

test("the planted good skill passes, so every failure below is the defect's", () =>
{
    assert.deepEqual(checkSkill(plantSkill(goodFiles())), []);
});

// Each row: what is planted, and a fragment of the problem it must raise.
const PLANTED_DEFECTS =
[
    ["a key outside the specification", { "SKILL.md": GOOD_FRONTMATTER.replace("---\nname", "---\nargument-hint: <url>\nname") + GOOD_BODY }, "'argument-hint' is not in the specification"],
    ["a name with a capital", { "SKILL.md": GOOD_FRONTMATTER.replace("name: good-skill", "name: Good-skill") + GOOD_BODY }, "not lowercase"],
    ["a name with a double hyphen", { "SKILL.md": GOOD_FRONTMATTER.replace("name: good-skill", "name: good--skill") + GOOD_BODY }, "not lowercase"],
    ["a name with a leading hyphen", { "SKILL.md": GOOD_FRONTMATTER.replace("name: good-skill", "name: -good-skill") + GOOD_BODY }, "not lowercase"],
    ["a name that is not its directory", { "SKILL.md": GOOD_FRONTMATTER.replace("name: good-skill", "name: other-skill") + GOOD_BODY }, "does not match its directory"],
    ["a name over 64 characters", { "SKILL.md": GOOD_FRONTMATTER.replace("name: good-skill", `name: ${"a".repeat(65)}`) + GOOD_BODY }, "over 64"],
    ["no description", { "SKILL.md": GOOD_FRONTMATTER.replace(/description: .*\n/, "") + GOOD_BODY }, "description is missing"],
    ["a description over 1024 characters", { "SKILL.md": GOOD_FRONTMATTER.replace("Does nothing.", "x".repeat(1024)) + GOOD_BODY }, "over 1024"],
    ["a description without its trigger", { "SKILL.md": GOOD_FRONTMATTER.replace("Use when a test", "When a test") + GOOD_BODY }, "'Use when '"],
    ["comma-separated allowed-tools", { "SKILL.md": GOOD_FRONTMATTER.replace("Read Grep", "Read, Grep") + GOOD_BODY }, "space-separated"],
    ["metadata that is not a mapping", { "SKILL.md": GOOD_FRONTMATTER.replace("---\nname", "---\nmetadata: flat\nname") + GOOD_BODY }, "metadata must map"],
    ["a body of 500 lines", { "SKILL.md": GOOD_FRONTMATTER + GOOD_BODY + "line\n".repeat(500) }, "lines, over 499"],
    ["a body over 5000 tokens", { "SKILL.md": GOOD_FRONTMATTER + GOOD_BODY + `${"word ".repeat(4100)}\n` }, "tokens, over 5000"],
    ["a reference to a missing file", { "references/guide.md": undefined }, "'references/guide.md' does not exist"],
    ["a reference two levels deep", { "SKILL.md": GOOD_FRONTMATTER + GOOD_BODY + "See references/deep/guide.md.\n" }, "not one level inside"],
    ["a link outside the supporting folders", { "SKILL.md": GOOD_FRONTMATTER + GOOD_BODY + "See [notes](NOTES.md).\n" }, "'NOTES.md' is not one level inside"],
    ["a path into the plugin root", { "SKILL.md": GOOD_FRONTMATTER + GOOD_BODY + "Read `${CLAUDE_PLUGIN_ROOT}/shared/rules.md`.\n" }, "reaches outside the skill"],
    ["a parent-directory path", { "SKILL.md": GOOD_FRONTMATTER + GOOD_BODY + "Read `../other/SKILL.md`.\n" }, "'../' path"],
    ["an @-import", { "SKILL.md": GOOD_FRONTMATTER + GOOD_BODY + "Load @references/guide.md now.\n" }, "@-import"],
    ["a file beside SKILL.md", { "NOTES.md": "# notes\n" }, "'NOTES.md' sits beside SKILL.md"],
    ["a folder outside the three", { "templates/one.md": "# one\n" }, "'templates' sits beside SKILL.md"],
    ["a nested supporting folder", { "references/deep/guide.md": "# deep\n" }, "nests a folder"],
];

for (const [defect, overrides, expected] of PLANTED_DEFECTS)
{
    test(`the guard has teeth: ${defect} is caught`, () =>
    {
        const files = goodFiles(overrides);

        for (const [relativePath, content] of Object.entries(files))
        {
            if (content === undefined)
            {
                delete files[relativePath];
            }
        }

        const problems = checkSkill(plantSkill(files));

        assert.ok(problems.some((problem) => problem.includes(expected)), `expected '${expected}' in: ${JSON.stringify(problems)}`);
    });
}

test("the guard has teeth: a drifted copy of a shared reference is caught", () =>
{
    const copy = `# guide\n\n${COPY_MARKER}\n`;
    const first = plantSkill(goodFiles({ "references/guide.md": copy }), "first-skill");
    const drifted = plantSkill(goodFiles({ "references/guide.md": `${copy}One more line.\n` }), "second-skill");
    const unmarkedTwin = plantSkill(goodFiles({ "references/guide.md": "# guide, its own\n" }), "third-skill");

    assert.match(checkSharedReferences([first, drifted]).join("\n"), /references\/guide\.md differs/);
    assert.match(checkSharedReferences([first, unmarkedTwin]).join("\n"), /references\/guide\.md differs/);
    assert.deepEqual(checkSharedReferences([first, plantSkill(goodFiles({ "references/guide.md": copy }), "fourth-skill")]), []);
    assert.deepEqual(checkSharedReferences([unmarkedTwin, plantSkill(goodFiles(), "fifth-skill")]), [], "files that only share a name are not copies");
});

test("the frontmatter reader handles folded blocks, quotes and metadata", () =>
{
    const fields = parseFrontmatter("name: one\ndescription: >-\n  Use when a\n  test runs.\nlicense: \"Apache-2.0\"\nmetadata:\n  argument-hint: \"<url>\"\n");

    assert.deepEqual(fields,
    {
        name: "one",
        description: "Use when a test runs.",
        license: "Apache-2.0",
        metadata: { "argument-hint": "<url>" },
    });
});
