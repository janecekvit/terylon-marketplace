# Cutting a release, and verifying one

How the maintainer releases the marketplace, what the release workflow does with the tag, and how anyone checks that a downloaded release is the one this repository built. Read it before pushing a release tag, or when you hold a `terylon-marketplace-vX.Y.Z.tar.gz` and want to know where it came from.

**A release is one tag on `main`, `vMAJOR.MINOR.PATCH`, and nothing else.** There are no per-plugin tags: each plugin keeps its own version in `plugins/<slug>/.claude-plugin/plugin.json`, and the release notes list every one of them at the tag. A release does not change what a consumer installs — consumers follow `main` and compare `plugin.json#version` (see [`flows/change-to-consumer-repo.md`](../flows/change-to-consumer-repo.md)). It is a signed, citable snapshot of the whole marketplace.

## The shape

```
  maintainer                     GitHub Actions: .github/workflows/release.yml, on push of v*.*.*
  ──────────                     ─────────────────────────────────────────────────────────────────
  git tag -a vX.Y.Z  ──push──▶   1 refuse anything but exactly vMAJOR.MINOR.PATCH
  (a commit on main)             2 checkout the tag, full history, NO persisted credential
                                 3 previous tag = highest vX.Y.Z below this one (or none)
                                 4 git archive ──▶ terylon-marketplace-vX.Y.Z.tar.gz + SHA256SUMS
                                 5 node tests/release/release-notes.js ──▶ the notes
                                 6 attest-build-provenance(archive) ──▶ *.intoto.jsonl
                                     OIDC token, id-token: write — NO STORED KEY ANYWHERE
                                 7 sigstore sign(archive, SHA256SUMS) ──▶ *.sigstore.json, verified in place
                                 8 gh release create --verify-tag, every file attached
```

| Asset | What it is |
|---|---|
| `terylon-marketplace-vX.Y.Z.tar.gz` | `git archive` of the tag, every path under `terylon-marketplace-vX.Y.Z/` |
| `SHA256SUMS` | the archive's SHA-256, in `sha256sum` format |
| `terylon-marketplace-vX.Y.Z.intoto.jsonl` | the archive's SLSA build provenance attestation, a Sigstore bundle; also stored on the repository, which is where `gh attestation verify` reads it from |
| `terylon-marketplace-vX.Y.Z.tar.gz.sigstore.json` | the archive's Sigstore signature bundle |
| `SHA256SUMS.sigstore.json` | `SHA256SUMS`'s Sigstore signature bundle |

**The signing identity is the workflow at the tag**: `https://github.com/janecekvit/terylon-marketplace/.github/workflows/release.yml@refs/tags/vX.Y.Z`, issued by `https://token.actions.githubusercontent.com`. Nothing else can produce a signature that verifies against it, and no key exists to leak.

## Cutting a release

1. **Choose the version.** The tag's version is the marketplace's, independent of any plugin's.

   | Since the previous tag | Raise | Example |
   |---|---|---|
   | only fixes and wording | **patch** | `v1.2.3` → `v1.2.4` |
   | anything new — a plugin, a skill, a capability | **minor**, patch back to `0` | `v1.2.4` → `v1.3.0` |
   | a breaking change | **major** | only the maintainer decides it, as with a plugin's major (`plugins/CLAUDE.md`, *Versioning*) |

   The first release is `v1.0.0`.

2. **Rehearse it** (optional, publishes nothing). Run the workflow by hand from `main` with the version: `gh workflow run release.yml -R janecekvit/terylon-marketplace --ref main -f tag=vX.Y.Z`. The *Rehearse* job prints the notes and the archive's listing, and attests, signs and publishes nothing. A tag that does not exist yet is rehearsed against the dispatched commit.

3. **Tag the commit on `main` and push the tag:**

   ```bash
   git fetch origin
   git tag -a vX.Y.Z origin/main -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```

4. **Watch the run** in the repository's Actions tab, *Release*. When it is green the release is on the Releases page with five assets.

**Never move or delete a published tag.** A consumer or a verifier may already hold the archive, and its signature names the tag. A mistake is fixed by the next patch release.

## Verifying a release

Anyone can do this; no account with the repository is needed. Download the archive and the files beside it from the release, then:

| Check | Command | Proves |
|---|---|---|
| provenance, through GitHub | `gh attestation verify terylon-marketplace-vX.Y.Z.tar.gz -R janecekvit/terylon-marketplace` | this repository's GitHub Actions built exactly these bytes |
| provenance, stricter | add `--signer-workflow janecekvit/terylon-marketplace/.github/workflows/release.yml --source-ref refs/tags/vX.Y.Z` | it was the release workflow, at that tag |
| provenance, from the attached bundle | add `--bundle terylon-marketplace-vX.Y.Z.intoto.jsonl` | the same, from the file on the release instead of the repository's attestation store |
| Sigstore signature | see below | the archive was signed by the release workflow at that tag |
| checksum | `sha256sum --check SHA256SUMS` | the archive matches the signed checksum file |

The Sigstore check, with `sigstore` from PyPI (`python -m pip install sigstore`; the syntax is sigstore 4.5.1's):

```bash
python -m sigstore verify github \
    --cert-identity https://github.com/janecekvit/terylon-marketplace/.github/workflows/release.yml@refs/tags/vX.Y.Z \
    --bundle terylon-marketplace-vX.Y.Z.tar.gz.sigstore.json \
    terylon-marketplace-vX.Y.Z.tar.gz

python -m sigstore verify github \
    --cert-identity https://github.com/janecekvit/terylon-marketplace/.github/workflows/release.yml@refs/tags/vX.Y.Z \
    --bundle SHA256SUMS.sigstore.json \
    SHA256SUMS
```

`--repository janecekvit/terylon-marketplace --ref refs/tags/vX.Y.Z --trigger push` narrow it further. A verification that fails is a release you must not trust: report it as [`SECURITY.md`](../../SECURITY.md) describes.

## When it fails

| Symptom | Cause | Fix |
|---|---|---|
| the run fails at *Refuse a tag* | the tag is not exactly `vMAJOR.MINOR.PATCH` — `v1.0`, `v1.0.0-rc.1`, `v01.0.0` | delete that tag (`git push origin --delete <tag>`, `git tag -d <tag>`) — nothing was published — and push a correct one |
| *Publish the release* fails with "release already exists" | an earlier attempt for the same tag got as far as creating it | delete that release on GitHub, keeping the tag, and re-run the failed job |
| *Publish the release* fails with "expected 2 Sigstore bundles" | the signing step wrote its bundles somewhere else, after an action upgrade | read the signing step's log for the paths it wrote, and correct the glob |
| any other failed step | read its log; nothing is published before the last step | fix on `main` through a pull request, then release the next patch — the failed tag stays unreleased |

## Where it lives

| File | Role |
|---|---|
| `.github/workflows/release.yml` | `release` — the tag check, archive, notes, attestation, signatures and release; `rehearsal` — the dispatch that publishes nothing |
| `tests/release/release-notes.js` | `buildReleaseNotes` — the plugin table at the tag and the pull requests since the previous tag; `selectPreviousTag` — the highest release tag below the current one |
| `tests/release/release-notes.test.js` | the notes against fixtures, and against a throwaway repository with real tags |
| `plugins/<slug>/.claude-plugin/plugin.json` | `version` — what the notes' table reads at each tag |
| `plugins/CLAUDE.md` | *Versioning* — the per-plugin digit rule the release version mirrors |
| `docs/flows/change-to-consumer-repo.md` | how a merged change reaches a consumer, and the release row that points here |
| `SECURITY.md` | where a release that fails verification is reported |
