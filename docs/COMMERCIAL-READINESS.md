# DeckShep commercial preparation

Seller and copyright owner: **Everett Kotler**. Product: **DeckShep**. Profiles:
**Rex** and **Herdr**. License policy: proprietary commercial licensing; source
access grants no distribution license. See [LICENSE](../LICENSE).

This checkpoint is for private review. It is not ready for public distribution
or sale. The owner requested retaining official provider artwork while seeking
permission, so the artwork has not been replaced or represented as cleared.

## Prepared

- DeckShep display names, original key-and-crook brand artwork, branded inspector,
  versioned package naming, and seller attribution.
- Existing plugin/action/profile/key UUIDs, settings, hook paths, backup paths,
  consent defaults, and routing behavior preserved for upgrades.
- [Preliminary name screen](NAME-SCREEN.md), provider permission drafts, draft
  customer license, privacy explanation, and a public-release check.

## Release prerequisites

`npm run commercial:check` intentionally fails until the checked-in
`commercial/release.json` contains reviewed evidence for the exact product
version, name clearance, provider assets and their hashes, finalized customer
terms, verified support contact, and completed launch validation. It checks the
record mechanically; it cannot decide whether legal permission is sufficient.
Do not record approval based on an unanswered request or this preliminary search.

1. Have the final DeckShep name and logo reviewed for the planned territories.
2. Obtain documented permission or another reviewed basis for each official
   provider asset and exact use. The current monochrome derivatives need specific
   attention; approved vendor-supplied replacements may be required.
3. Finalize [customer license terms](CUSTOMER-LICENSE-DRAFT.md), marketplace terms,
   price, refunds, and a support commitment. The draft is not an operative EULA.
4. Set up and test domain email. `support@kotl3r.com` and `legal@kotl3r.com` are
   proposed aliases only; neither is advertised as active. Add a verified public
   email or support URL to the release record.
5. Complete the [physical and independent beta gates](BETA-CHECKLIST.md), including
   a clean Mac installation and any platform claims. Verify the downloaded build's
   signing/notarization and decide the supported hardware/CPU scope.

The draft-release GitHub workflow also checks these prerequisites before creating
a remote release. Ordinary local beta packaging remains available for private
review and includes this status document. No live agent testing, installation,
domain changes, email sending, marketplace submission, or public release is part
of this branding checkpoint.
