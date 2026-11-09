# Sprint 2 — Membership Submission Implementation Plan

## 1. Purpose and status

This plan prepares the next implementation work for prospective-applicant identity, application submission, applicant self-access, screening, and scoped review. It is based on local repository evidence and the Project Owner's four planning decisions recorded on 7 November 2026 in [the trust and authorization design](../architecture/PROSPECTIVE_APPLICANT_TRUST_AND_AUTHORIZATION.md). The owner instruction is the approval source; this record does not invent a signature, meeting, or external approval artifact.

**This plan does not implement runtime submission.** Applicant authentication and the Stage 2 client-side form are implemented locally; Stage 2 form acceptance is recorded in [MEMBERSHIP_WORKFLOW_STAGE_2_ACCEPTANCE.md](MEMBERSHIP_WORKFLOW_STAGE_2_ACCEPTANCE.md). The approved decisions do not prove all Auth configuration, email delivery, parish settings, reviewer assignments, or an operational screening source. Stage 3 implementation must not accept or persist applicant PII until the applicable gates below pass. The project roadmap still labels sprint allocations as proposed; this plan is not evidence that the overall roadmap has been formally re-baselined.

## 2. Approved planning decisions and limits

1. Current release is single-parish: SS Joachim and Anne Catholic Church, Ijegun. All applications, reviews, and parish operations use that server-configured intake/review destination. It does not establish applicant belonging.
2. Applicant data follows a minimum-field approach grounded in the FRS and needed for review.
3. Reviewer permissions require a designated grant authority and auditable permission assignments; no authority is inferred from a role or title.
4. Duplicate screening uses evidence-based human review. Possible matches and insufficient evidence remain unresolved and block final approval/member creation.

Applicant self-access and editing only before review, explicit parish-scoped reviewer checks, persisted screening/routing, and safe operation-scoped idempotency are also recorded planning decisions in the existing lifecycle documents. Permission codes and physical representations in this plan are proposals only.

## 3. Owner-approved MLD-16 application fields

The Project Owner has approved field-by-field requiredness and conditional details for all 14 `FR-MEM-006` categories. The full field inventory is in [MEMBERSHIP_LIFECYCLE_CONTRACT_SPEC.md](MEMBERSHIP_LIFECYCLE_CONTRACT_SPEC.md) §5.1. This replaces the earlier “smallest defensible candidate” proposal in this plan; none of its previous proposed optional/deferred classifications remains current.

The approved application includes mandatory full name, date of birth, verified Auth email association, primary phone, sacramental disclosure, marital status, sex, previous/current parish disclosure, current residential address, and emergency contact. Permanent address and sacramental/parish details are conditional. Occupation, societies, and school are optional under the approved conditions. No other field may be added without separate approval. Use the linked inventory for each field's precise subfields and constraints.

These are Stage 1 requirements. Stage 2's form represents them in temporary client-side state and has been owner-accepted; this does not establish persisted representation, server-side validation, privacy/access control, retention, or lawful-handling procedures. Keep registration/authentication separate from application data; do not request duplicate Auth email or create an independent editable email field by default. Do not submit or persist application PII until remaining controls are designed and verified.

## 4. Verified implementation and configuration baseline

### Authentication capability inventory

| Capability                           | Finding                                                                                                                                                                                                                    | Evidence / next verification                                                                                                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Existing sign-in                     | **Implemented locally:** browser UI calls `signInWithPassword`; it requires a returned session and then verifies `/api/identity/me`. Errors are reduced to a generic sign-in message.                                      | `modules/identity/presentation/identity-experience.tsx`; `modules/identity/presentation/identity-experience-state.ts`                                                                      |
| Trusted Auth identity                | **Implemented locally:** server helper checks for a session and calls Auth `getUser()` before returning the user ID. The identity lookup then requires a linked account/member.                                            | `infrastructure/supabase/trusted-authenticated-user.ts`; `modules/identity/infrastructure/supabase-identity-context-reader.ts`; `app/api/identity/me/route.ts`                             |
| Prospective-applicant signup         | **Not implemented locally.** Installed `@supabase/supabase-js` / `@supabase/auth-js` 2.117.2 types expose `auth.signUp`; no app call, route, or UI exists.                                                                 | Add only after signup policy, callback, confirmation, and abuse controls are defined and tested. SDK presence does not prove project settings.                                             |
| Email verification / confirmation    | **SDK-supported, configuration unverified.** SDK types expose OTP/code exchange methods; no verification callback/route is present.                                                                                        | Verify actual Auth confirmation settings, allowed redirect URLs, and real delivery in an authorized non-production environment. No remote settings were inspected.                         |
| Unverified-user sign-in behavior     | **Unknown for the target project.** Local sign-in requires a session and identity lookup; it cannot establish whether confirmation is required or what the target project returns for an unverified account.               | Verify after configuration in a disposable/development project; ensure no application is accepted without a verified Auth principal.                                                       |
| Password reset/recovery              | **SDK-supported, not implemented in the app.** SDK types expose `resetPasswordForEmail` and user update methods.                                                                                                           | Implement explicit recovery and callback behavior; test token expiry/replay, redirects, enumeration behavior, and verified ownership in non-production.                                    |
| Session validation                   | **Implemented locally for existing flows:** cookie-aware SSR client and `getUser()` helper are used. No prospective-applicant ownership check or application endpoint exists.                                              | New endpoints must verify the current Auth user on every call and bind ownership from that principal.                                                                                      |
| Rate limit / abuse control           | **Not implemented in inspected app code; provider/project configuration unverified.**                                                                                                                                      | Verify Auth quotas/configuration and add application-ingress controls for signup, verification resend, submission, and reads as appropriate. Do not assume provider defaults are adequate. |
| Redirect/callback                    | **Not implemented locally for signup/confirmation/recovery.** `NEXT_PUBLIC_APP_URL` is validated, but no auth callback route or redirect allowlist is evidenced.                                                           | Define exact environment-specific callback URLs and validate redirect destinations; test rejected/unlisted destinations.                                                                   |
| Email delivery                       | **No local mail integration found; project/provider delivery configuration unverified.**                                                                                                                                   | Confirm configured provider, sender/domain, deliverability, bounce behavior, and non-production test route without exposing tokens.                                                        |
| Enumeration/privacy                  | **Existing sign-in UI uses a generic error.** Signup/recovery behavior does not exist.                                                                                                                                     | Keep signup, resend, recovery, and inaccessible-application responses generic; measure no status that reveals another applicant or member.                                                 |
| Auth identity without member/account | **Supported by the local schema boundary:** `auth.users` exists independently; `user_accounts` references Auth and member but there is no requirement that every Auth user has an account. No application link exists yet. | Application owner may be the Auth UUID; later account/member linkage must occur only through the separately approved post-approval/activation workflow.                                    |

Provider SDK support is not evidence that email confirmation, recovery, redirect allowlists, rate controls, or email delivery are configured. Before production intake, verify signup, confirmation, unverified sign-in denial, recovery, session refresh, callback URLs, abuse limits, and delivery end-to-end in a dedicated non-production project. Record sanitized outcomes only; never record credentials, OTPs, tokens, or verification URLs.

### Reviewer and screening baseline

- The only implemented authorization route is `/api/authorization/me`, backed by `current_user_is_platform_admin()`. `modules/authorization` represents the current caller's platform-admin boolean; the platform migration has no membership-review grants. No membership reviewer assignment, parish-scoped permission, review API, revocation path, or audit-read API exists.
- `DATABASE_AUTHORIZATION.md` separates `PLATFORM_ADMIN` from executive and membership authority. It must not be reused as an implied membership reviewer role.
- `members` stores UUID, home parish, status, and timestamps, but no name/email/phone/profile data (`supabase/migrations/20261008090000_identity_foundation.sql`). Authenticated RLS is own-row; it does not authorize applicant review. `service_role` bypasses RLS, so service-role access requires independent server-side permission/scope checks.
- No matching source, matching algorithm, reviewer route, or approved evidence catalog is implemented. A reviewer cannot safely determine `no_apparent_match` or confirmed identity from current member rows alone. Screening begins unresolved/insufficient and blocks later approval/member creation until an approved evidence source and scoped reviewer path exist.

### Proposed reviewer permissions (not implemented or assigned)

| Proposed code                              | Purpose                                               | Proposed grant boundary                                                                       |
| ------------------------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `membership.application.read`              | Read minimum application data                         | Active assignment to the application's intake parish                                          |
| `membership.application.decide`            | Routine decision operation                            | Secretary under explicit parish assignment and valid current state                            |
| `membership.application.screening.resolve` | Human screening disposition                           | Explicitly assigned reviewer in the parish; rationale/evidence required; no identity mutation |
| `membership.application.escalated_decide`  | Escalated/disputed final decision                     | President authority under approved policy, explicit grant/scope and recorded escalation       |
| `membership.application.audit.read`        | Read relevant security/business accountability events | Separate explicit read-only scope; no automatic PII access                                    |

These identifiers are suggestions for the authorization design, not approved permission IDs. Before reviewer access exists, the Project Owner must designate the grant authority, record grant/revocation evidence, and approve the implementation mechanism. Secretary routine review and President escalated/disputed authority follow the approved planning policy; executive status alone does nothing. `PLATFORM_ADMIN` receives no membership permission by default. Cross-parish access is denied unless separately authorized.

## 5. Conceptual persistence and trust boundary

Do not change `members` or `user_accounts` to represent an application. Proposed additive protected persistence should separate:

- **Application:** durable submission, verified applicant Auth owner, server-derived intake parish, current application outcome, version, submission time, and optional prior-rejected application reference.
- **Protected applicant data:** only the approved minimum fields; separate or tightly protected from identity rows. Do not expose it via broad member own-row policies.
- **Screening/routing:** approved screening outcome, unresolved/review-routing information, and any scoped assignment. Client never writes it. `no_apparent_match` is not person-uniqueness proof.
- **Business review history:** append-only record of decisions/actions, actor/system attribution, previous/resulting state, time, and minimized evidence reference. Current outcome and history update together.
- **Permission assignments:** proposed action grants tied to reviewer principal and parish scope, with grant/revoke attribution. The designated grant authority must be established before any assignment is created.
- **Idempotency mapping:** operation key scoped to applicant and operation, bound to a canonical validated-payload digest. No raw PII request body stored solely for idempotency.
- **Security audit:** distinct from business review history. Required successful audit writes share the business transaction. A separately reliable denied-attempt path is not currently evidenced.

Preferred access path is a narrow protected server/database operation invoked using a verified authenticated principal, with database constraints and transactions enforcing ownership, current state, scope, and uniqueness. If any service-role path is chosen, it must independently verify actor, explicit permission, scope, and application state; RLS does not protect service-role writes. The later schema design must inspect actual grants, policies, object ownership, and reachable RPC paths; do not assume a private schema or `SECURITY DEFINER` is safe without reviewing its grants and search path.

## 6. Implementation sequence

The order puts trust and authorization prerequisites before applicant PII.

### Slice A — Verify and configure prospective-applicant Auth

**Local implementation status (2026-11-07):** Registration, PKCE callback, password recovery, verified applicant sign-in, and a protected Auth-only placeholder page are implemented with mocked tests. Hosted Auth/email behavior, CAPTCHA, effective limits, and callback allowlisting remain to be verified; membership-application intake remains disabled/not implemented.

- **Work:** implement the applicant signup, confirmation callback, recovery, and session contract in [APPLICANT_AUTHENTICATION_SPEC.md](../architecture/APPLICANT_AUTHENTICATION_SPEC.md). Keep Auth principal separate from member/account identity; validate applicant sessions server-side with `getUser()` and require verified email under an explicitly verified Confirm Email configuration.
- **Likely files:** `modules/identity` application/presentation/composition; `infrastructure/supabase/server.ts`; new auth callback/API route only if the selected SSR flow requires it; `infrastructure/config` schemas; focused auth tests.
- **Prerequisites:** the owner verifies the non-production project reference, requires email confirmation with autoconfirm disabled, verifies email delivery and callback/recovery allowlists, and records effective rate-limit/CAPTCHA/session settings. Local `supabase/config.toml` now enables signup and confirmation; hosted settings remain reported by the owner but were not independently checked in this task. See the specification checklist.
- **Acceptance/evidence:** verified and unverified cases tested; `getUser()` binds identity; recovery works only for the same Auth principal; callback rejects unapproved redirects; generic errors prevent account enumeration; no member/account row is required; no secret/token is logged; signup, confirmation, recovery and abuse controls are verified in the intended non-production project.
- **Failure/rollback:** disable prospective signup route/feature flag and stop intake if provider configuration or callback behavior is uncertain. Do not create member records as fallback.

### Slice B — Establish trusted single-parish setting

- **Work:** add a server-only setting for the active parish; validate the configured identifier against the database and require the resolved `org_units` row to be the parish named SS Joachim and Anne Catholic Church, Ijegun. Reject missing, non-parish, absent, duplicate/ambiguous, or mismatched configuration. Never accept caller-supplied parish scope. Apply the same scope to all current membership applications, reviews, and parish operations.
- **Likely files:** `infrastructure/config/schema.ts`, server config module, environment documentation, and a narrow scope resolver plus tests.
- **Prerequisites:** single-parish scope is owner-approved; supply the actual parish identifier from the intended deployment and verify it against the named parish before enabling intake.
- **Acceptance/evidence:** config cannot enter browser bundle; wrong/missing/non-parish or differently named parish fails closed; client-supplied parish is ignored/rejected; existing submissions retain their stored scope if configuration changes.
- **Failure/rollback:** disable intake and parish operations if validation fails; changing configuration must not rewrite existing applications.

### Slice C — Establish membership reviewer grants and scope enforcement

- **Work:** name the designated grant authority through a recorded owner decision; approve permission codes and assignment lifecycle; add a protected server/database authorization evaluator for action + parish + current assignment. Provide attributable grant and revocation operations before any review route returns applicant data.
- **Likely files:** `modules/authorization` contracts/application/infrastructure/composition; database authorization migration and tests; authorization documentation. Do not expand platform-admin permission catalog.
- **Prerequisites:** named grant authority, exact permission/scope design, operator evidence, and approved applicant-data access boundaries.
- **Acceptance/evidence:** no authorization from title alone; role-only, `PLATFORM_ADMIN`, absent/revoked grant, wrong parish, and stale assignment all deny; Secretary routine and President escalated cases follow explicit grant; grant and revocation have audit evidence; no cross-parish bypass.
- **Failure/rollback:** disable reviewer endpoints and preserve applications; revoke incorrect assignment through protected procedure; no direct table DML from applicant roles or generic service-role caller.

### Slice D — Define approved fields and application persistence

- **Work:** carry the owner-approved MLD-16 field decisions forward; design additive application and protected applicant-data persistence, owner Auth UUID, intake parish FK, current outcome/version, screening/routing, review history, and application-specific access path. Keep member/account schema separate.
- **Likely files:** additive migration under `supabase/migrations`, membership domain/application contracts and repository port, infrastructure adapter, migration tests, data model and traceability updates.
- **Prerequisites:** preserve MLD-16 requiredness; specify technical validation/purpose and verified-email association, permitted screening evidence, and data access/retention basis. Migration design validates actual Postgres/Supabase privilege effects.
- **Acceptance/evidence:** an application exists without member/account; applicant ownership derives only from authenticated Auth ID; PII inaccessible to other applicants and ordinary reviewer roles; no direct client DML bypass; required FK/check/unique constraints work; no unintended identity-table change.
- **Failure/rollback:** additive migration preserves prior identities. If migration or policy tests fail, do not deploy intake; rollback plan is tested in disposable DB and preserves submitted data or disables writes without destructive reset.

### Slice E — Screening and authorized routing

- **Work:** implement review-only screening outcome storage and scoped queue using approved evidence. Until a permitted evidence source is available, persist unresolved/insufficient and block final approval/member creation. No automatic match or linking.
- **Likely files:** membership application use case/repository, scoped review operation, authorization adapter, migration constraints/indexes, tests.
- **Prerequisites:** an approved comparison data source and evidence rules; designated grant authority and explicit reviewer grants; data-minimization and read scope.
- **Acceptance/evidence:** all four conceptual outcomes persist through protected operations; `possible_match`/`insufficient_evidence` remain blocked; `no_apparent_match` never asserts uniqueness; confirmed match requires reviewer evidence and does not create/link/mutate a member; reviewer cannot see unrelated parish/application PII.
- **Failure/rollback:** screening lookup failure becomes unresolved, not no-match; reviewer permission unavailable leaves queue blocked; no direct identity modification.

### Slice F — Idempotent submission and pre-review self-service

- **Work:** build submission/read/edit use cases and API contracts. Bind operation-scoped key to applicant, operation and canonical payload digest; same payload retry returns same authorized application; conflicting reuse rejects without update. Edit only before review and invalidate any stale screening.
- **Likely files:** membership module contracts/use cases/ports/adapters; API routes; database constraints/RPC; tests. Follow existing module-first dependency rules.
- **Prerequisites:** A-E gates pass; retention period/key lifetime decision sufficient to prevent duplicate submissions through retry/reconciliation; narrow DB write path established.
- **Acceptance/evidence:** concurrent same-key requests create one application; mismatched payload conflicts; post-review edit denied; cross-owner reads/retries denied without enumeration; state/history/audit and idempotency writes are atomic; failures do not return false success or partial records.
- **Failure/rollback:** transaction rollback leaves no application/idempotency false success; lost response retry reconciles by key; do not expire mapping while a retry could create a duplicate.

### Slice G — Controlled enablement and verification

- **Work:** run local unit and migration tests, then integration tests in an explicitly identified disposable/development Supabase environment; enable intake only after operational sign-off and monitoring.
- **Acceptance/evidence:** test matrix below passes, sanitized config verification is recorded, no live/production project is targeted, and intake can be disabled without deleting application history.
- **Failure/rollback:** feature flag or route gate disables new submissions; no schema reset or deletion of valid applications; revoke reviewer grants if authorization is uncertain.

## 7. Required test and verification matrix

| Area                      | Required cases                                                                                                                                                                                         | Environment/evidence                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Applicant Auth            | Signup; verified versus unverified; callback allowlist; expired/invalid verification; password reset; recovery session; session refresh/logout; generic error and account-enumeration behavior         | Unit tests plus disposable/development Supabase Auth and configured email delivery; sanitized result record   |
| Applicant ownership       | Unauthenticated request; verified owner read; other applicant read; guessed UUID; deleted/disabled Auth principal; email change; no account/member row                                                 | Unit/API and database tests; verify auth principal comes from `getUser()`/`auth.uid()`                        |
| Scope                     | Missing/wrong config; nonexistent/non-parish org unit; client-supplied parish mismatch; changed config; cross-parish reviewer                                                                          | Unit plus disposable DB/RLS/RPC tests; never test against unverified project                                  |
| Reviewer authorization    | Secretary routine grant; President escalation grant; other executive title only; `PLATFORM_ADMIN` only; missing/revoked grant; wrong action/parish; stale assignment; PII/read audit scopes            | Unit and DB privilege tests under `anon`, `authenticated`, intended server path; owner/grant audit evidence   |
| Screening                 | No apparent match is not uniqueness; possible/insufficient block; confirmed match requires human evidence; lookup failure blocks; applicant cannot view candidate/evidence; no matching data available | Unit/integration against approved test fixtures; not proof of matching quality absent approved criteria       |
| Idempotency/concurrency   | Same key/same payload; key with changed payload; concurrent same operation; concurrent edits/review; lost response/retry; stale version; transaction failure                                           | Unit and DB transaction/unique-constraint tests; disposable Postgres/Supabase for actual locking/RLS behavior |
| Persistence/privacy/audit | No member/account side effect; no PII in logs/errors; service-role bypass path blocked by server checks; direct DML denied; audit rollback; denial recording limitations                               | Migration tests and disposable Supabase privilege inspection; no remote production verification               |

Do not claim these tests pass until executed. The existing identity tests do not verify applicant signup, application ownership, reviewer permission, screening, or application idempotency.

## 8. Outstanding owner and operational decisions

### Owner decisions still required

1. MLD-16 field classifications are owner-approved and Stage 2 is formally closed. Stage 3 must define persisted representation, server-side validation, privacy/access, retention, and emergency-contact safeguards without reopening requiredness.
2. Identify the designated authority allowed to authorize and revoke membership reviewer permission assignments, and the approval evidence/operating procedure. The owner has approved the need for a designated authority but has not named one; do not infer from Secretary, President, project owner, or `PLATFORM_ADMIN`.
3. Approve permitted screening evidence and the minimum reviewer-visible member/application attributes needed for evidence-based human review. Current member rows provide no name/contact attributes; no external or unique identity evidence source is approved.
4. Decide audit/data retention, deletion/legal hold, denied-event reliability and failure handling before production storage; do not invent a period or claim reliable denied-event capture.

### Operational verification prerequisites

- Verify Auth signup, email confirmation, unverified sign-in behavior, password reset/recovery, callbacks/redirect allowlist, configured sender and deliverability, rate limits/abuse protection, and environment-specific sessions in a non-production project.
- Supply and validate the actual server-only intake parish setting; do not use the seeded parish without deployment owner confirmation.
- Establish a safe authorization migration/function design with direct DML denied and all service-role paths independently checked; verify effective grants and RLS in a disposable project.
- Select a secure secret/configuration deployment process; never place privileged values in browser bundles or logs.
- Record FRS baseline/owner approval separately from implementation verification; this plan does not mark an FRS requirement implemented.

## 9. Explicit exclusions

No membership approval/rejection, member creation/association, membership-status change, account creation/activation, identity merge/relink/transfer, platform-admin dashboard or role change, multi-parish onboarding, tenant administration, cross-parish workflows, external identity verification, phone verification, or production intake enablement is included in this plan. No migrations, functions, permissions, assignment, or runtime behavior are created here.
