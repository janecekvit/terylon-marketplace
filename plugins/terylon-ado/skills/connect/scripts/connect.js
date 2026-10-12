#!/usr/bin/env node
//
// Register the Azure DevOps MCP server at the user scope, from the environment (#332).
//
//   node connect.js            register it, or change it when the configuration moved
//   node connect.js --check    say where it stands and change nothing; exit 1 unless it matches
//
// IDEMPOTENT, AND THE SIGN-IN SURVIVES IT. An unchanged registration is left alone, so the OAuth
// sign-in it holds is kept. A changed one is removed and added again, and the owner signs in again
// (/mcp → ado → Authenticate). Why the server is registered here and not shipped in the plugin's
// .mcp.json is in shared/ado-server.js, with the measurement behind it.
//
// IT NEVER READS A TOKEN AND PRINTS NO ID. The two ids are configuration, not secrets, and they
// are still said as "set", never echoed: what reaches a transcript is the shape, not the value.

"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const server = require(path.join(__dirname, "..", "..", "..", "shared", "ado-server.js"));

// A test stand-in's address; never set for real use, where the server is Microsoft's.
const URL_OVERRIDE_VARIABLE = "ADO_MCP_URL_FOR_TESTS";

function run(argv, environment)
{
    return spawnSync("claude", argv, { encoding: "utf8", env: environment });
}

function main(argv, environment)
{
    const isCheck = argv.includes("--check");
    const wanted = server.wantedServer(environment, environment[URL_OVERRIDE_VARIABLE] || server.SERVER_URL);
    const context = server.callContext(environment);

    for (const problem of [...wanted.problems, ...context.problems])
    {
        console.log(`  MISS  ${problem}`);
    }

    if (wanted.problems.length > 0)
    {
        console.log("Nothing was registered: set the variables in your own ~/.claude/settings.json (env), then run this again.");

        return 1;
    }

    const configurationPath = server.userConfigurationPath(environment);
    const registered = server.registeredServer(configurationPath);

    if (registered !== null && server.sameServer(registered, wanted.server))
    {
        console.log(`  ok    the user-scope server '${server.SERVER_NAME}' is registered as configured; nothing changed, the sign-in is kept`);

        return context.problems.length > 0 ? 1 : 0;
    }

    if (isCheck)
    {
        console.log(registered === null
            ? `  MISS  no user-scope server '${server.SERVER_NAME}': run connect without --check`
            : `  WRONG the user-scope server '${server.SERVER_NAME}' differs from the configuration: run connect without --check`);

        return 1;
    }

    if (registered !== null)
    {
        const removed = run(["mcp", "remove", server.SERVER_NAME, "--scope", "user"], environment);

        if (removed.status !== 0)
        {
            console.log(`  FAIL  claude mcp remove: ${(removed.stderr || removed.stdout).trim()}`);

            return 1;
        }
    }

    const added = run(["mcp", "add-json", "--scope", "user", server.SERVER_NAME, JSON.stringify(wanted.server)], environment);

    if (added.status !== 0)
    {
        console.log(`  FAIL  claude mcp add-json: ${(added.stderr || added.stdout).trim()}`);

        return 1;
    }

    console.log(`  ok    registered the user-scope server '${server.SERVER_NAME}' at ${wanted.server.url}, client id and tenant set`);
    console.log("Sign in once, in an interactive session: /mcp → ado → Authenticate (on a remote box, forward the callback port first: ssh -L 3118:localhost:3118).");

    return context.problems.length > 0 ? 1 : 0;
}

if (require.main === module)
{
    process.exitCode = main(process.argv.slice(2), process.env);
}

module.exports = { main };
