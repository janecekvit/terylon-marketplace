#!/usr/bin/env node
//
// Report whether this environment can reach Azure DevOps through the remote MCP server, and name
// what is missing when it cannot (#332).
//
// WHAT IT CHECKS. The four variables — the organisation and project every call carries, the client
// and tenant ids the server is registered with — and whether the user-scope server `ado` is registered
// exactly as they say. It makes no network call: whether the owner has signed in is what /mcp shows
// (`ado` connected, or "Needs authentication"), and an OAuth token is nothing a script should read.
//
// IT NEVER WRITES AND NEVER PRINTS AN ID. AGENTS.md states the rule for this repository's drivers:
// name what is missing and refuse. `connect` is the one script that registers anything.

"use strict";

const path = require("node:path");

const server = require(path.join(__dirname, "..", "..", "..", "shared", "ado-server.js"));

const OK = "ok   ";
const MISSING = "MISS ";

/** One line per thing checked, and whether all of them hold. */
function describe(environment)
{
    const lines = [];
    const context = server.callContext(environment);
    const wanted = server.wantedServer(environment);
    let failed = false;

    if (context.problems.length === 0)
    {
        lines.push(`  ${OK} ${server.ORGANIZATION_VARIABLE.padEnd(20)} set, passed as orgName in every call`);
    }

    lines.push(context.project === ""
        ? `  ${OK} ${server.PROJECT_VARIABLE.padEnd(20)} not set: each call takes the project from the git remote or the URL`
        : `  ${OK} ${server.PROJECT_VARIABLE.padEnd(20)} set, passed as project`);

    for (const problem of [...context.problems, ...wanted.problems])
    {
        failed = true;
        lines.push(`  ${MISSING} ${problem}`);
    }

    if (wanted.problems.length === 0)
    {
        lines.push(`  ${OK} ${server.CLIENT_ID_VARIABLE.padEnd(20)} set`);
        lines.push(`  ${OK} ${server.TENANT_ID_VARIABLE.padEnd(20)} set`);

        const registered = server.registeredServer(server.userConfigurationPath(environment));

        if (registered === null)
        {
            failed = true;
            lines.push(`  ${MISSING} no user-scope server '${server.SERVER_NAME}': run the connect skill`);
        }
        else if (!server.sameServer(registered, wanted.server))
        {
            failed = true;
            lines.push(`  ${MISSING} the user-scope server '${server.SERVER_NAME}' differs from these variables: run the connect skill`);
        }
        else
        {
            lines.push(`  ${OK} ${"server".padEnd(20)} '${server.SERVER_NAME}' registered at ${server.SERVER_URL}, as configured`);
        }
    }

    return { lines, failed };
}

function main(environment)
{
    const { lines, failed } = describe(environment);

    console.log(`Azure DevOps access (remote MCP server, OAuth)\n\n${lines.join("\n")}\n`);
    console.log(failed
        ? "Set what is missing in your own ~/.claude/settings.json (env), then run the connect skill.\n"
        : "Then /mcp shows whether 'ado' is signed in; sign in there once if it says it needs authentication.\n");

    return failed ? 1 : 0;
}

if (require.main === module)
{
    process.exitCode = main(process.env);
}

module.exports = { describe };
