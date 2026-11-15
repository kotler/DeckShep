# Navigation-only release review

Reviewed November 15, 2026 with the mattpocock code-review skill. Fixed point
`f38be98a3e5b9ab69243fe83d975911339ee1b91` is freshly fetched `origin/main`.
Initial review covered that merge-base through `6bae60d`; closure reviewed the
subsequent working-tree fixes. Both reviewers used fresh contexts and read-only
inspection. Neither ran native tests or operated installed applications.

## Standards

Two P2 findings were identified and closed.

- App-home privacy was checked only for the public-mode socket exception.
  App policy now checks the private directory/no-ACL contract and single-link
  socket independently of its mode. ACL and hard-link regressions cover 0600,
  0700 and 0755 sockets. The new ACL cases failed before the fix and pass after.
- Five older agent-controls review records contained absolute home/workspace
  paths. They now use repository-relative paths. A path scan found no remaining
  references in those records.

The Standards reviewer inspected the closure diff and reported no remaining
standard violations or substantive baseline-smell findings.

## Spec

One P2 finding was identified and closed. It was the same App-home ACL bypass,
which contradicted ADR 0008’s private/no-ACL requirement.

The Spec reviewer verified the closure and reported no remaining missing,
incorrect or unrequested runtime behavior. Publisher/peer/helper verification,
inert provider overrides, profiles and preference migration match the
navigation-only scope. Deferred prototypes remain test-only.

The prior native background-editor failure, hardware/profile-switching checks,
clean-Mac installation, Intel execution and exact-version launch approval remain
explicit publication checks. No reviewer represented them as passes.

Standards: 0 open findings (2 closed); Spec: 0 open findings (1 closed).
