# Free Marketplace listing draft

Source listing: `release/marketplace.json`. The intended listing is **free**.
GitHub Releases are the other planned distribution channel. Nothing has been submitted or published.
The draft states the experimental features, separate provider accounts and
initial Apple silicon target. Do not advertise Intel execution, other layouts,
Herdr staged submission or finalized Claude hardware support without evidence.

## Preview media

Run `npm run marketplace:media` and `npm run marketplace:check`. The ignored
`dist/marketplace/` directory contains a 288 × 288 PNG app icon, a 1920 × 960
thumbnail and three 1920 × 960 gallery images, editable SVG sources and hashes.
The actual key renderer uses synthetic data; no real sessions, terminal content,
identities, workspaces or device serial numbers are captured. The board is a
layout diagram, not a hardware photograph. Images retain a private-review label
until the owner reviews public variants and their final hashes.

LobeHub SVG code is MIT-licensed; the provider marks belong to OpenAI and
Anthropic and trademark permission remains pending. Do not present the source
license or another Maker's use as permission or endorsement. Keep attribution.

## AI-use disclosure and eligibility

AI assistance was used in development, original brand artwork and listing/media
preparation. The owner supplied requirements and naming decisions. The draft
includes this disclosure; do not claim all material was manually created or that
final human review has happened. The owner must review current Elgato AI-use
rules, the requirement to disclose AI assistance, and eligibility of the actual
contributions before submission. A free listing does not remove that review.

Review the current [product guidelines](https://docs.elgato.com/guidelines/products/)
and [submission process](https://docs.elgato.com/maker-console/submitting-products/)
at submission time. Maker onboarding, agreements, category/eligibility decisions
and submission are owner actions. No script creates accounts, accepts agreements
or submits products. Marketplace eligibility is separate from `release:check`.

## Before submission

- Review the reserved DeckShep branding and exact provider artwork/rendering.
- Confirm the AI disclosure and eligibility under the current policy.
- Choose and test public support/privacy URLs and an active support email;
  placeholder URLs or private repository pages cannot serve public users.
- Complete physical and independent validation for the advertised scope.
- If the optional Herdr App mod proceeds, review installing executable code
  into another app under current Elgato Marketplace rules and Herdr's mod
  policies/licensing. Review consent, per-window layout setup, code provenance,
  updates and removal before plugin uninstall. This is a pending distribution
  gate, not policy clearance; no mod is currently implemented or installed.
- Review final public media and current Maker Console field requirements.
- Run `npm run release:check` and reviewed `--release` packaging from a clean commit.

The listing stays a draft with null public support/privacy URLs until reviewed.
