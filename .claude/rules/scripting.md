# Scripting conventions

Applies to every script in this repo — hooks in `.claude/hooks/`, any future tooling, and ad-hoc commands run in a session. The formatting rules below are language-agnostic: they read the same in JavaScript, PowerShell, or bash, and that is the point.

## Choosing a language

| Purpose | Language | Why |
|---|---|---|
| **Hooks** (`.claude/hooks/`) | **Node.js** | Runs on every tool call, so startup latency compounds. Node starts in ~106 ms against pwsh's ~384 ms — measured over 100 runs each, interleaved. |
| Interactive shell work | bash or `pwsh` | Whatever is at hand. Not committed, so consistency does not matter. |
| Committed tooling | Node.js | Same reason as hooks: one language, no extra runtime. |

The latency figure is not a guess. Optimizing the PowerShell hook — dropping `Set-StrictMode`, replacing `ConvertFrom-Json` with a regex, reading `.git/HEAD` instead of shelling out to git — bought only 50 ms. The remaining ~330 ms is .NET runtime startup and cannot be removed.

**When PowerShell is what you are writing**, use `pwsh`, never `powershell`. This repo runs on Windows **and natively on Debian**; `powershell.exe` is Windows PowerShell 5.1, which does not exist on Debian and differs in behavior (default encoding, `&&`/`||` chain operators, ternary, null-coalescing).

## Cross-platform constraints

Everything committed must work on Windows and Debian alike.

- **Paths:** build them with `path.join()` (Node) or `Join-Path` (PowerShell), never a hard-coded `\`. Debian is case-sensitive — match the real casing of every file.
- **Environment:** `process.env.NAME` (Node) or `$env:NAME` (PowerShell). `CLAUDE_PROJECT_DIR` is the repo root; fall back to the working directory when it is unset.
- **No platform-only APIs:** avoid Windows registry access, `Get-CimInstance`, `*-Service`, and anything else that exists on one platform only.
- **Line endings:** scripts are committed with LF, enforced by `.gitattributes`. A shebang followed by CR does not work on Debian.
- **No dependencies.** Hooks use only the standard library. A hook that needs `npm install` is a hook that breaks on a fresh clone.

## Full names, never abbreviations

Spell everything out so the code reads clearly in review and in a diff. Abbreviations force the reader to look them up; the long form is self-documenting.

This has three parts:

1. **Variables and functions** — `projectDirectory` not `dir`, `getCurrentBranch` not `getBranch`, `toolCommand` not `cmd`. A name should say what the value *is*, not hint at it.
2. **Parameters and flags** — in PowerShell, `-Path` not `-p`, `-Recurse` not `-r`, `-ErrorAction` not `-ea`; `Get-ChildItem` not `gci`/`ls`, `Where-Object` not `?`, `ForEach-Object` not `%`.
3. **Named over positional** — pass arguments by name where the language allows it, so a reordered call cannot silently change meaning.

```javascript
// Good
const projectDirectory = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const branchOutput = execSync("git symbolic-ref --short HEAD", { cwd: projectDirectory });

// Avoid
const d = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const b = execSync("git symbolic-ref --short HEAD", { cwd: d });
```

```powershell
# Good
Get-ChildItem -Path ./plugins -Filter *.md -Recurse

# Avoid
gci ./plugins -Filter *.md -r
```

## Formatting — Allman braces

Opening braces go on their **own line**, aligned with the statement that owns them. Closing braces likewise. This is Allman style (also called BSD style); it costs a line and buys an unmistakable block boundary.

**This applies to every language in the repo**, not just PowerShell. The two examples below are the same function, and they read the same way.

```javascript
function getCurrentBranch()
{
    const projectDirectory = process.env.CLAUDE_PROJECT_DIR || process.cwd();

    try
    {
        const branchOutput = execSync("git symbolic-ref --short HEAD",
        {
            stdio: ["ignore", "pipe", "ignore"],
            cwd: projectDirectory,
        });

        return branchOutput.toString().trim();
    }
    catch
    {
        return null;
    }
}
```

```powershell
function Get-CurrentBranch
{
    $projectDirectory = if ($env:CLAUDE_PROJECT_DIR) { $env:CLAUDE_PROJECT_DIR } else { $PWD.Path }

    try
    {
        $branch = git -C $projectDirectory symbolic-ref --short HEAD 2>$null

        if ($LASTEXITCODE -ne 0)
        {
            return $null
        }

        return $branch.Trim()
    }
    catch
    {
        return $null
    }
}
```

Avoid the trailing-brace style in either language:

```javascript
// Avoid
function getCurrentBranch() {
    try {
        return execSync("git symbolic-ref --short HEAD").toString().trim();
    } catch {
        return null;
    }
}
```

> Both Prettier and PSScriptAnalyzer default to the trailing style. This repo overrides that deliberately. For PSScriptAnalyzer, configure `PSPlaceOpenBrace` with `OnSameLine = $false`. Prettier cannot be configured for Allman at all, so do not run it over these files.

### Remaining layout rules

- **Indent:** 4 spaces. Never tabs.
- **One statement per line.** Do not chain to save space.
- **Blank line** between logical blocks — after the parameter list, between setup and work, before the return.
- **Named constants at the top** for regular expressions and magic values, in `SCREAMING_SNAKE_CASE`, each with a comment saying what it matches and why.
- **Break long chains** after the operator, indenting the continuation by 4 spaces.

## Error handling

- **Fail open in a hook.** A hook that crashes on malformed input must not block the user's work — catch, return a neutral result, and exit 0. A hook is a guard, not a gate that can jam shut.
- **Never swallow an error silently** anywhere else. If a failure is genuinely expected, catch it and say so in a comment on the catch block.
- In PowerShell, prefer `-ErrorAction Stop` inside a `try` block; without it a non-terminating error skips the `catch` and the script continues on a broken assumption.

```javascript
function readStandardInput()
{
    try
    {
        return fileSystem.readFileSync(0, "utf8");
    }
    catch
    {
        // Unreadable stdin must not block the user's work.
        return "";
    }
}
```

## Hooks specifically

- **Protocol:** stdin carries JSON `{ tool_name, tool_input, ... }`. Allow = exit 0 with no stdout. Deny = exit 0 with a JSON payload whose `hookSpecificOutput.permissionDecision` is `"deny"`.
- **Parse JSON with a real parser**, not a regex. A command containing escaped quotes will defeat a regex and silently skip the guard.
- **Keep the timeout at 5 s** in `settings.json`. A hook that needs longer is doing too much.
- **Test both directions.** A hook is only correct if it blocks what it must *and* passes everything else. Verify the pass-through cases explicitly — a guard that blocks legitimate work is worse than no guard, because it gets disabled.
