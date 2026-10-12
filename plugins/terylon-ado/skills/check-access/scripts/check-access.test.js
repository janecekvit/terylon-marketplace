"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { describe } = require("./check-access.js");
const server = require("../../../shared/ado-server.js");

// Ids shaped like the real ones and belonging to nobody.
const CLIENT_ID = "11111111-2222-4333-8444-555555555555";
const TENANT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function configurationDirectory(servers)
{
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "check-access-"));

    if (servers !== undefined)
    {
        fs.writeFileSync(path.join(directory, ".claude.json"), JSON.stringify({ mcpServers: servers }));
    }

    return directory;
}

function environment(overrides, directory)
{
    return {
        CLAUDE_CONFIG_DIR: directory,
        ADO_ORGANIZATION: "contoso",
        ADO_MCP_CLIENT_ID: CLIENT_ID,
        ADO_MCP_TENANT_ID: TENANT_ID,
        ...overrides,
    };
}

test("a missing organisation, client id or tenant is named, and there is no default for any", () =>
{
    const directory = configurationDirectory();

    for (const variable of ["ADO_ORGANIZATION", "ADO_MCP_CLIENT_ID", "ADO_MCP_TENANT_ID"])
    {
        const described = describe(environment({ [variable]: undefined }, directory));

        assert.strictEqual(described.failed, true, variable);
        assert.ok(described.lines.some(line => line.includes(variable) && line.includes("MISS")), variable);
    }
});

test("an organisation given as a URL is refused: it goes into every call as a bare name", () =>
{
    const described = describe(environment({ ADO_ORGANIZATION: "https://dev.azure.com/contoso" }, configurationDirectory()));

    assert.strictEqual(described.failed, true);
    assert.ok(described.lines.some(line => line.includes("bare name")));
});

test("an id that is not a GUID is refused", () =>
{
    const described = describe(environment({ ADO_MCP_CLIENT_ID: "my-app" }, configurationDirectory()));

    assert.strictEqual(described.failed, true);
    assert.ok(described.lines.some(line => line.includes("not a GUID")));
});

test("no registration, or one that differs, sends the reader to connect", () =>
{
    const absent = describe(environment({}, configurationDirectory()));
    const other = describe(environment({}, configurationDirectory({ ado: { type: "http", url: "https://mcp.dev.azure.com/contoso" } })));

    assert.strictEqual(absent.failed, true);
    assert.ok(absent.lines.some(line => line.includes("run the connect skill")));
    assert.strictEqual(other.failed, true);
    assert.ok(other.lines.some(line => line.includes("differs")));
});

test("the registration connect makes passes, at the root URL with the tenant's pinned metadata", () =>
{
    const wanted = server.wantedServer(environment({}, "")).server;
    const described = describe(environment({}, configurationDirectory({ ado: wanted })));

    assert.strictEqual(described.failed, false, described.lines.join("\n"));
    assert.strictEqual(wanted.url, "https://mcp.dev.azure.com");
    assert.strictEqual(wanted.oauth.authServerMetadataUrl, `https://login.microsoftonline.com/${TENANT_ID}/v2.0/.well-known/openid-configuration`);
    assert.strictEqual(wanted.oauth.callbackPort, 3118);
    assert.strictEqual(wanted.oauth.scopes, "https://mcp.dev.azure.com/.default offline_access");
});

test("no id is ever printed", () =>
{
    const directory = configurationDirectory();

    for (const overrides of [{}, { ADO_MCP_TENANT_ID: "not-a-guid" }, { ADO_ORGANIZATION: undefined }])
    {
        const text = describe(environment(overrides, directory)).lines.join("\n");

        assert.ok(!text.includes(CLIENT_ID) && !text.includes(TENANT_ID), "an id reached the report");
    }
});
