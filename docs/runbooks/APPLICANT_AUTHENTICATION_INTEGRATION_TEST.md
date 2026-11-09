# Applicant Authentication Integration Test Runbook

## Purpose and safety boundary

Use this runbook for one controlled, non-production browser test of applicant authentication. The only permitted hosted target is the Supabase project `cyon-connect-security-test` (`crfcglxcsnmeovnipnko`). Do not link, migrate, query, or otherwise operate on the production project `cyon-connect` (`bpooqfgadtbyeduapwyi`). Do not create membership applications, members, accounts, or reviewer assignments.

The test uses one synthetic email address with an inbox the operator can access, one registration confirmation, and one password-recovery message. Keep at least one hour between any additional email sends because the hosted project has a reported limit of two emails per hour. Do not retry email actions just to repeat a successful result.

## Recorded hosted manual results

The project owner reported that the following manual flow completed against the authorized non-production project `cyon-connect-security-test` (`crfcglxcsnmeovnipnko`). The report was received on 8 November 2026; the date on which the browser test itself was performed was not supplied. These are owner-reported observations, not automated test results or an independent database inspection.

| Test                                  | Owner-reported observed result                                               |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| Applicant registration                | Successful                                                                   |
| Confirmation email delivered to Gmail | Successful                                                                   |
| Confirmation link opened              | Successful                                                                   |
| PKCE callback                         | Successful; arrival at the verified applicant page was the reported evidence |
| Verified applicant sign-in            | Successful                                                                   |
| Protected `/applicant` access         | Successful                                                                   |
| Password recovery email               | Successful                                                                   |
| Password update                       | Successful                                                                   |
| Sign-in using the new password        | Successful                                                                   |

The report did not establish that database records were independently inspected, that sign-in with the old password was tested, or that every security and abuse-control requirement was verified. It does not establish production readiness. CAPTCHA/Attack Protection and effective hosted abuse limits remain separate configuration checks. The earlier local production-target mismatch was subsequently addressed; it is not evidence that this manual test targeted production.

## 1. Prepare and verify local configuration

In the project directory, update the ignored local `.env.local` using values copied directly from the **development/test** project's Dashboard. Do not paste keys into chat, documentation, terminal commands, or logs.

Required values:

- `NEXT_PUBLIC_APP_URL=http://localhost:3000`
- `NEXT_PUBLIC_SUPABASE_URL=https://crfcglxcsnmeovnipnko.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: the public/publishable key from that same test project.

The applicant-authentication flow needs only the public key. Do not put a service-role key in browser code or use it for applicant Auth. If a service-role value exists in `.env.local`, keep it server-only and do not invoke admin-backed routes during this test. The current public URL and key must both come from the test project's Dashboard; a publishable key may not encode a project reference that can be checked locally.

Run this PowerShell preflight. It prints only the resolved project reference and whether a public key is present; it does not print the URL or key:

```powershell
$expectedRef = 'crfcglxcsnmeovnipnko'
$url = $env:NEXT_PUBLIC_SUPABASE_URL
if (-not $url -and (Test-Path .env.local)) {
    $line = Get-Content .env.local | Where-Object { $_ -match '^\s*NEXT_PUBLIC_SUPABASE_URL\s*=' } | Select-Object -Last 1
    if ($line -match '^\s*NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.*)$') {
        $url = $Matches[1].Trim().Trim('"').Trim("'")
    }
}
if (-not $url) { throw 'NEXT_PUBLIC_SUPABASE_URL is missing.' }
$uri = [uri]$url
$actualRef = $uri.Host -replace '\.supabase\.co$', ''
if ($uri.Scheme -ne 'https' -or $actualRef -ne $expectedRef) {
    throw "Refusing test: expected project $expectedRef; resolved project $actualRef."
}
$keyInFile = $false
if (Test-Path .env.local) {
    $keyInFile = Select-String -Path .env.local -Pattern '^\s*NEXT_PUBLIC_SUPABASE_ANON_KEY\s*=' -Quiet
}
$keyPresent = [bool]($env:NEXT_PUBLIC_SUPABASE_ANON_KEY -or $keyInFile)
if (-not $keyPresent) { throw 'NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.' }
"Target verified: $actualRef; public key present (value withheld)."
```

The preflight cannot prove that the public key belongs to the URL. Confirm both values were copied from the same Dashboard project. If any check fails, stop. Do not start Next.js or attempt a hosted request. `next dev` also enforces the fixed test-project URL, but the preflight is required before use.

Run local mocked negatives without sending email:

```powershell
npm test -- tests/applicant-auth
```

These tests cover generic registration/recovery responses, invalid and replayed callback codes, fixed redirects, verified-email enforcement, unauthenticated access, and that password updates act on the current Auth identity only. They do not prove hosted delivery or hosted settings.

## 2. Start the local application

After the target preflight passes, start the local Next.js server:

```powershell
npm run dev
```

Use `http://localhost:3000` only. Do not use a production URL, Supabase CLI link/deploy/migration command, SQL Editor, service-role client, or database operation for this test.

Use a new synthetic address at a test mailbox controlled by the operator and a unique strong test password. Do not use a real member's address or an existing account. Do not place the password, email link, authorization code, or tokens in logs, screenshots, or chat.

## 3. Registration, unverified denial, and confirmation

1. Open `http://localhost:3000/applicant/register` and submit the synthetic email and test password once.
2. Confirm the UI displays the generic registration response. A success response does not prove message delivery.
3. Before opening the message, visit `http://localhost:3000/applicant`. It must redirect to applicant sign-in; no application or member content should appear. This tests the unverified/no-session boundary for the newly registered identity.
4. Open the single confirmation email in the controlled test mailbox. Check that its link uses the approved localhost callback. Do not copy the code into a log or share the link.
5. Open the link once. The callback must exchange its one-time PKCE code, call server-side `getUser()`, require confirmed email, and redirect to the fixed applicant sign-in destination.
6. Re-open the already-used confirmation link once to check replay handling. It must show the generic invalid/expired result and must not redirect to an external destination.
7. In the browser, visit `/auth/callback?code=invalid-test-code&flow=confirmation&next=https%3A%2F%2Fexample.invalid`. Expect the fixed local failure destination, not `example.invalid`. Do not use a real confirmation code in this negative test.

If delivery fails, stop. Do not repeatedly request signup or resend confirmation. Record the time and sanitized outcome only; check Dashboard/provider delivery configuration before another attempt.

## 4. Verified sign-in and protected applicant page

1. At `/applicant/sign-in`, sign in with the confirmed synthetic identity.
2. Confirm `/applicant` displays the verified-applicant placeholder and no membership-application data. It must not show the existing member identity shell.
3. In a separate private browser window with no session, visit `/applicant`; it must redirect to sign-in.
4. Do not test by changing client-supplied user IDs. The applicant routes derive identity from the current server-verified Auth session and have no application records to query.

## 5. Password recovery and password change

1. Sign out from the applicant page.
2. At `/auth/reset-password`, submit the synthetic account email once. Expect the same generic acknowledgement used for an unknown account; do not infer account existence from response details.
3. Confirm one recovery message arrives and uses the fixed `/auth/callback?flow=recovery` route. Open it once; the callback must exchange the one-time code and redirect to `/auth/reset-password?mode=update`.
4. Set a new strong test password. The server must validate the current verified Auth user and call `updateUser` without accepting a target user ID.
5. Confirm the UI signs out and returns to applicant sign-in.
6. Try the old test password once; it must fail. Sign in with the new password; it must succeed. Do not repeat failed attempts.
7. Sign out and revisit `/applicant`; it must redirect to sign-in. This verifies client sign-out and server-side protected-page denial.

The hosted check for recovery account-enumeration behavior should use the same generic response for the known synthetic address and a synthetic unregistered address. The unregistered request should not send a message; do not repeat requests. Automated mocked test coverage exists in `tests/applicant-auth/routes.test.ts` and is the primary comparison if the hosted response behavior is ambiguous.

## 6. Negative checks and expected outcomes

| Check                            | Expected result                                  | Safe method                                                                                                   |
| -------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Unverified applicant access      | `/applicant` redirects to sign-in                | Visit before confirming the one test registration                                                             |
| Invalid/expired callback         | Fixed local failure route; no session grant      | Use a dummy code, never a real code                                                                           |
| Reused callback code             | Generic failure; no external redirect            | Re-open the consumed link once                                                                                |
| Unauthenticated access           | `/applicant` redirects to sign-in                | Private browser window or after sign-out                                                                      |
| Malformed redirect               | Redirect remains on configured app origin        | Add an external `next` parameter to a dummy callback URL                                                      |
| Recovery account enumeration     | Generic response regardless of account existence | Compare the one known and one unregistered synthetic-address request; rely on mocked tests if unclear         |
| Cross-user identity substitution | No caller-supplied ID selects another user       | Do not send a real user's ID; code tests verify `updateUser` receives only a password for the current session |

These routes do not implement membership-application ownership because application persistence is out of scope. Do not claim cross-user application isolation has been hosted-tested.

## 7. Stop conditions and evidence

Stop immediately if the resolved reference is not `crfcglxcsnmeovnipnko`, the test project's signup/confirmation or redirect settings are unclear, the callback leaves an unverified session, any redirect leaves localhost, an unexpected account/member/role side effect appears, or the email quota is at risk. Do not “fix” a failure by changing hosted settings during this test.

Record only: test date, confirmed project reference, synthetic test alias (or a masked label), each pass/fail result, sanitized error category, and whether confirmation/recovery mail arrived. Never record passwords, keys, tokens, callback codes, full mailbox links, or service-role values.

This runbook does not authorize production testing, membership application submission, member/account creation, reviewer access, or database changes. A successful run verifies only the tested hosted Auth flows and does not establish production readiness.
