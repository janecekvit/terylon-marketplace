#!/usr/bin/env node
//
// Report whether this environment can reach Azure DevOps, and name what is
// missing when it cannot.
//
// WHY THIS EXISTS. The server's own failure messages are accurate and not
// actionable. "PERSONAL_ACCESS_TOKEN is not set or empty" does not say what
// shape the value wants, and a token encoded the obvious way answers 401 --
// which sends a reader to check permissions, scopes and organisation, every
// place except the one line that is wrong.
//
// IT NEVER WRITES AND NEVER PRINTS THE TOKEN. AGENTS.md states the rule for
// this repository's drivers: name the credential that is missing and refuse.
// A script that configures a secret is a script that has read one.

"use strict";

const https = require("node:https");

const ORGANISATION_VARIABLE = "TERYLON_ADO_ORG";
const TOKEN_VARIABLE = "PERSONAL_ACCESS_TOKEN";
const AUTHENTICATION_VARIABLE = "TERYLON_ADO_AUTHENTICATION";

// The authentication types the server accepts. 'pat' is this plugin's default
// because it is the only one that fails immediately when unconfigured.
const AUTHENTICATION_TYPES = ["pat", "azcli", "envvar", "env", "interactive"];

const OK = "ok   ";
const MISSING = "MISS ";
const WRONG = "WRONG";

/**
 * Whether a base64 value decodes to a Basic-auth credential with an empty user.
 *
 * THE LEADING COLON IS THE WHOLE CHECK. Azure DevOps Basic auth puts the token
 * in the password field and leaves the user empty, so the credential is
 * ":" + token. The server documents the variable as "base64-encoded Personal
 * Access Token", which reads as the token alone -- and that spelling returns
 * 401 from a token that is otherwise valid.
 */
function describeToken(rawValue)
{
    if (!rawValue)
    {
        return { status: MISSING, detail: "not set" };
    }

    let decoded;

    try
    {
        decoded = Buffer.from(rawValue, "base64").toString("utf8");
    }
    catch
    {
        return { status: WRONG, detail: "it is not valid base64" };
    }

    // A round trip is the only reliable test: Buffer.from ignores what it
    // cannot decode rather than throwing, so a value that is not base64 at all
    // decodes to something rather than failing.
    if (Buffer.from(decoded, "utf8").toString("base64").replace(/=+$/, "")
        !== rawValue.replace(/=+$/, ""))
    {
        return { status: WRONG, detail: "it is not valid base64" };
    }

    if (!decoded.startsWith(":"))
    {
        return {
            status: WRONG,
            detail: "it decodes to a bare token. Azure DevOps wants the "
                + "Basic-auth form, so encode \":\" + the token -- "
                + "printf ':%s' \"$PAT\" | base64 -w0",
        };
    }

    if (decoded.length === 1)
    {
        return { status: WRONG, detail: "it decodes to a colon and nothing else" };
    }

    return { status: OK, detail: `set, ${decoded.length - 1} characters after the colon` };
}

/** One authenticated request, to say whether the credential actually works. */
function callAzureDevOps(organisation, credential)
{
    return new Promise((resolve) =>
    {
        const request = https.request(
            {
                host: "dev.azure.com",
                path: `/${encodeURIComponent(organisation)}/_apis/projects?api-version=7.1`,
                method: "GET",
                headers: { Authorization: `Basic ${credential}` },
                timeout: 20000,
            },
            (response) =>
            {
                let body = "";

                response.on("data", (chunk) => { body += chunk; });
                response.on("end", () => resolve({ status: response.statusCode, body }));
            });

        request.on("timeout", () =>
        {
            request.destroy();
            resolve({ status: 0, body: "the request timed out" });
        });

        request.on("error", (failure) => resolve({ status: 0, body: failure.message }));
        request.end();
    });
}

async function main(argv)
{
    const live = argv.includes("--live");
    const organisation = process.env[ORGANISATION_VARIABLE];
    const token = describeToken(process.env[TOKEN_VARIABLE]);
    const authentication = process.env[AUTHENTICATION_VARIABLE] ?? "pat";

    const lines = [];
    let failed = false;

    if (organisation)
    {
        lines.push(`  ${OK} ${ORGANISATION_VARIABLE.padEnd(26)} ${organisation}`);
    }
    else
    {
        failed = true;
        lines.push(`  ${MISSING} ${ORGANISATION_VARIABLE.padEnd(26)} not set, and it has no default`);
    }

    lines.push(`  ${token.status === OK ? OK : token.status} ${TOKEN_VARIABLE.padEnd(26)} ${token.detail}`);

    if (token.status !== OK)
    {
        failed = true;
    }

    if (AUTHENTICATION_TYPES.includes(authentication))
    {
        const suffix = process.env[AUTHENTICATION_VARIABLE] ? "" : " (the default)";

        lines.push(`  ${OK} ${AUTHENTICATION_VARIABLE.padEnd(26)} ${authentication}${suffix}`);
    }
    else
    {
        failed = true;
        lines.push(`  ${WRONG} ${AUTHENTICATION_VARIABLE.padEnd(26)} ${authentication} is not one of `
            + AUTHENTICATION_TYPES.join(", "));
    }

    if (live && !failed)
    {
        const answer = await callAzureDevOps(organisation, process.env[TOKEN_VARIABLE]);

        if (answer.status === 200)
        {
            let count = "?";

            try { count = String(JSON.parse(answer.body).count); } catch { /* shape is not the point */ }

            lines.push(`  ${OK} ${"live call".padEnd(26)} 200, ${count} projects visible`);
        }
        else
        {
            failed = true;
            lines.push(`  ${WRONG} ${"live call".padEnd(26)} ${answer.status || "no response"} -- `
                + (answer.status === 401
                    ? "the credential was refused. Check the token has not expired and that its scopes cover work items"
                    : answer.body.slice(0, 120)));
        }
    }
    else if (live)
    {
        lines.push(`  ---- ${"live call".padEnd(26)} skipped, because the configuration above is incomplete`);
    }

    console.log(`Azure DevOps access\n\n${lines.join("\n")}\n`);

    if (failed)
    {
        console.log("Set what is missing in the environment. Nothing here writes it for you, and no\n"
            + "token belongs in a committed file.\n");
    }

    return failed ? 1 : 0;
}

if (require.main === module)
{
    main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}

module.exports = { describeToken, AUTHENTICATION_TYPES };
