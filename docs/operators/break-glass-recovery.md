# Break-glass recovery procedure

Break-glass recovery is an offline operator action and is never callable through
MCP or HTTP. Use it only when normal integrity/recovery tooling cannot open the
repository and service restoration cannot wait for the ordinary change process.

1. Stop every engine process for the target repository and prevent new clients.
2. Record the incident, operator identity, accountable incident commander,
   reason, UTC time, and the last known repository revision in the external
   operations log.
3. Make a read-only, checksummed copy of the entire requirements root, including
   `.engine/`. Never work on the only copy.
4. Have a second authorized operator verify the target path and backup checksum.
5. Run the version-matched offline diagnose/recover command against a working
   copy. Do not hand-edit canonical files, history, baselines, or audit events.
6. Validate schemas, cross-file revision consistency, transaction manifests,
   audit chain, baseline checksums, and a representative exact-ID read.
7. Atomically replace the unavailable repository with the verified recovered
   copy using the deployment's approved restore process.
8. Restart one engine instance, rerun diagnosis, then restore client access.
9. Append a governed recovery event when the engine is healthy and attach its
   correlation ID and resulting revision to the external incident record.
10. Retain the original evidence under incident/legal-hold policy and conduct a
    review before closing the incident.

If any checksum, target identity, or revision remains ambiguous, stop. Restore a
known-good backup or escalate to the incident commander; never guess which
candidate is authoritative.
