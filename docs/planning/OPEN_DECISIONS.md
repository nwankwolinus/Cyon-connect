# Open Business Decisions (FRS v1.0 §20.2)

No policy has been selected. Options are for discussion only. Decision owners are proposed, not confirmed.

| #   | Decision                            | Domain         | Affected requirements                                       | Status |
| --- | ----------------------------------- | -------------- | ----------------------------------------------------------- | ------ |
| 1   | Partial dues payment                | Dues / Finance | FR-DUE-005, 006, 007, 008, 011; FR-PAY-005; FR-FIN-005, 013 | OPEN   |
| 2   | Dues overpayment                    | Dues / Finance | FR-DUE-006, 007, 008; FR-PAY-005; FR-FIN-005, 013           | OPEN   |
| 3   | Duplicate-member resolution / merge | Membership     | FR-MEM-002, 011; FR-MEMA-005, 006; FR-SEC-003; BR-CC-001    | OPEN   |
| 4   | Detailed messaging-group governance | Messaging      | FR-MSG-002, 003, 004, 009, 010; FR-SEC-017                  | OPEN   |

## 1. Partial dues payment

- **Why it matters:** determines allocation logic and the dues ledger model (FR-DUE-008) and what a reversal restores (FR-DUE-011).
- **Possible options:** reject partials; accept and hold a part-paid month; accept and apply oldest-first.
- **Needed by:** before Sprint 5 design. **Proposed owner:** Financial Secretary, with Parish Priest/Youth Chaplain and President.

## 2. Dues overpayment

- **Why it matters:** an overpayment can become advance months, a credit balance or a refund; each has different ledger and audit consequences.
- **Possible options:** auto-apply to future months; hold as credit; reject excess.
- **Needed by:** before Sprint 5 design. **Proposed owner:** Financial Secretary, with Chaplain/Treasurer.

## 3. Duplicate-member resolution

- **Why it matters:** FR-MEM-011 requires detection and routing, but the review and merge procedure is unspecified. Merge touches attendance, dues and history (FR-MEM-010, FR-MEMA-005) and the one-person/one-account rule.
- **Possible options:** manual review with reject-only; merge by authorised executive with audit; link-and-retire.
- **Needed by:** before Sprint 2 duplicate workflow. **Proposed owner:** Secretary, with President.

## 4. Detailed messaging-group governance

- **Why it matters:** who may create groups, administer them and add members affects privacy (FR-MSG-010, FR-SEC-017) and moderation.
- **Possible options:** executive-created official groups only; member-created with limits; staged (FRS §24.2 lists "enhanced messaging governance" as Phase 2).
- **Needed by:** before Sprint 9. **Proposed owner:** President and Secretary, with Parish Priest/Youth Chaplain.

---

# Technical decisions (Sprint 1A)

| ID   | Decision / issue                                                                                                                                                                                                      | Status                     | Owner                        |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------- |
| TD-1 | Supabase environments (dev/test/production projects), GitHub remote, Vercel project, and how migrations reach remote databases (CI vs manual `supabase db push`)                                                      | OPEN: needs human setup    | Project owner                |
| TD-2 | Approve ADR-007 organisation scope model. **Sprint 1B.1 implemented only the common subset** (typed org units, home parish); executive scope, descendants, transfers and cross-unit access remain blocked             | OPEN                       | Project owner / stakeholders |
| TD-3 | Content-Security-Policy strategy (nonce via middleware)                                                                                                                                                               | OPEN, deferred             | Engineering                  |
| TD-4 | `npm audit`: PostCSS advisories (high) via `next@15.5.27` nested dependency; npm's suggested fix is a breaking upgrade to Next 16. Not exploitable through unprocessed untrusted CSS in this app, but must be tracked | OPEN                       | Engineering                  |
| TD-5 | Verify `supabase/config.toml`, migrations and real RLS with the Supabase CLI stack (Docker); consider a CI job                                                                                                        | OPEN: NOT RUN in Sprint 1A | Engineering                  |
| TD-6 | Rate limiting for security-sensitive routes (FR-SEC-022/023)                                                                                                                                                          | OPEN: Sprint 1B            | Engineering                  |
| TD-7 | Realtime design details (ADR-006)                                                                                                                                                                                     | OPEN: Sprint 9             | Engineering                  |
| TD-8 | Observability/error-reporting tooling (none installed)                                                                                                                                                                | OPEN                       | Engineering                  |

---

# Identity database decisions (Sprint 1B.1)

| ID   | Decision / issue                                                                                                                                           | Status                                                                    | Owner                      |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------- |
| ID-1 | Membership identifier (FR-MEM-003): format, uniqueness scope (global or per parish), when it is assigned                                                   | OPEN; not implemented, the UUID `members.id` is the only identifier today | Secretary / President      |
| ID-2 | Design of the member profile/PII table and field-level access (FR-MEM-006, FR-MEM-012, FR-PRI-003)                                                         | OPEN: Membership sprint                                                   | Engineering with Secretary |
| ID-3 | Controlled procedure to erase or re-link an auth identity while keeping history (database currently forbids both)                                          | OPEN                                                                      | Engineering / stakeholders |
| ID-4 | Should membership status (suspended, archived) also block data access, or only account status? (only account status gates RLS today)                       | OPEN                                                                      | Secretary / President      |
| ID-5 | Member transfer between parishes and how history is kept (ADR-007)                                                                                         | OPEN                                                                      | Stakeholders               |
| ID-6 | Confirm account status vocabulary (derived from FR-SEC-004 verbs: pending_activation, active, suspended, deactivated) and what "recovery" means as a state | OPEN: needs confirmation                                                  | Project owner              |
| ID-7 | Confirm members always belong to a parish (interim CHECK) and the real names/identity of the deanery and archdiocese above the parish                      | OPEN                                                                      | Stakeholders               |
| ID-8 | Confirm the seeded parish reference row name ("SS Joachim and Anne Catholic Church, Ijegun")                                                               | OPEN                                                                      | Project owner              |
