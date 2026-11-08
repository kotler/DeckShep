# 0002 — Guard every delivery with a single-use permit

Status: implemented.

A rendered press captures its profile, appearance, visibility, generation,
backend key, page, target and stamp. Preflight checks this capture before native
verification. Every CLI/RPC mutation then passes through `DeliveryKernel` and
`TerminalBackend.deliver`. Native daemon settings writes and Rex activation use
the same route. Unknown methods fail closed; only enumerated reads bypass it.

The authority keeps permits in a private WeakMap. A permit binds the exact target
and generation, rechecks visibility and backend identity, and is consumed before
I/O. A timeout never makes it reusable. Postflight catches a disappeared profile
even when native work completed. Selection/navigation may intentionally change
page or target, so postflight checks visibility rather than undoing those changes.

Native focus, process owner/start/executable, chat/turn/request, digest, cursor,
scroll and opt-in guards still execute in the compatibility engines. A permit
supplements those checks; it cannot replace them. Fixture injection is explicit
in tests. The production bundle has no environment/message fixture switch.
