# Stage 3 — Application Submission Architecture

## 1. Status and design boundary

This proposed architecture is subordinate to the [Stage 3 Owner-Approved Requirements Baseline](STAGE_3_OWNER_APPROVED_REQUIREMENTS.md), which records the operative terms of S3D-01–10 and all listed sub-decisions. It does not create or verify deployed database objects. Stage 2 is formally accepted and closed. Stage 3 implementation must satisfy the baseline and remains gated on evidence prerequisites, including the cleared professional assessment, approved retention periods, KMS security assessment, and technical access-control design/verification.

## 2. Current implementation baseline

### Verified local facts

- `app/applicant/page.tsx` calls `getVerifiedApplicant()` on the server and redirects if no verified applicant is returned. It renders `MembershipApplicationForm` with the verified Auth email.
- `modules/applicant-auth/infrastructure/supabase-applicant-session.ts` obtains the current Auth identity through `auth.getUser()`. `verifyApplicantSession` requires an Auth ID, email, and `emailConfirmedAt`.
- `modules/membership-application/presentation/membership-application-form.tsx` stores form input in React reducer state, validates in the browser, and its “Review information” submit handler only marks the form reviewed in memory. No request sends the membership payload to an API or database.
- `infrastructure/organization/operational-parish.ts` obtains a server-only configured parish UUID, reads the matching `org_units` row through the server-only admin client, uses `maybeSingle()`, and requires the exact configured ID, `unit_type = parish`, and canonical name `SS Joachim and Anne Catholic Church, Ijegun`. The function returns a generic unavailable error. The resolver implementation does not prove the configured UUID exists in a particular hosted project.
- `infrastructure/supabase/admin.ts` creates a server-only service-role client that bypasses RLS. `infrastructure/config/public.ts` hard-codes the `crfcglxcsnmeovnipnko` development project guard when `NODE_ENV=development`. This is a local development guard, not a complete deployment or migration target control. `infrastructure/database/safety.ts` guards destructive operations; it is not a general runtime write-authorization boundary.
- The local identity foundation migration creates `public.org_units`, `public.members`, and `public.user_accounts`; there is no application, submitted application data, screening, review history, or general lifecycle-audit object in the inspected migrations. Do not infer remote schema state from those files.
- `members` is a stable identity without profile fields. Its status vocabulary is `pending`, `active`, `inactive`, `suspended`, `archived`. `user_accounts` links Auth users to members and has its own statuses. Neither table is an application record.
- Existing identity-table RLS allows authenticated own-account reads and active own-member/org reads; it grants no authenticated direct writes. These policies do not apply to future application tables and do not authorize executive review. Service-role access bypasses RLS.
- Existing audit tables concern initial identity provisioning and platform bootstrap. They are not a general application submission audit path. A failed transaction rolls back its own audit inserts; no durable denied-event mechanism is established.
- The form includes the owner-approved 14 MLD-16 categories and the 52-entry Archdiocesan society options. The directory is not evidence of active parish chapters. See [the Stage 2 acceptance record](MEMBERSHIP_WORKFLOW_STAGE_2_ACCEPTANCE.md).

### No remote verification

This planning work does not connect to Supabase. It does not establish that the configured parish row or any migration is present in either hosted project. The authorized development reference is `crfcglxcsnmeovnipnko`; production is `bpooqfgadtbyeduapwyi`. No environment values or project settings were changed.

## 3. Proposed component architecture

```text
Stage 2 client form
  └─ explicit confirm + operation-scoped idempotency key
       ↓ same-origin POST
Next.js route handler (server)
  ├─ origin/content-type/size checks and no-store response
  ├─ verified applicant session (Supabase Auth getUser + confirmed email)
  ├─ server-side payload validation and normalization
  ├─ trusted operational-parish resolver
  ├─ resubmission reference ownership/outcome validation
  └─ membership application use case
       ↓ narrow server-only persistence port
PostgreSQL transaction (proposed additive application schema)
  ├─ application control record + protected submitted data
  ├─ operation idempotency binding
  ├─ initial screening/routing record = unresolved until reviewed
  ├─ business submission history
  └─ required successful-action audit event
       ↓ committed result only
Safe applicant response / owner-scoped GET
```

Component proposals (not existing files):

- `modules/membership-application/domain`: submitted payload, application reference, semantic result types, no database-specific imports.
- `modules/membership-application/application`: submit and get-own-application use cases; ports for verified principal, parish, transaction/persistence, and clock/ID source as repository conventions require.
- `modules/membership-application/infrastructure`: server-only adapters and a narrow database transaction boundary.
- `modules/membership-application/presentation`: request/response contract; API route under `app/api/membership-applications/route.ts` and owner-scoped retrieval route if approved.
- Reuse existing Auth verification and operational-parish resolver through composition. Do not recreate authentication or parish selection.

Do not return full application payload for idempotency retries until the current request is authenticated and the stored application owner matches the verified Auth UUID.

## 4. Data model proposal (conceptual only)

The model must not reinterpret `members` or `user_accounts` as application tables. A possible additive relational design is:

| Concept                        | Purpose and proposed relationship                                                                                                                                                                          | Integrity/security notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application control record     | One row per genuine submitted application; owner Auth UUID, operational parish FK, owner-approved current state/version, submission timestamps, optional predecessor reference, and safe public reference. | Applicant exists without a `members` or `user_accounts` row. FK to `auth.users` preserves ownership reference but deletion behavior needs to follow approved Auth deletion policy. Parish FK must enforce `org_units.unit_type = parish` through the existing typed relationship pattern. Physical fields and status constraint representation remain design decisions.                                                                                                                                                                                       |
| Protected application payload  | One-to-one or tightly coupled protected data associated with the application, containing the accepted MLD-16 submission snapshot and verified-email association as approved.                               | Separate from stable member identity and general audit. Consider a dedicated protected relation rather than broad application-table SELECT. Decide typed columns versus versioned structured payload after field-level access and privacy review. The recommended submission snapshot is the data presented at submit; how pre-review edits are versioned or recorded without unnecessary PII duplication remains open. Do not duplicate Auth email unnecessarily; if snapshotting it at submission is required, define verified source and change semantics. |
| Screening/routing record       | Persisted representation of the owner-approved S3D-07D dispositions: confirmed duplicate, not a duplicate, or inconclusive.                                                                                | Matching and review are not implemented. Implement S3D-07A–C exact-match flags and supporting indicators against only S3D-07B sources. Persisted field/value representation remains a technical design choice. Inconclusive remains unresolved and blocks approval/member creation; confirmed duplicate does not authorize automatic association or merge.                                                                                                                                                                                                    |
| Business review history        | Attributable, append-only history of application decisions/material review actions, with state before/after where applicable, time, outcome, and minimized evidence reference.                             | Separate from security audit and applicant payload. A successful state change and required history event share one database transaction. Ordinary application principals cannot update/delete history.                                                                                                                                                                                                                                                                                                                                                        |
| Submission idempotency binding | Operation-scoped reference to applicant, operation, high-entropy key digest, canonical validated payload digest, and resulting application reference.                                                      | Unique key scope and digest binding prevent races. Do not store the raw payload solely for retry detection. Apply the approved retention schedule while preserving S3D-10 retry guarantees; no numeric period is inferred.                                                                                                                                                                                                                                                                                                                                    |
| Security audit                 | Required security/accountability events distinct from business review history.                                                                                                                             | Successful required audit write commits with the business transaction. Denials requiring recording need a separate durable mechanism; none is currently evidenced. Keep PII out of event payloads.                                                                                                                                                                                                                                                                                                                                                            |

Proposed relationships: one application has exactly one verified Auth owner and one trusted intake parish; it has zero or one predecessor and at most one current resolved member association in a later approval stage. One Auth user and one member may relate to multiple historical applications. Application submission itself creates no member association. A resubmission is a new application linked to the prior rejected application; the server must verify the predecessor's rejected outcome and enforce history preservation. The approved baseline does not define all branching/cardinality edge cases; resolve those as technical modeling details without imposing unapproved limits.

### Constraints and indexes to evaluate in schema design

- Primary key for application; foreign keys to `auth.users`, typed parish `org_units`, and optional predecessor application; delete restrictions/retention semantics must be reconciled with privacy and Auth deletion decisions.
- `CHECK`/enum constraints for the finally approved application and screening vocabularies; avoid introducing `rejected` into membership status.
- Unique idempotency scope such as `(applicant_auth_id, operation, key_digest)`, with request digest and resulting application reference in the same transaction.
- Index owner/status/submission time for owner-scoped list/retrieval, parish/status for authorized review queue only after review access is approved, and predecessor for history traversal.
- Do not create uniqueness over names, email, phone, or other applicant PII as a proxy for person uniqueness. No current database key proves FR-MEM-002.
- Do not add a “one open application” unique constraint until duplicate pending applications and resubmission rules are explicitly settled. Idempotency prevents retry duplication, not separate logical applications or cross-Auth person duplication.
- Use version or row-lock semantics for any permitted edit or later review transition so stale writes conflict. Exact response semantics are a contract decision.

## 5. Trust boundaries and authorization

### Browser to server

- Browser provides only form fields, a client-generated high-entropy idempotency key, and (when applicable) a selected prior rejected application reference. None of these proves identity or scope.
- Validate same-origin request, content type, bounded request size, shape, normalized values, and CSRF protections using repository conventions. Do not put PII in URL/query strings.
- Server obtains the applicant from the cookie-backed Supabase client, calls Auth `getUser()`, and checks confirmed email. Ignore/reject owner ID, parish ID, status, screening, review, member ID, account ID, role, or audit fields supplied by the browser.
- Return only a minimal receipt/reference and applicant-safe state, with `Cache-Control: no-store`. Do not echo sensitive submitted values in errors.

### Server to database

- Reuse trusted parish resolver; its server-configured UUID, exact-row/type/name validation, and fail-closed behavior are the only operational parish source. No applicant parish-history field may set the FK.
- Direct browser DML to new application/review tables must be denied. Enable RLS and grant only the narrow roles/operations chosen by the reviewed schema.
- If a service-role adapter is used, remember it bypasses RLS. It must be a server-only, narrow persistence port called only after actor, verified email, payload, state, idempotency, and parish checks. Avoid generic service-role CRUD. Database constraints and one transaction still enforce referential and concurrency invariants, but they do not independently authenticate the HTTP applicant when service role is used.
- Prefer owner-scoped database reads guarded by `auth.uid()` when the selected access path preserves that claim; otherwise the server query must explicitly filter by the verified Auth UUID and return indistinguishable not-found/denied results. Do not treat current identity RLS as application access control.
- Reviewer data remains unavailable until a designated grant authority, explicit permission identifiers, assignment/revocation audit, parish scope, and independently tested server/database enforcement exist. Secretary/President policy and `PLATFORM_ADMIN` separation remain unchanged.

## 6. Screening, duplicate cases, and resubmission

- A submission is durably received even when duplicate screening is unresolved, if privacy/storage/intake gates have passed. A possible match or insufficient evidence is not an automatic rejection and does not suppress or erase the application; it blocks final approval, member association, and member creation.
- A same-key retry is the same operation and returns the original authorized result. A different key is a new operation; matching content alone must not be used as an idempotency key or automatically rejected. Policy for multiple pending applications from one Auth owner and possible same-person submissions under different Auth identities remains unresolved.
- Current `members` contains no name, email, or phone fields, and no matcher/review path is implemented. S3D-07A–C now approves comparison indicators and permitted evidence sources, but does not create those data sources or prove person-level uniqueness. A lookup failure or inability to establish identity remains inconclusive, not “not a duplicate.”
- Prior application data could be a candidate screening source only after privacy purpose, reviewer access, retention, and evidence policy are approved. Do not disclose candidate records to applicants or unscoped reviewers.
- For a resubmission, a client reference is only a locator: server verifies the predecessor belongs to the same Auth applicant and has Rejected outcome. New record links to it; neither prior application nor review history is overwritten. Any additional branch/cardinality edge handling is a technical design detail and must preserve the approved new-linked-application rule.
- **Submission blocking versus approval blocking:** malformed/incomplete required payload, unverified/expired session, failed trusted parish resolution, invalid idempotency reuse, invalid/foreign/non-rejected resubmission reference, or database/audit failure blocks creation/confirmation of a submission. An unresolved possible duplicate does not itself block durable receipt after privacy gates pass; it routes to unresolved review and blocks approval/member creation. If no protected intake/review path can meet the privacy and access requirements, intake stays disabled rather than silently accepting data without a safe disposition path.

## 7. Transaction, idempotency, and failure handling

### Recommended boundary

Use one PostgreSQL transaction for the application record, protected payload, idempotency binding, initial screening/routing data, business submission-history event, and required successful submission audit event. If any required write/constraint fails, roll back the entire transaction and return no success. S3D-09 requires notifications after the corresponding business event; email delivery is outside the PostgreSQL transaction, delivery attempts/failures are recorded, and failure never changes application status. Do not claim atomicity for email or other external effects and do not send before commit.

### Idempotency contract (proposed)

1. Client generates a random, unguessable key for one explicit submit attempt and reuses it only for retries of that logical operation.
2. Server scopes key by verified Auth owner and operation, validates/normalizes the payload, and computes a canonical payload digest. Do not log or store the raw PII request for idempotency.
3. First valid request persists binding and application in one transaction under a unique constraint.
4. Same owner, operation, key, and payload digest returns the existing reference and safe receipt after reauthorizing that owner.
5. Same key with a different digest returns a conflict without overwriting the original application.
6. Concurrent same-key requests converge through the unique constraint/transaction; losers read/reconcile the committed result under owner authorization.
7. If the database committed but the HTTP response was lost, the retry recovers the same result. If transaction rolled back, retry may safely attempt the operation again.
8. Key retention must follow the approved schedule and preserve S3D-10 safe retry guarantees; do not invent a duration or expire a binding while a retry could create a duplicate.

An idempotency key handles duplicate transport attempts, not same-person identity, a genuinely new submission, or duplicate registration across separate Auth identities.

## 8. Audit and operational visibility

- Business review history states what happened to an application and preserves application decisions/changes.
- Security audit establishes accountability for protected access and security-relevant outcomes. It is not a replacement for review history or a general payload store.
- Successful submission audit and business-history writes are transactional with application creation when all share PostgreSQL. A rollback also rolls back those rows; this is correct for an uncommitted business operation.
- Security-relevant denied attempts cannot be made durable by inserting an event into the transaction that is then rolled back. A separate reliable denial-event channel and its failure behavior are still required; do not claim one currently exists.
- Minimum approved event fields are authenticated actor or defined system actor, target application/member, action, before/after state where applicable, timestamp, outcome/failure category, and correlation/evidence reference where available. Keep payload fields, tokens, keys, confirmation links, and unnecessary PII out.
- Read access to membership history and security audit is explicitly authorized, scoped, and read-only. `PLATFORM_ADMIN` does not automatically receive membership or unrestricted PII access.
- Retention principles, role access, masking boundaries, and restrictions are owner-approved by S3D-03/04/06. Exact category periods and the professional audit schedule are not located; export, deletion/disposal mechanics, legal-hold handling, and operational incident procedures require implementation/evidence. Do not invent durations or legal compliance claims.

## 9. Data protection and failure cases

| Failure or threat                                      | Required behavior                                                                                                                              |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing/unverified/expired Auth identity               | Deny before database read/write; do not trust client user ID.                                                                                  |
| Invalid or oversized payload                           | Reject with safe validation result; no partial write or sensitive-value echo.                                                                  |
| Parish config absent, wrong, unresolved, or mismatched | Fail closed; no arbitrary/first/seed/caller-selected fallback and no application write.                                                        |
| Duplicate candidate or no approved matcher             | Persist as unresolved only after privacy/intake gates; do not claim no match, link, reject, or approve. Keep approval/member creation blocked. |
| Invalid predecessor/resubmission                       | Reject without disclosing another applicant's application existence.                                                                           |
| Idempotency key reused with changed payload            | Conflict; preserve existing application unchanged.                                                                                             |
| Concurrent writes or stale version                     | Constraint/transaction detects conflict; no duplicate/partial result. Exact API response contract remains design work.                         |
| Audit/history/child-row failure                        | Roll back all transaction-bound application writes; return no success.                                                                         |
| Commit succeeds, response is lost                      | Same authorized idempotent retry returns original receipt/reference.                                                                           |
| Reviewer grant/scope absent                            | No reviewer PII path; application remains held and intake should remain disabled unless a safely approved intake disposition exists.           |
| Logging/telemetry                                      | Record only non-sensitive operation, correlation, and outcome class; never payload/secret/token.                                               |

## 10. Decisions required before implementation

See [OPEN_DECISIONS.md](OPEN_DECISIONS.md) for implementation and evidence dependencies. The owner-approved baseline settles purposes/exclusions, controller identity, role boundaries, DOB eligibility/confidentiality, retention principles, duplicate evidence and dispositions, status vocabulary, notifications, and idempotency semantics. A later explicit owner-approved requirement makes the passport photograph mandatory before submission; no other supporting-document upload is approved. Still open are technical representation/enforcement, the cleared professional and KMS assessments, submitted-photo retention, reliable Storage API cleanup for expired draft photos, and implementation evidence. These dependencies do not reopen owner decisions.
