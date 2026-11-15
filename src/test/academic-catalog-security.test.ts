// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";

const db = new PGlite();
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
beforeAll(async () => {
  await db.exec(`
    create role authenticated;
    create role anon;
    create schema auth;
    grant usage on schema auth to authenticated, anon;
    create function auth.uid() returns uuid language sql as $$
      select nullif(current_setting('qa.uid', true), '')::uuid
    $$;
    create function public.is_platform_admin() returns boolean language sql as $$
      select auth.uid() = '${uid(9)}'::uuid
    $$;
    create table organizations(id uuid primary key, is_active boolean);
    create table schools(id uuid primary key, org_id uuid, is_active boolean);
    create table memberships(user_id uuid, org_id uuid, school_id uuid, is_active boolean, branch_suspended boolean);
    create table academic_catalog(name text);
    grant select on organizations, schools, memberships, academic_catalog to authenticated;
    alter table memberships enable row level security;
    create policy own_membership on memberships for select to authenticated using(user_id = auth.uid());
    alter table academic_catalog enable row level security;
    create policy academic_catalog_read on academic_catalog for select to authenticated using(auth.uid() is not null);
    insert into organizations values('${uid(10)}',true),('${uid(20)}',false);
    insert into schools values('${uid(11)}','${uid(10)}',true),('${uid(12)}','${uid(10)}',false),('${uid(21)}','${uid(20)}',true);
    insert into memberships values
      ('${uid(1)}','${uid(10)}',null,true,false),
      ('${uid(2)}','${uid(10)}','${uid(11)}',true,false),
      ('${uid(3)}','${uid(10)}','${uid(11)}',false,false),
      ('${uid(4)}','${uid(10)}','${uid(11)}',true,true),
      ('${uid(5)}','${uid(10)}','${uid(12)}',true,false),
      ('${uid(6)}','${uid(20)}','${uid(21)}',true,false),
      ('${uid(7)}','${uid(10)}','${uid(21)}',true,false);
    insert into academic_catalog values('1448/1449'),('الفصل الدراسي الأول');
  `);
  await db.exec(readFileSync(new URL("../../supabase/migrations/20261115115859_bc5455f8-2d87-4641-9453-5ba5fbe8041a.sql", import.meta.url), "utf8"));
}, 30000);
afterAll(async () => { await db.close(); });

async function rows(n: number) {
  await db.exec(`reset role; select set_config('qa.uid','${uid(n)}',false); set role authenticated;`);
  return (await db.query<{ name: string }>("select name from academic_catalog order by name")).rows;
}
it.each([1, 2, 9])("approved owner, school member or platform admin %i reads shared reference values", async n => {
  expect((await rows(n)).map(row => row.name)).toEqual(["1448/1449", "الفصل الدراسي الأول"]);
});
it("authentication without approved membership does not grant catalog access", async () => {
  expect(await rows(8)).toEqual([]);
});
it.each([3, 4, 5, 6, 7])("inactive, suspended or invalid organization/school membership %i grants no access", async n => {
  expect(await rows(n)).toEqual([]);
});
it("anonymous callers have no table privilege", async () => {
  await db.exec("reset role; select set_config('qa.uid','',false); set role anon;");
  await expect(db.query("select * from academic_catalog")).rejects.toThrow(/permission denied/);
});