# 0005 — Official Stream Deck SDK and standalone bundles

Status: implemented and exercised by an isolated fake host.

The plugin uses `@elgato/streamdeck` 2.1.2, retaining SDKVersion 2 / Node 20 support
rather than requiring a new installed runtime. One `SingletonAction` preserves
`com.local.rexagents.key`. Only the plugin layer imports the SDK. It translates
action events, settings, images, titles and alerts into the application's local
port. Coordinates, profileScope and v2 settings remain unchanged.

Rollup emits `bin/plugin.js`; hook/configuration entry points stay at the plugin
root so existing absolute Claude commands continue resolving. The inspector uses
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
