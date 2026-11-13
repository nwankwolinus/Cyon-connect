# Stage 3 — Application Submission Requirements

## 1. Purpose and status

This document defines requirements for **Membership Workflow Stage 3 — Application Submission**. Stage 1 requirements/workflow and Stage 2 form are recorded as closed baselines; Stage 2 acceptance is documented in [MEMBERSHIP_WORKFLOW_STAGE_2_ACCEPTANCE.md](MEMBERSHIP_WORKFLOW_STAGE_2_ACCEPTANCE.md). The controlling owner-approved terms for S3D-01–10 and all listed sub-decisions are in [STAGE_3_OWNER_APPROVED_REQUIREMENTS.md](STAGE_3_OWNER_APPROVED_REQUIREMENTS.md). This document is subordinate and must be read consistently with that baseline. No Stage 3 implementation is evidenced here.

The current product scope is one CYON Connect application for SS Joachim and Anne Catholic Church, Ijegun. This does not authorize multi-parish onboarding, tenant administration, or cross-parish workflows.

## 2. Verified baseline

- Supabase Auth registration, email confirmation, recovery, and server-verified applicant access exist locally. The applicant session path uses Auth `getUser()` and requires a confirmed email.
- `/applicant` renders the accepted multi-step MLD-16 form. Its state is in client memory and its final action only confirms review in the current page session; it does not submit or persist an application.
- `infrastructure/organization/operational-parish.ts` resolves the configured server-only parish UUID against `public.org_units`, requiring exactly one row of type `parish` and the canonical parish name. This is a local implementation fact, not evidence that a hosted row/configuration has been checked during this task.
- Local migrations define `public.org_units`, `public.members`, and `public.user_accounts`; none defines a membership application, application data, submission endpoint, reviewer grant, or lifecycle audit store. Do not infer live remote database state from migrations.
- `members` has no applicant profile fields. `user_accounts` associates an Auth identity to an existing member and is not the applicant-ownership model. Auth-only applicants must remain independent of both tables.

## 3. Source and authority

The local CYON-FRS-001 v1.0 candidate states:

- `FR-MEM-001`: prospective members shall be able to submit membership applications digitally.
- `FR-MEM-002`: maintain one CYON member record per person, subject to authorised duplicate resolution.
- `FR-MEM-004`: authorised executives review, approve, or reject applications.
- `FR-MEM-005`: approved members enter the defined account-activation workflow.
- `FR-MEM-006`: member records support 14 listed information categories; the owner-approved field classifications are detailed in [MEMBERSHIP_LIFECYCLE_CONTRACT_SPEC.md](MEMBERSHIP_LIFECYCLE_CONTRACT_SPEC.md) §5.1.
- `FR-MEM-011`: potential duplicate registrations are detected and routed for authorised review.
- `FR-MEM-012`: personal information uses role- and field-level access controls.
- `FR-SEC-002`, `FR-SEC-003`, `FR-SEC-008`, and `FR-SEC-010` cover authentication, one-member-per-person, authorization, and database security boundaries.
- `FR-PRI-001`–`005` cover approved-purpose collection, information notice, restricted sensitive-data access, unauthorized disclosure, and auditable administrative access.
- `FR-AUD-001`–`004` cover important-action audit, actor/action/time/record/change attribution, protection from ordinary modification, and historical accountability.

Requirement wording/statuses are not changed here. The Stage 3 acceptance criteria are delivery criteria, not new FRS requirements. Approved states, access roles, DOB/age controls, duplicate evidence/outcomes, retention principles, notifications and idempotency rules are binding as stated in the owner baseline. Technical implementation and professional assessment evidence remain incomplete; numeric retention periods and professional findings must come from the required assessment/schedule, not be invented.

## 4. Applicant journey and submission contract

1. The applicant registers and confirms their email through the existing Auth flow.
2. The authenticated applicant completes and reviews the Stage 2 form. Current form state is temporary browser memory only.
3. When Stage 3 is enabled, the applicant explicitly confirms submission. The UI must make clear that this submits an application for review and does not itself grant membership or system access.
4. A same-origin server endpoint verifies the current session and applicant using the existing server-side Auth mechanism (`getUser()`); it requires a verified email. It derives the applicant Auth UUID from that verified identity and ignores/rejects client-supplied owner IDs.
5. The server validates the complete submitted payload against a server-side schema aligned with the accepted MLD-16 classifications. It reports safe field validation errors without echoing sensitive values.
6. The server resolves the operational parish through the trusted resolver. Missing, malformed, unresolved, wrong-type, or wrong-name configuration fails closed. Applicant-declared parish history is form data only and cannot set operational scope.
7. The server validates any resubmission reference against the verified applicant's own prior rejected application and the final approved resubmission rules. It does not trust a submitted UUID without checking ownership and outcome.
8. The server creates one durable application and its protected submitted data, idempotency binding, initial unresolved screening/routing record, business submission-history entry, and required audit record within one PostgreSQL transaction, if the approved database boundary supports all of these writes together. No member, `user_accounts` row, membership status, role, approval, or account activation is created or changed.
9. After commit, the applicant receives a non-sensitive application reference and a clear received/submitted result. An identical retry reconciles to the same authorized result. A lost response after commit must not create a second application.
10. Subsequent applicant reads are owner-scoped to the `getUser()`-verified Auth UUID. The applicant sees only their own submitted application and its applicant-safe status. Review or screening evidence is not exposed by default.

Submission is receipt for review, not membership approval. Use the owner-approved statuses in S3D-08. Persisted transition enforcement must implement those statuses and authorised history rules.

## 5. Proposed functional requirements

These `S3` labels are planning references only; they are not FRS requirement identifiers.

| Planning ID | Requirement                                                                                                                                                                                                                                           | Source / decision                                                                | Planned verification                                                                                                             |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| S3-FR-01    | Accept submission only from an authenticated, email-verified applicant; derive owner from server-verified Auth identity.                                                                                                                              | Existing Auth design; FR-SEC-002; approved ownership decision.                   | Route tests for missing, invalid, expired, unverified, and valid sessions; assert client owner IDs cannot change owner.          |
| S3-FR-02    | Validate all accepted MLD-16 fields server-side and persist only approved field data and metadata.                                                                                                                                                    | FR-MEM-006; FR-PRI-001; MLD-16.                                                  | Schema tests covering required, optional, conditional, enum, date, and phone constraints.                                        |
| S3-FR-03    | Assign the one operational parish from trusted server configuration; never use applicant parish input as scope.                                                                                                                                       | Single-parish owner decision; `FR-GEN-005`, `FR-SEC-008`.                        | Resolver and endpoint tests for valid/missing/invalid/mismatched parish and malicious client parish.                             |
| S3-FR-04    | Create a durable application without creating or associating a member or account, granting a role, or deciding membership.                                                                                                                            | FR-MEM-001/004/005; approved lifecycle decisions.                                | Database integration assertions that submission changes only application-related records and audit/history.                      |
| S3-FR-05    | Support applicant-only reads of their own application. Do not expose other applicants' existence or data.                                                                                                                                             | FR-PRI-003/004; approved applicant ownership policy.                             | Cross-owner, guessed-ID, unauthenticated, unverified, and wrong-scope tests.                                                     |
| S3-FR-06    | Treat operation retries idempotently: same owner/operation/key/payload returns the original result; same key with changed payload conflicts without mutation.                                                                                         | Owner-approved S3D-10.                                                           | Unit and concurrent database tests plus lost-response retry simulation.                                                          |
| S3-FR-07    | Preserve rejected applications; a resubmission is a new application linked to its rejected predecessor and does not overwrite history.                                                                                                                | Approved lifecycle policy; FR-MEM-009/010.                                       | Integration tests for valid owned predecessor, non-rejected/foreign predecessor, lineage, and preserved history.                 |
| S3-FR-08    | Record screening as unresolved until an approved evidence-based path determines an outcome. Possible/insufficient outcomes block approval/member creation; similarity alone never auto-links or rejects.                                              | FR-MEM-002/011; approved duplicate-screening policy.                             | Tests for unresolved fail-closed state, no automatic link/rejection, and approval gate integration when built.                   |
| S3-FR-09    | Record submission business history and required audit metadata without PII in routine logs; keep audit reads independently authorized.                                                                                                                | FR-AUD-001–004; FR-PRI-005; approved audit policy.                               | Transaction rollback tests and log-content tests; separate denial-path reliability test once designed.                           |
| S3-FR-10    | Permit an applicant to edit only their own submitted application before review begins, through a protected server-side operation. Once review has begun, applicant edits are denied. An edit must not change screening/review state or erase history. | `FR-MEM-007`, `FR-MEM-009`, `FR-SEC-008`; owner-approved pre-review edit policy. | State/version tests; denied edits after review begins; verify update cannot alter screening/history and stale versions conflict. |

### Proposed non-functional requirements

- **Security and default deny:** browser input is untrusted; server validates actor, verified email, operation, state, and scope. Direct client database writes to application or review data are denied. Service-role use is server-only and carries explicit application authorization because it bypasses RLS.
- **Privacy:** collect only owner-approved fields for S3D-01 purposes; protect applicant and emergency-contact data according to S3D-02A/B, S3D-03/04/04A, and S3D-06A–E. Do not place sensitive data, tokens, or match evidence in URLs, logs, or errors. Professional assessment evidence, KMS security assessment, and approved schedule periods are prerequisites; their absence does not reopen the approved decisions.
- **Consistency:** application, protected data, idempotency record, initial screening/routing, review-history submission event, and required successful-action audit writes commit or roll back together when they share PostgreSQL.
- **Concurrency:** database constraints and transaction-level locking/version checks, not preflight-only application checks, prevent two writes using the same key and reject stale edits/decisions.
- **Recoverability:** if commit succeeds but the response is lost, a same-key authorized retry returns the original application reference. If commit fails, no partial application or false success is returned.
- **Deployment safety:** local dev uses the repository's development Supabase ref guard; it is not a general production/deployment guard. Before a migration or hosted integration, assert the exact intended non-production ref independently and prohibit accidental production targeting.
- No availability, performance, or service-level target is invented in this planning document.

## 6. Submission acceptance criteria

Stage 3 submission is acceptable for controlled non-production verification only when all of the following are demonstrated:

1. Valid verified applicant submits the complete MLD-16 payload and receives a stable application reference.
2. Application owner is the Auth UUID returned by server-verified `getUser()`; forged client user IDs do not affect it.
3. Parish is the exact trusted configured `org_units` parish; untrusted input cannot override it and invalid resolution prevents persistence.
4. No member, user-account association, role, approval, membership-status change, or activation is created by submission.
5. All fields are server validated; invalid values produce safe errors and do not persist partial data.
6. Applicant can retrieve their own application only; cross-applicant and unauthenticated access is denied without revealing whether another application exists.
7. Same key/same payload retry, concurrent retry, changed-payload conflict, transaction rollback, and lost-response reconciliation are proven against the migration/database implementation.
8. Application history/resubmission lineage and initial screening state are preserved; unresolved screening cannot reach approval/member creation.
9. The exact S3D-08 status vocabulary and transition history are enforced; inactivity is not rejection, and rejected applications cannot be reopened by editing.
10. S3D-05 age boundaries are calculated using exact birthday comparison; applicants below 16 or above 40 are not accepted, and applicants aged 16–17 cannot be accepted without the consent method/evidence required by the cleared professional assessment.
11. DOB is encrypted and isolated per S3D-04A/05C, never returned to parish authorities or written to logs/audit, with decryption restricted to the eligibility service.
12. S3D-09 notifications go to verified email without sensitive content; delivery attempts/failures are recorded and cannot alter status.
13. Database grants/RLS and server-side access paths are reviewed and tested; no browser role can directly insert/update application PII or reviewer state.
14. Required successful-write audit is atomic with business writes. Denied-event capture limitations and failure behavior are explicitly tested and documented; no reliability claim is made without evidence.
15. Approved privacy notice/purpose, PII access, emergency-contact use, retention, masking, and disposal controls exist before real intake.
16. Reviewers cannot see applicant data until a designated grant authority, explicit permission assignments, scope, and protected read path are approved and tested.
17. Development target, parish row, rollback/disable procedure, and applicable hosted Auth/abuse configuration are recorded using sanitized evidence. No production project is touched.

## 7. Explicit exclusions

Submission does not implement membership approval/rejection, final duplicate resolution, member creation/association, membership-status transitions, `user_accounts` creation/linking, account activation, permission granting, identity merge/relink/transfer, applicant-facing access to reviewer notes, or production intake enablement. Multi-parish onboarding and tenant administration remain out of scope.
