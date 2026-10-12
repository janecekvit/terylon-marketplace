// connect.js against the real `claude mcp` commands, in a throwaway configuration directory: no
// network, no sign-in. Skips, saying why, where the claude CLI is absent.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const CONNECT = path.join(__dirname, "connect.js");

// Ids shaped like the real ones and belonging to nobody.
const CLIENT_ID = "11111111-2222-4333-8444-555555555555";
const OTHER_CLIENT_ID = "99999999-2222-4333-8444-555555555555";
const TENANT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

const SKIP = spawnSync("claude", ["--version"]).status === 0 ? false : "the claude CLI is not on PATH";

function connect(directory, overrides = {}, argv = [])
{
    const environment = { ...process.env, CLAUDE_CONFIG_DIR: directory, ADO_ORGANIZATION: "contoso", ADO_MCP_CLIENT_ID: CLIENT_ID, ADO_MCP_TENANT_ID: TENANT_ID, ...overrides };

    for (const [key, value] of Object.entries(environment))
    {
        if (value === undefined)
        {
            delete environment[key];
        }
    }

    return spawnSync(process.execPath, [CONNECT, ...argv], { encoding: "utf8", env: environment, timeout: 60000 });
}

function registered(directory)
{
    return JSON.parse(fs.readFileSync(path.join(directory, ".claude.json"), "utf8")).mcpServers?.ado ?? null;
}

test("registers the remote server at the user scope from the environment", { skip: SKIP }, () =>
{
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "connect-"));
    const first = connect(directory);

    assert.strictEqual(first.status, 0, first.stdout + first.stderr);
    assert.deepStrictEqual(registered(directory), {
        type: "http",
        url: "https://mcp.dev.azure.com",
        oauth: {
            clientId: CLIENT_ID,
            callbackPort: 3118,
            authServerMetadataUrl: `https://login.microsoftonline.com/${TENANT_ID}/v2.0/.well-known/openid-configuration`,
            scopes: "https://mcp.dev.azure.com/.default offline_access",
        },
    });
    assert.ok(!first.stdout.includes(CLIENT_ID) && !first.stdout.includes(TENANT_ID), "an id was printed");
});

test("re-running with the same configuration touches nothing, so a sign-in is kept", { skip: SKIP }, () =>
{
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "connect-"));
    connect(directory);
    const file = path.join(directory, ".claude.json");
    const before = fs.readFileSync(file, "utf8");
    const modified = fs.statSync(file).mtimeMs;
    const again = connect(directory);

    assert.strictEqual(again.status, 0, again.stdout + again.stderr);
    assert.match(again.stdout, /nothing changed, the sign-in is kept/);
    assert.strictEqual(fs.readFileSync(file, "utf8"), before);
    assert.strictEqual(fs.statSync(file).mtimeMs, modified);
});

test("a changed client id re-registers, and --check reports without changing anything", { skip: SKIP }, () =>
{
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "connect-"));
    connect(directory);
    const checked = connect(directory, { ADO_MCP_CLIENT_ID: OTHER_CLIENT_ID }, ["--check"]);

    assert.strictEqual(checked.status, 1);
    assert.match(checked.stdout, /differs from the configuration/);
    assert.strictEqual(registered(directory).oauth.clientId, CLIENT_ID);

    const changed = connect(directory, { ADO_MCP_CLIENT_ID: OTHER_CLIENT_ID });

    assert.strictEqual(changed.status, 0, changed.stdout + changed.stderr);
    assert.strictEqual(registered(directory).oauth.clientId, OTHER_CLIENT_ID);
});

test("missing ids register nothing and say which variable", { skip: SKIP }, () =>
{
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "connect-"));
    const refused = connect(directory, { ADO_MCP_TENANT_ID: undefined });

    assert.strictEqual(refused.status, 1);
    assert.match(refused.stdout, /ADO_MCP_TENANT_ID is not set/);
    assert.ok(!fs.existsSync(path.join(directory, ".claude.json")) || registered(directory) === null);
});
