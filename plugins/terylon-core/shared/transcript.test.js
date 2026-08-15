"use strict";

const test = require("node:test");
const assert = require("node:assert");

const transcript = require("./transcript.js");

function usage(output, cacheRead, cacheWrite)
{
    return { output_tokens: output, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: cacheWrite };
}

function toText(records)
{
    return records.map((record) => JSON.stringify(record)).join("\n") + "\n";
}

test("one response split across three records is counted once", () =>
{
    const text = toText(
    [
        { type: "assistant", message: { id: "msg_a", model: "claude-opus-5", usage: usage(1, 0, 49491) } },
        { type: "assistant", message: { id: "msg_a", model: "claude-opus-5", usage: usage(1, 0, 49491) } },
        { type: "assistant", message: { id: "msg_a", model: "claude-opus-5", usage: usage(183, 0, 49491) } },
    ]);

    const result = transcript.sumAssistantUsage(text, null);

    assert.strictEqual(result.totals.output, 183);
    assert.strictEqual(result.totals.cacheWrite, 49491);
    assert.strictEqual(result.totals.cacheRead, 0);
    assert.strictEqual(result.totals.messages, 1);
});

test("a message straddling two reads is counted once across both", () =>
{
    const first = toText(
    [
        { type: "assistant", message: { id: "msg_a", usage: usage(1, 100, 200) } },
    ]);

    const second = toText(
    [
        { type: "assistant", message: { id: "msg_a", usage: usage(1, 100, 200) } },
        { type: "assistant", message: { id: "msg_a", usage: usage(183, 100, 200) } },
    ]);

    const firstPass = transcript.sumAssistantUsage(first, null);
    const secondPass = transcript.sumAssistantUsage(second, firstPass.carry);

    assert.strictEqual(firstPass.totals.output + secondPass.totals.output, 183);
    assert.strictEqual(firstPass.totals.cacheRead + secondPass.totals.cacheRead, 100);
    assert.strictEqual(firstPass.totals.cacheWrite + secondPass.totals.cacheWrite, 200);
});

test("a carry for a message that never grows again adds nothing on the next read", () =>
{
    const first = toText([{ type: "assistant", message: { id: "msg_a", usage: usage(183, 100, 200) } }]);
    const second = toText([{ type: "assistant", message: { id: "msg_b", usage: usage(7, 50, 10) } }]);

    const firstPass = transcript.sumAssistantUsage(first, null);
    const secondPass = transcript.sumAssistantUsage(second, firstPass.carry);

    assert.strictEqual(firstPass.totals.output, 183);
    assert.strictEqual(secondPass.totals.output, 7);
    assert.strictEqual(secondPass.totals.cacheRead, 50);
});

test("two distinct messages are counted separately", () =>
{
    const text = toText(
    [
        { type: "assistant", message: { id: "msg_a", usage: usage(10, 1000, 40) } },
        { type: "assistant", message: { id: "msg_b", usage: usage(20, 2000, 50) } },
    ]);

    const result = transcript.sumAssistantUsage(text, null);

    assert.strictEqual(result.totals.output, 30);
    assert.strictEqual(result.totals.cacheRead, 3000);
    assert.strictEqual(result.totals.cacheWrite, 90);
    assert.strictEqual(result.totals.messages, 2);
});

test("records with no message.id are each their own group", () =>
{
    const text = toText(
    [
        { type: "assistant", message: { usage: usage(10, 20, 30) } },
        { type: "assistant", message: { usage: usage(10, 20, 30) } },
    ]);

    const result = transcript.sumAssistantUsage(text, null);

    assert.strictEqual(result.totals.output, 20);
    assert.strictEqual(result.totals.cacheRead, 40);
    assert.strictEqual(result.totals.cacheWrite, 60);
});

test("non-assistant records are ignored", () =>
{
    const text = toText(
    [
        { type: "assistant", message: { id: "msg_a", usage: usage(10, 0, 0) } },
        { type: "user", message: { id: "msg_x", usage: usage(999, 999, 999) } },
        { type: "assistant", message: { id: "msg_b", usage: usage(5, 0, 0) } },
    ]);

    const result = transcript.sumAssistantUsage(text, null);

    assert.strictEqual(result.totals.output, 15);
});

test("assistantRecords counts raw records while messages counts responses", () =>
{
    const text = toText(
    [
        { type: "assistant", message: { id: "msg_a", usage: usage(1, 5, 5) } },
        { type: "assistant", message: { id: "msg_a", usage: usage(9, 5, 5) } },
        { type: "assistant", message: { id: "msg_b", usage: usage(3, 5, 5) } },
    ]);

    const result = transcript.sumAssistantUsage(text, null);

    assert.strictEqual(result.totals.assistantRecords, 3);
    assert.strictEqual(result.totals.messages, 2);
});

test("the first model seen is reported", () =>
{
    const text = toText(
    [
        { type: "assistant", message: { id: "msg_a", model: "claude-sonnet-5", usage: usage(1, 0, 0) } },
        { type: "assistant", message: { id: "msg_b", model: "claude-opus-5", usage: usage(1, 0, 0) } },
    ]);

    const result = transcript.sumAssistantUsage(text, null);

    assert.strictEqual(result.totals.model, "claude-sonnet-5");
});

test("a truncated final line is skipped, not fatal", () =>
{
    const text = toText([{ type: "assistant", message: { id: "msg_a", usage: usage(10, 0, 0) } }])
        + "{\"type\":\"assistant\",\"mess";

    const result = transcript.sumAssistantUsage(text, null);

    assert.strictEqual(result.totals.output, 10);
});

test("empty text yields zero totals and a null carry", () =>
{
    const result = transcript.sumAssistantUsage("", null);

    assert.strictEqual(result.totals.output, 0);
    assert.strictEqual(result.totals.assistantRecords, 0);
    assert.strictEqual(result.carry, null);
});

test("a record with no usage block is skipped", () =>
{
    const text = toText(
    [
        { type: "assistant", message: { id: "msg_a" } },
        { type: "assistant", message: { id: "msg_b", usage: usage(4, 0, 0) } },
    ]);

    const result = transcript.sumAssistantUsage(text, null);

    assert.strictEqual(result.totals.output, 4);
    assert.strictEqual(result.totals.messages, 1);
});

test("an unidentified trailing group is never carried — its key is positional", () =>
{
    const first = toText([{ type: "assistant", message: { usage: usage(100, 0, 0) } }]);
    const second = toText([{ type: "assistant", message: { usage: usage(7, 0, 0) } }]);

    const firstPass = transcript.sumAssistantUsage(first, null);

    assert.strictEqual(firstPass.carry, null);

    const secondPass = transcript.sumAssistantUsage(second, firstPass.carry);

    assert.strictEqual(secondPass.totals.output, 7);
});
