# Netlify application URL and Supabase Auth configuration

## Scope

The canonical application origin for the CYON Connect Netlify site is:

`https://cyonssjoachimandanneijegun.netlify.app`

The previous Netlify origin is retired. The application does not contain it in active source or configuration. Local development continues to use `http://localhost:3000`.

The published Netlify branch is `development`, connected to `https://github.com/nwankwolinus/Cyon-connect`. This runbook does not change the deployment or hosted dashboard settings.

## Authentication URL behavior in the application

`NEXT_PUBLIC_APP_URL` is the single canonical application-origin setting. It is required by the public environment schema; there is no localhost fallback. The URL builder uses the configured origin and fixed internal paths, so a base path or trailing slash cannot create duplicate path separators. Callback query parameters supplied by a visitor are not used as redirect destinations.

The flows are:

1. Applicant registration sends the Supabase confirmation email to `/auth/callback?flow=confirmation` using `NEXT_PUBLIC_APP_URL`.
2. The callback exchanges the one-time PKCE code (or validates the confirmation token hash), verifies the Auth user server-side, and redirects to `/applicant/registration-confirmed` on success. Invalid, expired, or unconfirmed callbacks go to a fixed local error destination.
3. Recovery calls `resetPasswordForEmail` with `/auth/callback?flow=recovery` using the same setting.
4. The callback exchanges the one-time PKCE code into the server cookie session and redirects to `/auth/reset-password?mode=update`. That page requires the verified current Auth user. The update endpoint changes that current user's password, then the browser signs out and returns to applicant sign-in.

`/auth/reset-password` is an application destination reached after the callback; it is not passed as a Supabase `redirectTo` URL by the current code. The Supabase allowlist therefore needs the callback destinations. Local reset URLs remain in the local project's configuration for local use.

## Netlify site configuration to verify

In the new site's Project configuration, verify that the production branch is `development` and automatic publishing is enabled. Configure the following values in the Netlify UI for the context that builds the published deployment (normally **Production** when `development` is the production branch). If the deployment is instead a branch deploy, set the `Branch: development` contextual values. Ensure no more-specific context overrides them. Set values for both build and function/runtime scopes, or the default all-scopes setting. Redeploy after saving so public `NEXT_PUBLIC_*` values are present in the built application.

| Variable | Value or source | Handling |
| --- | --- | --- |
| `APP_ENV` | `development` for this non-production test project; the application currently enables applicant registration and membership submission only in development. | Non-secret. Keep the database scripts' production-runtime guards intact. |
| `NEXT_PUBLIC_APP_URL` | `https://cyonssjoachimandanneijegun.netlify.app` | Public; exact origin, no trailing path. |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://crfcglxcsnmeovnipnko.supabase.co` | Public URL for `cyon-connect-security-test` only. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The publishable/anon key copied from the `cyon-connect-security-test` project dashboard. | Public key, but it must belong to the URL above. |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key copied from the same `cyon-connect-security-test` project dashboard. | Secret; server/functions only. Never use the production project's key or expose this value in client scope. |
| `CYON_ACTIVE_PARISH_ID` | The verified SS Joachim and Anne parish UUID in the same test project, if membership operations requiring it are enabled. | Server-only. Do not guess or copy a production UUID. |

`APPLICANT_REGISTRATION_ENABLED` and `MEMBERSHIP_APPLICATION_SUBMISSION_ENABLED` default to `false`. Preserve their current Netlify values; this URL migration does not authorize enabling either feature. If applicant registration is intended to remain enabled on this test site, the existing registration gate requires `APP_ENV=development` and an explicitly authorized `APPLICANT_REGISTRATION_ENABLED=true`. Membership submission has its own existing development-only and feature-flag gates. Do not change those flags as part of this URL migration.

`MEMBERSHIP_PHOTO_CLEANUP_HMAC_SECRET` is an optional server-only value for the scheduled photo-cleanup endpoint; configure it only if that endpoint is being operated. No secret value belongs in this repository or this runbook.

## Supabase dashboard changes for the test project

In Supabase project **`cyon-connect-security-test`**, reference **`crfcglxcsnmeovnipnko`**, open Authentication URL Configuration. Do not open or modify the production project `cyon-connect` (`bpooqfgadtbyeduapwyi`).

Set **Site URL** to:

`https://cyonssjoachimandanneijegun.netlify.app`

Add these exact production redirect URLs:

```text
https://cyonssjoachimandanneijegun.netlify.app/auth/callback?flow=confirmation
https://cyonssjoachimandanneijegun.netlify.app/auth/callback?flow=recovery
```

Retain these localhost entries in **Additional Redirect URLs** for local development:

```text
http://localhost:3000/auth/callback
http://localhost:3000/auth/callback?flow=confirmation
http://localhost:3000/auth/callback?flow=recovery
http://localhost:3000/auth/reset-password
http://127.0.0.1:3000/auth/callback
http://127.0.0.1:3000/auth/callback?flow=confirmation
http://127.0.0.1:3000/auth/callback?flow=recovery
http://127.0.0.1:3000/auth/reset-password
```

Do not add a broad Netlify wildcard for this fixed site. The implementation passes only the two callback URLs above to Supabase. The later password-update URL is generated inside the application, not supplied as a provider redirect.

For the hosted signup confirmation email template, ensure the link honors Supabase's per-request redirect (`.RedirectTo`) and appends the confirmation token hash as the local template does. Do not hard-code either Netlify hostname in the template. For the recovery template, preserve Supabase's confirmation URL flow so its verification endpoint can return the user to the `redirectTo` callback requested by the application. Email delivery and template behavior must be confirmed in the test project; repository changes do not verify hosted settings.

## Repository references and verification limits

The `.env.example` keeps `NEXT_PUBLIC_APP_URL=http://localhost:3000` for local development and points operators to this runbook for the Netlify production-context value. Existing localhost occurrences in tests, local Supabase config, and the local authentication test runbook are intentional. The old Netlify origin is not present in active repository files.

This document records the required dashboard configuration; it is not evidence that Netlify or Supabase has been changed. Verify the project reference, deployment context values, Site URL, allowlist, and hosted email templates in their respective dashboards before an external authentication test.
