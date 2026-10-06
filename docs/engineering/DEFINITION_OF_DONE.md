# Definition of Done

A sprint increment is done only when every applicable item is true and evidenced (command output, test names, review notes).

1. Requirements identified by FRS ID; ambiguities recorded in OPEN_DECISIONS.md, not decided in code.
2. Acceptance criteria written and satisfied.
3. Implementation complete and within the sprint's narrow scope (BR-CC-017).
4. Inputs validated server-side (FR-SEC-024).
5. Automated tests added for business rules; they pass.
6. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` all pass (actually run).
7. Migrations reviewed for safety: reversible or documented, no destructive deletes of organisational, financial, attendance, executive or audit data; applied to a non-production database first.
8. Security checks performed (below).
9. Documentation and the traceability matrix updated; status `COMPLETE` only when 1–8 hold.
10. No known critical blocker; changes reviewed; git diff inspected; no secrets in the diff.

## Additional for security-sensitive work

- Authorisation enforced in the backend and by database policy, independent of UI (FR-SEC-008, FR-CC-008).
- Negative tests: unauthorised roles, expired/ended executive assignments, object-level access (FR-SEC-009), default-deny for unspecified permissions.
- Financial: only Financial Secretary can correct or reverse; Treasurer/Chaplain and President are tested as denied.
- Privileged actions write an audit record with actor, action, time, record and change (FR-AUD-002).
- Errors do not leak secrets or internals (FR-SEC-026).
