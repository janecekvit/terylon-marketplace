// The pane's tools are Terylon's (S27, #27): the owner's acts are exactly the former gates Terylon PR 228 made owner
// writes, merge is the one gate and in neither the pane's tools nor its allow rules, and the README's allow rules are
// exactly the pane's tools. The gate list is copied from Terylon, never derived, so a renamed gate fails here.
//
//   Terylon's McpToolTable ──copied──▶ mcp-tool-table.json ──held equal──▶ OWNER_ACTS, GATE_TOOLS (hooks/terylon.ts)
//          │                                                               PANE_TOOLS ──held equal──▶ README allow rules
//          └── TERYLON_SOURCE set: the copy is held to the C# itself; unset: that one case skips and says why
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The mod, from the repository root.
const MOD_ROOT = path.join(__dirname, "..", "..", "plugins", "terylon-pane");

// The copy of Terylon's tool table.
const TABLE = JSON.parse(fs.readFileSync(path.join(__dirname, "mcp-tool-table.json"), "utf8"));

// How an allow rule names a tool of the terylon-os plugin's server.
const PREFIX = "mcp__plugin_terylon-os_terylon__";

// The one gate: the person's passkey confirms it in the console.
const MERGE = "story_merge";

// A tool name inside a list literal: 'plan_approve'.
const QUOTED_TOOL = /'([a-z_]+)'/g;

// The JSON block under "Allow the pane's … tools" in the README.
const ALLOW_BLOCK = /"allow": \[([\s\S]*?)\]/;

// The quoted strings inside that block.
const QUOTED_STRING = /"([^"]+)"/g;

// A gate and an owner act as Terylon's C# declares them: Gate("story_merge"), OwnerAct("plan_approve").
const CS_GATE = /(?:yield return )?Gate\(\s*"([a-z_]+)"/g;
const CS_OWNER_ACT = /OwnerAct\(\s*"([a-z_]+)"/g;

function sorted(values)
{
    return [...values].sort();
}

// The names one `export const NAME` list declares in hooks/terylon.ts, with a spread of OWNER_ACTS followed.
function declaredList(source, name)
{
    const start = source.indexOf(`export const ${name}`);

    assert.notEqual(start, -1, `hooks/terylon.ts no longer declares ${name}`);

    const open = source.indexOf("[", source.indexOf("=", start));
    const close = source.indexOf("]", open);
    const body = source.slice(open, close);
    const names = [...body.matchAll(QUOTED_TOOL)].map(match => match[1]);

    return body.includes("...OWNER_ACTS") ? [...names, ...declaredList(source, "OWNER_ACTS")] : names;
}

function paneLists()
{
    const source = fs.readFileSync(path.join(MOD_ROOT, "hooks", "terylon.ts"), "utf8");

    return {
        ownerActs: declaredList(source, "OWNER_ACTS"),
        paneTools: declaredList(source, "PANE_TOOLS"),
        gates: declaredList(source, "GATE_TOOLS"),
    };
}

function readmeRules(readme)
{
    const block = ALLOW_BLOCK.exec(readme);

    assert.ok(block !== null, "the README no longer carries an allow block");

    return [...block[1].matchAll(QUOTED_STRING)].map(match => match[1]);
}

// What is wrong with the README's allow rules against the pane's tools: empty when nothing is.
function readmeProblems(readme, paneTools)
{
    const rules = readmeRules(readme);
    const expected = new Set(paneTools.map(tool => `${PREFIX}${tool}`));
    const problems = [];

    for (const rule of rules)
    {
        if (!expected.has(rule))
        {
            problems.push(`a rule the pane does not call: ${rule}`);
        }

        // Merge by name, or anything short of one tool by name: the bare server or a wildcard lets merge through too.
        if (rule.endsWith(MERGE) || !rule.startsWith(PREFIX) || rule.includes("*"))
        {
            problems.push(`a rule that lets the gate through: ${rule}`);
        }
    }

    for (const tool of paneTools)
    {
        if (!rules.includes(`${PREFIX}${tool}`))
        {
            problems.push(`a pane tool with no rule: ${tool}`);
        }
    }

    return problems;
}

test("the owner's acts are exactly the table's owner writes that were gates, and merge the one gate", () =>
{
    const { ownerActs, gates } = paneLists();

    assert.deepEqual(sorted(ownerActs), sorted(TABLE.ownerWritesThatWereGates));
    assert.deepEqual(sorted(gates), sorted(TABLE.gates));
    assert.deepEqual(TABLE.gates, [MERGE]);
});

test("the pane's tools are the table's reads and writes it uses, and never a gate", () =>
{
    const { ownerActs, paneTools } = paneLists();
    const known = new Set([...TABLE.reads, ...TABLE.writes, ...TABLE.ownerWritesThatWereGates]);

    assert.equal(new Set(paneTools).size, paneTools.length, "a tool is listed twice");
    assert.ok(!paneTools.includes(MERGE), "merge is among the pane's tools");

    for (const tool of paneTools)
    {
        assert.ok(known.has(tool), `${tool} is not in Terylon's table`);
        assert.ok(!TABLE.gates.includes(tool), `${tool} is a gate`);
    }

    for (const act of ownerActs)
    {
        assert.ok(paneTools.includes(act), `the owner act ${act} is not among the pane's tools`);
    }
});

test("the README's allow rules are exactly the pane's tools, merge never among them", () =>
{
    const readme = fs.readFileSync(path.join(MOD_ROOT, "README.md"), "utf8");

    assert.deepEqual(readmeProblems(readme, paneLists().paneTools), []);
});

test("the README check has teeth: merge planted, the bare server planted, or an owner act removed each fails it", () =>
{
    const readme = fs.readFileSync(path.join(MOD_ROOT, "README.md"), "utf8");
    const { paneTools } = paneLists();
    const first = `"${PREFIX}${paneTools[0]}",`;
    const plants = [
        readme.replace(first, `${first}\n    "${PREFIX}${MERGE}",`),
        readme.replace(first, `${first}\n    "${PREFIX.slice(0, -2)}",`),
    ];
    const removed = readme.replace(`\n    "${PREFIX}plan_approve",`, "");

    assert.notEqual(removed, readme, "the README has no rule for plan_approve to remove");
    plants.push(removed);

    for (const planted of plants)
    {
        assert.notEqual(planted, readme, "the plant did not change the README");
        assert.notDeepEqual(readmeProblems(planted, paneTools), []);
    }
});

const TERYLON_SOURCE = process.env.TERYLON_SOURCE;

test("the copy is Terylon's table as its C# declares it", { skip: TERYLON_SOURCE ? false : "TERYLON_SOURCE is not set to a Terylon checkout, so the copy cannot be held to its C# here" }, () =>
{
    const directory = path.join(TERYLON_SOURCE, "src", "Terylon.Web.Host", "Mcp");
    const source = fs.readdirSync(directory)
        .filter(name => name.endsWith(".cs"))
        .map(name => fs.readFileSync(path.join(directory, name), "utf8"))
        .join("\n");

    assert.deepEqual(sorted(new Set([...source.matchAll(CS_GATE)].map(match => match[1]))), sorted(TABLE.gates));
    assert.deepEqual(sorted(new Set([...source.matchAll(CS_OWNER_ACT)].map(match => match[1]))), sorted(TABLE.ownerWritesThatWereGates));
});
