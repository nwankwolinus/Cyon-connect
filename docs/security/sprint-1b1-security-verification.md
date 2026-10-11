# Sprint 1B.1 — Supabase Security Verification

## Environment

* Target: Disposable Supabase security-test project
* Project ref: nvjqcfezxknrifjbeeig
* Original DEV project: bpooqfgadtbyeduapwyi
* Production: Not targeted
* Scope: Identity foundation, RLS, grants, authenticated API access, and parish isolation

## Verified checks

|Check|Result|Evidence|
|-|-|-|
|Both migrations deployed to disposable project|PASS|Local and remote migration versions matched|
|RLS enabled on org\_units, members, user\_accounts|PASS|Read-only PostgreSQL inspection|
|Expected SELECT policies present|PASS|Read-only policy inspection|
|Authenticated SELECT grants present|PASS|Read-only grants inspection|
|Anonymous API read of user\_accounts|PASS|HTTP 401|
|Tested authenticated write attempts|PASS|Tested PATCH, POST and DELETE attempts were denied|
|User A reads own account and membership|PASS|Authenticated API test|
|User B reads own account and membership|PASS|Authenticated API test|
|Suspended User C cannot read membership or organisation units|PASS|Authenticated API test|
|User A sees only the original parish|PASS|Authenticated API test|
|User D sees only CYON Security Test Parish B|PASS|Authenticated API test|

## Test fixtures

Synthetic test identities A, B, C and D were used in the disposable project.

Second test parish:

* Name: CYON Security Test Parish B
* ID: 12eda499-5f67-4d6f-b080-af102d384b07

User D test member ID:

* 18554cd6-68a8-447c-97b3-25f0d59ebb58

Original parish:

* Name: SS Joachim and Anne Catholic Church, Ijegun
* ID: 2ba858fc-a1bc-448f-9d09-7249d59457f5

## Outstanding checks

* Direct-read isolation for members and user\_accounts across different users
* Additional negative tests for inactive membership and account states
* Review of any remaining access paths required by the security requirements
* Change exposed synthetic test passwords
* Remove synthetic test records and the second parish after testing
* Final post-cleanup verification

## Limitations

These results cover only the cases explicitly tested in the disposable project.
They do not establish that every role, table, API endpoint or application workflow is secure.
No production security changes were made as part of these tests.



\## Additional verification results



| Check | Result | Evidence |

|---|---|---|

| Cross-user account isolation | PASS | Users A and B could not read each other's account records |

| Cross-user membership isolation | PASS | Users A and B could not read each other's membership records |

| Cross-parish isolation | PASS | Users A and D each saw only their own parish |

| Suspended account behaviour | PASS for tested restrictions | User C could read their own account row but could not read memberships or organisation units |

| Inactive membership behaviour | FINDING | User B could still read their membership row when membership\_status was temporarily set to inactive |

| Physical deletion protection | PASS | The database rejected deletion from user\_accounts; the cleanup transaction rolled back |



\## Findings and follow-up



\- The members SELECT policy checks that the linked account is active, but the inactive-membership test showed that an inactive member could still read their own membership row. Confirm the intended access rules against the security requirements and update the policy if inactive members should not have access.

\- The suspended account could read its own user\_accounts row. Confirm that this is the intended behaviour.

\- The attempted cleanup was rejected by the prevent\_delete() trigger. A subsequent read-only check confirmed that all four synthetic application accounts, four memberships, and the test parish remained present. The original parish also remained present.

\- The disposable project is scheduled for deletion and recreation to remove test fixtures without bypassing database deletion safeguards.



\## Remaining checks



\- Review any remaining access paths required by the security requirements.

\- Re-run applicable tests after any policy changes.

\- Verify the schema, grants, policies, and migration versions in the recreated disposable project.

\- Perform final verification after recreating the test environment.



\## Limitations



These results cover only the cases explicitly tested in the disposable project. They do not establish that every role, table, API endpoint or application workflow is secure. No production security changes were made as part of these tests.

