# 0003 — Gate controls by verified capabilities

Status: implemented for the existing layouts; Herdr App remains disabled.

2026-11-08: Herdr App also requires a per-control verification entry and a
matching record key captured with the press. Layouts, custom overrides,
provider dispatch and delivery check it; permits bind the control and record.
Replacing a record invalidates the backend generation. Selection and Next
name the native `focus` control; local pages/banks grant no native input.
Rex/Herdr TUI still use their existing engines and golden mappings. No
production Herdr App verification record or capability was added.

Backend declarations live in `domain/capabilities.ts`. Control specifications
list requirements. Provider support and backend capabilities are intersected in
the app; the existing native engines retain their more specific refusals for
custom per-key overrides. Layouts retain the exact golden action mappings.

Herdr TUI has no verified composer cursor. Its working row omits Steer/Queue and
its Prompts page keeps the existing keyboard instructions. Rex's native cursor
and stable composer checks remain mandatory. Advertising a capability requires
native evidence, not merely a CLI method of a similar name.

`npm run compatibility` generates the backend/provider matrix from declarations;
CI checks that the generated file is current. Herdr App's production capability
set is empty. Its fixture can exercise discovery without granting input.
