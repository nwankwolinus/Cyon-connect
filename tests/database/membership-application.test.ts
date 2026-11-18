import { describe, expect, it } from "vitest";
import { as, freshDb, seed, type Db } from "../support/db";

let db: Db;

async function prepareDraftPhoto(ownerId: string, parishId: string): Promise<string> {
  const existingDraft = await db.query<{ id: string }>(
    "select id from membership_private.application_drafts where applicant_auth_id=$1",
    [ownerId],
  );
  const draftId =
    existingDraft.rows[0]?.id ??
    (
      await db.query<{ id: string }>(
        `insert into membership_private.application_drafts
         (applicant_auth_id, org_unit_id, applicant_payload, active_step, last_activity_at, expires_at)
       values ($1,$2,'{}',9,now(),now()+interval '30 days') returning id`,
        [ownerId, parishId],
      )
    ).rows[0]!.id;
  const photoId = (await db.query<{ id: string }>("select gen_random_uuid() as id")).rows[0]!.id;
  await db.query(
    `insert into membership_private.application_photos
       (id, applicant_auth_id, draft_id, object_path, content_type, byte_size, state, verified_at)
     values ($1,$2,$3,$4,'image/jpeg',100,'draft',now())`,
    [photoId, ownerId, draftId, `${ownerId}/${draftId}/${photoId}.jpg`],
  );
  await db.query(
    "update membership_private.application_drafts set passport_photo_id=$2 where id=$1",
    [draftId, photoId],
  );
  return photoId;
}

async function createSubmittedApplication() {
  const ownerId = await seed.authUser(db);
  const parishId = await seed.parishId(db);
  const inserted = await db.query<{ id: string; public_reference: string }>(
    `insert into membership_private.applications
       (applicant_auth_id, org_unit_id, status, submitted_at)
     values ($1, $2, 'submitted', now()) returning id, public_reference`,
    [ownerId, parishId],
  );
  return { ownerId, parishId, ...inserted.rows[0]! };
}

describe("membership application foundation migration", () => {
  it("installs independent scheduled expiry cleanup without relying on applicant visits", async () => {
    db = await freshDb();
    const job = await db.query<{ job_name: string; schedule: string; command: string }>(
      "select * from cron.test_jobs where job_name = $1",
      ["cyon-expire-membership-application-drafts"],
    );
    expect(job.rows[0]).toMatchObject({
      job_name: "cyon-expire-membership-application-drafts",
      schedule: "* * * * *",
    });
    expect(job.rows[0]?.command).toContain("purge_expired_application_drafts");
  }, 60_000);

  it("stores resumable drafts privately, excludes DOB, and resets the server expiry on save", async () => {
    db = await freshDb();
    const ownerId = await seed.authUser(db);
    const parishId = await seed.parishId(db);
    await db.query("update auth.users set email_confirmed_at = now() where id = $1", [ownerId]);
    const emptyOverview = await as(db, "service_role", null, () =>
      db.query<{ result: Record<string, unknown> }>(
        "select public.get_my_membership_application_overview($1,$2,$3) as result",
        [ownerId, parishId, "72166bd6-ef2b-42b4-bbd6-04b02653fac5"],
      ),
    );
    expect(emptyOverview.rows[0]?.result).toEqual({
      application: null,
      draft: null,
      expiredDraftDisposed: false,
    });
    expect(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from public.user_accounts where auth_user_id=$1",
          [ownerId],
        )
      ).rows[0]?.count,
    ).toBe(0);
    const save = (payload: unknown, step: number, expected: string | null) =>
      db.query<{ result: Record<string, unknown> }>(
        "select public.save_membership_application_draft($1,$2,$3,$4,$5,$6) as result",
        [ownerId, parishId, payload, step, expected, "27b23654-16c9-4c50-8d35-8b44ef42b123"],
      );
    const first = await as(db, "service_role", null, () =>
      save({ firstName: "Synthetic" }, 2, null),
    );
    const firstResult = first.rows[0]!.result;
    expect(firstResult.activeStep).toBe(2);
    expect(firstResult.expiresAt).toBeTruthy();
    const persisted = await db.query<{ payload: unknown }>(
      `select applicant_payload as payload from membership_private.application_drafts
       where applicant_auth_id=$1`,
      [ownerId],
    );
    expect(persisted.rows[0]).toEqual({ payload: { firstName: "Synthetic" } });
    expect(
      (
        await db.query<{ count: number }>(
          "select count(*)::int from membership_private.applications where applicant_auth_id=$1",
          [ownerId],
        )
      ).rows[0]?.count,
    ).toBe(0);
    const ownOverview = await as(db, "service_role", null, () =>
      db.query<{ result: Record<string, unknown> }>(
        "select public.get_my_membership_application_overview($1,$2,$3) as result",
        [ownerId, parishId, "72166bd6-ef2b-42b4-bbd6-04b02653fac4"],
      ),
    );
    expect(ownOverview.rows[0]?.result.application).toBeNull();
    expect(ownOverview.rows[0]?.result.draft).toMatchObject({ activeStep: 2 });
    expect(ownOverview.rows[0]?.result.draft).not.toHaveProperty("payload");

    const next = await as(db, "service_role", null, () =>
      save({ firstName: "Synthetic", surname: "Applicant" }, 3, String(firstResult.updatedAt)),
    );
    expect(next.rows[0]?.result.activeStep).toBe(3);
    expect(next.rows[0]?.result.updatedAt).not.toBe(firstResult.updatedAt);
    await expect(
      as(db, "service_role", null, () =>
        save({ firstName: "Stale" }, 1, String(firstResult.updatedAt)),
      ),
    ).rejects.toThrow(/draft_version_conflict/i);
    const otherOwner = await seed.authUser(db);
    await db.query("update auth.users set email_confirmed_at = now() where id = $1", [otherOwner]);
    const isolatedRead = await as(db, "service_role", null, () =>
      db.query<{ result: unknown }>(
        "select public.get_membership_application_draft($1,$2,$3) as result",
        [otherOwner, parishId, "72166bd6-ef2b-42b4-bbd6-04b02653fac4"],
      ),
    );
    expect(isolatedRead.rows[0]?.result).toBeNull();
    await expect(as(db, "authenticated", ownerId, () => save({}, 0, null))).rejects.toThrow(
      /permission denied/i,
    );
    await expect(
      as(db, "service_role", null, () => save({ nested: { dateOfBirth: "2000-01-01" } }, 1, null)),
    ).rejects.toThrow(/draft_payload_invalid/i);
  }, 60_000);

  it("deletes expired draft payloads and records payload-free disposal", async () => {
    db = await freshDb();
    const ownerId = await seed.authUser(db);
    const parishId = await seed.parishId(db);
    await db.query("update auth.users set email_confirmed_at = now() where id = $1", [ownerId]);
    await as(db, "service_role", null, () =>
      db.query("select public.save_membership_application_draft($1,$2,$3,$4,$5,$6)", [
        ownerId,
        parishId,
        { firstName: "Synthetic" },
        2,
        null,
        "27b23654-16c9-4c50-8d35-8b44ef42b123",
      ]),
    );
    await db.query(
      `update membership_private.application_drafts
      set last_activity_at = now() - interval '31 days', expires_at = now() - interval '1 day'
      where applicant_auth_id = $1`,
      [ownerId],
    );
    const queuedPhoto = await prepareDraftPhoto(ownerId, parishId);
    const read = await as(db, "service_role", null, () =>
      db.query<{ result: unknown }>(
        "select public.get_membership_application_draft($1,$2,$3) as result",
        [ownerId, parishId, "72166bd6-ef2b-42b4-bbd6-04b02653fac4"],
      ),
    );
    expect(read.rows[0]?.result).toEqual({ expired: true });
    expect(
      (
        await db.query("select state from membership_private.application_photos where id=$1", [
          queuedPhoto,
        ])
      ).rows[0],
    ).toEqual({ state: "pending_delete" });
    expect(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from membership_private.application_drafts",
        )
      ).rows[0]?.count,
    ).toBe(0);
    expect(
      (
        await db.query(
          "select action from membership_private.security_audit_events where action = 'membership_application.draft_expired_disposed'",
        )
      ).rows,
    ).toHaveLength(1);
  }, 60_000);

  it("prevents saving after submission and consumes an existing draft atomically on submission", async () => {
    db = await freshDb();
    const ownerId = await seed.authUser(db);
    const parishId = await seed.parishId(db);
    await db.query("update auth.users set email_confirmed_at = now() where id = $1", [ownerId]);
    await as(db, "service_role", null, () =>
      db.query("select public.save_membership_application_draft($1,$2,$3,$4,$5,$6)", [
        ownerId,
        parishId,
        { firstName: "Synthetic" },
        4,
        null,
        "27b23654-16c9-4c50-8d35-8b44ef42b123",
      ]),
    );
    const photoId = await prepareDraftPhoto(ownerId, parishId);
    const submitted = await as(db, "service_role", null, () =>
      db.query<{ application_status: string }>(
        "select * from public.submit_membership_application($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          ownerId,
          parishId,
          { identity: { firstName: "Synthetic" } },
          Buffer.alloc(32, 31),
          Buffer.alloc(32, 32),
          "27b23654-16c9-4c50-8d35-8b44ef42b123",
          photoId,
          true,
        ],
      ),
    );
    expect(submitted.rows[0]?.application_status).toBe("submitted");
    const overview = await as(db, "service_role", null, () =>
      db.query<{ result: { application: Record<string, unknown> } }>(
        "select public.get_my_membership_application_overview($1,$2,$3) as result",
        [ownerId, parishId, "72166bd6-ef2b-42b4-bbd6-04b02653fac4"],
      ),
    );
    expect(overview.rows[0]?.result.application).toMatchObject({
      reference: expect.any(String),
      status: "submitted",
    });
    expect(overview.rows[0]?.result.application).not.toHaveProperty("payload");
    const remaining = await db.query<{ drafts: number; dobKeys: number }>(
      `select (select count(*)::int from membership_private.application_drafts where applicant_auth_id=$1) drafts,
              (select count(*)::int from membership_private.application_data d
               join membership_private.applications a on a.id=d.application_id
               where a.applicant_auth_id=$1 and membership_private.payload_contains_dob_key(d.applicant_payload)) dobKeys`,
      [ownerId],
    );
    expect(remaining.rows[0]).toEqual({ drafts: 0, dobkeys: 0 });
    const photo = await db.query<{ state: string; application_id: string | null }>(
      "select state, application_id from membership_private.application_photos where id=$1",
      [photoId],
    );
    expect(photo.rows[0]).toEqual({ state: "attached", application_id: expect.any(String) });
    await expect(
      as(db, "service_role", null, () =>
        db.query("select public.save_membership_application_draft($1,$2,$3,$4,$5,$6)", [
          ownerId,
          parishId,
          { firstName: "Changed" },
          4,
          null,
          "b61978a1-a1d0-42c4-97e9-ab369c55b893",
        ]),
      ),
    ).rejects.toThrow(/application_already_open/i);
  }, 60_000);

  it("keeps private application tables default-deny, including for service_role", async () => {
    db = await freshDb();
    const tables = await db.query<{ tablename: string; rowsecurity: boolean }>(
      `select tablename, rowsecurity from pg_tables
       where schemaname = 'membership_private' order by tablename`,
    );
    expect(tables.rows.map(({ tablename }) => tablename)).toEqual([
      "application_data",
      "application_drafts",
      "application_history",
      "application_photos",
      "applications",
      "photo_cleanup_request_replays",
      "security_audit_events",
      "submission_idempotency",
    ]);
    expect(tables.rows.every(({ rowsecurity }) => rowsecurity)).toBe(true);

    const policies = await db.query<{ policyname: string }>(
      "select policyname from pg_policies where schemaname = 'membership_private'",
    );
    expect(policies.rows).toEqual([]);
    const bucket = await db.query<{
      public: boolean;
      file_size_limit: number;
      allowed_mime_types: string[];
    }>(
      "select public, file_size_limit, allowed_mime_types from storage.buckets where id='membership-applicant-photos'",
    );
    expect(bucket.rows[0]).toEqual({
      public: false,
      file_size_limit: 5242880,
      allowed_mime_types: ["image/jpeg", "image/png", "image/webp"],
    });
    const storagePolicy = await db.query<{ policyname: string; permissive: string; qual: string }>(
      "select policyname, permissive, qual from pg_policies where schemaname='storage' and tablename='objects'",
    );
    expect(storagePolicy.rows).toEqual([
      expect.objectContaining({
        policyname: "membership_applicant_photo_no_client_access",
        permissive: "RESTRICTIVE",
      }),
    ]);
    expect(storagePolicy.rows[0]?.qual).toContain("membership-applicant-photos");

    const constraints = await db.query<{ conname: string }>(
      `select conname from pg_constraint c
       join pg_namespace n on n.oid = c.connamespace
       where n.nspname = 'membership_private'`,
    );
    expect(constraints.rows.map(({ conname }) => conname)).toEqual(
      expect.arrayContaining([
        "applications_pkey",
        "membership_applications_org_unit_fk",
        "membership_applications_predecessor_owner_fk",
        "membership_applications_approval_screening_ck",
        "application_data_payload_excludes_dob_ck",
        "submission_idempotency_pkey",
      ]),
    );

    const indexes = await db.query<{ indexname: string }>(
      "select indexname from pg_indexes where schemaname = 'membership_private'",
    );
    expect(indexes.rows.map(({ indexname }) => indexname)).toEqual(
      expect.arrayContaining([
        "membership_applications_owner_created_idx",
        "membership_applications_parish_status_idx",
        "application_history_application_time_idx",
        "membership_security_audit_time_idx",
      ]),
    );

    for (const role of ["anon", "authenticated", "service_role"] as const) {
      await expect(
        as(db, role, null, () => db.query("select * from membership_private.applications")),
      ).rejects.toThrow(/permission denied/i);
    }
  }, 60_000);

  it("records separate application status, screening disposition, opaque DOB-envelope slot and history", async () => {
    db = await freshDb();
    const app = await createSubmittedApplication();

    await db.query(
      `insert into membership_private.application_data(application_id, applicant_payload, dob_envelope, kms_key_version)
       values ($1, '{"firstName":"Synthetic","surname":"Applicant"}', decode('001122', 'hex'), 'test-kms-version')`,
      [app.id],
    );
    await db.query(
      `insert into membership_private.application_history
       (application_id, actor_kind, actor_auth_id, action, resulting_status)
       values ($1, 'authenticated_user', $2, 'submitted', 'submitted')`,
      [app.id, app.ownerId],
    );
    const stored = await db.query<{
      status: string;
      screening_outcome: string | null;
      payload: unknown;
    }>(
      `select a.status, a.screening_outcome, d.applicant_payload as payload
       from membership_private.applications a
       join membership_private.application_data d on d.application_id = a.id
       where a.id = $1`,
      [app.id],
    );
    expect(stored.rows[0]).toEqual({
      status: "submitted",
      screening_outcome: null,
      payload: { firstName: "Synthetic", surname: "Applicant" },
    });

    await expect(
      db.query(`update membership_private.applications set status = 'approved' where id = $1`, [
        app.id,
      ]),
    ).rejects.toThrow(/check constraint/i);
  }, 60_000);

  it("rejects DOB keys in ordinary payload and protects history and audit from mutation", async () => {
    db = await freshDb();
    const app = await createSubmittedApplication();
    await expect(
      db.query(
        `insert into membership_private.application_data(application_id, applicant_payload, dob_envelope, kms_key_version)
         values ($1, '{"nested":{"dateOfBirth":"2000-01-01"}}', decode('001122', 'hex'), 'test')`,
        [app.id],
      ),
    ).rejects.toThrow(/check constraint/i);

    const history = await db.query<{ id: string }>(
      `insert into membership_private.application_history
       (application_id, actor_kind, actor_auth_id, action, resulting_status)
       values ($1, 'authenticated_user', $2, 'submitted', 'submitted') returning id`,
      [app.id, app.ownerId],
    );
    await expect(
      db.query(`delete from membership_private.application_history where id = $1`, [
        history.rows[0]!.id,
      ]),
    ).rejects.toThrow(/append-only/i);

    const audit = await db.query<{ id: string }>(
      `insert into membership_private.security_audit_events
       (actor_kind, action, outcome) values ('system', 'test', 'succeeded') returning id`,
    );
    await expect(
      db.query(
        `update membership_private.security_audit_events set outcome = 'failed' where id = $1`,
        [audit.rows[0]!.id],
      ),
    ).rejects.toThrow(/append-only/i);
    await expect(
      db.query(`delete from membership_private.security_audit_events where id = $1`, [
        audit.rows[0]!.id,
      ]),
    ).rejects.toThrow(/append-only/i);
  }, 60_000);

  it("binds operation-scoped idempotency to payload and application without storing raw keys", async () => {
    db = await freshDb();
    const app = await createSubmittedApplication();
    await db.query(
      `insert into membership_private.submission_idempotency
       (applicant_auth_id, operation, key_digest, payload_digest, application_id)
       values ($1, 'membership_application.submit', decode(repeat('01', 32), 'hex'), decode(repeat('02', 32), 'hex'), $2)`,
      [app.ownerId, app.id],
    );
    await expect(
      db.query(
        `insert into membership_private.submission_idempotency
         (applicant_auth_id, operation, key_digest, payload_digest, application_id)
         values ($1, 'membership_application.submit', decode(repeat('01', 32), 'hex'), decode(repeat('03', 32), 'hex'), $2)`,
        [app.ownerId, app.id],
      ),
    ).rejects.toThrow(/duplicate key/i);
  }, 60_000);

  it("allows omission of DOB storage while retaining the envelope pair constraint", async () => {
    db = await freshDb();
    const app = await createSubmittedApplication();
    await db.query(
      `insert into membership_private.application_data(application_id, applicant_payload)
       values ($1, '{"identity":{"firstName":"Synthetic"}}')`,
      [app.id],
    );
    const stored = await db.query<{
      dob_envelope: Uint8Array | null;
      kms_key_version: string | null;
    }>(
      "select dob_envelope, kms_key_version from membership_private.application_data where application_id = $1",
      [app.id],
    );
    expect(stored.rows[0]).toEqual({ dob_envelope: null, kms_key_version: null });
    await expect(
      db.query(
        `update membership_private.application_data set dob_envelope = decode('01','hex') where application_id = $1`,
        [app.id],
      ),
    ).rejects.toThrow(/check constraint/i);
  }, 60_000);

  it("commits the application, submission history, audit, and idempotency row in one service-only RPC", async () => {
    db = await freshDb();
    const ownerId = await seed.authUser(db);
    const parishId = await seed.parishId(db);
    await db.query("update auth.users set email_confirmed_at = now() where id = $1", [ownerId]);
    const keyDigest = Buffer.alloc(32, 3);
    const payloadDigest = Buffer.alloc(32, 4);
    const correlationId = "7f901f56-64af-48d0-b65c-b76bfbcd3a81";
    const photoId = await prepareDraftPhoto(ownerId, parishId);
    const submit = () =>
      db.query<{
        application_id: string;
        application_reference: string;
        application_status: string;
        was_replay: boolean;
      }>(`select * from public.submit_membership_application($1,$2,$3,$4,$5,$6,$7,$8)`, [
        ownerId,
        parishId,
        { identity: { firstName: "Synthetic" } },
        keyDigest,
        payloadDigest,
        correlationId,
        photoId,
        true,
      ]);
    await expect(as(db, "authenticated", ownerId, submit)).rejects.toThrow(/permission denied/i);
    const first = await as(db, "service_role", null, submit);
    const replay = await as(db, "service_role", null, submit);
    expect(first.rows[0]?.was_replay).toBe(false);
    expect(replay.rows[0]).toMatchObject({
      application_id: first.rows[0]?.application_id,
      application_reference: first.rows[0]?.application_reference,
      application_status: "submitted",
      was_replay: true,
    });
    const related = await db.query<{
      histories: number;
      audits: number;
      idempotencies: number;
      envelope: Uint8Array | null;
      passport_photo_id: string;
    }>(
      `select
        (select count(*)::int from membership_private.application_history where application_id=$1) histories,
        (select count(*)::int from membership_private.security_audit_events where target_application_id=$1) audits,
        (select count(*)::int from membership_private.submission_idempotency where application_id=$1) idempotencies,
        (select dob_envelope from membership_private.application_data where application_id=$1) envelope,
        (select passport_photo_id from membership_private.application_data where application_id=$1) passport_photo_id`,
      [first.rows[0]?.application_id],
    );
    expect(related.rows[0]).toEqual({
      histories: 1,
      audits: 1,
      idempotencies: 1,
      envelope: null,
      passport_photo_id: photoId,
    });
    const identityRows = await db.query<{ members: number; accounts: number }>(
      `select (select count(*)::int from public.members) members,
              (select count(*)::int from public.user_accounts) accounts`,
    );
    expect(identityRows.rows[0]).toEqual({ members: 0, accounts: 0 });
  }, 60_000);

  it("refuses missing or another applicant's photo before creating an application", async () => {
    db = await freshDb();
    const ownerId = await seed.authUser(db);
    const otherId = await seed.authUser(db);
    const parishId = await seed.parishId(db);
    await db.query("update auth.users set email_confirmed_at=now() where id in ($1,$2)", [
      ownerId,
      otherId,
    ]);
    await prepareDraftPhoto(ownerId, parishId);
    const otherPhotoId = await prepareDraftPhoto(otherId, parishId);
    const attempt = (photoId: string) =>
      db.query("select * from public.submit_membership_application($1,$2,$3,$4,$5,$6,$7,$8)", [
        ownerId,
        parishId,
        { identity: { firstName: "Synthetic" } },
        Buffer.alloc(32, 41),
        Buffer.alloc(32, 42),
        "16df021b-4ab6-41bf-9393-d45ed1804ee9",
        photoId,
        true,
      ]);
    await expect(
      as(db, "service_role", null, () => attempt("45c43b66-4fcb-43e3-b0c7-d5620297099b")),
    ).rejects.toThrow(/valid_applicant_photo_required/i);
    await expect(as(db, "service_role", null, () => attempt(otherPhotoId))).rejects.toThrow(
      /valid_applicant_photo_required/i,
    );
    expect(
      (
        await db.query(
          "select count(*)::int from membership_private.applications where applicant_auth_id=$1",
          [ownerId],
        )
      ).rows[0],
    ).toEqual({ count: 0 });
  }, 60_000);

  it("rolls back every submission record when a required audit write fails", async () => {
    db = await freshDb();
    const ownerId = await seed.authUser(db);
    const parishId = await seed.parishId(db);
    await db.query("update auth.users set email_confirmed_at = now() where id = $1", [ownerId]);
    await db.exec(`
      create function public.fail_submission_audit() returns trigger language plpgsql as $$
      begin raise exception 'synthetic audit failure'; end $$;
      create trigger fail_submission_audit before insert on membership_private.security_audit_events
      for each row execute function public.fail_submission_audit();
    `);
    const photoId = await prepareDraftPhoto(ownerId, parishId);
    await expect(
      as(db, "service_role", null, () =>
        db.query(`select * from public.submit_membership_application($1,$2,$3,$4,$5,$6,$7,$8)`, [
          ownerId,
          parishId,
          { identity: { firstName: "Synthetic" } },
          Buffer.alloc(32, 10),
          Buffer.alloc(32, 11),
          "50b3bb43-04cd-4eca-b9d9-883ec4f94501",
          photoId,
          true,
        ]),
      ),
    ).rejects.toThrow(/synthetic audit failure/i);
    const counts = await db.query<{
      applications: number;
      data_rows: number;
      history: number;
      audit: number;
      idempotency: number;
    }>(
      `select
        (select count(*)::int from membership_private.applications) applications,
        (select count(*)::int from membership_private.application_data) data_rows,
        (select count(*)::int from membership_private.application_history) history,
        (select count(*)::int from membership_private.security_audit_events) audit,
        (select count(*)::int from membership_private.submission_idempotency) idempotency`,
    );
    expect(counts.rows[0]).toEqual({
      applications: 0,
      data_rows: 0,
      history: 0,
      audit: 0,
      idempotency: 0,
    });
  }, 60_000);

  it("rejects changed-payload key reuse, unverified owners, and browser roles", async () => {
    db = await freshDb();
    const ownerId = await seed.authUser(db);
    const parishId = await seed.parishId(db);
    await db.query("update auth.users set email_confirmed_at = now() where id = $1", [ownerId]);
    const photoId = await prepareDraftPhoto(ownerId, parishId);
    const args = [
      ownerId,
      parishId,
      { identity: { firstName: "Synthetic" } },
      Buffer.alloc(32, 5),
      Buffer.alloc(32, 6),
      "61f30d91-ec65-43ec-ac84-b7fc4f6a8c33",
      photoId,
      true,
    ];
    await as(db, "service_role", null, () =>
      db.query("select * from public.submit_membership_application($1,$2,$3,$4,$5,$6,$7,$8)", args),
    );
    await expect(
      as(db, "service_role", null, () =>
        db.query("select * from public.submit_membership_application($1,$2,$3,$4,$5,$6,$7,$8)", [
          args[0],
          args[1],
          args[2],
          args[3],
          Buffer.alloc(32, 7),
          args[5],
          args[6],
          true,
        ]),
      ),
    ).rejects.toThrow(/idempotency_payload_conflict/i);

    const unverified = await seed.authUser(db);
    await expect(
      as(db, "service_role", null, () =>
        db.query("select * from public.submit_membership_application($1,$2,$3,$4,$5,$6,$7,$8)", [
          unverified,
          parishId,
          args[2],
          Buffer.alloc(32, 8),
          Buffer.alloc(32, 9),
          args[5],
          "a7a2e9ed-c781-4f4f-a88d-252a7959fe74",
          false,
        ]),
      ),
    ).rejects.toThrow(/verified_applicant_required/i);
    await expect(
      as(db, "authenticated", ownerId, () =>
        db.query(
          "select * from public.submit_membership_application($1,$2,$3,$4,$5,$6,$7,$8)",
          args,
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  }, 60_000);
});

describe("passport photo cleanup migration", () => {
  it("schedules the protected worker and restricts cleanup RPCs to service_role", async () => {
    db = await freshDb();
    const job = await db.query<{ schedule: string; command: string }>(
      "select schedule, command from cron.test_jobs where job_name = $1",
      ["cyon-cleanup-membership-application-photos"],
    );
    expect(job.rows[0]?.schedule).toBe("*/15 * * * *");
    expect(job.rows[0]?.command).toContain("invoke_membership_photo_cleanup");
    expect(job.rows[0]?.command).not.toContain("membership_photo_cleanup_hmac_secret");
    const privileges = await db.query<{
      anon: boolean;
      authenticated: boolean;
      service_role: boolean;
    }>(
      `select
        has_function_privilege('anon', 'public.claim_membership_application_photo_cleanup_jobs(integer)', 'EXECUTE') anon,
        has_function_privilege('authenticated', 'public.claim_membership_application_photo_cleanup_jobs(integer)', 'EXECUTE') authenticated,
        has_function_privilege('service_role', 'public.claim_membership_application_photo_cleanup_jobs(integer)', 'EXECUTE') service_role`,
    );
    expect(privileges.rows[0]).toEqual({ anon: false, authenticated: false, service_role: true });
    await expect(
      as(db, "authenticated", null, () =>
        db.query("select * from public.claim_membership_application_photo_cleanup_jobs(10)"),
      ),
    ).rejects.toThrow(/permission denied/i);
  }, 60_000);

  it("claims only expired detached photos, backs off failures, and recovers crashed leases", async () => {
    db = await freshDb();
    const parishId = await seed.parishId(db);

    const expiredOwner = await seed.authUser(db);
    const expiredPhotoId = await prepareDraftPhoto(expiredOwner, parishId);
    await db.query(
      `update membership_private.application_drafts
       set last_activity_at = expired.activity_at,
           expires_at = expired.activity_at + interval '30 days'
       from (select clock_timestamp() - interval '31 days' as activity_at) expired
       where applicant_auth_id = $1`,
      [expiredOwner],
    );
    const expiredDraftId = (
      await db.query<{ id: string }>(
        "select id from membership_private.application_drafts where applicant_auth_id=$1",
        [expiredOwner],
      )
    ).rows[0]!.id;
    expect(
      (
        await db.query("select membership_private.delete_expired_application_draft($1)", [
          expiredDraftId,
        ])
      ).rows[0],
    ).toEqual({ delete_expired_application_draft: true });

    const activeOwner = await seed.authUser(db);
    const activePhotoId = await prepareDraftPhoto(activeOwner, parishId);
    const submittedOwner = await seed.authUser(db);
    const submittedPhotoId = await prepareDraftPhoto(submittedOwner, parishId);
    await db.query(
      `insert into membership_private.applications(applicant_auth_id, org_unit_id, status, submitted_at)
       values ($1, $2, 'submitted', clock_timestamp())`,
      [submittedOwner, parishId],
    );

    const claim = () =>
      as(db, "service_role", null, () =>
        db.query<{
          photo_id: string;
          object_path: string;
          deletion_reason: string;
          source_expires_at: string;
          claim_token: string;
        }>("select * from public.claim_membership_application_photo_cleanup_jobs(100)"),
      );
    const firstClaim = await claim();
    expect(firstClaim.rows).toHaveLength(1);
    expect(firstClaim.rows[0]).toMatchObject({
      photo_id: expiredPhotoId,
      deletion_reason: "draft_expired",
      object_path: `${expiredOwner}/${expiredDraftId}/${expiredPhotoId}.jpg`,
    });
    expect(Date.parse(firstClaim.rows[0]!.source_expires_at)).toBeLessThanOrEqual(Date.now());
    expect((await claim()).rows).toHaveLength(0);
    expect(
      (
        await db.query<{ state: string }>(
          "select state from membership_private.application_photos where id=$1",
          [activePhotoId],
        )
      ).rows[0]?.state,
    ).toBe("draft");
    expect(
      (
        await db.query<{ state: string }>(
          "select state from membership_private.application_photos where id=$1",
          [submittedPhotoId],
        )
      ).rows[0]?.state,
    ).toBe("attached");

    const firstToken = firstClaim.rows[0]!.claim_token;
    const failed = await as(db, "service_role", null, () =>
      db.query(
        "select public.fail_membership_application_photo_cleanup($1,$2,'storage_unavailable',false)",
        [expiredPhotoId, firstToken],
      ),
    );
    expect(failed.rows[0]).toEqual({ fail_membership_application_photo_cleanup: true });
    expect((await claim()).rows).toHaveLength(0);

    await db.query(
      "update membership_private.application_photos set deletion_next_attempt_at=clock_timestamp() where id=$1",
      [expiredPhotoId],
    );
    const retryClaim = await claim();
    const retryToken = retryClaim.rows[0]!.claim_token;
    expect(retryToken).not.toBe(firstToken);

    // Simulate an interrupted worker: lease expiry makes the still-pending job claimable.
    await db.query(
      "update membership_private.application_photos set deletion_claimed_until=clock_timestamp()-interval '1 second' where id=$1",
      [expiredPhotoId],
    );
    const recoveredClaim = await claim();
    expect(recoveredClaim.rows).toHaveLength(1);
    expect(recoveredClaim.rows[0]!.claim_token).not.toBe(retryToken);
    const staleCompletion = await as(db, "service_role", null, () =>
      db.query("select public.complete_membership_application_photo_cleanup($1,$2)", [
        expiredPhotoId,
        firstToken,
      ]),
    );
    expect(staleCompletion.rows[0]).toEqual({
      complete_membership_application_photo_cleanup: false,
    });
    const completed = await as(db, "service_role", null, () =>
      db.query("select public.complete_membership_application_photo_cleanup($1,$2)", [
        expiredPhotoId,
        recoveredClaim.rows[0]!.claim_token,
      ]),
    );
    expect(completed.rows[0]).toEqual({ complete_membership_application_photo_cleanup: true });
    expect(
      (
        await db.query("select 1 from membership_private.application_photos where id=$1", [
          expiredPhotoId,
        ])
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "select count(*)::int as count from membership_private.security_audit_events where action='membership_application.photo_cleanup_completed'",
        )
      ).rows[0],
    ).toEqual({ count: 1 });
  }, 60_000);
});

describe("passport photo cleanup request replay protection migration", () => {
  it("atomically consumes a request once, rejects reuse, and prunes expired ledger rows", async () => {
    db = await freshDb();
    const pruneJob = await db.query<{ schedule: string; command: string }>(
      "select schedule, command from cron.test_jobs where job_name = $1",
      ["cyon-prune-membership-photo-cleanup-replays"],
    );
    expect(pruneJob.rows[0]?.schedule).toBe("*/15 * * * *");
    expect(pruneJob.rows[0]?.command).toContain("prune_membership_photo_cleanup_request_replays");
    const requestId = "8c2f75f3-b61b-4a2c-bf88-1fe5a6ab8946";
    const acceptedUntil = new Date(Date.now() + 5 * 60_000).toISOString();
    const consume = () =>
      as(db, "service_role", null, () =>
        db.query<{ consume_membership_photo_cleanup_request: boolean }>(
          "select public.consume_membership_photo_cleanup_request($1,$2)",
          [requestId, acceptedUntil],
        ),
      );

    expect((await consume()).rows[0]?.consume_membership_photo_cleanup_request).toBe(true);
    expect((await consume()).rows[0]?.consume_membership_photo_cleanup_request).toBe(false);
    const concurrentId = "6c2f75f3-b61b-4a2c-bf88-1fe5a6ab8946";
    const concurrentUntil = new Date(Date.now() + 5 * 60_000).toISOString();
    const concurrent = await as(db, "service_role", null, () =>
      Promise.all([
        db.query<{ consume_membership_photo_cleanup_request: boolean }>(
          "select public.consume_membership_photo_cleanup_request($1,$2)",
          [concurrentId, concurrentUntil],
        ),
        db.query<{ consume_membership_photo_cleanup_request: boolean }>(
          "select public.consume_membership_photo_cleanup_request($1,$2)",
          [concurrentId, concurrentUntil],
        ),
      ]),
    );
    expect(
      concurrent.filter((result) => result.rows[0]?.consume_membership_photo_cleanup_request)
        .length,
    ).toBe(1);
    await expect(
      as(db, "authenticated", null, () =>
        db.query("select public.consume_membership_photo_cleanup_request($1,$2)", [
          "9c2f75f3-b61b-4a2c-bf88-1fe5a6ab8946",
          acceptedUntil,
        ]),
      ),
    ).rejects.toThrow();

    await db.query(
      `insert into membership_private.photo_cleanup_request_replays(request_id,accepted_until,created_at)
       values ('5c2f75f3-b61b-4a2c-bf88-1fe5a6ab8946',clock_timestamp()-interval '10 minutes',clock_timestamp()-interval '20 minutes')`,
    );
    const nextRequest = await as(db, "service_role", null, () =>
      db.query<{ consume_membership_photo_cleanup_request: boolean }>(
        "select public.consume_membership_photo_cleanup_request($1,$2)",
        ["7c2f75f3-b61b-4a2c-bf88-1fe5a6ab8946", new Date(Date.now() + 5 * 60_000).toISOString()],
      ),
    );
    expect(nextRequest.rows[0]?.consume_membership_photo_cleanup_request).toBe(true);
    const pruned = await db.query<{ exists: boolean }>(
      "select exists(select 1 from membership_private.photo_cleanup_request_replays where request_id='5c2f75f3-b61b-4a2c-bf88-1fe5a6ab8946') as exists",
    );
    expect(pruned.rows[0]?.exists).toBe(false);

    await db.query(
      `insert into membership_private.photo_cleanup_request_replays(request_id,accepted_until,created_at)
       values ('4c2f75f3-b61b-4a2c-bf88-1fe5a6ab8946',clock_timestamp()-interval '10 minutes',clock_timestamp()-interval '20 minutes')`,
    );
    await db.query("select membership_private.prune_membership_photo_cleanup_request_replays()");
    const independentlyPruned = await db.query<{ exists: boolean }>(
      "select exists(select 1 from membership_private.photo_cleanup_request_replays where request_id='4c2f75f3-b61b-4a2c-bf88-1fe5a6ab8946') as exists",
    );
    expect(independentlyPruned.rows[0]?.exists).toBe(false);
  }, 60_000);
});
