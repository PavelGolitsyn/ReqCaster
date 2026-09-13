# Direct-edit integrity failure and reconciliation

The two canonical requirement JSON files are engine-owned. If either checksum
differs from `.engine/versions/current.json`, normal reads and writes stop with
`INTEGRITY_FAILURE`, and the observed files are copied to quarantine. The engine
does not update the committed checksum to make an unexplained edit appear
legitimate.

Reconciliation is a controlled manager and operator procedure:

1. Stop writers and preserve a checksummed copy of the entire requirements root.
2. Record the incident, accountable principal, detected revision, quarantine
   location, and reason for reconciliation.
3. Compare the quarantined data with the last committed transaction images.
4. Restore the last committed pair to regain a healthy repository. If the
   out-of-band content is wanted, treat it as untrusted import input rather than
   replacing a canonical file.
5. A requirements manager previews the normalized create/update/retire command
   set against the restored revision. Review every validation finding, ID
   mapping, rejection, relationship impact, and exact diff.
6. Commit the accepted command set through the governed bulk/import path with a
   new correlation and idempotency key. This creates ordinary versions,
   provenance, audit attribution, and a committed transaction checksum.
7. Validate the repository, rebuild derived state, and retain the incident copy
   according to records policy.

If the last committed pair cannot be proven, use the break-glass recovery
procedure. Never edit `current.json`, a transaction manifest, or an audit record
to force a checksum match.
