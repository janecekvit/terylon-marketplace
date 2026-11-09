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
const CREATE_FEATURE_SKILL = AUTHORING_SKILLS[1];
const BOARD_REFERENCE = path.join(REPOSITORY_ROOT, "plugins", "terylon-product", "skills", "create-feature", "references", "feature-board.md");
const BOARD_TEMPLATE = path.join(REPOSITORY_ROOT, "plugins", "terylon-product", "skills", "create-feature", "references", "feature-board.html");
const FORGE_OPS_SKILLS =
[
    path.join(REPOSITORY_ROOT, "plugins", "terylon-ado", "skills", "forge-ops", "SKILL.md"),
    path.join(REPOSITORY_ROOT, "plugins", "terylon-github", "skills", "forge-ops", "SKILL.md"),
];

// The board's six sections, in order: the template's <section> ids and the Markdown board's headings.
const BOARD_SECTION_IDS = ["status", "today-beside-after", "instead", "reach", "decisions", "measured"];
const BOARD_MARKDOWN_HEADINGS =
[
    "## Status strip",
    "## 1. Today beside after",
    "## 2. What each part gets instead",
    "## 3. Who reaches what",
    "## 4. The owner's decisions",
    "## 5. What each step measured",
];

// What a board that must draw from disk may not carry: a script of its own, the canvas's conditional
// element, an interactive control, or anything fetched. The one font stylesheet a canvas allows is a
// copy-time addition and is not in the template.
const BOARD_FORBIDDEN_PATTERN = /<script|sc-if|<button|<input|<iframe|\bsrc=|https?:\/\//i;

// A colour literal: a hex colour, or an rgb()/hsl() call.
const COLOUR_LITERAL_PATTERN = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g;

// The recipes pipe through `gh --jq`, which fake-gh.js hands to the real jq. Without jq on PATH the
// tests that run such a recipe skip and say why; in CI a missing jq fails them instead, so a skip
// there can never hide a regression.
const JQ_SKIP = jqSkipReason();

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

function jqSkipReason()
{
    const probe = childProcess.spawnSync("jq", ["--version"], { encoding: "utf8" });

    if (probe.status === 0 || process.env.CI)
    {
        return false;
    }

    return "jq not on PATH";
}

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

// A skill's own reference files, which it reads as part of its instructions.
function referenceFiles(skill)
{
    const directory = path.join(path.dirname(skill), "references");

    if (!fileSystem.existsSync(directory))
    {
        return [];
    }

    return fileSystem.readdirSync(directory).filter((name) => name.endsWith(".md")).map((name) => path.join(directory, name));
}

test("neither authoring skill names a platform field, an MCP tool or a gh subcommand", () =>
{
    for (const skill of AUTHORING_SKILLS)
    {
        const texts = [withoutFrontmatter(readText(skill)), ...referenceFiles(skill).map(readText)];
        const lines = texts.join("\n").split("\n").filter((line) => PLATFORM_NAME_PATTERN.test(line));

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

test("a story is created with its title, body and criteria intact, the criteria as a task list", { skip: JQ_SKIP }, () =>
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

test("the type label is created when missing, an existing tag is not, and both are attached", { skip: JQ_SKIP }, () =>
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

test("a created story is attached to the requested parent, and the parent reads it back as a child", { skip: JQ_SKIP }, () =>
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

test("a Feature keeps every section of the standard, in order, and gains no criteria section", { skip: JQ_SKIP }, () =>
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

test("teeth: sending the id as a string (-f) is refused", { skip: JQ_SKIP }, () =>
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

// ---------------------------------------------------------------------------------------------
// The Feature's design board — the board's standard, its template, and the attachment the port
// carries it with. The template is read, not rendered: what it must not contain is what would stop
// it drawing from disk, and that is a property of the text.
// ---------------------------------------------------------------------------------------------

// The text with every <!-- … --> comment taken out, scanned once from left to right so that no comment
// can survive by being assembled from the pieces around another; an unclosed comment runs to the end.
function withoutHtmlComments(html)
{
    let kept = "";
    let position = 0;

    while (position < html.length)
    {
        const start = html.indexOf("<!--", position);

        if (start === -1)
        {
            return kept + html.slice(position);
        }

        kept += html.slice(position, start);

        const end = html.indexOf("-->", start + "<!--".length);

        if (end === -1)
        {
            return kept;
        }

        position = end + "-->".length;
    }

    return kept;
}

// The token block, between the markers the canvas's own generator writes and the template keeps.
function tokenBlock(html)
{
    const match = html.match(/\/\* tokens:[\s\S]*?\/\* \/tokens \*\//);

    assert.ok(match !== null, "the token block's markers are missing");

    return match[0];
}

test("both forge-ops bodies offer attach-work-item-file, in their catalog and as a recipe", () =>
{
    for (const reference of [ADO_REFERENCE, GITHUB_REFERENCE])
    {
        assert.ok(section(readText(reference), "### `attach-work-item-file`").trim().length > 0, `${reference} has no recipe`);
    }

    for (const skill of FORGE_OPS_SKILLS)
    {
        assert.match(readText(skill), /^\| `attach-work-item-file` \|/m, `${skill} does not list the operation`);
    }
});

test("create-feature draws the board, attaches it through the port and says what happens when it cannot", () =>
{
    const body = withoutFrontmatter(readText(CREATE_FEATURE_SKILL));

    assert.match(body, /feature-board\.md/, "the skill does not point at the board's standard");
    assert.match(body, /feature-board\.html/, "the skill does not point at the board's template");
    assert.match(body, /`attach-work-item-file`/, "the skill does not name the port's operation");
    assert.match(body, /not attached/i, "the skill does not say how a refused attachment is reported");
    assert.doesNotMatch(body, /\bPNG\b|playwright|screenshot/i, "the board is Markdown and HTML, never a rendered picture");
});

test("the board's standard and its template carry the same six sections, in the same order", () =>
{
    const template = readText(BOARD_TEMPLATE);
    const sectionIds = [...withoutHtmlComments(template).matchAll(/<section id="([^"]+)"/g)].map((match) => match[1]);

    assert.deepStrictEqual(sectionIds, BOARD_SECTION_IDS);

    const skeleton = readText(BOARD_REFERENCE).match(/```markdown\n([\s\S]*?)```/);

    assert.ok(skeleton !== null, "the standard has no Markdown skeleton");

    const headings = skeleton[1].split("\n").filter((line) => line.startsWith("## "));

    assert.deepStrictEqual(headings, BOARD_MARKDOWN_HEADINGS);
    assert.match(skeleton[1], /Nothing measured yet\./, "a board drawn at creation must say nothing was measured");
});

test("the board template draws from disk: no script, no sc-if, no control, nothing fetched", () =>
{
    const template = withoutHtmlComments(readText(BOARD_TEMPLATE));
    const forbidden = template.split("\n").filter((line) => BOARD_FORBIDDEN_PATTERN.test(line));

    assert.deepStrictEqual(forbidden, []);
});

test("the board template is 1440 wide and light and dark from one token block, with no colour outside it", () =>
{
    const template = withoutHtmlComments(readText(BOARD_TEMPLATE));
    const tokens = tokenBlock(template);
    const outside = template.replace(tokens, "");

    assert.match(outside, /\.t\{width:1440px/, "the board's root is not 1440 wide");
    assert.match(tokens, /@media \(prefers-color-scheme:dark\)/, "no dark values for the system's dark scheme");
    assert.match(tokens, /\.t\.dark/, "the dark theme cannot be forced");
    assert.match(tokens, /\.t\.light/, "the light theme cannot be forced");
    assert.deepStrictEqual(outside.match(COLOUR_LITERAL_PATTERN), null, "a colour is set outside the tokens");
    assert.match(template, /<div class="t">/, "the root class the tokens hang on is missing");
});

// Runs the attach recipe as written, then the read-back. `transform` breaks the recipe.
function attachWorkItemFile(directory, inputs, transform)
{
    const [attachRecipe, readBackRecipe] = recipe("attach-work-item-file");

    fileSystem.writeFileSync(path.join(directory, inputs.fileName), inputs.content);

    const script =
    [
        "set -eo pipefail",
        "OWNER=contoso",
        "REPO=widgets",
        "ISSUE=" + inputs.issue,
        "FILE_NAME=" + shellQuote(inputs.fileName),
        "FILE=" + shellQuote(inputs.fileName),
        "COMMENT=" + shellQuote(inputs.comment),
        (transform || ((text) => text))(attachRecipe),
        "echo '--- read back'",
        readBackRecipe,
    ].join("\n");

    return runBash(directory, script);
}

const BOARD_FIXTURE =
{
    issue: 7,
    fileName: "feature-7-board.md",
    comment: "Design board, 2026-11-08, create-feature@1.8.0",
    content: "# Admins can audit who changed a setting\n\n## Status strip\n\n| Story | State |\n|---|---|\n| not broken down yet | - |\n",
};

function featureFixture()
{
    return createFixture(
    {
        nextNumber: 8,
        issues: [{ number: 7, title: "Admins can audit who changed a setting", body: "", state: "OPEN", labels: ["feature"], subIssues: [] }],
    });
}

function readBackUrls(result)
{
    return (result.stdout.split("--- read back\n")[1] || "").trim().split("\n").filter(Boolean);
}

test("the board is attached as one comment opened by its marker, and read back", { skip: JQ_SKIP }, () =>
{
    const directory = featureFixture();
    const result = attachWorkItemFile(directory, BOARD_FIXTURE);

    assert.strictEqual(result.status, 0, result.stderr);

    const comments = readState(directory).issues[0].comments;

    assert.strictEqual(comments.length, 1);
    assert.ok(comments[0].body.startsWith("<!-- attached-file: feature-7-board.md -->\n"), "the comment does not open with the file's marker");
    assert.ok(comments[0].body.includes(BOARD_FIXTURE.comment));
    assert.ok(comments[0].body.endsWith(BOARD_FIXTURE.content), "the file's text is not the comment's");
    assert.deepStrictEqual(readBackUrls(result), [`https://github.com/contoso/widgets/issues/7#issuecomment-${comments[0].id}`]);
});

test("a second run replaces the board's comment instead of adding another", { skip: JQ_SKIP }, () =>
{
    const directory = featureFixture();

    attachWorkItemFile(directory, BOARD_FIXTURE);

    const result = attachWorkItemFile(directory, { ...BOARD_FIXTURE, content: BOARD_FIXTURE.content + "\n## 1. Today beside after\n" });
    const comments = readState(directory).issues[0].comments;

    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(comments.length, 1, "a re-run added a second comment");
    assert.ok(comments[0].body.includes("## 1. Today beside after"), "the comment still holds the first run's board");
    assert.ok(readLog(directory).some((call) => call[0] === "api" && call.includes("PATCH")), "the re-run did not PATCH");
});

test("a file GitHub cannot carry as a comment is refused before any call", () =>
{
    const directory = featureFixture();
    const result = attachWorkItemFile(directory, { ...BOARD_FIXTURE, fileName: "feature-7-board.html", content: "<!doctype html>" });

    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /Markdown or text file only/);
    assert.deepStrictEqual(readLog(directory), []);
});

test("teeth: sending the body with -f posts the literal path, and the read-back finds no board", { skip: JQ_SKIP }, () =>
{
    const directory = featureFixture();
    const result = attachWorkItemFile(directory, BOARD_FIXTURE, (text) => text.replace(/-F body=@/g, "-f body=@"));
    const comments = readState(directory).issues[0].comments;

    assert.strictEqual(result.status, 0, result.stderr);
    assert.deepStrictEqual(comments.map((comment) => comment.body), ["@attachment.md"]);
    assert.deepStrictEqual(readBackUrls(result), [], "a board that was not attached was read back as attached");
});

test("teeth: without the marker lookup, a second run leaves two boards on the Feature", { skip: JQ_SKIP }, () =>
{
    const directory = featureFixture();
    const withoutLookup = (text) => text.replace(/COMMENT_ID=\$\(.*\)/, "COMMENT_ID=");

    attachWorkItemFile(directory, BOARD_FIXTURE, withoutLookup);
    attachWorkItemFile(directory, BOARD_FIXTURE, withoutLookup);

    assert.strictEqual(readState(directory).issues[0].comments.length, 2);
});
