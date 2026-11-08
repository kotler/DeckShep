LobeHub agent icons
===================

`codex-mark.svg` and `claude-mark.svg` are unmodified static SVGs from
[LobeHub / Lobe Icons](https://github.com/lobehub/lobe-icons), pinned to revision
`ea434b96e75813517b377825e01c0df61dee8836`. Exact upstream paths and SHA-256 hashes
are recorded in `lobehub-PROVENANCE.json`; the upstream MIT notice is retained in
`lobehub-LICENSE.txt`.

The renderer preserves each SVG's viewBox and fill rules, gives the nested SVG a
24 × 24 canvas, and uses inherited white color for the key artwork. Signal marks
are centered at 104 × 104 pixels, at 26% opacity for Codex and 28% for Claude.
Text, selection indicators and controls retain their existing positions.
The copied Codex app PNGs have been removed. No CDN or LobeHub runtime package is
required by the installed plugin.

The library's MIT code license does not establish rights to provider trademarks.
OpenAI and Anthropic permissions for the exact rendered use remain pending.

Lucide control icons
====================

`lucide/` contains unmodified SVGs from `lucide-static@0.468.0`, downloaded from the npm CDN at https://unpkg.com/lucide-static@0.468.0/icons/. Used as one consistent family in the Signal renderer. See `lucide/LICENSE` for the ISC and Feather MIT notices.

DeckShep original brand artwork
==============================

`plugin-icon-source.svg`, the plugin PNGs, `action-icon.svg` and `loading.svg` use an original key-and-shepherd-crook design and ink/mint/amber palette. Copyright (c) 2026 Everett Kotler. Recreate PNGs with `swift -module-cache-path /tmp/deckshep-swift-cache scripts/brand-icons.swift com.kotl3r.deckshep.sdPlugin` from the repository root. No third-party logo is incorporated into this brand mark. Provider marks remain separate and pending permission.
