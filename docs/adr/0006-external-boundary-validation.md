# 0006 — Bound and validate every external JSON boundary

Status: implemented.

Zod schemas validate Rex responses, visible-pane output, protocol-22 Herdr frames,
Codex daemon envelopes/catalogs, Claude hook/status payloads and private records,
config, inspector/host events and versioned global settings. `schemas.parse` is
the sole JSON.parse in application source. It caps bytes, depth and node count,
rejects pollution/control-character keys, and never reflects received values in
errors. Identity fields reject terminal controls; text view fields retain ANSI
and newlines because the existing viewport/digest parsers require them.

Envelope schemas deliberately preserve unknown native fields. Existing semantic
validators still require exact protocol/version, expected IDs, root-thread and
foreground ownership, stable view/cursor and complete responses before input.
Schema success alone grants no capability or delivery authority. Tests retain the
original malformed-reply scenarios and add invalid/oversized/control cases.
