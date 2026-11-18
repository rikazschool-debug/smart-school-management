// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Exercise the actual migration's gate in local PostgreSQL/WASM, not a JS copy of it.
// The fixture contains no real identities, credentials, provider clients or network calls.
const uid = "10000000-0000-4000-8000-000000000001";
const org = "20000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";
const school = "30000000-0000-4000-8000-000000000001";
const foreignSchool = "30000000-0000-4000-8000-000000000002";
let db: PGlite;
const staff = [
  "org_owner",
  "principal",
  "vice_principal",
  "dept_head",
  "supervisor",
  "teacher",
  "student_affairs",
  "counselor",
  "nurse",
  "security",
];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION is_platform_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('qa.platform_admin',true)='on' $$;
    CREATE TABLE organizations(id uuid PRIMARY KEY,is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE schools(id uuid PRIMARY KEY,org_id uuid,is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE memberships(user_id uuid,org_id uuid,school_id uuid,role text,is_active boolean NOT NULL DEFAULT true,branch_suspended boolean NOT NULL DEFAULT false);
    CREATE TABLE user_active_context(user_id uuid,org_id uuid,school_id uuid,role text);
  `);
  const migration = readFileSync(
    new URL(
      "../../supabase/migrations/20261117212135_84f8737f-3035-4875-b1d7-0ab795e9e006.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await db.exec(migration.split("CREATE OR REPLACE FUNCTION private.co_community")[0]!);
}, 30000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(`
    TRUNCATE organizations,schools,memberships,user_active_context;
    SELECT set_config('request.jwt.claim.sub','${uid}',false),set_config('qa.platform_admin','off',false);
    INSERT INTO organizations(id)VALUES('${org}'),('${other}');
    INSERT INTO schools(id,org_id)VALUES('${school}','${org}'),('${foreignSchool}','${other}');
    INSERT INTO memberships(user_id,org_id,school_id,role)VALUES('${uid}','${org}','${school}','teacher');
    INSERT INTO user_active_context VALUES('${uid}','${org}','${school}','teacher');
  `);
});
async function allowed(target = org) {
  return (await db.query<{ ok: boolean }>("SELECT _co_ok($1::uuid) AS ok", [target])).rows[0]!.ok;
}

describe("collaboration active-context authorization", () => {
  it.each(staff)(
    "allows active staff role %s in its matching organization/context",
    async (role) => {
      await db.query("UPDATE memberships SET role=$1", [role]);
      await db.query("UPDATE user_active_context SET role=$1", [role]);
      expect(await allowed()).toBe(true);
    },
  );
  it.each(["student", "guardian"])("denies %s even with a matching context", async (role) => {
    await db.query("UPDATE memberships SET role=$1", [role]);
    await db.query("UPDATE user_active_context SET role=$1", [role]);
    expect(await allowed()).toBe(false);
  });
  it.each([
    "SELECT set_config('request.jwt.claim.sub','',false)",
    "DELETE FROM memberships",
    "DELETE FROM user_active_context",
    "UPDATE memberships SET is_active=false",
    "UPDATE memberships SET branch_suspended=true",
    "UPDATE organizations SET is_active=false",
    "UPDATE schools SET is_active=false",
    "UPDATE user_active_context SET role='principal'",
    `UPDATE user_active_context SET org_id='${other}'`,
    `UPDATE user_active_context SET school_id='${foreignSchool}'`,
    `UPDATE memberships SET org_id='${other}'`,
  ])("denies a missing, suspended, inactive or mismatched identity/context: %s", async (change) => {
    await db.exec(change);
    expect(await allowed()).toBe(false);
  });
  it("denies access to another organization", async () => {
    expect(await allowed(other)).toBe(false);
  });
  it("allows the group owner's null-school membership only in an active branch of that group", async () => {
    await db.exec(
      "UPDATE memberships SET role='org_owner',school_id=NULL;UPDATE user_active_context SET role='org_owner'",
    );
    expect(await allowed()).toBe(true);
    await db.exec(`UPDATE user_active_context SET school_id='${foreignSchool}'`);
    expect(await allowed()).toBe(false);
  });
  it("requires platform-admin proof, owner context and an active same-org branch", async () => {
    await db.exec(
      "DELETE FROM memberships;SELECT set_config('qa.platform_admin','on',false);UPDATE user_active_context SET role='org_owner'",
    );
    expect(await allowed()).toBe(true);
    await db.exec("UPDATE user_active_context SET role='teacher'");
    expect(await allowed()).toBe(false);
    await db.exec("UPDATE user_active_context SET role='org_owner',school_id=NULL");
    expect(await allowed()).toBe(false);
    await db.exec(`UPDATE user_active_context SET school_id='${foreignSchool}'`);
    expect(await allowed()).toBe(false);
  });
});
