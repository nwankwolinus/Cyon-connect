# Sprint 2 — Applicant Ownership and Application Persistence Plan

## 1. Purpose and status

This document sequences the next implementation work after the owner-reported hosted applicant-authentication test. It is an implementation plan, not evidence that application persistence, review authorization, duplicate screening, or production controls exist. The current release serves SS Joachim and Anne Catholic Church, Ijegun. The active parish must be resolved by the existing trusted server-side resolver; applicants do not select operational scope.

The owner-reported manual results are recorded in [the authentication integration runbook](../runbooks/APPLICANT_AUTHENTICATION_INTEGRATION_TEST.md). They are not automated results, a database inspection, or production-readiness approval.

## 2. Verified baseline

- Applicant session verification is separate from member identity. `modules/applicant-auth/application/verify-applicant-session.ts` requires an Auth identity with confirmed email; `modules/applicant-auth/infrastructure/supabase-applicant-session.ts` validates through server-side Supabase Auth `getUser()`.
- `infrastructure/supabase/trusted-authenticated-user.ts` is server-only and derives the authenticated UUID from the verified session. Application operations must use this trusted result rather than a request-body user ID.
- `/applicant` is a protected placeholder, not an application repository or persistence feature. No membership-application table or submission endpoint exists in the inspected local migration/application baseline.
- The identity foundation stores `org_units`, `members`, and `user_accounts`; its own-row policies do not authorize application review. The existing `members` model does not provide applicant-comparable profile data for person-level duplicate screening. Service-role database access bypasses ordinary RLS and therefore needs a separately enforced server-side authorization boundary.
- `infrastructure/organization/operational-parish.ts` resolves a configured parish ID against an exact `org_units` record and fails closed on invalid resolution. This is local implementation evidence only; the intended development database’s actual parish record has not been independently verified for this plan.
- The roadmap describes sprint allocation as proposed. This plan does not change its approval status.

## 3. FRS `FR-MEM-006` field inventory

The Project Owner has now approved MLD-16 requiredness and conditional details for all 14 categories. The complete field specification is in [MEMBERSHIP_LIFECYCLE_CONTRACT_SPEC.md](MEMBERSHIP_LIFECYCLE_CONTRACT_SPEC.md) §5.1; MLD-16 is recorded in [OPEN_DECISIONS.md](OPEN_DECISIONS.md) as owner-approved, with technical dependencies still open. This plan must preserve those classifications. The application is the full membership-assessment step, not a repeat of email/password registration.

| FR-MEM-006 category           | Owner-approved initial-application classification                                                                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name                          | Mandatory first name and surname; optional middle name; separate fields.                                                                                                               |
| Date of birth                 | Mandatory; date picker; reject invalid/future dates; no unapproved age limit.                                                                                                          |
| Email                         | Verified Auth email mandatory through registration; associate it without duplicate entry or an independent editable email field by default.                                            |
| Phone                         | One primary number mandatory; international formats including `+234`; structure validation; no phone verification requirement.                                                         |
| Sacramental information       | Mandatory disclosure for Baptism, First Holy Communion, Confirmation, and Matrimony where applicable; received/not received/unknown; details conditional as specified in the contract. |
| Marital status                | Mandatory; approved five categories; must not automatically determine eligibility.                                                                                                     |
| Sex                           | Mandatory; self-selected Male/Female; no inference or extra categories without approval.                                                                                               |
| Previous/current parish       | Mandatory disclosure; applicable parish details and transfer/return/first-time distinction; never determines operational parish scope.                                                 |
| Residential/permanent address | Current residential address mandatory; permanent address conditional on being different; no proof at initial application unless separately approved.                                   |
| Occupation                    | Optional; employment status/occupation description; no employer/salary or eligibility condition.                                                                                       |
| Societies                     | Optional, multiple; includes “None currently” and “Other” text; not an eligibility condition.                                                                                          |
| Emergency contact             | Name, relationship, primary phone mandatory; alternative phone optional; purpose confirmation and restriction required.                                                                |
| School                        | Optional where applicable; current/most recent; includes “Not applicable”; no certificates.                                                                                            |
| Other approved fields         | No additional fields absent separate explicit approval and defined purpose, requiredness, validation, and privacy justification.                                                       |

These are owner-approved Stage 1 requirements, and Stage 2's client-side form has been formally accepted and closed. The form does not submit or persist applicant data. The verified Auth identity remains the proposed owner key; system metadata includes an application ID, trusted parish association, timestamps, lifecycle/screening metadata, and operation-scoped idempotency metadata. Stage 3 must design persisted representation, server-side validation, applicant/emergency-contact access, privacy notice, retention, and secure persistence before submission or storage is enabled.

## 4. Applicant ownership and access contract

1. Each protected applicant operation validates the current session server-side with the established trusted Auth mechanism and requires confirmed email.
2. The server derives the Auth UUID from `getUser()`; client-supplied applicant IDs are ignored or rejected and never establish ownership.
3. Each application is owned by that Auth principal. Applicant read, update, and idempotent retry paths constrain by both the trusted principal and application identity. A missing or foreign-owned application returns a non-disclosing result.
4. Applicant Auth identities remain independent of `public.members` and `public.user_accounts`. Submission, read, and edit create or change neither record and grant no membership or reviewer permission.
5. Edits are permitted only before review. Screening/review state and history are not applicant-editable. If an allowed edit invalidates screening, the system must return the application to an explicitly unresolved screening gate and preserve prior review history.
6. Responses, logs, and exceptions exclude credentials, tokens, unnecessary applicant data, and other applicants’ records.

## 5. Proposed persistence concepts (not existing schema)

Physical names and final schema remain subject to design review. The minimum conceptual separation is:

| Concept                  | Relationships and invariants                                                                                                                                                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application              | Stable ID; owner Auth UUID; trusted parish/org-unit ID; current application outcome/state; creation/submission/update timestamps; optional prior rejected application reference. No member/account row is required for submission.                                           |
| Protected submitted data | Application-owned data limited to approved fields. Keep access narrower than general identity reads; do not duplicate Auth email unless a documented snapshot requirement justifies it.                                                                                      |
| Screening/review history | Attributable business records for screening decisions, routing, and review actions. Applicant cannot write these. Possible match or insufficient evidence blocks final approval and member creation.                                                                         |
| Idempotency record       | Scoped to authenticated applicant and submission operation; binds key to a canonical validated request digest and resulting application. Same key/digest safely resolves to the same owned result; same key/different digest conflicts. No raw PII payload solely for retry. |
| Member association       | Zero or one current resolved member association per application; a member may have multiple justified historical applications. Association follows authorized review and approval rules; it does not alter `user_accounts.member_id` or member status.                       |
| Security audit           | Separate from business review history. Capture security-relevant actions and denials through a defined reliable path; do not copy unnecessary PII or screening evidence into generic audit events.                                                                           |

Constraints should protect foreign-key integrity, owner/application references, one current association per application, operation-key uniqueness in its defined scope, and valid resubmission lineage. A foreign key or unique link does not prove person-level uniqueness. Exact constraints, retention, RLS, grants, and reliable denied-event capture require schema/security design before migrations.

## 6. Parish and screening boundaries

Resolve the operational parish through the existing server-only resolver for every new application. Ignore/reject applicant-supplied parish IDs. A missing, malformed, unresolved, ambiguous, or invalid configured organization must fail submission closed. The target parish’s live development record still needs independent verification before enabling intake.

No matching source or algorithm is established. Do not claim screening is operational merely because the conceptual outcomes exist. `no_apparent_match` is not proof of uniqueness. Until permitted evidence, explicit reviewer permission, and scoped data access exist, use an unresolved/insufficient-evidence gate; do not expose candidate member data, automatically link by similarity, approve, or create a member. Possible and insufficient matches block final approval/member creation. A confirmed existing-member match also requires an authorized recorded decision and must not create another member.

## 7. Authorization, RLS, and privacy

- Applicant self-access is based on verified Auth ownership, not member/account linkage or a client ID.
- Reviewer operations require an authenticated actor, explicit action permission, current application state, and server-established parish scope; default deny. Secretary routine-review and President escalation policy remain as approved planning decisions. Executive titles and `PLATFORM_ADMIN` do not confer membership-review authority.
- The designated authority that grants reviewer permissions and the durable, auditable assignment/revocation mechanism remain unspecified. Until established, reviewer access is denied and no applicant PII is exposed to reviewers through a substitute route.
- Existing identity own-row RLS is not an application-review policy. If a server-side service-role path is used, it bypasses RLS and must independently enforce ownership/permission/scope; direct application-table writes must not bypass the protected operation.
- Define PII minimization, masking, access matrix, retention/disposal, legal-hold handling, and audit-reader scope before accepting production applicant data. Approval/member creation and required database audit writes should share one PostgreSQL transaction where feasible; a failed required write rolls back the business change. A rolled-back transaction cannot preserve its own audit insert, so denied-event capture needs a separately designed reliable path.

## 8. Lifecycle and retry contract

- New submission creates one durable application independent of member/account rows and cannot itself approve, associate, create, activate, or grant permissions.
- Same applicant + operation + idempotency key + same validated logical payload returns the same application only after rechecking ownership. Reuse with a different payload conflicts without overwriting the original. Concurrent identical requests must resolve to one logical submission through database uniqueness/transaction protection, not process memory.
- Bind the key to the applicant, operation, and canonical validated payload digest. Keep the mapping for the application lifecycle unless an approved retention policy specifies otherwise; do not invent expiry that permits duplicate submissions. Failed transactions must not report success or leave partial application/idempotency state.
- Applicant edits stop when review begins and cannot change screening/review data. Concurrent updates and review must reject stale state using a database-backed version/state check.
- Resubmission creates a new application linked to the prior rejected application; both histories remain. Potential duplicates are neither auto-rejected nor auto-created.
- Final approval requires resolved identity/duplicate review. For a new person, create the member only after approval and within the same database transaction as application outcome, association, review-history, and required audit writes where those writes share PostgreSQL. Any required failure rolls back all writes. If an existing member is confirmed, associate only after authorized review; do not silently reactivate inactive, suspended, or archived members or change existing account links.
- Account creation/activation is separate. Membership approval alone does not activate Auth, `user_accounts`, or grant application access.

## 9. Dependency-ordered implementation slices

| Slice                                       | Objective and likely area                                                                                                                                                                                          | Database/security work                                                                                                                 | Tests and exit criteria                                                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Evidence and configuration gate          | Carry approved MLD-16 classifications forward; verify development parish record, Auth configuration, and privacy/retention basis; review architecture docs and `infrastructure/organization/operational-parish.ts` | No migration until target parish and access model are evidenced                                                                        | MLD-16 is not reopened; remaining evidence gates pass; no applicant PII accepted while controls remain open                                                                             |
| 1. Persistence/access design                | Finalize application, protected data, review history, idempotency, association and audit concepts                                                                                                                  | Additive schema proposal, grants/RLS and narrow server operation design; no service-role bypass assumptions                            | Security review traces every direct and indirect write/read path; constraints cover ownership and race invariants                                                                       |
| 2. Applicant-owned durable submission       | Add application module/use case/API using existing module-first patterns and trusted Auth/parish resolvers                                                                                                         | Application storage + constraints + protected server persistence; no member/account side effect                                        | Valid/invalid request; verified/unverified; auth spoofing; wrong owner; parish spoofing; rollback; zero identity mutations                                                              |
| 3. Idempotent retry and pre-review editing  | Add operation-scoped idempotency and guarded updates                                                                                                                                                               | Unique scoped key/digest and concurrency guard; history preserved on edits                                                             | Same retry gives one result; changed payload conflicts; concurrent requests produce one application; stale/post-review edit denied                                                      |
| 4. Screening and reviewer authorization     | Implement only after evidence and grant authority are established                                                                                                                                                  | Explicit permission/scope assignments, narrowly authorized review path, protected screening/review history                             | All screening outcomes; unresolved blocks; role/title-only and cross-scope denied; no match PII leak; audit failure rolls back required state                                           |
| 5. Approval and member association/creation | Apply approved lifecycle after review contracts are implemented                                                                                                                                                    | Transactional approval + review history + association or member creation + required audit; constraints prevent duplicate links/retries | New member only after approval; confirmed existing member not duplicated; inactive/suspended/archived not changed; failure rollback; races/conflicts safe                               |
| 6. Integration and enablement gate          | End-to-end dev validation before any production intake                                                                                                                                                             | Verify deployed grants/RLS/configuration against reviewed migration; do not target production                                          | Browser/session ownership, database direct-write negatives, migration/concurrency tests, PII-safe logs, operational rollback evidence; production remains disabled until all gates pass |

## 10. Dependencies still requiring evidence or design

1. **MLD-16 and Stage 2 form are approved/accepted:** use the field table and Stage 2 acceptance record. Stage 3 must define persisted representation, server-side validation, email association without unnecessary duplication, purpose/access/privacy controls, and retention; do not reclassify requiredness as part of technical design.
2. **Duplicate screening:** identify lawful/approved comparison data and authorized reviewer-visible evidence. Current `members` rows have no comparable profile data in the inspected identity schema; no match algorithm or external verification exists.
3. **Reviewer grant:** identify the designated grant authority and establish explicit permission identifiers, durable scope, assignment/revocation audit, and audit-read permissions. Until then, review operations deny.
4. **Parish target:** independently verify the single operational parish row in the authorized development database before enabling intake. Local resolver tests/configuration do not prove live database identity.
5. **Privacy/audit:** define applicant-data access, retention/disposal, masking, review/security audit access and reliable denied-event capture.
6. **Hosted security:** CAPTCHA/Attack Protection and effective abuse limits are not verified by the reported successful auth flow. Confirmation/recovery success does not test old-password rejection or all account-enumeration/abuse requirements.
7. **Physical security boundary:** design and test grants/RLS/service-role paths and transaction behavior in a disposable/local test environment before relying on database controls.

These are dependencies, not requests to reopen approved lifecycle decisions. Do not accept applicant PII or claim submission/screening is operational until the corresponding access, field, and persistence controls are implemented and verified.

## 11. Acceptance criteria for the persistence milestone

- Applicant ownership comes only from server-verified Auth `getUser()` and requires confirmed email.
- Every application read, update, and retry is owner-scoped; cross-applicant access and client-supplied identity substitution fail without data leakage.
- Parish comes only from the trusted resolver and matches the verified operational development record; unresolved parish configuration fails closed.
- Stored fields are only the explicitly approved minimum; PII is absent from unnecessary logs/errors and access is constrained by tested server/database controls.
- Submission creates no member/account record, cannot approve, and cannot grant membership/reviewer/admin permissions.
- Idempotency is durable, request-bound and concurrency-safe; retries do not leak a stored result to another principal.
- Applicant edits are pre-review only and cannot alter review/screening history.
- Unresolved screening blocks approval and member creation; role-only or scope-less reviewer access is denied.
- Required business-state and audit writes commit or roll back together when within the same database transaction; limitations for denied-event capture are explicit and tested.
- Automated tests cover normal, negative, concurrent, rollback, authorization, and data-minimization behavior; hosted Auth results are reported separately from automated and database verification.

## 12. Explicit exclusions

This plan does not authorize implementation in this task. It excludes multi-parish administration, member/account creation during submission, membership approval/rejection implementation, identity merging/relinking/transfers, account activation, reviewer permission assignment before its authority is established, a matching algorithm or external identity integration, dashboard work, production deployment, and remote database changes.
