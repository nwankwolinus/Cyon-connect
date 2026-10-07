import { beforeAll, describe, expect, it } from "vitest";
import { as, type Db, freshDb, seed } from "../support/db";

let db: Db;
beforeAll(async () => {
  db = await freshDb();
}, 60_000);

const ids = (r: { rows: unknown[] }, col = "id") =>
  r.rows.map((x) => (x as Record<string, unknown>)[col]);

describe("schema inventory", () => {
  it("contains exactly the identity tables, all with RLS enabled", async () => {
    const r = await db.query<{ relname: string; relrowsecurity: boolean }>(
      "select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by 1",
    );
    expect(r.rows.map((x) => x.relname)).toEqual(["members", "org_units", "user_accounts"]);
    expect(r.rows.every((x) => x.relrowsecurity)).toBe(true);
  });

  it("anon holds no privilege on any public table", async () => {
    const r = await db.query(
      "select 1 from information_schema.table_privileges where table_schema='public' and grantee in ('anon','PUBLIC')",
    );
    expect(r.rows).toEqual([]);
  });

  it("stores no credentials: no password/hash/token/secret columns (AC-07)", async () => {
    const r = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema='public' and column_name ~* '(passw|hash|token|secret|credential)'",
    );
    expect(r.rows).toEqual([]);
  });

  it("embeds no role/permission/executive state in identity tables (AC-09)", async () => {
    const r = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema='public' and column_name ~* '(role|permission|executive|office|position)'",
    );
    expect(r.rows).toEqual([]);
  });

  it("every table has an immutable uuid primary key and timezone-aware timestamps", async () => {
    const pk = await db.query<{ t: string; type: string; def: string | null }>(
      `select c.table_name t, c.data_type type, c.column_default def from information_schema.columns c
       where c.table_schema='public' and c.column_name='id' order by 1`,
    );
    expect(pk.rows).toHaveLength(3);
    for (const x of pk.rows) {
      expect(x.type).toBe("uuid");
      expect(x.def).toContain("gen_random_uuid");
    }
    const ts = await db.query<{ data_type: string }>(
      "select data_type from information_schema.columns where table_schema='public' and column_name in ('created_at','updated_at')",
    );
    expect(ts.rows).toHaveLength(6);
    expect(ts.rows.every((x) => x.data_type === "timestamp with time zone")).toBe(true);
  });
});

describe("organisation hierarchy (Archdiocese -> Deanery -> Parish)", () => {
  it("seeds exactly the one initial parish, with no parent", async () => {
    const r = await db.query<{ unit_type: string; parent_id: string | null }>(
      "select unit_type, parent_id from public.org_units",
    );
    expect(r.rows).toEqual([{ unit_type: "parish", parent_id: null }]);
  });

  it("accepts a valid chain and a parish with an unknown deanery", async () => {
    const a = await seed.orgUnit(db, "archdiocese", "T-Arch-1");
    const d = await seed.orgUnit(db, "deanery", "T-Deanery-1", { id: a, type: "archdiocese" });
    await seed.orgUnit(db, "parish", "T-Parish-1", { id: d, type: "deanery" });
    await seed.orgUnit(db, "parish", "T-Parish-Orphan");
    await seed.orgUnit(db, "deanery", "T-Deanery-Orphan");
  });

  it("rejects hierarchy violations", async () => {
    const a = await seed.orgUnit(db, "archdiocese", "T-Arch-2");
    const d = await seed.orgUnit(db, "deanery", "T-Deanery-2", { id: a, type: "archdiocese" });
    const p = await seed.orgUnit(db, "parish", "T-Parish-2", { id: d, type: "deanery" });
    await expect(
      seed.orgUnit(db, "archdiocese", "T-Arch-Child", { id: a, type: "archdiocese" }),
    ).rejects.toThrow(/check constraint/i);
    await expect(
      seed.orgUnit(db, "parish", "T-P-under-A", { id: a, type: "archdiocese" }),
    ).rejects.toThrow(/check constraint/i);
    await expect(
      seed.orgUnit(db, "deanery", "T-D-under-P", { id: p, type: "parish" }),
    ).rejects.toThrow(/check constraint/i);
    await expect(seed.orgUnit(db, "diocese", "T-bad-type")).rejects.toThrow(/check constraint/i);
  });

  it("verifies the parent's real type (FK) and requires parent id and type together", async () => {
    const a = await seed.orgUnit(db, "archdiocese", "T-Arch-3");
    await expect(
      seed.orgUnit(db, "parish", "T-P-wrongtype", { id: a, type: "deanery" }),
    ).rejects.toThrow(/foreign key/i);
    await expect(
      db.query(
        "insert into public.org_units (unit_type,name,parent_id) values ('deanery','T-D-noparenttype',$1)",
        [a],
      ),
    ).rejects.toThrow(/check constraint/i);
    await expect(
      seed.orgUnit(db, "parish", "T-P-ghostparent", {
        id: "00000000-0000-0000-0000-0000000000aa",
        type: "deanery",
      }),
    ).rejects.toThrow(/foreign key/i);
  });

  it("keeps sibling names unique per type and parent, but allows the same name elsewhere", async () => {
    const a = await seed.orgUnit(db, "archdiocese", "T-Arch-4");
    const d1 = await seed.orgUnit(db, "deanery", "T-D4a", { id: a, type: "archdiocese" });
    const d2 = await seed.orgUnit(db, "deanery", "T-D4b", { id: a, type: "archdiocese" });
    await seed.orgUnit(db, "parish", "T-Same", { id: d1, type: "deanery" });
    await seed.orgUnit(db, "parish", "T-Same", { id: d2, type: "deanery" });
    await expect(
      seed.orgUnit(db, "parish", " t-same ", { id: d1, type: "deanery" }),
    ).rejects.toThrow(/duplicate key/i);
  });

  it("id and unit_type are immutable; units cannot be deleted; a referenced parent cannot go", async () => {
    const id = await seed.parishId(db);
    await expect(
      db.query("update public.org_units set unit_type='deanery' where id=$1", [id]),
    ).rejects.toThrow(/immutable/i);
    await expect(
      db.query("update public.org_units set id=gen_random_uuid() where id=$1", [id]),
    ).rejects.toThrow(/immutable/i);
    await expect(db.query("delete from public.org_units where id=$1", [id])).rejects.toThrow(
      /not permitted/i,
    );
  });
});

describe("members: stable identity without personal data", () => {
  it("defaults to pending and to the parish discriminator", async () => {
    const m = await seed.member(db);
    const r = await db.query<{ membership_status: string; org_unit_type: string }>(
      "select membership_status, org_unit_type from public.members where id=$1",
      [m],
    );
    expect(r.rows[0]).toEqual({ membership_status: "pending", org_unit_type: "parish" });
  });

  it("accepts every FR-MEM-009 status and rejects others", async () => {
    for (const s of ["pending", "active", "inactive", "suspended", "archived"])
      await seed.member(db, { status: s });
    await expect(seed.member(db, { status: "president" })).rejects.toThrow(/check constraint/i);
    await expect(seed.member(db, { status: "deleted" })).rejects.toThrow(/check constraint/i);
  });

  it("requires a real organisation that is a parish (interim ADR-007 rule)", async () => {
    await expect(
      db.query("insert into public.members (org_unit_id) values (null)"),
    ).rejects.toThrow(/not-null/i);
    await expect(
      seed.member(db, { orgUnitId: "00000000-0000-0000-0000-0000000000aa" }),
    ).rejects.toThrow(/foreign key/i);
    const a = await seed.orgUnit(db, "archdiocese", "T-Arch-M");
    const d = await seed.orgUnit(db, "deanery", "T-Deanery-M", { id: a, type: "archdiocese" });
    await expect(seed.member(db, { orgUnitId: d })).rejects.toThrow(/foreign key/i);
    await expect(
      db.query("insert into public.members (org_unit_id, org_unit_type) values ($1,'deanery')", [
        d,
      ]),
    ).rejects.toThrow(/check constraint/i);
  });

  it("id is immutable, rows cannot be deleted, and a unit with members cannot be removed", async () => {
    const m = await seed.member(db);
    await expect(
      db.query("update public.members set id=gen_random_uuid() where id=$1", [m]),
    ).rejects.toThrow(/immutable/i);
    await expect(db.query("delete from public.members where id=$1", [m])).rejects.toThrow(
      /not permitted/i,
    );
  });

  it("maintains updated_at on change", async () => {
    const m = await seed.member(db);
    await db.query("update public.members set updated_at='2000-01-01' where id=$1", [m]);
    await db.query("update public.members set membership_status='active' where id=$1", [m]);
    const r = await db.query<{ recent: boolean }>(
      "select updated_at > now() - interval '1 minute' recent from public.members where id=$1",
      [m],
    );
    expect(r.rows[0]!.recent).toBe(true);
  });
});

describe("accounts: Person -> Member -> Account and Supabase Auth linkage", () => {
  it("defaults to pending_activation and accepts only the defined statuses", async () => {
    const u = await seed.authUser(db);
    const a = await seed.account(db, u, await seed.member(db));
    expect(
      (
        await db.query<{ s: string }>(
          "select account_status s from public.user_accounts where id=$1",
          [a],
        )
      ).rows[0]!.s,
    ).toBe("pending_activation");
    for (const s of ["active", "suspended", "deactivated"])
      await seed.account(db, await seed.authUser(db), await seed.member(db), s);
    await expect(
      seed.account(db, await seed.authUser(db), await seed.member(db), "banned"),
    ).rejects.toThrow(/check constraint/i);
  });

  it("one member cannot have two accounts", async () => {
    const m = await seed.member(db);
    await seed.account(db, await seed.authUser(db), m);
    await expect(seed.account(db, await seed.authUser(db), m)).rejects.toThrow(/duplicate key/i);
  });

  it("one auth identity cannot back two accounts", async () => {
    const u = await seed.authUser(db);
    await seed.account(db, u, await seed.member(db));
    await expect(seed.account(db, u, await seed.member(db))).rejects.toThrow(/duplicate key/i);
  });

  it("requires an existing auth user and an existing member", async () => {
    await expect(
      seed.account(db, "00000000-0000-0000-0000-0000000000aa", await seed.member(db)),
    ).rejects.toThrow(/foreign key/i);
    await expect(
      seed.account(db, await seed.authUser(db), "00000000-0000-0000-0000-0000000000aa"),
    ).rejects.toThrow(/foreign key/i);
    await expect(
      db.query("insert into public.user_accounts (auth_user_id, member_id) values (null, $1)", [
        await seed.member(db),
      ]),
    ).rejects.toThrow(/not-null/i);
  });

  it("a member can exist without an account (e.g. a pending applicant)", async () => {
    const m = await seed.member(db, { status: "pending" });
    expect(
      (await db.query("select 1 from public.user_accounts where member_id=$1", [m])).rows,
    ).toHaveLength(0);
  });

  it("an auth user with an account cannot be deleted; one without can", async () => {
    const p = await seed.person(db);
    await expect(db.query("delete from auth.users where id=$1", [p.authUserId])).rejects.toThrow(
      /foreign key/i,
    );
    const lone = await seed.authUser(db);
    await db.query("delete from auth.users where id=$1", [lone]);
  });

  it("linkage columns are immutable and accounts cannot be deleted", async () => {
    const p = await seed.person(db);
    const other = await seed.member(db);
    await expect(
      db.query("update public.user_accounts set member_id=$2 where id=$1", [p.accountId, other]),
    ).rejects.toThrow(/immutable/i);
    await expect(
      db.query("update public.user_accounts set auth_user_id=$2 where id=$1", [
        p.accountId,
        await seed.authUser(db),
      ]),
    ).rejects.toThrow(/immutable/i);
    await expect(
      db.query("update public.user_accounts set id=gen_random_uuid() where id=$1", [p.accountId]),
    ).rejects.toThrow(/immutable/i);
    await expect(
      db.query("delete from public.user_accounts where id=$1", [p.accountId]),
    ).rejects.toThrow(/not permitted/i);
  });
});

describe("status separation (BR-CC-002)", () => {
  it("allows independent combinations of membership and account status", async () => {
    const combos: Array<[string, string]> = [
      ["inactive", "active"],
      ["active", "suspended"],
      ["archived", "deactivated"],
      ["pending", "pending_activation"],
    ];
    for (const [membership, account] of combos) {
      const p = await seed.person(db, { membership, account });
      const r = await db.query<{ m: string; a: string }>(
        "select m.membership_status m, a.account_status a from public.user_accounts a join public.members m on m.id=a.member_id where a.id=$1",
        [p.accountId],
      );
      expect(r.rows[0]).toEqual({ m: membership, a: account });
    }
  });

  it("changing one status never changes the other", async () => {
    const p = await seed.person(db, { membership: "active", account: "active" });
    await db.query("update public.user_accounts set account_status='suspended' where id=$1", [
      p.accountId,
    ]);
    expect(
      (
        await db.query<{ s: string }>(
          "select membership_status s from public.members where id=$1",
          [p.memberId],
        )
      ).rows[0]!.s,
    ).toBe("active");
    await db.query("update public.members set membership_status='inactive' where id=$1", [
      p.memberId,
    ]);
    expect(
      (
        await db.query<{ s: string }>(
          "select account_status s from public.user_accounts where id=$1",
          [p.accountId],
        )
      ).rows[0]!.s,
    ).toBe("suspended");
  });
});

describe("row level security (default deny)", () => {
  const tables = ["org_units", "members", "user_accounts"];

  it("anon cannot read or write anything", async () => {
    for (const t of tables) {
      await expect(
        as(db, "anon", null, () => db.query(`select * from public.${t}`)),
      ).rejects.toThrow(/permission denied/i);
      await expect(as(db, "anon", null, () => db.query(`delete from public.${t}`))).rejects.toThrow(
        /permission denied/i,
      );
    }
    await expect(
      as(db, "anon", null, () =>
        db.query("insert into public.org_units (unit_type,name) values ('parish','x')"),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("an authenticated user with no account sees nothing", async () => {
    const stranger = await seed.authUser(db);
    for (const t of tables)
      expect(
        (await as(db, "authenticated", stranger, () => db.query(`select * from public.${t}`))).rows,
      ).toEqual([]);
  });

  it("an active user sees only their own account, member row and home unit", async () => {
    const parishB = await seed.orgUnit(db, "parish", "T-Parish-RLS-B");
    const a = await seed.person(db);
    const b = await seed.person(db, { orgUnitId: parishB });
    const accounts = await as(db, "authenticated", a.authUserId, () =>
      db.query("select * from public.user_accounts"),
    );
    const members = await as(db, "authenticated", a.authUserId, () =>
      db.query("select * from public.members"),
    );
    const units = await as(db, "authenticated", a.authUserId, () =>
      db.query("select * from public.org_units"),
    );
    expect(ids(accounts)).toEqual([a.accountId]);
    expect(ids(members)).toEqual([a.memberId]);
    expect(ids(units)).toEqual([await seed.parishId(db)]);
    expect(ids(accounts)).not.toContain(b.accountId);
  });

  it("cross-organisation: a user in parish B cannot see parish A's unit, members or accounts", async () => {
    const parishB = await seed.orgUnit(db, "parish", "T-Parish-RLS-C");
    const inA = await seed.person(db);
    const inB = await seed.person(db, { orgUnitId: parishB });
    const unitsSeenByB = await as(db, "authenticated", inB.authUserId, () =>
      db.query("select * from public.org_units"),
    );
    const membersSeenByB = await as(db, "authenticated", inB.authUserId, () =>
      db.query("select * from public.members"),
    );
    expect(ids(unitsSeenByB)).toEqual([parishB]);
    expect(ids(membersSeenByB)).toEqual([inB.memberId]);
    expect(ids(membersSeenByB)).not.toContain(inA.memberId);
    const direct = await as(db, "authenticated", inB.authUserId, () =>
      db.query("select * from public.members where id=$1", [inA.memberId]),
    );
    expect(direct.rows).toEqual([]);
  });

  it("suspended, deactivated and pending accounts see only their own account row", async () => {
    for (const status of ["suspended", "deactivated", "pending_activation"]) {
      const p = await seed.person(db, { membership: "active", account: status });
      const acc = await as(db, "authenticated", p.authUserId, () =>
        db.query("select account_status from public.user_accounts"),
      );
      expect(acc.rows).toEqual([{ account_status: status }]);
      expect(
        (
          await as(db, "authenticated", p.authUserId, () =>
            db.query("select * from public.members"),
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await as(db, "authenticated", p.authUserId, () =>
            db.query("select * from public.org_units"),
          )
        ).rows,
      ).toEqual([]);
    }
  });

  it("an account becomes unreadable through RLS the moment it is suspended", async () => {
    const p = await seed.person(db, { membership: "active", account: "active" });
    expect(
      (await as(db, "authenticated", p.authUserId, () => db.query("select * from public.members")))
        .rows,
    ).toHaveLength(1);
    await db.query("update public.user_accounts set account_status='suspended' where id=$1", [
      p.accountId,
    ]);
    expect(
      (await as(db, "authenticated", p.authUserId, () => db.query("select * from public.members")))
        .rows,
    ).toHaveLength(0);
  });

  it("authenticated users cannot write: no self-activation, no status edits, no inserts, no deletes", async () => {
    const p = await seed.person(db, { membership: "suspended", account: "suspended" });
    const run = (sql: string, params: unknown[] = []) =>
      as(db, "authenticated", p.authUserId, () => db.query(sql, params));
    await expect(run("update public.user_accounts set account_status='active'")).rejects.toThrow(
      /permission denied/i,
    );
    await expect(run("update public.members set membership_status='active'")).rejects.toThrow(
      /permission denied/i,
    );
    await expect(
      run("insert into public.members (org_unit_id) values ($1)", [await seed.parishId(db)]),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      run("insert into public.user_accounts (auth_user_id, member_id) values ($1,$2)", [
        p.authUserId,
        p.memberId,
      ]),
    ).rejects.toThrow(/permission denied/i);
    await expect(run("update public.org_units set name='hijack'")).rejects.toThrow(
      /permission denied/i,
    );
    for (const t of ["org_units", "members", "user_accounts"]) {
      await expect(run(`delete from public.${t}`)).rejects.toThrow(/permission denied/i);
      await expect(run(`truncate public.${t}`)).rejects.toThrow(/permission denied/i);
    }
  });

  it("authenticated users cannot reach service-only functions", async () => {
    const p = await seed.person(db);
    await expect(
      as(db, "authenticated", p.authUserId, () => db.query("select public.platform_ping()")),
    ).rejects.toThrow(/permission denied/i);
  });

  it("the service role (server-side only) can read, insert and update but never delete or truncate", async () => {
    const p = await seed.person(db, { membership: "active", account: "active" });
    const sr = (sql: string, params: unknown[] = []) =>
      as(db, "service_role", null, () => db.query(sql, params));
    const all = await sr("select id from public.members where id=$1", [p.memberId]);
    expect(ids(all)).toEqual([p.memberId]);
    await sr("update public.user_accounts set account_status='suspended' where id=$1", [
      p.accountId,
    ]);
    const m = await sr("insert into public.members (org_unit_id) values ($1) returning id", [
      await seed.parishId(db),
    ]);
    expect(m.rows).toHaveLength(1);
    for (const t of ["org_units", "members", "user_accounts"]) {
      await expect(sr(`delete from public.${t}`)).rejects.toThrow(/permission denied/i);
      await expect(sr(`truncate public.${t}`)).rejects.toThrow(/permission denied/i);
    }
  });

  it("the service role still cannot bypass integrity constraints", async () => {
    const p = await seed.person(db);
    const sr = (sql: string, params: unknown[] = []) =>
      as(db, "service_role", null, () => db.query(sql, params));
    await expect(
      sr("insert into public.user_accounts (auth_user_id, member_id) values ($1,$2)", [
        await seed.authUser(db),
        p.memberId,
      ]),
    ).rejects.toThrow(/duplicate key/i);
    await expect(
      sr("update public.members set id=gen_random_uuid() where id=$1", [p.memberId]),
    ).rejects.toThrow(/immutable/i);
  });
});
