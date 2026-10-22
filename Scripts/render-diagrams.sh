#!/usr/bin/env bash
# Formats, validates and renders every docs/**/*.d2 to the .svg beside it.
#
#   Scripts/render-diagrams.sh            format each source in place and render it
#   Scripts/render-diagrams.sh --check    fail on an unformatted or invalid source, or on a stale or
#                                         missing SVG - what the Diagrams workflow runs
#
# Install D2 the way CI does, so every SVG comes from the same build:
#   go install github.com/d2lang/d2@v0.9.0
set -euo pipefail

# The D2 release the committed SVGs are rendered with. CI installs exactly this one; a different
# release lays out and serialises differently, and every SVG would read as stale.
readonly D2_VERSION="v0.9.0"

# Where the sources live, as a git pathspec: every .d2 under docs/, at any depth.
readonly SOURCE_PATHSPEC="docs/*.d2"

# What --check holds against the committed tree: the sources (d2 fmt rewrites them) and the SVGs.
readonly RENDERED_PATHSPECS=("docs/*.d2" "docs/*.svg")

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"

check_mode=false

if [[ "${1:-}" == "--check" ]]
then
    check_mode=true
elif [[ -n "${1:-}" ]]
then
    echo "usage: Scripts/render-diagrams.sh [--check]" >&2
    exit 2
fi

if ! command -v d2 >/dev/null 2>&1
then
    echo "d2 is not on PATH. Install it with: go install github.com/d2lang/d2@${D2_VERSION}" >&2
    exit 1
fi

# Tracked sources and new ones alike; a gitignored scratch tree under docs/ is never rendered.
mapfile -t source_files < <(git ls-files --cached --others --exclude-standard -- "$SOURCE_PATHSPEC" | sort)

if [[ ${#source_files[@]} -eq 0 ]]
then
    echo "no D2 sources under docs/"
    exit 0
fi

for source_file in "${source_files[@]}"
do
    if $check_mode
    then
        d2 fmt --check "$source_file"
    else
        d2 fmt "$source_file"
    fi

    d2 validate "$source_file"
    d2 "$source_file" "${source_file%.d2}.svg"
done

if $check_mode
then
    stale_files="$(git diff --name-only -- "${RENDERED_PATHSPECS[@]}"; git ls-files --others --exclude-standard -- "${RENDERED_PATHSPECS[@]}")"

    if [[ -n "$stale_files" ]]
    then
        echo "$stale_files" >&2
        echo "Diagram sources or rendered SVGs differ from what is committed." >&2
        echo "Run Scripts/render-diagrams.sh with D2 ${D2_VERSION} and commit the result." >&2
        exit 1
    fi

    echo "${#source_files[@]} diagram(s) formatted, valid and rendered as committed."
fi
