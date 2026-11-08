# Public-release readiness

DeckShep is being prepared for a free, Apache-2.0 release. No public repository,
release or Marketplace submission is created by this preparation. Source is
maintained in `kotler/DeckShep`; visibility changes require owner authorization.
The DeckShep name and key-and-crook logo are reserved under [TRADEMARKS.md](../TRADEMARKS.md).

## Mechanical gate

`npm run release:check` validates `release/readiness.json`. It intentionally fails
until the owner records evidence for the exact version. Never mark a review
complete based on fixture results, a draft or an unanswered request.

- Product and version must match root `package.json` exactly.
- Apache-2.0 metadata and the SHA-256 of `LICENSE` must match; `NOTICE` and
  `TRADEMARKS.md` must be present.
- The pinned LobeHub revision, provenance hash and the two SVG/license hashes
  must match the vendored files. Both records must state trademark permission
  as **pending**. MIT covers the SVG code; it does not grant provider trademarks.
- Launch validation must name this version and have an owner-verified review,
  calendar date and a nonempty, repository-local evidence file.
- The public GitHub Issues URL and active support email each need owner
  verification, review date and local evidence. Placeholder values fail.
  Do not publish an address until the owner has confirmed it works.

Evidence paths must resolve to regular files inside the repository without
symlinks. Record only privacy-safe summaries, not credentials, private mail or
terminal transcripts. The gate checks records mechanically; it does not establish
legal clearance, actual mailbox operation or completion of physical testing.
Marketplace eligibility is reviewed separately. Provider trademark permission is still pending when it passes.

## Open validation and distribution work

[The beta checklist](BETA-CHECKLIST.md) remains the source for physical and
independent checks: Claude controls/questions/approvals on hardware, mixed-profile
navigation, Herdr overflow/reconnect/multiple clients and outer-terminal Zoom,
hook lifecycle and custom bindings, a clean Mac install and upgrade, Intel
execution, optional signing/notarization and cleanup fingerprints. Do not claim
these passed from fixtures or a universal build.

Public Issues and email remain unverified. The owner must choose the new public
repository, enable private vulnerability reporting, review the snapshot audit
and downloaded artifact, and authorize publication separately. GitHub Releases
and a **free** Marketplace listing are the intended channels. Marketplace AI-use
disclosure, eligibility, public support/privacy URLs and final media still need
owner review; see [MARKETPLACE.md](MARKETPLACE.md).

Local beta packaging remains available without changing any pending approval.
Stable packaging requires `--release` and a clean source commit; the workflow
uses the same evidence gate and creates drafts only. See [RELEASING.md](RELEASING.md).
