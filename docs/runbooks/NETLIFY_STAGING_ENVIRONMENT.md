# Netlify Staging Environment

This runbook covers a separate staging deployment using the CYON Connect security-test Supabase
project. It does not authorize changes to hosted Supabase settings or deployment configuration.

## Required deployment identity and target

Set `APP_ENV=staging` explicitly in the Netlify staging deploy context. Netlify/Next.js should manage
`NODE_ENV`; do not set `APP_ENV=development` to bypass staging restrictions.

For `APP_ENV=staging`, applicant registration and membership intake validate the configured
`NEXT_PUBLIC_SUPABASE_URL` against the exact project host
`crfcglxcsnmeovnipnko.supabase.co` before identity creation or membership write operations. Missing,
malformed, or any other URL fails closed. The public project URL and publishable key must both belong
to that project.

## Netlify variable checklist

Required for a functional staging deployment:

- `APP_ENV=staging`
- `NEXT_PUBLIC_APP_URL`: the staging site's canonical HTTPS origin, without a path
- `NEXT_PUBLIC_SUPABASE_URL`: `https://crfcglxcsnmeovnipnko.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: the publishable key for that same project
- `SUPABASE_SERVICE_ROLE_KEY`: the server-only service-role key for that same project
- `CYON_ACTIVE_PARISH_ID`: the UUID of the verified operational parish row in that project
- `APPLICANT_REGISTRATION_ENABLED`: `false` by default; set `true` only when staging Auth controls
  and email confirmation configuration are independently verified
- `MEMBERSHIP_APPLICATION_SUBMISSION_ENABLED`: `false` by default; set `true` only when the staging
  database, parish row, access restrictions, and privacy prerequisites are verified

Both feature flags remain opt-in. Production is not an eligible environment for either workflow,
even when a flag is `true`.

If scheduled passport-photo cleanup is enabled, also configure a unique staging
`MEMBERSHIP_PHOTO_CLEANUP_HMAC_SECRET` and the matching staging-only Supabase Vault values:

- `membership_photo_cleanup_url`: the staging site's protected cleanup endpoint URL
- `membership_photo_cleanup_hmac_secret`: the same secret as the Netlify server variable

Do not reuse production secrets. Keep cleanup scheduling disabled until the staging route and both
Vault values have been verified.

## Variables that do not belong in Netlify

Do not configure local database tooling or one-time operator credentials in the application
deployment:

- `DATABASE_URL`
- `SUPABASE_URL`
- `CYON_ALLOW_REMOTE_DESTRUCTIVE`
- `CYON_INITIAL_PLATFORM_ADMIN_HMAC_KEY_BASE64`

Do not use production Supabase credentials in any staging deploy context. Never expose
`SUPABASE_SERVICE_ROLE_KEY` or HMAC secrets through `NEXT_PUBLIC_*` variables.

## Current workflow limitation

Registration and draft/photo/submission intake are enabled only when `APP_ENV` is `development` or
`staging`, their respective feature flag is explicitly `true`, and staging target validation passes.
Production remains blocked by the application gates. Destructive database scripts separately reject
`APP_ENV=staging` and `APP_ENV=production`.

The application validates the staging target in server-side write gates. The deployed Netlify
environment itself is not verified by this runbook; confirm the deploy context, variable scopes,
Supabase Auth redirect allowlist, and each target value before enabling either flag.
