#!/usr/bin/env node
"use strict";

// Output-equivalent tokens (OET) — one derived quantity proportional to what a run costs,
// so a spend decision is not taken on the smallest of the three buckets.
//
//     OET = modelFactor x (output + cacheWriteWeight x cacheWrite + cacheReadWeight x cacheRead)
//
// The weights live in weights.json beside this file, as ratios rather than prices. Both the
// measure-token-spend skill and the SubagentStop hook load them from here, so a single edit
// re-weights every consumer at once.

const fileSystem = require("fs");
const path = require("path");

const WEIGHTS_PATH = path.join(__dirname, "weights.json");

// Model identifiers arrive as full strings ("claude-opus-5[1m]", "claude-sonnet-4-5-20250929").
// The family is the only part the weight table keys on, so match it as a substring and keep the
// table free of every dated variant that will ever ship.
const MODEL_FAMILY_PATTERN = /(opus|sonnet|haiku)/i;

// Used when weights.json is missing or unparseable. Identical to the shipped file, so a broken
// read degrades to the documented defaults rather than to zero — a zero weight would silently
// report every run as free.
const FALLBACK_WEIGHTS =
{
    readOn: "unknown",
    bucket: { output: 1.0, cacheWrite: 0.25, cacheRead: 0.02 },
    model: { default: 1.0, opus: 1.0, sonnet: 0.2, haiku: 0.05 },
};

function loadWeights(weightsPath)
{
    const resolvedPath = weightsPath || WEIGHTS_PATH;

    try
    {
        const parsed = JSON.parse(fileSystem.readFileSync(resolvedPath, "utf8"));

        if (!parsed || !parsed.bucket || !parsed.model)
        {
            return FALLBACK_WEIGHTS;
        }

        return parsed;
    }
    catch
    {
        // An unreadable weight table must not stop a measurement; the documented defaults apply
        // and the report says "unknown" where it would otherwise print the read date.
        return FALLBACK_WEIGHTS;
    }
}

function modelFactor(modelIdentifier, weights)
{
    const table = (weights || FALLBACK_WEIGHTS).model;
    const fallback = typeof table.default === "number" ? table.default : 1.0;

    if (typeof modelIdentifier !== "string")
    {
        return fallback;
    }

    const matched = MODEL_FAMILY_PATTERN.exec(modelIdentifier);

    if (matched === null)
    {
        return fallback;
    }

    const family = matched[1].toLowerCase();

    return typeof table[family] === "number" ? table[family] : fallback;
}

function outputEquivalentTokens(usage, modelIdentifier, weights)
{
    const resolved = weights || loadWeights();
    const bucket = resolved.bucket;

    const weighted = (usage.output || 0) * bucket.output
        + (usage.cacheWrite || 0) * bucket.cacheWrite
        + (usage.cacheRead || 0) * bucket.cacheRead;

    return Math.round(weighted * modelFactor(modelIdentifier, resolved));
}

module.exports =
{
    WEIGHTS_PATH,
    FALLBACK_WEIGHTS,
    loadWeights,
    modelFactor,
    outputEquivalentTokens,
};
