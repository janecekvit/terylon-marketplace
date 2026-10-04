#!/usr/bin/env node
//
// npx-shim — stands in for `npx` on the PATH the harness gives Claude Code.
//
// terylon-ado's .mcp.json launches `npx -y @azure-devops/mcp@<version> <org> -a <auth>`. When the
// package is the Azure DevOps server, this starts the stub instead, or — in E2E_ADO_MODE=unreachable
// — fails the way an unreachable server does, so the harness can watch a skill stop on it. Every
// other npx invocation is handed to the real npx further down the PATH.
//
"use strict";

const childProcess = require("child_process");
const path = require("path");
const fileSystem = require("fs");

const ADO_PACKAGE_PATTERN = /^@azure-devops\/mcp@/;

const argumentList = process.argv.slice(2);
const packageIndex = argumentList.findIndex((argument) => ADO_PACKAGE_PATTERN.test(argument));

if (packageIndex !== -1)
{
    if (process.env.E2E_ADO_MODE === "unreachable")
    {
        process.stderr.write("Error: connect ECONNREFUSED dev.azure.com:443 — the Azure DevOps MCP server could not reach its organisation\n");
        process.exit(1);
    }

    const stub = path.join(__dirname, "ado-mcp-stub.js");
    const child = childProcess.spawn(process.execPath, [stub, ...argumentList.slice(packageIndex + 1)], { stdio: "inherit" });

    child.on("exit", (code) => process.exit(code === null ? 1 : code));
}
else
{
    // The harness puts its wrapper directory first on PATH; skip it, or npx finds itself.
    const wrapperDirectory = path.resolve(process.env.E2E_BIN_DIR || __dirname);
    const realNpx = (process.env.PATH || "")
        .split(path.delimiter)
        .filter((directory) => directory !== "" && path.resolve(directory) !== wrapperDirectory)
        .map((directory) => path.join(directory, "npx"))
        .find((candidate) => fileSystem.existsSync(candidate));

    if (realNpx === undefined)
    {
        process.stderr.write("npx-shim: no real npx on PATH\n");
        process.exit(127);
    }

    const result = childProcess.spawnSync(realNpx, argumentList, { stdio: "inherit" });

    process.exit(result.status === null ? 1 : result.status);
}
