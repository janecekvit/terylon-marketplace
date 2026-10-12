// The Azure DevOps MCP server this plugin's skills call: Microsoft's remote server over OAuth (#332).
//
// WHY THE PLUGIN DOES NOT SHIP IT IN .mcp.json. The server needs the client id of the owner's own
// Entra app registration and the tenant's v2.0 metadata URL, and both are CONFIGURATION, never code:
// this repository is published. MEASURED on Claude Code 2.1.296 (2026-10-11), with a probe plugin and
// a local OAuth stand-in: inside a plugin .mcp.json's `oauth` block neither ${VAR} nor
// ${user_config.KEY} is substituted — the authorization URL carried client_id=${user_config.clientId}
// literally while the same server's `url` WAS substituted from both — and a ${VAR} in
// authServerMetadataUrl is validated raw ("Invalid URL"). So the server is registered at the user
// scope, from the environment, by the connect skill, exactly as a session on the owner's remote box
// has it. MEASURE AGAIN on a newer Claude Code: when `oauth` is substituted, the server can move back
// into the plugin's .mcp.json and this file into it.
//
//   ADO_MCP_CLIENT_ID, ADO_MCP_TENANT_ID ──▶ connect ──▶ claude mcp add-json --scope user ado {…}
//                                                          │  unchanged config: NOTHING is touched,
//                                                          │  so the sign-in is kept
//   ADO_ORGANIZATION, ADO_PROJECT ──▶ every tool call as orgName and project, never in the URL
//
// The ROOT URL, never the organisation's: https://mcp.dev.azure.com/<org> fails with AADSTS9010010,
// its RFC 8707 resource not matching the .default scope. The metadata is PINNED to the tenant because
// the root's own metadata names the `organizations` authority, which a single-tenant app cannot use.

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// The server's name: its tools are mcp__ado__<tool>.
const SERVER_NAME = "ado";

// The remote server's root, with no organisation in it.
const SERVER_URL = "https://mcp.dev.azure.com";

// The redirect the app registration names: http://localhost:3118/callback.
const CALLBACK_PORT = 3118;

// What the owner consents to: the server's own scope, and a refresh token.
const SCOPES = "https://mcp.dev.azure.com/.default offline_access";

// The variables, by what they hold.
const CLIENT_ID_VARIABLE = "ADO_MCP_CLIENT_ID";
const TENANT_ID_VARIABLE = "ADO_MCP_TENANT_ID";
const ORGANIZATION_VARIABLE = "ADO_ORGANIZATION";
const PROJECT_VARIABLE = "ADO_PROJECT";

// An Entra id: a GUID.
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// An organisation's bare name: no scheme, no host, no slash.
const ORGANIZATION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,48}[A-Za-z0-9]?$/;

function metadataUrl(tenantId)
{
    return `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`;
}

/** The server as it must be registered, or the names of what is missing or malformed. */
function wantedServer(environment, url = SERVER_URL)
{
    const problems = [];
    const clientId = environment[CLIENT_ID_VARIABLE] ?? "";
    const tenantId = environment[TENANT_ID_VARIABLE] ?? "";

    for (const [variable, value] of [[CLIENT_ID_VARIABLE, clientId], [TENANT_ID_VARIABLE, tenantId]])
    {
        if (value === "")
        {
            problems.push(`${variable} is not set: it is the ${variable === CLIENT_ID_VARIABLE ? "app registration's client id" : "tenant's id"}, a GUID, and it has no default`);
        }
        else if (!GUID_PATTERN.test(value))
        {
            problems.push(`${variable} is not a GUID`);
        }
    }

    if (problems.length > 0)
    {
        return { problems };
    }

    return {
        problems,
        server: {
            type: "http",
            url,
            oauth: {
                clientId,
                callbackPort: CALLBACK_PORT,
                authServerMetadataUrl: metadataUrl(tenantId),
                scopes: SCOPES,
            },
        },
    };
}

/** Where Claude Code keeps the user scope's servers. */
function userConfigurationPath(environment)
{
    const directory = environment.CLAUDE_CONFIG_DIR;

    return directory ? path.join(directory, ".claude.json") : path.join(environment.HOME ?? os.homedir(), ".claude.json");
}

/** The user scope's `ado` server as registered, or null. Reads that one key and nothing else of the file. */
function registeredServer(configurationPath)
{
    try
    {
        const configuration = JSON.parse(fs.readFileSync(configurationPath, "utf8"));

        return configuration?.mcpServers?.[SERVER_NAME] ?? null;
    }
    catch (error)
    {
        // A missing configuration file is a session never started here: nothing is registered.
        if (error.code === "ENOENT")
        {
            return null;
        }

        throw error;
    }
}

function canonical(value)
{
    if (Array.isArray(value))
    {
        return value.map(canonical);
    }

    if (value !== null && typeof value === "object")
    {
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    }

    return value;
}

function sameServer(left, right)
{
    return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

/** The organisation and project every tool call carries, or what is wrong with them. */
function callContext(environment)
{
    const organization = environment[ORGANIZATION_VARIABLE] ?? "";
    const project = environment[PROJECT_VARIABLE] ?? "";
    const problems = [];

    if (organization === "")
    {
        problems.push(`${ORGANIZATION_VARIABLE} is not set: every tool call carries it as orgName, and it has no default`);
    }
    else if (!ORGANIZATION_PATTERN.test(organization))
    {
        problems.push(`${ORGANIZATION_VARIABLE} must be the organisation's bare name, not a URL`);
    }

    return { organization, project, problems };
}

module.exports = {
    SERVER_NAME,
    SERVER_URL,
    CALLBACK_PORT,
    SCOPES,
    CLIENT_ID_VARIABLE,
    TENANT_ID_VARIABLE,
    ORGANIZATION_VARIABLE,
    PROJECT_VARIABLE,
    metadataUrl,
    wantedServer,
    userConfigurationPath,
    registeredServer,
    sameServer,
    callContext,
};
