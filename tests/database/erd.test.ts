import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { type Db, freshDb } from "../support/db";

const md = readFileSync(path.resolve(__dirname, "../../docs/architecture/ERD_IDENTITY.md"), "utf8");
const mermaid = /```mermaid\n([\s\S]*?)```/.exec(md)![1]!;
const TABLES = ["org_units", "members", "user_accounts"];
const TYPE: Record<string, string> = {
  uuid: "uuid",
  text: "text",
  timestamptz: "timestamp with time zone",
};

interface ErdColumn {
  type: string;
  keys: string[];
}

function parseEntities() {
  const entities: Record<string, Record<string, ErdColumn>> = {};
  for (const m of mermaid.matchAll(/^\s{2}(\w+) \{\n([\s\S]*?)^\s{2}\}/gm)) {
    const cols: Record<string, ErdColumn> = {};
    for (const line of m[2]!
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)) {
      const [type, name, ...rest] = line.split(/\s+/);
      cols[name!] = { type: type!, keys: rest.join(" ").split(/[ ,]+/).filter(Boolean) };
    }
    entities[m[1]!] = cols;
  }
  return entities;
}

function parseRelationships() {
  return [...mermaid.matchAll(/^\s{2}(\w+) ([|o}{]{2})--([|o}{]{2}) (\w+) :/gm)].map((m) => ({
    parent: m[1]!,
    child: m[4]!,
    childSide: m[3]!,
  }));
}

let db: Db;
beforeAll(async () => {
  db = await freshDb();
}, 60_000);

describe("ERD matches the implemented database", () => {
  it("documents exactly the identity tables (plus the external auth_users)", () => {
    expect(Object.keys(parseEntities()).sort()).toEqual([...TABLES, "auth_users"].sort());
  });

  it("columns, types and PK/FK/UK flags match the catalog", async () => {
    const entities = parseEntities();
    for (const table of TABLES) {
      const cols = await db.query<{ column_name: string; data_type: string }>(
        "select column_name, data_type from information_schema.columns where table_schema='public' and table_name=$1",
        [table],
      );
      const flags = await db.query<{ col: string; kind: string }>(
        `select a.attname col,
                case c.contype when 'p' then 'PK' when 'f' then 'FK' else 'UK' end kind
         from pg_constraint c
         join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
         where c.conrelid = ('public.' || $1)::regclass
           and (c.contype in ('p','f') or (c.contype = 'u' and array_length(c.conkey,1) = 1))`,
        [table],
      );
      const actual: Record<string, ErdColumn> = {};
      for (const c of cols.rows) {
        actual[c.column_name] = {
          type: c.data_type,
          keys: flags.rows
            .filter((f) => f.col === c.column_name)
            .map((f) => f.kind)
            .sort(),
        };
      }
      const documented = Object.fromEntries(
        Object.entries(entities[table]!).map(([n, c]) => [
          n,
          { type: TYPE[c.type] ?? c.type, keys: [...c.keys].sort() },
        ]),
      );
      expect(documented, `table ${table}`).toEqual(actual);
    }
  });

  it("relationships and their cardinality match the foreign keys", async () => {
    const fks = await db.query<{ parent: string; child: string; child_unique: boolean }>(
      `select case when pn.nspname = 'auth' then 'auth_users' else pc.relname end parent,
              cc.relname child,
              exists (select 1 from pg_constraint u where u.conrelid = c.conrelid and u.contype in ('u','p') and u.conkey = c.conkey) child_unique
       from pg_constraint c
       join pg_class cc on cc.oid = c.conrelid
       join pg_class pc on pc.oid = c.confrelid
       join pg_namespace pn on pn.oid = pc.relnamespace
       join pg_namespace cn on cn.oid = cc.relnamespace
       where c.contype = 'f' and cn.nspname = 'public'`,
    );
    // composite FKs are one constraint each; dedupe identical parent>child pairs
    const actual = new Map<string, boolean>();
    for (const f of fks.rows) actual.set(`${f.parent}>${f.child}`, f.child_unique);
    const documented = new Map(
      parseRelationships().map((r) => [`${r.parent}>${r.child}`, r.childSide]),
    );

    expect([...documented.keys()].sort()).toEqual([...actual.keys()].sort());
    for (const [pair, childUnique] of actual) {
      const side = documented.get(pair)!;
      if (childUnique) expect(["o|", "||"], pair).toContain(side);
      else expect(["o{", "|{"], pair).toContain(side);
    }
  });
});
