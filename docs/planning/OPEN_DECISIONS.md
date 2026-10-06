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
