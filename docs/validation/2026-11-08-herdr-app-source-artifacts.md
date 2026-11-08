# Herdr App calibration artifacts: source build and static checks

Date: 2026-11-08. Prepared against DeckShep `b1224e5` for the
[calibration harness](../../tests/live/APP-CALIBRATION.md). Owner scope was artifact
preparation. **No Herdr App/core binary was executed, including version probes.**
No native calibration or production capability is approved by this record.

## Sources and build

| Component | Exact source | Static version |
| --- | --- | --- |
| App | `2405bf388c568c3ed479f05b8e405ccfa44b3f2c` | 0.1.14 |
| Core | `3965a46caae095a3ead01de237fa13955e52b8c6` | 0.1.18 |
| App Ghostty submodule | `291fd050b9e9c293c8adb6a140742649b7e42d3a` | Pinned gitlink |
| Core Ghostty submodule | `1e5cdb865807abc990181efb8ebfa9122955cce2` | Pinned gitlink |

Both clean source checkouts were fetched into a fresh private temporary build
root. Versions were read from pinned Cargo sources and the assembled App plist;
they are not runtime observations. Cargo lockfiles and source/submodule commits
are retained in the private provenance report. No upstream source was patched.

The machine lacked Rust and Zig. Rust 1.95.0 (rustc, standard library and Cargo)
and Zig 0.16.0 were downloaded from their official distribution servers, checked
against the official manifest SHA-256 values, and installed only into the private
build root. No Homebrew/global tool installation or shell-profile change occurred.
The observed build host and macOS SDK are **27.2**, architecture **arm64**.

Both builds used `cargo build --release --locked -p <package> --bin <binary>`,
four jobs, no incremental state, private HOME/Cargo/Zig caches and explicit tool
paths. The child environment was constructed rather than inherited; it included
neither `HERDR_APP_RELEASE` nor `HERDR_RELEASES_URL`, routing/auth/hooks or owner
credentials. Rust paths were remapped to a neutral build prefix. Cargo's App
dependency file independently records `HERDR_APP_RELEASE` as **unset**.

Core's Zig wrapper adds only `-Demit-xcframework=false`, avoiding unused
XCFramework generation with Command Line Tools while retaining the requested
static VT target. No tracked source changes. App's pinned build already passes
that flag and uses runtime Metal shaders. Full Xcode was not installed or needed.

App and core release builds exited successfully (approximately 3m14s and 1m35s).
The App build reported three upstream QuickJS warnings; no suppressions or source
fixes were added. The DeckShep peer helper was freshly built with
`npm run build -- --universal`, which installs/restarts nothing. Its source hashes,
DeckShep commit and arm64/x86_64 architectures are retained in provenance.

## Prepared manifest

The private artifact directory contains the manually assembled `Herdr.app`,
`herdr-core`, `herdr-app-peer` and candidate `manifest.json`. The App bundle uses
the source packaging metadata, icon, license and third-party notices. App/core
have ad-hoc signatures; no Developer ID credentials, notarization, registration,
installer, updater or LaunchServices command was used. The manifest key is
`calibration-only`, not a production allowlist entry.

| Evidence | Value |
| --- | --- |
| Manifest SHA-256 | `d8ef3f9d48d9c560da494489a13d225d46017c451325ef032fa1728dfb0cb8e2` |
| App bundle tree SHA-256 | `a862459a6cd2a090775294fc2baff4c3528d59368959866bbb155a4893d14cd0` |
| App executable SHA-256 | `688c1e71e608460444b878f3f522142a33cdcb781871d73241b5481e65c59291` |
| App plist SHA-256 | `903c6a4376d630305c8abb034d1bd0faba21bbca1a94734a36db071fccbbde12` |
| App static CDHash, arm64 | `0517bb788442f175a5acadde93d79bbf5df04a66` |
| Core executable SHA-256 | `7628db954a649595f77fa04cb1a1a4b84367c5c105d9671ab749db93d91732ca` |
| Core static CDHash, arm64 | `c23a0ae60491364fd65dccc78618e6986baaf78b` |
| Peer helper SHA-256 | `0ef0c7692e2fa85237ba89983249fcdf086dc4553ad7bc63fa1f950f549ccb44` |

`provenance.json` beside the private artifact directory records the tool URLs and
checksums, build arguments/times, lockfile hashes, build/assembly-script hashes,
source state, helper evidence and static checks. It explicitly retains
`nativeExecution:false`, `approvedForLiveRun:false` and `productionApproved:false`.
Artifacts, toolchains, dependency caches and raw build logs are outside the
repository and are not distribution contents. Their private location is supplied
separately; no owner home/workspace path is recorded here.

## Static verification and remaining gates

- `codesign --verify --strict` passed for App, core and helper. App/core are arm64;
  the helper is universal. The App executable is about 57 MB; core about 5.9 MB.
- The harness's actual `stageArtifacts` accepted the populated manifest and
  produced a second private copy. Build/file stability checks passed, and static
  App/core signature verification also passed on that copied representation.
  The validation copy was removed without executing it.
- Scanning App bundle files, core and helper found no current owner-home or
  DeckShep-workspace path. No prompts, tokens or terminal transcripts were used.
- Both source checkouts remain clean. Production `APP_FOCUS_RECORDS` and Herdr App
  capabilities were directly checked and remain empty. No production code,
  defaults, UUIDs, settings or guard was changed for artifact preparation.

These are build and static-signature facts, not connected-peer observations,
native endpoint isolation, App/core terminal binding, request latency or completed
focus evidence. The no-updater build provenance and candidate manifest still need
review before a separately authorized isolated native run. Source-only results
cannot approve a differently signed/packaged release. Live tests remain disabled;
the prepared App/core, installed apps, existing agents and developer services
were never launched, stopped, restarted, inspected or contacted. Nothing was
installed or pushed.
