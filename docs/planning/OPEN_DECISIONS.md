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
| TD-2 | Approve ADR-007 organisation scope model before identity schema                                                                                                                                                       | OPEN                       | Project owner / stakeholders |
| TD-3 | Content-Security-Policy strategy (nonce via middleware)                                                                                                                                                               | OPEN, deferred             | Engineering                  |
| TD-4 | `npm audit`: PostCSS advisories (high) via `next@15.5.27` nested dependency; npm's suggested fix is a breaking upgrade to Next 16. Not exploitable through unprocessed untrusted CSS in this app, but must be tracked | OPEN                       | Engineering                  |
| TD-5 | Verify `supabase/config.toml`, migrations and real RLS with the Supabase CLI stack (Docker); consider a CI job                                                                                                        | OPEN: NOT RUN in Sprint 1A | Engineering                  |
| TD-6 | Rate limiting for security-sensitive routes (FR-SEC-022/023)                                                                                                                                                          | OPEN: Sprint 1B            | Engineering                  |
| TD-7 | Realtime design details (ADR-006)                                                                                                                                                                                     | OPEN: Sprint 9             | Engineering                  |
| TD-8 | Observability/error-reporting tooling (none installed)                                                                                                                                                                | OPEN                       | Engineering                  |
