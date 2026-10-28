# Architecture

Why this marketplace is shaped the way it is — the static view. **Architecture Decision Records live here**, one decision per file.

An ADR records a decision *and the reasoning that was overturned to reach it*. That is what separates it from the rest of the knowledge base: a flow describes what happens now, an ADR describes why the alternative was rejected.

## Diagrams

The structure of the marketplace, drawn as Mermaid flowcharts with the ELK layout. Each block is its own source of truth: GitHub renders it where it stands, and nothing is generated from it. To change a diagram, edit its block. Flows over time are drawn as Mermaid in the article that walks them, in [`flows/`](../flows/README.md). The rules are in `.claude/rules/markdown.md`, under *Mermaid with ELK for structure, Mermaid for flows, box drawing for short sketches*.

| Diagram | Draws | Drawn in |
|---|---|---|
| The plugins | every plugin and the dependencies its manifest declares, and the two keys a consumer enables | [the root `README.md`, under *Architecture*](../../README.md#architecture) — the one copy, read where a consumer lands |
| [The forge port](#the-forge-port) | the forge port: its operation catalog, `resolve-forge`, and the two adapters that implement it | here |
| [terylon-os and the pane](#terylon-os-and-the-pane) | a session reaching Terylon's Agentic OS through `terylon-os`, the `terylon-pane` mod and the owner's acts it takes, and merge, the one gate, which stays in the console | here |

### The forge port

```mermaid
---
config:
  layout: elk
  flowchart:
    padding: 16
---
%% The forge port: who names an operation, who resolves the forge, and which adapter's body runs it.
%% The source of truth is this block: edit it here; nothing is generated from it.
%% Why it is a port at all: port-and-adapter-split.md. The resolution step by step:
%% ../flows/forge-resolution.md.
flowchart TD
    %% One colour per kind, the palette of .claude/rules/markdown.md: callers (indigo), the port (amber),
    %% adapters (green), the stop (red), platforms outside the marketplace (grey).
    %% No theme is set, so GitHub draws the block in its light or dark theme.
    classDef caller fill:#4F46E5,stroke:#3730A3,color:#FFFFFF
    classDef port fill:#B45309,stroke:#92400E,color:#FFFFFF
    classDef adapter fill:#047857,stroke:#065F46,color:#FFFFFF
    classDef stop fill:#B91C1C,stroke:#991B1B,color:#FFFFFF
    classDef external fill:#4B5563,stroke:#374151,color:#FFFFFF

    subgraph callers ["Callers: name operations, never tools"]
        transports["`terylon-forge transports
create-pr, review-pr, address-pr-comments,
write-pr-description, update-pr-checklist,
update-work-item-checklist, pr-reviewer`"]:::caller
        product["`terylon-product
create-user-story, create-feature`"]:::caller
        dev["`terylon-dev
develop, planner`"]:::caller
    end

    subgraph port ["`terylon-forge: the port
declares terylon-git only; no adapter declared`"]
        resolve["`resolve-forge
explicit URL, then TERYLON_FORGE, then the git remote
first hit wins; no default`"]:::port
        catalog["`The operation catalog
URLs: parse-pr-url, parse-item-url, resolve-repo-id
pull requests: create, list, metadata, eligibility, diff,
description, reviewers, auto-merge, linked items
threads: list, read, post, reply, resolve
work items: fetch, create, update, link, comments
identity: current user, identity, preconditions`"]:::port
    end

    stop["`STOP: name the forge, the missing plugin,
what to enable. No fallback, no calls of its own`"]:::stop

    subgraph ado ["terylon-ado: adapter"]
        adoForgeOps["`forge-ops
the Azure DevOps body`"]:::adapter
        connect["`connect
registers the ado server at the user scope`"]:::adapter
    end

    subgraph github ["terylon-github: adapter"]
        githubForgeOps["`forge-ops
the GitHub body; no server`"]:::adapter
    end

    adoServer(["`ado: Microsoft's remote MCP server
mcp.dev.azure.com, OAuth
tools mcp__ado__*`"]):::external
    gh["`gh CLI
authenticated by gh auth login`"]:::external
    azureDevOps(["Azure DevOps"]):::external
    githubCom(["GitHub"]):::external

    callers -->|"an operation, by name"| catalog
    callers -->|"which forge? resolved per item"| resolve
    resolve -->|"ado"| adoForgeOps
    resolve -->|"github"| githubForgeOps
    resolve -->|"no forge, or its adapter not installed"| stop

    adoForgeOps -.->|"implements"| catalog
    githubForgeOps -.->|"implements"| catalog

    connect -->|"registers"| adoServer
    adoForgeOps -->|"orgName = ADO_ORGANIZATION, every call"| adoServer
    adoServer --> azureDevOps
    githubForgeOps -->|"gh subcommands"| gh
    gh --> githubCom

    style callers fill:#4F46E51A,stroke:#4F46E5,color:#4F46E5
    style port fill:#B453091A,stroke:#B45309,color:#B45309
    style ado fill:#0478571A,stroke:#047857,color:#047857
    style github fill:#0478571A,stroke:#047857,color:#047857
    linkStyle default stroke:#8B949E
```

### terylon-os and the pane

```mermaid
---
config:
  layout: elk
  flowchart:
    padding: 16
---
%% terylon-os and its mod terylon-pane: how a session reaches Terylon's Agentic OS, the owner's
%% acts the pane takes on their cards, and why merge, the one gate, stays in the console.
%% The source of truth is this block: edit it here; nothing is generated from it.
%% Why every surface goes through the one /mcp: one-source-of-truth-reached-from-two-places.md.
flowchart TD
    %% One colour per kind, the palette of .claude/rules/markdown.md: Terylon's own plugins (purple),
    %% Agentic OS (blue), the gate (red), the phone (grey); the owner takes the theme's.
    %% No theme is set, so GitHub draws the block in its light or dark theme.
    classDef terylon fill:#7E22CE,stroke:#6B21A8,color:#FFFFFF
    classDef service fill:#2563EB,stroke:#1E40AF,color:#FFFFFF
    classDef gate fill:#B91C1C,stroke:#991B1B,color:#FFFFFF
    classDef external fill:#4B5563,stroke:#374151,color:#FFFFFF

    subgraph session ["Claude Desktop or Claude Code: a local session on the PC"]
        subgraph os ["terylon-os plugin: no dependencies"]
            %% The variable is drawn as written: Mermaid substitutes nothing inside a label.
            server["server terylon at ${TERYLON_URL}/mcp"]:::terylon
            skills["`one skill per prompt it serves
briefing, hand-over, merge-gate,
add-goal, review-plan, show-story`"]:::terylon
        end

        subgraph pane ["terylon-pane mod: shows, asks, answers, posts, takes the owner's acts; never merges"]
            allowList["`PANE_TOOLS: reads, five writes that decide nothing,
the owner's thirteen acts; never story_merge`"]:::terylon
            band["`the band above the prompt
what calls for the owner`"]:::terylon
            statusLine["`the status line
the health of Agentic OS, its worst problem`"]:::terylon
            tabs["`one pane, five tabs
Queue, Goals, Bell, Memory, Status
opened only by the band or a command;
each act on its subject's card, on a press`"]:::terylon
        end
    end

    phone["`The phone, through Remote Control
terylon-os on an always-on box; no mod`"]:::external

    subgraph terylon ["Terylon's Agentic OS: the only source of truth"]
        mcp["`/mcp
the caller's tailnet identity; no header, no token`"]:::service
        leader["`leader, goals, plans, stories,
bell, memory`"]:::service
        console["`the console: the one gate
merge, confirmed by the owner's passkey`"]:::gate
    end

    %% No class: the theme colours the owner, so it stays readable in light and dark mode alike.
    person(["the owner"])

    pane -.->|"dependencies: terylon-os"| os
    server -->|"over the tailnet"| mcp
    allowList -->|"`every 30 s: briefing, work_in_flight,
stories_list, events_since`"| server
    allowList --> band
    allowList --> statusLine
    allowList --> tabs
    tabs -.->|"merge is a link, never a button"| console
    phone -->|"the same /mcp"| mcp
    mcp --> leader
    person -->|"confirms every merge"| console

    %% The session is the large area, so its fill is the fainter 14.
    style session fill:#8B949E14,stroke:#8B949E,color:#8B949E
    style os fill:#7E22CE1A,stroke:#7E22CE,color:#7E22CE
    style pane fill:#7E22CE1A,stroke:#7E22CE,color:#7E22CE
    style terylon fill:#2563EB1A,stroke:#2563EB,color:#2563EB
    linkStyle default stroke:#8B949E
```

## Articles

| Article | Records |
|---|---|
| [port-and-adapter-split](./port-and-adapter-split.md) | why `terylon-devops` broke into a port and two adapters, and why the port declares no adapter |
| [spend-measured-on-output-tokens](./spend-measured-on-output-tokens.md) | why a run's cost is measured from its own transcripts, weighted, rather than from the harness's figures |
| [superpowers-left-the-dependency-set](./superpowers-left-the-dependency-set.md) | why a dependency on a foreign marketplace was removed, and what replaced its six skills |
| [one-source-of-truth-reached-from-two-places](./one-source-of-truth-reached-from-two-places.md) | why Agentic OS on the owner's host is the only source of truth, reached through one `/mcp` from the PC's pane and from the phone through Remote Control, and why the pane holds nothing; superseded in part by the next row |
| [the-pane-takes-the-owners-acts](./the-pane-takes-the-owners-acts.md) | why the pane approves, returns, unblocks, pauses and the rest on their subject's cards since Terylon PR 228, and why merge, the one gate, stays in the console behind the passkey |
| [every-rule-has-one-owner](./every-rule-has-one-owner.md) | why a rule is stated once and pointed at everywhere else, what the first sweep found, and why nothing but review enforces it yet |

## Writing one

The shape, in order: a status line and the decision stated as a fact, `Context` (what forced it, with the arrangement that broke drawn), `The alternatives` (a table, one row per option, the chosen one marked), `Decision` (a rule in the present tense), `Consequences` (a table keyed good / cost / **constraint**), optional `Gotchas`, and `Where it lives`.

**The `Consequences` constraint rows are the ones that matter.** Name the specific act that would undo the decision, so the next person recognises it before committing it.

Three further things bind:

**Name the file for the decision, not the problem.** `superpowers-left-the-dependency-set`, not `dependency-review`.

**A reversed decision is superseded, never edited away.** An ADR is a record of what was decided when. Mark the old one superseded, link to the new one, and leave the overturned reasoning readable — the next person needs to see the argument that lost, or they will make it again.

**State the alternative you rejected and why.** An ADR whose Context section admits no other option was available is not recording a decision.

## What does not get an ADR

A decision already stated in full — with its failure mode and its reasoning — in the root `CLAUDE.md`, in `plugins/CLAUDE.md` or in a rule. A second copy diverges from the first, and the reader cannot tell which one is current.

The worked example: **`ADO_ORGANIZATION` having no default gets no ADR.** The root `CLAUDE.md` states that decision in full — the silent failure it prevents, and why a missing required value must fail where it is missing. Every other mention states the requirement in whatever form its own reader needs, and re-argues none of it. An ADR would be one more copy of one argument.
