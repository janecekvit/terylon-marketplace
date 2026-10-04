#!/usr/bin/env node
//
// git-http-server — serves one directory of bare repositories over HTTP on 127.0.0.1, so a local
// clone (a planted defect, an unpushed branch) can be installed through the same
// `marketplace add <url>#<ref>` path a consumer uses. Claude Code accepts an http(s) git URL and
// refuses file://.
//
// It is a thin CGI front for `git http-backend`, git's own smart-HTTP server: Claude Code clones
// shallow, and the static "dumb" protocol cannot. Upload only — a push is refused — and it binds
// the loopback interface only.
//
// Usage: node git-http-server.js <root-directory> <port-file>
//        writes the chosen port to <port-file> once it is listening.
//
"use strict";

const http = require("http");
const childProcess = require("child_process");
const fileSystem = require("fs");
const path = require("path");

const [rootDirectory, portFile] = process.argv.slice(2);
const root = path.resolve(rootDirectory);

// The CGI response's header block ends at the first blank line.
const HEADER_END_PATTERN = /\r?\n\r?\n/;

function serve(request, response, body)
{
    const url = new URL(request.url, "http://127.0.0.1");

    if (url.searchParams.get("service") === "git-receive-pack" || url.pathname.endsWith("/git-receive-pack"))
    {
        response.writeHead(403);
        response.end("read-only\n");
        return;
    }

    const backend = childProcess.spawn("git", ["http-backend"],
    {
        env:
        {
            PATH: process.env.PATH,
            GIT_PROJECT_ROOT: root,
            GIT_HTTP_EXPORT_ALL: "1",
            REQUEST_METHOD: request.method,
            PATH_INFO: decodeURIComponent(url.pathname),
            QUERY_STRING: url.search.replace(/^\?/, ""),
            CONTENT_TYPE: request.headers["content-type"] || "",
            CONTENT_LENGTH: String(body.length),
            HTTP_CONTENT_ENCODING: request.headers["content-encoding"] || "",
            GIT_PROTOCOL: request.headers["git-protocol"] || "",
            REMOTE_ADDR: "127.0.0.1",
        },
    });
    const chunks = [];

    backend.stdout.on("data", (chunk) => chunks.push(chunk));
    backend.stderr.on("data", (chunk) => process.stderr.write(chunk));
    backend.on("close", () =>
    {
        const output = Buffer.concat(chunks);
        const text = output.toString("latin1");
        const match = text.match(HEADER_END_PATTERN);

        if (match === null)
        {
            response.writeHead(500);
            response.end();
            return;
        }

        const headerText = text.slice(0, match.index);
        const headers = {};
        let status = 200;

        for (const line of headerText.split(/\r?\n/))
        {
            const separator = line.indexOf(":");

            if (separator === -1)
            {
                continue;
            }

            const name = line.slice(0, separator).trim();
            const value = line.slice(separator + 1).trim();

            if (name.toLowerCase() === "status")
            {
                status = Number(value.split(" ")[0]);
            }
            else
            {
                headers[name] = value;
            }
        }

        response.writeHead(status, headers);
        response.end(output.subarray(match.index + match[0].length));
    });

    backend.stdin.end(body);
}

const server = http.createServer((request, response) =>
{
    const chunks = [];

    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => serve(request, response, Buffer.concat(chunks)));
});

server.listen(0, "127.0.0.1", () =>
{
    fileSystem.writeFileSync(portFile, String(server.address().port));
});
