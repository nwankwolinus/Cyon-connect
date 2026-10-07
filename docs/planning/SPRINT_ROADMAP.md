# Sprint Roadmap (proposed; not stakeholder-approved)

Development is part-time, so each sprint has one narrow goal and a demonstrable increment. Mobile (React Native/Expo) is deliberately excluded until the web/backend foundation and core workflows are stable.

| Sprint | Goal                                                           | Demonstrable increment                                                                                                                                    |
| ------ | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0      | Repository, architecture and engineering foundation            | Repo builds; docs and traceability exist                                                                                                                  |
| 1A     | Architectural foundation and infrastructure hardening          | Module-first structure, Supabase clients, DB baseline and safety, health/readiness, boundary enforcement, security and CI baseline (no business features) |
| 1B     | Application shell, authentication and identity data foundation | Sign-in/out, protected route, account/member/org-unit tables, account status checks (needs ADR-007 approval)                                              |
| 2      | Membership registration, approval and member profiles          | Apply, duplicate flag, approve, profile                                                                                                                   |
| 3      | RBAC and executive administration hardening                    | Assignments, time-bound permissions, deny-by-default tests                                                                                                |
| 4      | Attendance sessions, QR and manual attendance                  | Session, QR scan, manual mark                                                                                                                             |
| 5      | Monthly dues and payment allocation                            | Obligations and allocation (needs open decisions 1, 2)                                                                                                    |
| 6      | Financial records and reconciliation                           | Ledger, correction/reversal by Financial Secretary only                                                                                                   |
| 7      | Events, RSVP and announcements                                 | Event lifecycle, RSVP, announcements                                                                                                                      |
| 8      | Social community and moderation                                | Feed, reports, moderation                                                                                                                                 |
| 9      | Messaging and notifications                                    | 1:1/group messaging (needs decision 4), notifications                                                                                                     |
| 10     | Faith formation and welfare                                    | Activities; restricted welfare cases                                                                                                                      |
| 11+    | Web integration, reporting, hardening, UAT, release            | Reports, UAT, release                                                                                                                                     |
| Later  | Mobile app                                                     | After agreed web/backend stability                                                                                                                        |

Note: FRS §24.2 lists expanded notifications, enhanced faith formation and expanded welfare as Phase 2. Sprints 9–10 must stay at MVP depth unless scope is formally changed (FR-CC-006).
