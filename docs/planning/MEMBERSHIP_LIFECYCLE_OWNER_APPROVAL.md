# Membership Lifecycle Owner Approval Record

## Approval record

- **Approval date:** 22 October 2026
- **Approver:** Project Owner; the person's name is not identified in the local project records.
- **Approval type:** Development-planning approval and owner-declared formal CYON policy / FRS baseline approval.
- **Source:** The Project Owner's explicit approval communicated in the CYON Connect project conversation on 22 October 2026.
- **Rationale:** The Project Owner stated that CYON has no policy document currently in use and that the project documents created for CYON Connect are intended to guide development of the secured software.

The Project Owner approved all recommended decisions AUTH-01 through AUTH-15. The repository does not contain those AUTH identifiers. Its current decision register uses MLD-01 through MLD-15. To avoid inventing identifiers or asserting an unsupported one-to-one mapping, this approval is recorded against the exact current recommendation text for MLD-01 through MLD-15. The scope is the recommendation and its stated conditions/limitations, not an unstated expansion of it.

| Repository decision | Approved subject and recommendation scope                                                                                                                                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MLD-01              | Applications are durable records independent of members/accounts; create new member identities only after approval.                                                                                                                                                                                                          |
| MLD-02              | Associate an application to an existing member only after authorized review; similarity alone is insufficient; no merge, relink, or identity mutation.                                                                                                                                                                       |
| MLD-03              | Rejection is an application outcome; resubmission creates a linked application and preserves history; do not add a rejected membership status or impose an unapproved successor limit.                                                                                                                                       |
| MLD-04              | Resolve a potential existing-member match before final approval; possible or insufficient evidence blocks final approval and member creation/association.                                                                                                                                                                    |
| MLD-05              | Use authorized human resolution with attributable, scoped, data-minimized rationale/evidence; do not invent an identifier, threshold, matching algorithm, or external verification.                                                                                                                                          |
| MLD-06              | Keep approval, member creation/association, business review history, and required audit writes in one PostgreSQL transaction where they share that boundary; failures roll back; external effects are post-commit.                                                                                                           |
| MLD-07              | A new member is `active` as approved membership only; account activation remains separate and must gate access as required. Do not implicitly change an existing member's status or account/identity links.                                                                                                                  |
| MLD-08              | Store current application outcome with append-only business review history; update consistently with stale-state protection. Keep business history distinct from the security audit log.                                                                                                                                     |
| MLD-09              | An application has zero or one current resolved member association; retain historical applications/associations; correct an erroneous association only through an attributable authorized process without changing member/account identity links.                                                                            |
| MLD-10              | Use operation-scoped idempotency bound to payload, reject key/payload conflicts, and protect concurrent decisions/member creation with current-state checks and database transaction safeguards.                                                                                                                             |
| MLD-11              | Apply action-specific permissions, server-side authorization, default deny, and explicit parish scope. Secretary handles routine review; President has final authority for escalated/disputed cases under the approved project policy; other executives and `PLATFORM_ADMIN` receive no implied membership-review authority. |
| MLD-12              | Minimize applicant data; protect it separately from stable member identity; scope applicant, reviewer, history, and audit access explicitly. Do not infer privacy compliance or unrestricted access from a role.                                                                                                             |
| MLD-13              | Keep membership approval, member status, Auth identity, and account activation distinct; activation is a separate controlled system workflow.                                                                                                                                                                                |
| MLD-14              | Commit required audit writes with successful business-state changes in the same database transaction; preserve separate handling for denied attempts; no rolled-back transaction is claimed to retain its own audit insert.                                                                                                  |
| MLD-15              | Record the Project Owner's approval of CYON-FRS-001 v1.0 and the lifecycle policy/design baseline, with the authority-evidence qualification below.                                                                                                                                                                          |

## Conditions and limitations

- This record is evidence of the Project Owner's approval as communicated in the project conversation. It is not a fabricated signature, meeting record, board resolution, or separate external artifact.
- The Project Charter §20 identifies the Parish Priest / Youth Chaplain and CYON Leadership as the Project Sponsor / Organisational Authority and states that they approve major project decisions. FRS §28 says formal baseline approval is to be obtained from appropriate CYON stakeholders. The local records do not name the Project Owner or establish whether the owner acted in that charter-defined capacity. The approval is therefore recorded as **owner-declared formal approval; alignment of the approver's capacity with the Charter authority is not independently evidenced in the repository**.
- Approval does not claim implementation, test execution, deployed database behavior, or operational verification.
- Exact duplicate-screening data/evidence, review permissions and scope identifiers, application representation, database constraints, account-activation details, audit retention/readers/masking, and denied-event reliability must be specified and enforced before their respective features ship. The approval does not authorize guessing these details.
- The approved `active` membership status does not activate an account or, by itself, grant application access. Any access path must enforce the separately approved account-activation gate.

## Requirements baseline status

The Project Owner declared CYON-FRS-001 v1.0 approved as the development requirements baseline and declared formal CYON policy/FRS approval on 22 October 2026. This record is the local record of that declaration. The FRS remains subject to the authority qualification above because the project documents identify the organizational approval roles but do not identify the Project Owner by name or demonstrate the owner's capacity relative to those roles. No requirement text or identifier has been changed by this approval record.

## Related records

- [Membership Lifecycle Decision Resolution](MEMBERSHIP_LIFECYCLE_DECISION_RESOLUTION.md)
- [Membership Lifecycle Contract Specification](MEMBERSHIP_LIFECYCLE_CONTRACT_SPEC.md)
- [Membership Application Data Model](../architecture/MEMBERSHIP_APPLICATION_DATA_MODEL.md)
- [Open Decisions](OPEN_DECISIONS.md)
- [Requirements Traceability](REQUIREMENTS_TRACEABILITY.md)
