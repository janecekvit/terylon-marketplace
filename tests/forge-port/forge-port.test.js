"use strict";

//
// forge-port — the authoring contract between terylon-product and the two forge-ops bodies.
//
// Two kinds of test live here, and they prove different things:
//
//   - CONTRACT tests read the markdown the plugins ship. Both bodies must declare the same
//     work-item keys, and the two authoring skills must name keys and operations, never a
//     platform field or tool. These are static: they prove what the files say.
//
//   - FIXTURE tests execute the GitHub body's recipes — the bash blocks in its reference,
//     extracted verbatim, not a copy — against fake-gh.js, a stand-in that refuses what the real
//     CLI refuses. They prove what those recipes do to an issue tracker that behaves like GitHub's.
//     They do not prove the live endpoint answers the same way; that run belongs to moving the
//     marketplace onto GitHub.
//
// Run: node --test tests/forge-port/forge-port.test.js   (the file, not the directory)
//

const { test } = require("node:test");
const assert = require("node:assert");
const fileSystem = require("fs");
const path = require("path");
const os = require("os");
const childProcess = require("child_process");

const REPOSITORY_ROOT = path.join(__dirname, "..", "..");
const ADO_REFERENCE = path.join(REPOSITORY_ROOT, "plugins", "terylon-ado", "skills", "forge-ops", "references", "forge-ops.md");
const GITHUB_REFERENCE = path.join(REPOSITORY_ROOT, "plugins", "terylon-github", "skills", "forge-ops", "references", "forge-ops.md");
const AUTHORING_SKILLS =
[
    path.join(REPOSITORY_ROOT, "plugins", "terylon-product", "skills", "create-user-story", "SKILL.md"),
    path.join(REPOSITORY_ROOT, "plugins", "terylon-product", "skills", "create-feature", "SKILL.md"),
];
const FEATURE_STANDARD = path.join(REPOSITORY_ROOT, "plugins", "terylon-product", "skills", "create-feature", "references", "feature-standard.md");
const FAKE_GH = path.join(__dirname, "fake-gh.js");

// The heading both bodies file the key table under. The same text on both is part of the contract.
const KEY_TABLE_HEADING = "### Work-item keys — the authoring contract";

// What an authoring skill must never name: a platform field, an MCP tool, a gh subcommand, or
// the ADO format bookkeeping. `allowed-tools` in the frontmatter is excluded before matching,
// because naming both surfaces there is required, not a crossing.
const PLATFORM_NAME_PATTERN = /System\.[A-Z]\w+|Microsoft\.VSTS|mcp__|wit_work_item|multilineFieldsFormat|\bgh (?:issue|api|label|pr)\b/;

// Same offset as fake-gh.js: a database id is the issue number plus this.
const DATABASE_ID_OFFSET = 900000000;

// The seven fields of the Feature standard's Section 2, in order.
const FEATURE_SECTIONS =
[
    "**Problem (why)**",
    "**User needs**",
    "**Design & proposal (what)**",
    "**UX**",
    "**Requirements**",
    "**Acceptance criteria**",
    "**Out of scope**",
];

function readText(file)
{
    return fileSystem.readFileSync(file, "utf8");
}

// The text from a heading to the next heading of the same or a higher level. A `#` line inside
// a fenced block is a shell comment, not a heading, so fences are tracked.
function section(markdown, heading)
{
    const lines = markdown.split("\n");
    const start = lines.indexOf(heading);

    assert.notStrictEqual(start, -1, `missing section: ${heading}`);

    const level = heading.match(/^#+/)[0].length;
    const nextHeading = new RegExp(`^#{1,${level}} `);
    let insideFence = false;
    let end = lines.length;

    for (let index = start + 1; index < lines.length; index++)
    {
        if (lines[index].startsWith("```"))
        {
            insideFence = !insideFence;
        }
        else if (!insideFence && nextHeading.test(lines[index]))
        {
            end = index;
            break;
        }
    }

    return lines.slice(start + 1, end).join("\n");
}

// Rows of the first markdown table in the text, as arrays of trimmed cells, header excluded.
function tableRows(markdown)
{
    const lines = markdown.split("\n").filter((line) => line.startsWith("|"));

    return lines.slice(2).map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
}

// The work-item keys a body declares, as { key: carriedCell }.
function declaredKeys(referenceFile)
{
    const rows = tableRows(section(readText(referenceFile), KEY_TABLE_HEADING));
    const keys = {};

    for (const row of rows)
    {
        keys[row[0].replace(/`/g, "")] = row[3];
    }

    return keys;
}

function bashBlocks(markdown)
{
    return [...markdown.matchAll(/```bash\n([\s\S]*?)```/g)].map((match) => match[1]);
}

function recipe(operation)
{
    return bashBlocks(section(readText(GITHUB_REFERENCE), "### `" + operation + "`"));
}

function withoutFrontmatter(markdown)
{
    return markdown.replace(/^---\n[\s\S]*?\n---\n/, "");
}

// A scratch repository: a state file, a log, and a PATH whose `gh` is the stand-in.
function createFixture(initialState)
{
    const directory = fileSystem.mkdtempSync(path.join(os.tmpdir(), "forge-port-"));
    const binDirectory = path.join(directory, "bin");

    fileSystem.mkdirSync(binDirectory);
    fileSystem.writeFileSync(path.join(binDirectory, "gh"), `#!/bin/sh\nexec node "${FAKE_GH}" "$@"\n`, { mode: 0o755 });
    fileSystem.writeFileSync(path.join(directory, "state.json"), JSON.stringify(
    {
        owner: "contoso",
        repository: "widgets",
        nextNumber: 1,
        labels: [],
        issues: [],
        ...initialState,
    }));
    fileSystem.writeFileSync(path.join(directory, "gh.log"), "");

    return directory;
}

function runBash(directory, script)
{
    return childProcess.spawnSync("bash", ["-c", script],
    {
        cwd: directory,
        encoding: "utf8",
        env:
        {
            ...process.env,
            PATH: path.join(directory, "bin") + path.delimiter + process.env.PATH,
            FAKE_GH_STATE: path.join(directory, "state.json"),
            FAKE_GH_LOG: path.join(directory, "gh.log"),
        },
    });
}

function readState(directory)
{
    return JSON.parse(readText(path.join(directory, "state.json")));
}

function readLog(directory)
{
    return readText(path.join(directory, "gh.log")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

function shellQuote(value)
{
    return "'" + value.replace(/'/g, "'\\''") + "'";
}

// Runs the create-work-item recipe as written, with the caller's inputs set the way the recipe
// documents them. `transform` lets a test break the recipe to show the fixture notices.
function createWorkItem(directory, inputs, transform)
{
    fileSystem.writeFileSync(path.join(directory, "description.md"), inputs.description);
    fileSystem.writeFileSync(path.join(directory, "criteria.md"), inputs.acceptanceCriteria || "");
    fileSystem.writeFileSync(path.join(directory, "footer.md"), inputs.footer);

    const createRecipe = recipe("create-work-item")[0];
    const script =
    [
        "set -eo pipefail",
        "OWNER=contoso",
        "REPO=widgets",
        "TITLE=" + shellQuote(inputs.title),
        "TYPE_LABEL=" + shellQuote(inputs.typeLabel),
        "TAGS=(" + (inputs.tags || []).map(shellQuote).join(" ") + ")",
        (transform || ((text) => text))(createRecipe),
        "echo \"$NUMBER\"",
    ].join("\n");

    return runBash(directory, script);
}

function linkWorkItemParent(directory, child, parent, transform)
{
    const [linkRecipe, readBackRecipe] = recipe("link-work-item-parent");
    const script =
    [
        "set -eo pipefail",
        "OWNER=contoso",
        "REPO=widgets",
        "CHILD=" + child,
        "PARENT=" + parent,
        (transform || ((text) => text))(linkRecipe),
        readBackRecipe,
    ].join("\n");

    return runBash(directory, script);
}

const STORY =
{
    title: "Export the audit log as CSV (Reports MVP)",
    typeLabel: "user story",
    tags: ["reports"],
    description: "## Summary\n- Admins can download the audit log as a spreadsheet.\n\n## Description\nAuditors ask for the log in a form they can filter.\n\n## Out of scope\n- Scheduled exports.\n",
    acceptanceCriteria: "- [ ] an admin can download the last 30 days of the audit log as a CSV file\n- [ ] a user without the admin role cannot download it\n",
    footer: "---\n*🤖 Generated with [Claude Code](https://claude.ai/code) — create-user-story@1.5.2*\n",
};

// ---------------------------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------------------------

test("both forge-ops bodies declare the same work-item keys, in the same order", () =>
{
    const adoKeys = Object.keys(declaredKeys(ADO_REFERENCE));
    const githubKeys = Object.keys(declaredKeys(GITHUB_REFERENCE));

    assert.ok(adoKeys.length > 0);
    assert.deepStrictEqual(githubKeys, adoKeys);
});

test("Azure DevOps carries every key; GitHub declares exactly planning, estimate and priority as not carried", () =>
{
    const notCarried = (keys) => Object.entries(keys)
        .filter(([, carried]) => /not carried/i.test(carried))
        .map(([key]) => key);

    assert.deepStrictEqual(notCarried(declaredKeys(ADO_REFERENCE)), []);
    assert.deepStrictEqual(notCarried(declaredKeys(GITHUB_REFERENCE)), ["planning", "estimate", "priority"]);
});

test("neither authoring skill names a platform field, an MCP tool or a gh subcommand", () =>
{
    for (const skill of AUTHORING_SKILLS)
    {
        const body = withoutFrontmatter(readText(skill));
        const lines = body.split("\n").filter((line) => PLATFORM_NAME_PATTERN.test(line));

        assert.deepStrictEqual(lines, [], `${path.basename(path.dirname(skill))} names platform specifics`);
    }
});

test("every key an authoring skill passes is a key both bodies declare", () =>
{
    const declared = Object.keys(declaredKeys(ADO_REFERENCE));

    for (const skill of AUTHORING_SKILLS)
    {
        const tables = withoutFrontmatter(readText(skill)).split(/\n(?=\| Key \|)/).slice(1);

        assert.ok(tables.length > 0, `${skill} has no key table`);

        for (const table of tables)
        {
            for (const row of tableRows(table))
            {
                for (const key of row[0].match(/`([a-zA-Z]+)`/g) || [])
                {
                    assert.ok(declared.includes(key.replace(/`/g, "")), `${path.basename(path.dirname(skill))} passes an undeclared key ${key}`);
                }
            }
        }
    }
});

// ---------------------------------------------------------------------------------------------
// Fixture — the GitHub body's recipes against a stand-in gh
// ---------------------------------------------------------------------------------------------

test("a story is created with its title, body and criteria intact, the criteria as a task list", () =>
{
    const directory = createFixture({ labels: ["reports"] });
    const result = createWorkItem(directory, STORY);

    assert.strictEqual(result.status, 0, result.stderr);

    const issue = readState(directory).issues[0];

    assert.strictEqual(result.stdout.trim(), "1");
    assert.strictEqual(issue.title, STORY.title);
    assert.strictEqual(issue.body,
        STORY.description + "\n## Acceptance criteria\n\n" + STORY.acceptanceCriteria + "\n" + STORY.footer);

    // GitHub renders a list item that opens "- [ ] " as a tickable box. Every criterion must.
    const criteria = issue.body.split("## Acceptance criteria\n\n")[1].split("\n---\n")[0].trim().split("\n");

    assert.strictEqual(issue.body.split("## Acceptance criteria").length - 1, 1, "exactly one criteria section");
    assert.ok(criteria.every((line) => line.startsWith("- [ ] ")), criteria.join("\n"));
    assert.ok(issue.body.endsWith(STORY.footer), "the footer is last");
});

test("the type label is created when missing, an existing tag is not, and both are attached", () =>
{
    const directory = createFixture({ labels: ["reports"] });
    const result = createWorkItem(directory, STORY);

    assert.strictEqual(result.status, 0, result.stderr);

    const created = readLog(directory).filter((call) => call[0] === "label" && call[1] === "create").map((call) => call[2]);

    assert.deepStrictEqual(created, ["user story"]);
    assert.deepStrictEqual(readState(directory).issues[0].labels, ["user story", "reports"]);
});

test("the create recipe writes nothing for a key GitHub does not carry", () =>
{
    const directory = createFixture({});
    const result = createWorkItem(directory, STORY);

    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(readState(directory).unsupportedFlags, undefined, "no milestone or project stands in for planning");
});

test("a created story is attached to the requested parent, and the parent reads it back as a child", () =>
{
    const directory = createFixture(
    {
        labels: ["feature", "reports"],
        nextNumber: 8,
        issues: [{ number: 7, title: "Reports", body: "", state: "OPEN", labels: ["feature"], subIssues: [] }],
    });

    assert.strictEqual(createWorkItem(directory, STORY).status, 0);

    const result = linkWorkItemParent(directory, 8, 7);

    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(result.stdout.trim().split("\n").pop(), "8", "the parent's sub-issues, read back, list the story");

    const linkCall = readLog(directory).find((call) => call[0] === "api" && call.includes("-F"));

    assert.deepStrictEqual(linkCall.slice(0, 4), ["api", "repos/contoso/widgets/issues/7/sub_issues", "-F", `sub_issue_id=${8 + DATABASE_ID_OFFSET}`]);

    // The fetch recipe is what the duplicate guard reads: the parent's children, by number and title.
    const fetchScript = "OWNER=contoso\nREPO=widgets\nISSUE=7\n" + recipe("fetch-work-item")[0];
    const fetched = runBash(directory, fetchScript);
    const children = fetched.stdout.trim().split("\n").slice(1).map((line) => JSON.parse(line));

    assert.strictEqual(fetched.status, 0, fetched.stderr);
    assert.deepStrictEqual(children.map((child) => [child.id, child.title]), [[8, STORY.title]]);
});

test("a Feature keeps every section of the standard, in order, and gains no criteria section", () =>
{
    const template = section(readText(FEATURE_STANDARD), "## 2. Template");

    for (const label of FEATURE_SECTIONS)
    {
        assert.ok(template.includes(label), `the standard no longer has ${label}`);
    }

    const description = FEATURE_SECTIONS.map((label) => `${label}\n\nGiven content for ${label}.\n`).join("\n---\n\n");
    const directory = createFixture({ labels: ["feature"] });
    const result = createWorkItem(directory,
    {
        title: "Admins can audit who changed a setting",
        typeLabel: "feature",
        description,
        footer: "---\n*🤖 Generated with [Claude Code](https://claude.ai/code) — create-feature@1.5.2*\n",
    });

    assert.strictEqual(result.status, 0, result.stderr);

    const body = readState(directory).issues[0].body;
    const positions = FEATURE_SECTIONS.map((label) => body.indexOf(label));

    assert.ok(positions.every((position) => position >= 0), "every section is present");
    assert.deepStrictEqual([...positions].sort((left, right) => left - right), positions, "in the standard's order");
    assert.ok(!body.includes("## Acceptance criteria"), "a Feature's criteria stay inside its description");
});

// ---------------------------------------------------------------------------------------------
// Teeth — each test breaks the recipe the way it is most likely to be broken, and the fixture
// must refuse it. A fixture that passes a broken recipe is decoration.
// ---------------------------------------------------------------------------------------------

test("teeth: without the label step, the create fails on the missing type label", () =>
{
    const directory = createFixture({ labels: ["reports"] });
    const result = createWorkItem(directory, STORY, (text) => text.replace(/\n {4}gh label list[\s\S]*?\|\| gh label create "\$LABEL" --repo "\$OWNER\/\$REPO"/, ""));

    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /could not add label: 'user story' not found/);
});

test("teeth: sending the id as a string (-f) is refused", () =>
{
    const directory = createFixture(
    {
        nextNumber: 9,
        issues:
        [
            { number: 7, title: "Reports", body: "", state: "OPEN", labels: [], subIssues: [] },
            { number: 8, title: "Story", body: "", state: "OPEN", labels: [], subIssues: [] },
        ],
    });
    const result = linkWorkItemParent(directory, 8, 7, (text) => text.replace("-F sub_issue_id", "-f sub_issue_id"));

    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /HTTP 422/);
});

test("teeth: passing the issue number where the database id belongs links nothing", () =>
{
    const directory = createFixture(
    {
        nextNumber: 9,
        issues:
        [
            { number: 7, title: "Reports", body: "", state: "OPEN", labels: [], subIssues: [] },
            { number: 8, title: "Story", body: "", state: "OPEN", labels: [], subIssues: [] },
        ],
    });
    const result = linkWorkItemParent(directory, 8, 7, (text) => text.replace(/CHILD_ID=\$\(.*\)/, "CHILD_ID=$CHILD"));

    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /HTTP 404/);
    assert.deepStrictEqual(readState(directory).issues[0].subIssues, []);
});
