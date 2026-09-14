"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const { describeToken, AUTHENTICATION_TYPES } = require("./check-access.js");

const encode = (value) => Buffer.from(value, "utf8").toString("base64");

test("an absent token is reported missing rather than wrong", () =>
{
    assert.strictEqual(describeToken(undefined).status, "MISS ");
    assert.strictEqual(describeToken("").status, "MISS ");
});

test("the Basic-auth form is accepted", () =>
{
    const described = describeToken(encode(":abc123"));

    assert.strictEqual(described.status, "ok   ");
    assert.match(described.detail, /6 characters after the colon/);
});

test("a bare token is refused, and the message says how to encode it", () =>
{
    // THE CASE THIS SCRIPT EXISTS FOR. This value is a correct token encoded
    // the obvious way, and Azure DevOps answers 401 to it -- which reads as a
    // permissions problem and is not one.
    const described = describeToken(encode("abc123"));

    assert.strictEqual(described.status, "WRONG");
    assert.match(described.detail, /Basic-auth form/);
    assert.match(described.detail, /base64/);
});

test("a colon with no token after it is refused", () =>
{
    assert.strictEqual(describeToken(encode(":")).status, "WRONG");
});

test("a value that is not base64 at all is refused", () =>
{
    // Buffer.from ignores what it cannot decode rather than throwing, so this
    // is caught by the round trip and not by an exception. Without that round
    // trip a raw PAT pasted in unencoded would decode to bytes, fail the
    // leading-colon test, and be reported with the wrong reason.
    assert.strictEqual(describeToken("not base64 !!!").status, "WRONG");
});

test("the token is never echoed back", () =>
{
    const secret = "s3cr3t-token-value";

    for (const value of [encode(`:${secret}`), encode(secret), "not base64 !!!"])
    {
        assert.ok(!describeToken(value).detail.includes(secret),
            "the reported detail must never contain the token");
    }
});

test("the authentication types are the ones the server accepts", () =>
{
    assert.deepStrictEqual(AUTHENTICATION_TYPES, ["pat", "azcli", "envvar", "env", "interactive"]);
});
