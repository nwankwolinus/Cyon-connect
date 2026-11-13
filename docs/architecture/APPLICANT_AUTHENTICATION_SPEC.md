# Prospective Applicant Authentication Specification

## 1. Purpose and status

This specification defines the authentication foundation for prospective applicants. The repository implements local registration, confirmation callback, password recovery, verified applicant sign-in, and the authenticated Stage 2 membership form using the existing Supabase Auth and Next.js architecture. Form entries remain in client-side memory; this specification does not implement application data access or persistence and does not establish that all hosted Auth settings or email delivery are verified.

The current product is a single-parish application for SS Joachim and Anne Catholic Church, Ijegun. Parish intake scope is established separately by the server-side operational-parish resolver; registration does not establish parish membership or belonging.

## 2. Verified repository baseline

- `infrastructure/supabase/browser.ts` creates a browser client using only the public Supabase URL and anon key.
- `infrastructure/supabase/server.ts` creates a cookie-aware, server-only client using the same public key and the caller's session cookies.
- `infrastructure/supabase/trusted-authenticated-user.ts` requires a session and obtains the Auth principal from `auth.getUser()`. It does not trust a caller-supplied user ID.
- `modules/identity/presentation/identity-experience.tsx` and its state helpers implement existing email/password sign-in, sign-out, and protected-shell checks against `/api/identity/me` and `/api/authorization/me`. This is the existing-member experience; an Auth identity without the required member/account links is denied by that flow.
- `modules/applicant-auth` and the `applicant`/`auth` routes implement registration, PKCE callback exchange, recovery request/password update, and server-verified applicant access. There is no membership-application submission or persistence route.
- The CYON registration application route now requires a date-only DOB input and runs the server-only exact-birthday eligibility check before calling Supabase Auth. Ages 16–40 inclusive pass; below 16 and above 40 do not. DOB is not forwarded to Supabase Auth, stored by this route, or included in its response. This route-level check does not prove that direct provider signup is blocked; provider-level bypass and hosted/local Auth configuration remain unverified. Do not enable applicant intake based on this check alone.
- `middleware.ts` refreshes cookies only for `/applicant/*`, `/auth/*`, and `/api/applicant-auth/*`; the protected page and password-update operation independently require a server-verified, email-confirmed Auth user.
- `supabase/config.toml` is local configuration with `project_id = "cyon-connect-security-test-local"`. It enables signup and email confirmation, sets Site URL `http://localhost:3000`, and lists exact callback/reset paths for `localhost` and `127.0.0.1`. The installed CLI is `2.120.0`; its local `status` inspection could not inspect containers because Docker Desktop was unavailable, and the CLI exposes no start dry-run flag. The file therefore remains unvalidated by the CLI. It does not establish hosted project settings, SMTP/delivery, CAPTCHA, or effective rate limits.
- The identity schema relates `user_accounts` to `auth.users`; it does not require every Auth user to have a `user_accounts` or `members` row. Prospective Auth identity can therefore remain separate from membership identity. No account or member may be created as a registration side effect.
- `infrastructure/supabase/admin.ts` uses a service-role key and bypasses RLS. Applicant ownership must use the cookie-aware user client and the server-verified Auth ID; service-role access is not an authentication or ownership proof.

## 3. Required applicant flow

The following is the proposed flow. It must not be enabled until the configuration checklist in Section 8 is verified in the intended non-production project.

1. **Register:** The applicant submits email and password to a same-origin application route. The route validates the values and calls Supabase Auth through the cookie-aware server client configured with the public anon key. It supplies a fixed confirmation callback URL and never accepts an arbitrary redirect URL or `next` destination. The browser and API expose no service-role key.
2. **Create Auth identity:** Supabase Auth creates an Auth identity only. No `members`, `user_accounts`, role, reviewer assignment, or membership application is created.
3. **Deliver confirmation:** Supabase Auth sends its confirmation message using the project's configured email provider/template. The application displays a generic “if registration can proceed” response and does not disclose whether an address already exists. A successful API response does not prove delivery.
4. **Confirm:** `/auth/callback` consumes the one-time PKCE authorization code through `exchangeCodeForSession`, then calls `getUser()` and requires `email_confirmed_at`. It never trusts callback query data as an Auth ID and redirects only to a fixed same-application destination. Expired, invalid, malformed, or replayed codes fail closed with a generic result and no applicant access. The `flow` query selects only the fixed landing page; it is not identity or authorization evidence.
5. **Sign in:** After successful confirmation, the applicant signs in with email/password. If the provider's confirmation exchange establishes a session, that session is still not sufficient by itself: protected applicant operations must independently validate the current Auth user server-side. The application must not grant access based solely on landing on the callback URL.
6. **Resolve principal:** Each future protected applicant operation obtains the cookie-backed server client, checks for a session, then calls `auth.getUser()`. The trusted Auth UUID returned by that call is the sole owner key. An unconfirmed, missing, invalid, expired, or unverifiable identity is denied. Never use a request body, query parameter, email, session-embedded user ID, or application ID as owner proof.
7. **Access application functionality:** The `/applicant` page now renders the Stage 2 membership form after verified Auth access. Its form data is temporary client-side memory; there are no application records or submission route. When persistence is implemented, the applicant may access only records whose persisted Auth owner UUID equals this verified principal and whose state permits the requested operation. The existing member shell must continue to deny an Auth-only applicant.

### Registration edge cases

- **Existing email:** Use a generic response. Do not reveal whether an Auth identity exists, attach it to a member, or modify an existing account. Any provider response differences must be normalized and tested before release.
- **Delivery failure or throttling:** Do not report success as proof of delivery. Show a generic retry/support state; do not log email contents, confirmation links, codes, or tokens. Retry behavior must respect provider rate limits.
- **Repeated confirmation:** The callback must treat already-consumed or invalidated proof as non-authorizing. It may show a generic “link invalid or expired; request a new confirmation” message. It must not create another Auth user or application.
- **Expired confirmation:** No session or application access is granted from an expired proof. A new confirmation request uses a generic response and provider/application abuse controls.
- **Session expiration or revocation:** Protected applicant operations revalidate with `getUser()` and deny when verification fails. Return a generic unauthenticated response; do not serve cached private content. A fresh sign-in is required.

## 4. Password recovery

Recovery uses Supabase Auth for the same Auth identity and must not change membership or account records.

1. A same-origin recovery request accepts an email address, validates it, and calls the Auth recovery operation through the public-key server client.
2. The response is generic whether or not an Auth identity exists, preventing account enumeration.
3. Recovery redirects only to the fixed `/auth/callback?flow=recovery` destination. The callback consumes the one-time PKCE code, validates the current user through `getUser()`, and sends the browser only to `/auth/reset-password?mode=update`.
4. A password-change page is available only after server-side `getUser()` validates that recovery session. It updates the password for that same Auth principal; it cannot accept a target user ID.
5. Expired, reused, malformed, or failed recovery proof is denied generically. No identity/account relinking, membership activation, or access grant occurs.

The concrete callback proof format and email-template markup must match the chosen Supabase SSR flow and be verified in the intended non-production project. The implementation must not support open redirects.

## 5. Session and authorization boundaries

- Use `createBrowserSupabaseClient()` for client-initiated Auth only; it contains no service-role key.
- Use `createServerSupabaseClient()` for server routes and callbacks that act as the current user. For protected operations, call `getUser()` rather than treating `getSession()` or cookie contents alone as verified identity.
- `middleware.ts` refreshes cookies for the applicant/auth paths. Refresh behavior, cookie exchange, callback, and recovery must still be integration-tested in the intended non-production runtime; this task ran mocked tests only.
- Authentication establishes an Auth principal, not a CYON member, parish affiliation, membership approval, platform role, or reviewer permission.
- Registration must not create `members` or `user_accounts`. Applicants receive no `PLATFORM_ADMIN`, executive, reviewer, or membership privilege by registering.
- Do not use the service-role client for applicant ownership checks. Any future privileged persistence path requires a separate server-side authorization design and is outside this specification.
- Return generic responses for account-sensitive registration and recovery outcomes. Do not include provider internals, tokens, passwords, email addresses, or confirmation/recovery URLs in logs or public errors.

## 6. Redirect and callback requirements

- Derive callback URLs from trusted environment configuration, not request `Host`, query parameters, or applicant input.
- Register exact local and non-production callback URLs in the applicable Supabase Auth redirect allowlist. Production configuration, if later approved, must use exact intended origins and paths rather than broad wildcards.
- The callback accepts only the confirmation/recovery flow labels, performs one PKCE exchange, calls `getUser()` and requires verified email, then redirects to a fixed internal path. The flow label selects only the destination; both paths rely on the one-time provider code and current-user verification. The provider-specific behavior must still be validated end to end.
- Failed callbacks must not retain an unverified or partial session. Clear/avoid session state when proof exchange fails and render a generic recovery/confirmation error.
- Confirmation and recovery email templates must point to the implemented callback path and use the provider variables required by the selected flow.

## 7. Abuse and privacy controls

- Supabase Auth's provider-level limits are a necessary control but do not substitute for application ingress protection if registration/recovery is later proxied by application routes.
- Before public enablement, verify effective per-IP Auth limits, confirmation/recovery resend limits, email sending quotas, CAPTCHA or an approved equivalent, and generic error behavior. Do not assume provider defaults or settings from local configuration are effective in the hosted project.
- Do not log passwords, access/refresh tokens, code verifiers, confirmation/recovery proof, email links, or applicant fields. Keep telemetry to correlation ID, operation category, outcome, and non-sensitive failure class.
- Email confirmation proves control of a mailbox under the configured flow; it does not establish civil identity, CYON membership, parish belonging, or eligibility.

## 8. Owner verification checklist — intended non-production project

Record the project name/reference and verification date in the project’s operational evidence record. Do not paste secrets or email links into the repository or chat.

### Hosted Supabase Dashboard — must be inspected by the project owner

- [ ] Confirm the Dashboard project is the intended non-production CYON Connect project; record its project reference and environment label.
- [ ] Enable new email/password sign-ups for that project only when the application flow is ready to be tested.
- [ ] Require email confirmation before an Auth identity is treated as an eligible prospective applicant; verify email autoconfirm is disabled. This is essential because Supabase can implicitly mark email confirmed when the confirmation requirement is disabled.
- [ ] Confirm email/password provider is enabled and configured for the intended sign-in method.
- [ ] Configure a supported email sender. Test confirmation and recovery delivery to an authorized non-production mailbox; confirm sender, delivery, link origin, and expiry behavior. The built-in sender has restrictions and is not suitable evidence of production deliverability.
- [ ] Set Site URL and exact allowed redirect URLs for the local/non-production callback and recovery paths. Confirm the provider accepts both generated callback query variants (`flow=confirmation` and `flow=recovery`) and no untrusted or unrelated origin is allowed. The owner-reported hosted list contains the callback path without these query variants; actual matching remains to be verified.
- [ ] Inspect and record effective limits for signup/sign-in, confirmation resend, verification, recovery, and outbound email. Verify behavior after limits are reached.
- [ ] Inspect CAPTCHA/bot protection settings and enable the approved protection before public signup. Confirm how the chosen challenge is enforced by the provider; do not add a client-only cosmetic challenge.
- [ ] Review Auth email templates for confirmation and recovery so they reach the implemented callback paths and do not expose secrets in logs or analytics.
- [ ] Inspect applicable session/refresh-token settings and record them for integration testing; verify logout, expiry, refresh, and revoked/invalid session behavior.

### Locally inspectable repository settings

- [x] `supabase/config.toml` identifies local project configuration as `cyon-connect-security-test-local`; CLI parsing/runtime validation remains unverified because local containers could not be inspected and `supabase start` has no dry-run mode.
- [x] Local Auth config now sets `enable_signup = true`, `enable_confirmations = true`, Site URL `http://localhost:3000`, and exact callback/reset redirects for `localhost` and `127.0.0.1`.
- [x] Local configuration declares no custom SMTP, CAPTCHA, or effective rate-limit values; built-in local email capture and effective behavior were not exercised in this implementation task.
- [x] Public environment schema exposes only `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The trusted callback origin must use validated application configuration; never expose service-role credentials.
- [x] Registration, callback, recovery, protected applicant access, and scoped middleware now exist locally; no membership-application submission route or persistence exists.

Local files cannot establish the hosted Dashboard's signup, confirmation, mail, redirect, rate-limit, CAPTCHA, or session settings. Do not infer that configuration from an SDK dependency or a local TOML value.

## 9. Implementation gates and acceptance evidence

Local Auth and Stage 2 form access exist. Before enabling server-side application submission/persistence or reviewer access, demonstrate:

1. Signup creates only an Auth identity and leaves `members` and `user_accounts` unchanged.
2. Email confirmation delivery and callback succeed in the intended non-production environment; unconfirmed, expired, malformed, and replayed proofs deny access.
3. Existing-email registration and recovery responses do not reveal account existence.
4. Callback URLs cannot redirect outside the configured application origin.
5. A future applicant operation obtains owner identity only through server-side `getUser()`; missing session, invalid/expired session, provider error, and unconfirmed email deny.
6. Authenticated applicants do not pass the current member identity or authorization gates merely because Auth registration succeeded.
7. Recovery changes only the same Auth principal's password and creates no member/account/role changes.
8. Rate limiting and CAPTCHA behavior are verified in the intended environment; sensitive values and links do not appear in output/logs.

Until the applicable checks and Stage 3 gates pass, do not submit or persist applicant membership-application PII on the server or expose it to reviewers. Stage 2 form data remains in temporary browser memory only. This Auth implementation adds no membership application persistence, reviewer permissions, duplicate screening, approval, member/account creation, or activation.

## 10. External provider references

- [Supabase Auth general configuration](https://supabase.com/docs/guides/auth/general-configuration) — signup and Confirm Email settings.
- [Supabase redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls) — Site URL and allowed redirect behavior.
- [Supabase SSR authentication](https://supabase.com/docs/guides/auth/server-side) — cookie-backed server-side sessions and PKCE guidance.
- [Supabase password-based Auth](https://supabase.com/docs/guides/auth/passwords) — signup, password sign-in, recovery, and email delivery requirements.
- [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits) — endpoint and email limits.
- [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) — delivery configuration and provider limitations.
