# CYON Connect --- Platform Admin Role & Identity Provisioning Authorization

**Document status:** Stakeholder approval recorded; traceable approval artifact and formal CYON governance verification unresolved

**Document type:** Stakeholder authorization record / operational audit evidence

**Actual repository path:** `docs/security/PLATFORM_ADMIN_PROVISIONING_AUTHORIZATION_EVIDENCE.md`

**Prepared on:** 15 October 2026

## 1. Purpose

This record is intended to document the stakeholder's authorization decision for provisioning the existing Supabase Auth user as the application identity and granting the `PLATFORM_ADMIN` role, along with the specified account, member, and parish linkages for CYON Connect.

## 2. Organization and reported preconditions

* **Organization:** SS Joachim and Anne Catholic Church, Ijegun

* **Organization type:** `parish`

* **Organization UUID (Parish ID):** `4e784b43-7c94-4dd7-a215-a4f4c6b88070`

* **Auth user ID:** `81e089b4-c59f-47f4-ab8c-f73cb34cdeea`

* **Account ID:** `03590e46-43ec-4f64-871c-ccf38c3a1d49`

* **Member ID:** `7da9d81d-9c03-46b7-b00d-1603d940db93`

* **Project reference:** `bpooqfgadtbyeduapwyi`

* **Evidence limitation:** These values were provided in the project context; this document does not independently verify current database state. Retain the actual query output or execution record that establishes the preconditions.

## 3. Authorization statement --- explicit approval granted

By completing the approval fields below, the authorizing stakeholder confirms that, within their actual authority and subject to Section 4, they authorize the operator to perform the identity provisioning operation and grant the `PLATFORM_ADMIN` role to the specified Supabase Auth user linked to the account, member, and parish identified above.

Execution is authorized only if all of the following remain true immediately before the operation:

1. The target Auth UUID, Account ID, Member ID, and Parish ID exactly match the values specified in Section 2 and the approved runbook.

2. The database-side provisioning and role-assignment procedures and their constraints have been inspected and understood.

3. The operation is executed once and its actual outcome is recorded in the audit record.

## 4. Authority basis and governance caveat

The project stakeholder has stated that they were the designated Technical Administrator Officer and were authorized to make the relevant project decisions while serving as CYON President and defining the project's requirements.

This is recorded as a **stakeholder attestation**, not independently verified evidence of formal CYON approval. This document must not be represented as a resolution or endorsement by the parish priest, parish council, CYON executive, or another authority unless such approval actually exists and is separately evidenced.

## 5. Scope and exclusions

### Intended scope, after approval

* Provisioning of the intended existing Auth user as an application identity.

* Linking the exact identity, account, member, and parish records specified in Section 2.

* Explicitly granting the `PLATFORM_ADMIN` role to the target user.

* Recording the genuine approval evidence reference and actual operation outcome in the private audit record.

### Not authorized by this record

* Changing the target Auth UUID, account UUID, or organization UUID to make the operation succeed without verification.

* Executing against a remote or production project unless that environment and operation have been separately authorized.

## 6. Approval details

The following records the stakeholder approval as stated. The traceable approval artifact is not attached or verified; see the evidence status below.

* **Authorizing stakeholder's full name:** Linus Nwankwo

* **Role/authority relied upon:** CYON President

* **Approval decision:** `APPROVED`

* **Approval date and time (with timezone):** 2nd February, 2025, 10:00 AM

* **Target Supabase Auth UUID:** `81e089b4-c59f-47f4-ab8c-f73cb34cdeea`

* **Target Account ID:** `03590e46-43ec-4f64-871c-ccf38c3a1d49`

* **Target Member ID:** `7da9d81d-9c03-46b7-b00d-1603d940db93`

* **Target Parish ID:** `4e784b43-7c94-4dd7-a215-a4f4c6b88070`

* **Project Reference:** `bpooqfgadtbyeduapwyi`

* **Runbook or change-record reference:** `docs/runbooks/INITIAL_IDENTITY_PROVISIONING.md`

* **Reason for provisioning:** Grant Platform Admin role and initialize application identity linkage.

* **Signature or traceable approval evidence:** **UNRESOLVED.** No valid traceable approval artifact is attached or referenced in this record. Do not treat this stakeholder attestation as independently verified formal CYON approval.

## 7. Execution record --- complete only after separately approved execution

**Execution status:** `NOT EXECUTED` — according to the latest owner-reported database verification, there is no active `PLATFORM_ADMIN` assignment and bootstrap remains open. This documentation update did not independently query or verify the database.

* **Intended execution environment/project:** `bpooqfgadtbyeduapwyi`

* **Execution date and time (with timezone):** Not applicable — not executed.

* **Operator:** Not applicable — not executed.

* **Provisioning procedure/function invoked:** Not applicable — not executed.

* **Operation/correlation ID:** Not applicable — not executed.

* **Result:** `NOT EXECUTED`

* **Database audit-event reference:** Not applicable — not executed.

* **Verification evidence location:** Not applicable — not executed.

* **Confirmation that `PLATFORM_ADMIN` assignment was successfully applied:** `NO` — latest owner-reported verification states no active assignment exists.

## 8. Audit-reference handling

The current repository path for this record is:
`docs/security/PLATFORM_ADMIN_PROVISIONING_AUTHORIZATION_EVIDENCE.md`

This file is currently untracked in the local repository. Its presence and approval fields do not establish that it is a formally controlled record or independently verify formal CYON approval. The path must not be used as bootstrap approval evidence until the missing traceable artifact is supplied and reviewed, and any required CYON governance approval is verified. Do not substitute an identity-provisioning record for the platform-admin grant approval.

## 9. Final authorization checklist

* \[ \] Traceable approval artifact has been supplied and verified.

* \[ \] Any required independent/formal CYON governance approval has been verified.

* \[x\] The stakeholder approval decision is recorded as `APPROVED`.

* \[ \] The record's traceable approval evidence is complete and verified.

* \[x\] The exact target Auth UUID, Account ID, Member ID, and Parish ID are recorded here; their values were not independently verified by this document.

* \[x\] The organization identity preconditions have been rechecked.

* \[x\] The actual provisioning procedure has been reviewed.

* \[x\] The target environment has been confirmed.

* \[x\] The operation includes the authorized `PLATFORM_ADMIN` grant.

* \[x\] Abort conditions and audit-recording behaviour are understood.

* \[x\] Execution status is accurately recorded as not executed, based on the latest owner-reported verification.
