# 0005 — Official Stream Deck SDK and standalone bundles

Status: implemented and exercised by an isolated fake host.

The plugin uses `@elgato/streamdeck` 3.0.4, retaining SDKVersion 2 / Node 20 support
rather than requiring a new installed runtime. One `SingletonAction` preserves
`com.kotl3r.deckshep.key`. Only the plugin layer imports the SDK. It translates
action events, settings, images, titles and alerts into the application's local
port. Coordinates, profileScope and v2 settings remain unchanged. SDK 3 uses
`useLegacySettingsBehavior` before connecting to preserve the existing Stream
Deck 6.6+ settings protocol; the fake host exercises the older host behavior.

Rollup emits `bin/plugin.js`; hook/configuration entry points stay at the plugin
root. The prelaunch folder/UUID reset requires removing older preview hooks
through their original registration before setting up the new location. The new
location stays fixed afterward; see [IDENTITY.md](../IDENTITY.md). The inspector uses
a vendored sdpi-components v4 file and a single library-managed socket. Consent
fields go through the existing scoped preference codec, never automatic flat
sdpi global-settings persistence.

SDK trace/error logging can serialize entire host frames. The build substitutes
a private no-op SDK logging sink; plugin errors use bounded fixed messages. The
fake host asserts that no SDK log directory is created. Distribution audits scan
all bundled bytes for the build machine's home/workspace paths.

SDK, Zod and TOML are build dependencies compiled into self-contained entries.
There are zero install-time runtime packages and no shipped node_modules. SDK
adoption replaces hand-written ws host I/O; Zod is justified by untrusted native
frames; TOML is retained to preserve native Codex configuration semantics.

The SDK's older `@elgato/utils` range originally resolved Zod 3.25.76, which
contains vulnerable v4-mini code (GHSA-mrhx-c7xc-m3w5). A scoped npm override pins
that transitive copy to patched Zod 4.6.7; the SDK still imports the compatible
v4-mini entry. CI audits the full dependency tree at high severity as well as
omit-dev, because build dependencies can enter a bundle. The fake host and
bundled upgrade tests verify compatibility after this override.

The SDK exposes no public disconnect callback. A build-scoped WebSocket lifecycle
adapter observes only the SDK host connection's close/error, invalidates all
visible keys and exits with the baseline status. It does not implement protocol
frames. This preserves late-delivery refusal when the host disconnects; the
fake-host test closes the connection and verifies clean process exit. Codex
daemon sockets are unaffected by this substitution.
