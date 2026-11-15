// Isolated PostgreSQL only: no network, Auth accounts, messages or live data.
// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const db = new PGlite();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const org = id(1), school = id(2), otherSchool = id(3), otherOrg = id(4);
beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select '${id(5)}'::uuid $$;
    create function public.section_enabled(uuid,text) returns boolean language sql as $$ select true $$;
    create function public._ad_ok(uuid,uuid,text) returns boolean language sql as $$ select $2='${school}'::uuid $$;
    create table schools(id uuid, org_id uuid, name text);
    create table students(id uuid, full_name text, school_id uuid, user_id uuid);
    create table ad_applications(id uuid, student_id uuid, org_id uuid, school_id uuid, status text, linked_at timestamptz, ref text);
    create table enrollments(student_id uuid, status text, start_date date, created_at timestamptz, section_id uuid, year_id uuid);
    create table sections(id uuid, name text, grade_id uuid);
    create table grades(id uuid, name text, stage_id uuid);
    create table stages(id uuid, name text);
    create table academic_years(id uuid, name text);
    insert into schools values ('${school}','${org}','Test'), ('${otherSchool}','${org}','Other');
    insert into students values
      ('${id(10)}','Accepted','${school}',null), ('${id(11)}','Rejected','${school}',null),
      ('${id(12)}','Unlinked','${school}',null), ('${id(13)}','Following','${school}',null),
      ('${id(14)}','Other school','${otherSchool}',null), ('${id(15)}','Wrong org','${school}',null),
      ('${id(16)}','Wrong school link','${school}',null);
    insert into ad_applications values
      ('${id(20)}','${id(10)}','${org}','${school}','accepted',now(),'A-1'),
      ('${id(21)}','${id(10)}','${org}','${school}','accepted',now(),'A-2'),
      ('${id(22)}','${id(11)}','${org}','${school}','rejected',now(),'R'),
      ('${id(23)}','${id(13)}','${org}','${school}','following',now(),'F'),
      ('${id(24)}','${id(14)}','${org}','${otherSchool}','accepted',now(),'S'),
      ('${id(25)}','${id(15)}','${otherOrg}','${school}','accepted',now(),'O'),
      ('${id(26)}','${id(16)}','${org}','${otherSchool}','accepted',now(),'X');
  `);
  await db.exec(readFileSync(new URL("../../supabase/migrations/20261115075851_d2b1c82b-f72e-4619-9721-3f6fbad78438.sql", import.meta.url), "utf8"));
}, 30000);
afterAll(async () => { await db.close(); });
async function list(filters = {}) {
  const result = await db.query<{ value: { total: number; rows: { id: string; app_ref: string }[] } }>("select ad_students($1::uuid,$2::jsonb,25,0) value", [org, JSON.stringify(filters)]);
  return result.rows[0]?.value;
}
describe("admissions current students", () => {
  it("requires an actually accepted linked request and deduplicates students", async () => {
    const result = await list();
    expect(result?.total).toBe(1);
    expect(result?.rows.map((r) => r.id)).toEqual([id(10)]);
  });
  it("isolates school and organization even with forged accepted links", async () => {
    expect((await list({ school: otherSchool }))?.total).toBe(0);
    expect((await list({ q: "Wrong" }))?.total).toBe(0);
  });
  it("export uses the same accepted-request filter", async () => {
    expect((await list({ export: true }))?.rows.map((r) => r.id)).toEqual([id(10)]);
  });
  it("a re-opened request no longer qualifies without changing the student", async () => {
    await db.exec(`begin; update ad_applications set status='following' where student_id='${id(10)}';`);
    try { expect((await list())?.total).toBe(0); }
    finally { await db.exec("rollback;"); }
    expect((await list())?.total).toBe(1);
  });
  it("academic student records remain intact", async () => {
    expect((await db.query<{ n: number }>("select count(*)::int n from students")).rows[0]?.n).toBe(7);
  });
  it("an unauthorized organization is refused", async () => {
    await expect(db.query("select ad_students($1::uuid)", [otherOrg])).rejects.toThrow("لا تملك عرض الطلاب الحاليين");
  });
});