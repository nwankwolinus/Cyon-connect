# Membership Application Data Model — Conceptual Proposal

## 1. Purpose and status

This is a conceptual schema proposal for review, not an approved physical schema or migration. The Project Owner declared formal CYON policy/FRS approval on 2026-10-22; the declaration and scope are recorded in `docs/planning/MEMBERSHIP_LIFECYCLE_OWNER_APPROVAL.md`. The repository does not independently establish the owner's identity or capacity under Charter §20 / FRS §28. This model records approved policy/design direction but does not implement it.

No physical database objects, permission identifiers, activation mechanisms, or numeric retention periods are approved by this conceptual model. The application-status vocabulary and owner policy terms are approved in [STAGE_3_OWNER_APPROVED_REQUIREMENTS.md](../planning/STAGE_3_OWNER_APPROVED_REQUIREMENTS.md); proposed entity/attribute labels remain illustrative only and must support that baseline.

## 2. Verified constraints

The identity foundation migration `supabase/migrations/20261008090000_identity_foundation.sql` defines:

- `public.members`: stable member identity with a required parish home-unit reference and membership status `pending`, `active`, `inactive`, `suspended`, or `archived`.
- `public.user_accounts`: an application account linked by restrictive foreign keys to one `auth.users` identity and one member. `auth_user_id` and `member_id` are each unique; account status is `pending_activation`, `active`, `suspended`, or `deactivated`.
- No membership-application table, submission record, application decision history, or lifecycle audit facility.

The `members_immutable` trigger rejects changes only to `id` and `created_at`; it does not make `org_unit_id` or `membership_status` immutable. A separate trigger prevents physical member deletion. The schema permits a member without an account. Existing RLS allows authenticated own-row reads; there are no application review writes/policies. The application has identity-context read logic but no membership-application use case or repository port. Later identity-provisioning migration source revokes direct `service_role` member/account DML. The initial identity-provisioning and platform-bootstrap migrations have purpose-specific audit tables; neither is a general membership lifecycle audit implementation.

Requirements references verified in `docs/planning/REQUIREMENTS_TRACEABILITY.md`: `FR-MEM-001/002/004/005/009/011`, `FR-MEMA-001–004`, `FR-SEC-002/003/004/008/010`, `FR-PRI-003/004/005`, and `FR-AUD-001–004`. The Project Owner's declared FRS/policy approval is recorded, with authority-capacity qualification, in the linked approval record. `FR-MEM-011` requires duplicate detection and authorized review routing at a high level; it does not set matching rules or authorize automatic rejection. `FR-MEM-002` and `FR-SEC-003` express one member per person but do not supply a database key or matching procedure to establish person identity.

## 3. Recommended conceptual entities

### 3.1 Application submission — proposed

One durable record per submitted attempt, whether initial or resubmitted. This is the authoritative record of what was submitted and the submission's eventual application outcome. It is not a member identity, Auth identity, or application account.

Illustrative concepts only: an application identifier, submitted time, target parish/reference, applicant-data reference, submission idempotency reference, and an optional reference to the prior rejected application. The owner-approved status vocabulary is Draft, Submitted, Under Review, On Hold, Approved, Rejected, Withdrawn, and Closed; its physical representation remains a design choice.

**Invariants:** a retry of the same submission operation must not create a second record; a genuine resubmission is a distinct record; an old application and its submission data/history are retained according to approved privacy and retention policy. No unique email/name/phone constraint is proposed as person identity. A database foreign key or unique application-to-member link can prevent invalid references or multiple links for one application, but cannot prove the `FR-MEM-002` invariant that there is one member record per person.

**Open technical work:** representation/enforcement of the approved states, submission completeness, applicant/Auth linkage constraints, operation-scoped idempotency persistence, and implementation of retention/disposal and access controls. State names are not open.

### 3.2 Resubmission relationship — proposed

An optional restrictive self-reference from a new application to the prior rejected application. It preserves lineage without overwriting the earlier attempt. The model must permit multiple successors unless the owner decides otherwise; no one-successor uniqueness is proposed now.

**Invariant:** only an authorized operation may create the link, and the referenced prior record must be verified as rejected under the eventual approved outcome model. A foreign key alone can enforce existence, not rejection semantics. The exact retry-versus-resubmission rule remains open.

### 3.3 Current outcome and review history — proposed

Two conceptual alternatives were considered:

1. Store the current application outcome on the application record and keep append-only review history. This gives a direct current-state read and supports a protected compare-and-set/version check, but duplicates the outcome across current state and history. Every outcome update and its history event must commit together and be checked for consistency.
2. Derive the current outcome by replaying an append-only event history. This avoids a separately stored current outcome, but makes reads and transition validation more complex and requires a defined event ordering, replay/version behavior, and migration/recovery strategy.

**Owner-approved technical design direction:** use an application record as the authoritative current outcome and a separate append-only business review history as the attributable record of how that outcome was reached. A protected operation should atomically validate the current state/version, update the current outcome, and append the corresponding event. This is not an approved physical schema or an existing event-sourcing/audit facility.

Each review-history event would refer to the application and identify the authenticated actor (or a defined system actor), action, previous/resulting outcome where applicable, timestamp, outcome/failure category and correlation/evidence reference where available. A stale or concurrent decision must fail without changing current state or appending a misleading successful event.

Business review history records application-level decisions and material review actions. The security audit log records security/accountability events such as denied privileged attempts; it is not a substitute for application review history. The history should preserve prior decisions even if a subsequent submission is made. Ordinary application roles must not mutate/delete it. Membership decision, member status change, and account status change are separate concepts, even if one approved operation later coordinates some of them in a transaction.

**Open:** full event catalog, denied-attempt capture mechanism, access permissions/scope, retention, masking, export/review and legal-hold rules. Current audit objects cover only identity provisioning and platform bootstrap.

### 3.4 Applicant data — proposed ownership choice for review

Because `members` intentionally contains no profile/PII fields, an application needs protected submission data. Prefer application-owned submitted data or a separate tightly protected application-data representation, rather than treating `members` as the application or silently reusing a mutable profile as a historical submission snapshot.

**Open technical work:** persistence representation, field-level enforcement, masking, deletion, and resubmission snapshots. DOB must be separated from ordinary application/member records, envelope-encrypted with managed KMS protection, and decryptable only by the restricted eligibility service per S3D-04A/05C. Do not copy DOB, sacramental details, or unnecessary PII into audit events. Numeric retention periods require the approved schedule.

### 3.5 Member association — proposed, optional until established

An application may be associated with an existing member only after authorized review confirms the relationship. For a new identity, create the member only after approval, as decided by the owner; associate that newly created member with the approved application. The application record must be able to exist before any member exists.

**Approved conceptual cardinality:** an application has zero or one current resolved member association; one member may be associated with multiple historical applications where the lifecycle justifies it, including distinct resubmissions. These are not yet enforced schema rules. A resubmission remains a separate application linked to its rejected predecessor; it does not overwrite the predecessor's association or review history. Do not rewrite historical associations to make a later application fit.

**Invariants:** one application must not silently point to multiple conflicting member identities. Similarity is not identity proof. Any correction to an erroneous association must be a separately authorized and attributable correction that preserves the prior association and reason; it must not mutate the referenced `members` or `user_accounts` identity links.

**Owner-approved policy:** assign `active` to a newly created member in the same transaction as final approval and creation, interpreting it only as approved membership. Keep the account absent or in its separate non-active activation lifecycle; `FR-MEM-005` requires a distinct account-activation workflow. `FR-MEM-009` defines vocabulary, not transitions, and the database default `pending` does not define post-approval meaning. All applicable access paths must enforce account activation; membership status alone must not grant access. This policy is not implemented.

For an existing `active` member, an authorized confirmed association may be recorded without changing status. For `pending`, `inactive`, `suspended`, or `archived` members, do not infer a transition from application approval; hold the association/approval for a separately authorized status disposition. Never implicitly activate, unsuspend, restore, change account status, or modify `user_accounts.member_id`.

**Open:** physical cardinality/correction representation, status-based disposition for an existing non-active member, and exact permission/scope that may resolve a match. The safe interim is no status mutation and no final outcome that depends on an unresolved status disposition.

### 3.6 Account relationship — existing model retained

Keep `public.user_accounts` separate. It links an Auth principal to a member and has its own account status. Approval must not create/activate an account automatically. A separate controlled verification/activation workflow may later create or update the account after all approved checks. Preserve the existing one-account-per-member and one-account-per-Auth constraints.

**Open:** when Auth identity/account creation occurs, exact activation states/checks, user confirmation, expiry, retries, replay/concurrency behavior and system-actor audit. No activation mechanism is prescribed.

## 4. Consistency alternatives for approval and member creation

**Option 1 — one database transaction:** validate the current application state, record approval, create a new member or associate an eligible existing member, append business review history, and write the required audit event in one transaction. This best matches the existing PostgreSQL-centered persistence and transaction patterns and gives all-or-nothing behavior when all writes are in the same database. It does not make any external Auth, notification, or other service operation atomic.

**Option 2 — durable recoverable workflow:** use separate transactions only if the operation cannot remain within one database boundary. Approval must then leave a durable, queryable outcome that cannot be silently abandoned; member creation must be idempotent; retries and lost responses must be reconciled to the same result; and required audit evidence must track each committed business transition. This needs an explicitly designed durable-work/recovery mechanism. No queue, outbox, recovery table, or such mechanism currently exists or is approved.

**Owner-approved technical design direction:** prefer Option 1 for approval/member/association/business-history/audit writes when they can be implemented within one protected database transaction. Use Option 2 only if a genuine boundary requires it, with its recovery contract designed before implementation. Do not claim atomicity across separate transactions. Retries must not create a second member, uncertain responses must be safely reconciled, and committed approvals must have a defined completion/recovery outcome. Required audit writes remain consistent with the business change. No lifecycle operation currently implements this design.

## 5. Conceptual lifecycle flow (not a state machine)

1. Receive a submission and persist one application record with protected submission data and an operation-scoped idempotency identity. This requires no member or account record. The current outcome begins in a semantic received/awaiting-review condition; this is descriptive, not an approved persisted state name. Same operation/key and payload must reconcile to the original application; reuse with a different payload conflicts. A genuinely new submission is not deduplicated merely because PII looks similar.
2. Treat duplicate transport retries as the same submission operation through approved idempotency behavior. A genuinely new submission creates a new application.
3. Screen only using an approved procedure and available authorized data. Record one of four conceptual results: no apparent match (not proof of uniqueness); possible match; confirmed match; or insufficient evidence. Do not invent an algorithm, threshold, unique identifier, or external verification. A possible match and insufficient evidence require authorized human review; record reviewer, scope, disposition, concise rationale/evidence reference, and time, minimizing PII. No match-resolution permission is implemented; deny until one and its scope are approved. Do not automatically link, reject, or suppress a submission.
4. The Secretary handles routine review with explicit server-side permission and scope; the President has final authority on escalated/disputed cases under the owner-approved policy, enforced through explicit permission and scope.
5. Rejection is recorded as an application outcome, separate from membership status. A later resubmission is a new linked application preserving both histories.
6. **Owner-approved sequencing:** resolve any possible match before final application approval. Possible or insufficiently evidenced matches block final approval and member creation/association. This implements the approved interpretation of `FR-MEM-002` / `FR-SEC-003`; it does not supply a matching algorithm or prove person uniqueness. Persisted review representation and evidence controls remain implementation prerequisites.
7. A recorded no-apparent-match result permits consideration of new member creation only after the approved review procedure has completed; it is not proof of uniqueness. A confirmed existing-member match permits association only after authorized review. Similarity alone never establishes identity. The protected write revalidates the recorded resolution and scope; unresolved/insufficient evidence fails closed. FKs and unique application/member links cannot enforce one person per member.
8. On final approval of a new applicant, create one new member with `membership_status = active` and its application association within the same database transaction. `active` means approved membership only; it does not activate an account or by itself grant application access. Enforce the separate account-activation requirement on every applicable access path. `pending` remains the database default but is not used to override this approved post-approval policy.
9. For a confirmed existing match, associate without creating another member. If its status is `active`, preserve it. If `pending`, `inactive`, `suspended`, or `archived`, do not change it; hold any approval/association that depends on a status transition for a separately authorized disposition. Never reactivate, restore, change account status, or alter `user_accounts.member_id` through this flow.
10. Record application outcome, member creation/association, business review history, and required audit in one protected PostgreSQL transaction. Any validation, stale-state, constraint, or required audit failure rolls back every database write. Do not report success or a completed approval if member creation/association fails. Use the same operation identity for safe retry/reconciliation; do not create a member twice after an ambiguous response. External notifications occur only after commit and are not part of the transaction.
11. Start account activation as a separate secure workflow. Approval does not create or activate an account. Failed/expired verification cannot bypass checks; the activation state machine remains open.

No application state names, rejection-reason vocabulary, duplicate threshold, retry limit, expiry period, or verification mechanism are defined here.

## 6. Integrity, concurrency, and access considerations

- Enforce operation-scoped submission idempotency without imposing person-level uniqueness based on PII. Bind a request key to its operation scope and payload digest; an identical retry returns/reconciles the original result, while a different payload under the same key conflicts. Key lifetime and externally visible conflict response remain approval decisions.
- Preserve the predecessor link with restrictive referential integrity; validate predecessor outcome within the protected operation.
- Use a transactionally checked current application version/state so competing reviews cannot both become final. A later stale decision must conflict without partial writes.
- Protect member creation against concurrent approval paths through a transaction and the existing identity uniqueness constraints where applicable. Those constraints cover Auth/account links, not one member per natural person; the approved duplicate-review procedure must be checked at the protected creation boundary to satisfy `FR-MEM-002`.
- Bind submission idempotency to a submission operation, not to a person or matching PII. Define handling of same-key/same-payload retries versus same-key/different-payload conflicts, key retention, and uncertain responses before implementation.
- Validate a review against the authoritative current application outcome/version within the protected mutation boundary. Competing stale decisions must conflict without partial writes; exact conflict response and retry behavior remain open.
- For a possible existing member, keep association unresolved until permission, actor, scope and evidence are checked server-side. No client-supplied member ID is proof of identity or authorization.
- Keep applicant data private by default. Define RLS and server-side authorization separately for applicant self-access, Secretary review, President escalation, duplicate review, member association and audit read.
- Do not widen existing own-row RLS to create reviewer access implicitly. Existing service-role bypass is not a substitute for an authorized workflow.
- Record a required successful-action audit event in the same transaction as the business change. A denial that rolls back cannot rely on an audit row in that transaction; a separately reliable denied-event mechanism and its failure behavior remain to be designed and tested.

## 7. Existing-member match before final approval

**Assessment:** no conflict was found in the local FRS. `FR-MEM-004` requires review/approval/rejection; `FR-MEM-011` requires potential duplicate detection and routing to authorized review; `FR-MEMA-003` requires permissions for status management. They do not specify sequencing. `FR-MEM-005` places approved members into the defined account-activation workflow.

**Owner-approved policy:** require authorized match resolution before final application approval. The Project Owner approved this sequencing on 2026-10-22. The alternative—approval while match review remains open—was not selected. Unresolved possible/insufficient evidence blocks approval, association, and member creation. This aligns with `FR-MEM-002` / `FR-MEM-011`, but the repository has no application model to implement the gate.

The sequencing rule is an **owner-approved CYON Connect policy direction**, recorded in the owner approval record. It can delay approval while evidence remains uncertain. Exact reviewer permissions, scope, evidence handling, and persisted representation remain implementation prerequisites. This is not a merge or identity-repair workflow.

The current schema cannot represent a pending identity-review outcome: it has no application entity or match-review field/history. The design could represent the gate as a review event/task or application-level marker, but the persisted representation and vocabulary remain to be designed; do not invent a status name. Until that representation, approved evidence handling, reviewer permissions, and scope are implemented, leave the case unresolved and create/associate no member.

## 8. Requirements traceability and authority

| Requirement                       | Source-supported meaning                                                                                                                             | Design relevance                                                                                                                                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FR-MEM-002`, `FR-SEC-003`        | One CYON member record per person, subject to authorized duplicate resolution; one person → one member → one user account.                           | A protected new-member creation operation must perform the approved duplicate-review procedure. Existing foreign keys/link uniqueness do not prove person identity.                                     |
| `FR-MEM-004`                      | Authorized executives review, approve, or reject applications.                                                                                       | Review operation and outcome history; does not specify identity-match sequencing.                                                                                                                       |
| `FR-MEM-005`                      | Approved members enter a defined account-activation workflow.                                                                                        | Supports separate post-approval activation; no automatic activation requirement.                                                                                                                        |
| `FR-MEM-009`                      | Membership status vocabulary includes Pending, Active, Inactive, Suspended, Archived/Former.                                                         | Do not add `rejected` as membership status. Does not define application outcomes or transitions.                                                                                                        |
| `FR-MEM-011`                      | Potential duplicate registrations are detected and routed for authorized review.                                                                     | Supports review routing; matching criteria and outcome remain unspecified.                                                                                                                              |
| `FR-MEMA-001` / `002`             | Secretary is primary operational owner; President has appropriate oversight.                                                                         | Supports these baseline responsibilities; the Project Owner's approved CYON Connect policy specifies final authority for escalated/disputed cases, while permission implementation remains outstanding. |
| `FR-MEMA-003` / `004`             | Status management follows assigned permissions; status changes attributable to authenticated actor.                                                  | Server-side permission and actor attribution.                                                                                                                                                           |
| `FR-SEC-002`, `004`, `008`, `010` | Explicit permissions; account lifecycle support; backend enforcement; least privilege/default-deny.                                                  | Authorization and separate activation controls.                                                                                                                                                         |
| `FR-AUD-001`–`004`                | Audit important actions; identify actor/action/time/affected record/relevant change; protect ordinary modification; preserve historical attribution. | Application/review history and audit controls; does not determine retention or denied-event transport.                                                                                                  |

The owner-approved policy/design baseline and its evidence qualification are recorded in [MEMBERSHIP_LIFECYCLE_OWNER_APPROVAL.md](../planning/MEMBERSHIP_LIFECYCLE_OWNER_APPROVAL.md). Application state/data design, duplicate-screening evidence and persisted disposition, permission/scope enforcement, and activation details remain implementation work. Requirement identifiers and statuses are unchanged. The owner-declared formal approval is not independently corroborated as to authority capacity under Charter §20 / FRS §28.

## 9. Decisions required before a schema design can be finalized

1. Application outcome/state vocabulary and implementation of the owner-approved current-outcome-plus-append-only-review-history model.
2. Implement the owner-approved rule that possible matches be resolved before final approval; define duplicate-review representation, evidence, dispositions, permissions, scope, and protected enforcement under `FR-MEM-002` / `FR-SEC-003`.
3. Enforce the owner-approved `active` status for a new post-approval member as membership approval only, with privilege gating while account activation remains separate; define handling for existing non-active matches without implicit reactivation.
4. Application/member cardinality and historical association semantics, association correction versus supersession, and how resubmission branches relate to prior application associations.
5. Application data fields, ownership, applicant self-service, PII protection and per-resubmission snapshot behavior.
6. Submission idempotency semantics versus genuinely new applications; key/payload conflict, uncertain response, resubmission eligibility, and multiple successor rules.
7. Exact permissions and parish/organizational scope for application review, match review, applicant data and audit.
8. Activation identity checks, account creation timing, states, verification, expiry, retries, replay/concurrency and failure handling.
9. Audit access, retention, masking, denial recording reliability, review/disposal/legal-hold policy and applicable privacy/legal requirements.
10. Approval/member-creation consistency approach: one database transaction where feasible, or a separately approved durable recovery design if necessary.
11. Any separate approval artifact or organizational formality required by the applicable process to substantiate the owner's declared formal approval. No external signature or meeting record is present locally, and the owner's authority capacity is not independently evidenced.

## 10. Acceptance criteria for a future schema increment

- A durable application can be submitted without a `members` or `user_accounts` row.
- Each genuine submission/resubmission has its own record; resubmission can link to the rejected predecessor without overwriting either history.
- Transport retries do not create another application; the approved mechanism does not suppress a genuinely new application based only on matching PII.
- Rejection remains an application outcome; membership and account status vocabularies remain unchanged.
- Member creation occurs only after approval; no member/account is created per application attempt.
- The protected new-member creation boundary applies the approved duplicate-review procedure addressing `FR-MEM-002` / `FR-SEC-003`; a foreign key or application/member uniqueness constraint is not treated as proof of person identity.
- After approval, a new member has the owner-approved `active` membership status only; the account remains separate and every applicable access path gates access on required account activation.
- Existing-member association requires authorized review and cannot trigger merge, relink, transfer or identity modification.
- A failed member create/association or required audit write leaves no committed final approval; retry/reconciliation cannot create a second member.
- Approval and new-member creation either commit with required review history/audit in one database transaction, or use an explicitly approved durable, idempotent recovery contract; no cross-transaction atomicity is claimed.
- The current application outcome and append-only business review history remain consistent, and stale concurrent decisions fail without partial writes.
- Existing-member association does not implicitly alter or reactivate membership status; a new member's `active` membership status does not activate an account or independently grant access.
- Historical associations are preserved; any correction is authorized, attributable, and does not rewrite existing member/account identity links.
- The owner-approved sequencing rule has an explicit persisted review representation and enforces resolution before final approval without inventing a state name.
- Competing review/member-creation operations cannot produce two final decisions or duplicate links; failures roll back or leave a durable, explicitly modeled recoverable operation.
- Approval does not activate the account; activation is separately controlled and authorized.
- Reviewer access is server-enforced, scoped and default-deny; ordinary users cannot write application/review history or access out-of-scope PII.
- Required successful-action audit commits with its business state; denied-attempt mechanism and reliability are separately specified and verified.

These are design acceptance criteria, not implementation or test claims.

## 11. Out of scope

No SQL, schema, migration, code, permissions, API, tests, matching algorithm, identity repair, merge, transfer, or account activation behavior is authorized by this conceptual proposal. The Sprint Roadmap remains proposed and unchanged.

## 12. Stage 3 controlling owner decisions

The Stage 3 owner-approved baseline at [STAGE_3_OWNER_APPROVED_REQUIREMENTS.md](../planning/STAGE_3_OWNER_APPROVED_REQUIREMENTS.md) controls application status, DOB eligibility/confidentiality, reviewer role boundaries, duplicate indicators/evidence/dispositions, retention principles, notification requirements, and transactional idempotency. The previous statement that application-state names remain undecided is superseded. S3D-05's 16–40 age eligibility rule supersedes MLD-16's earlier absence of an age limit.

Owner approval is not implementation evidence. The professional assessment, approved numeric retention schedule, KMS/security assessment, and technical schema/enforcement are not located or implemented in this repository. No physical schema is approved by this conceptual proposal.
