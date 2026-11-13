import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { as, type Db, freshDb, seed } from "../support/db";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

afterEach(async () => db.close());

describe("org_units_select_own_unit correction", () => {
  it("explicitly scopes parish visibility to the caller's active account/member relationship", async () => {
    const parishA = await seed.parishId(db);
    const parishB = await seed.orgUnit(db, "parish", "Synthetic Parish B");
    const personA = await seed.person(db, { orgUnitId: parishA });
    const personB = await seed.person(db, { orgUnitId: parishB });

    // Disable child-table RLS to ensure org_units' own policy enforces the owner relation.
    await db.exec(`
      alter table public.members disable row level security;
      alter table public.user_accounts disable row level security;
    `);

    const unitsA = await as(db, "authenticated", personA.authUserId, () =>
      db.query<{ id: string }>("select id from public.org_units order by id"),
    );
    const unitsB = await as(db, "authenticated", personB.authUserId, () =>
      db.query<{ id: string }>("select id from public.org_units order by id"),
    );

    expect(unitsA.rows.map((row) => row.id)).toEqual([parishA]);
    expect(unitsB.rows.map((row) => row.id)).toEqual([parishB]);
  });

  it("does not expose a parish to an account that is not active", async () => {
    const parish = await seed.parishId(db);
    const person = await seed.person(db, { orgUnitId: parish, account: "suspended" });
    await db.exec(`
      alter table public.members disable row level security;
      alter table public.user_accounts disable row level security;
    `);

    const units = await as(db, "authenticated", person.authUserId, () =>
      db.query("select id from public.org_units"),
    );
    expect(units.rows).toEqual([]);
  });
});
