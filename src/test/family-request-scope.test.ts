// @vitest-environment node
// Entirely in-memory PostgreSQL; no accounts, provider messages or hosted data.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, expect, it } from "vitest";
const db = new PGlite();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
beforeAll(async () => {
 await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; grant usage on schema auth to authenticated;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('qa.uid',true),'')::uuid$$;
 create table organizations(id uuid primary key); create table schools(id uuid primary key,org_id uuid,name text); create table students(id uuid primary key,school_id uuid,full_name text,status text); create table profiles(id uuid,full_name text);
 create function school_org(uuid) returns uuid language sql as $$select org_id from schools where id=$1$$;
 create function is_guardian_of(uuid) returns boolean language sql as $$select auth.uid()='${id(10)}'::uuid and $1='${id(3)}'::uuid$$;
 create function _ad_ok(uuid,uuid,text) returns boolean language sql as $$select $1='${id(11)}'::uuid and $2='${id(2)}'::uuid$$;
 insert into organizations values('${id(1)}'),('${id(20)}'); insert into schools values('${id(2)}','${id(1)}','A'),('${id(21)}','${id(20)}','B'); insert into students values('${id(3)}','${id(2)}','Child','active'),('${id(22)}','${id(21)}','Other','active'); insert into profiles values('${id(10)}','Guardian'),('${id(11)}','Admissions'); grant select on schools,students,profiles to authenticated;`);
 for (const file of ["20261115102213_588713ce-12c4-4a09-9ab8-ec6764f3a82c.sql", "20261115102406_5439cc85-f2de-4cf8-a10e-e7b2cb8c8e6e.sql"]) await db.exec(readFileSync(new URL(`../../supabase/migrations/${file}`,import.meta.url),"utf8"));
},30000);
afterAll(async () => {await db.close();});
async function asUser(n:number) { await db.exec(`reset role; select set_config('qa.uid','${id(n)}',false); set role authenticated;`); }
let request: string;
it("verified guardian can create for own child with append-only history",async()=>{await asUser(10);const q=await db.query<{id:string}>("select family_request_create($1,'mother_account','Please add mother') id",[id(3)]);request=q.rows[0]?.id ?? "";expect(request).not.toBe("");expect((await db.query("select * from family_request_history")).rows).toHaveLength(1);});
it("guardian cannot forge another child or school",async()=>{await asUser(10);await expect(db.query("select family_request_create($1,'withdrawal','Test request')",[id(22)])).rejects.toThrow();});
it("unrelated user cannot read details by guessed id",async()=>{await asUser(12);expect((await db.query("select * from family_requests")).rows).toHaveLength(0);await expect(db.query("select family_request_detail($1)",[request])).rejects.toThrow();});
it("requires rejection reason on the server",async()=>{await asUser(11);await expect(db.query("select family_request_decide($1,'rejected','Not accepted',null)",[request])).rejects.toThrow();});
it("acceptance is only a decision and leaves student unchanged",async()=>{await asUser(11);await db.query("select family_request_decide($1,'accepted','Please verify relationship',null)",[request]);expect((await db.query<{status:string}>("select status from students where id=$1",[id(3)])).rows[0]?.status).toBe("active");expect((await db.query<{status:string}>("select status from family_requests where id=$1",[request])).rows[0]?.status).toBe("accepted");expect((await db.query("select * from family_request_history")).rows).toHaveLength(2);});
it("prevents second decision and forged audit history",async()=>{await asUser(11);await expect(db.query("select family_request_decide($1,'rejected','Changed mind','Reason')",[request])).rejects.toThrow();await expect(db.query("insert into family_request_history(request_id,status) values($1,'accepted')",[request])).rejects.toThrow();});
it("admissions cannot read another institution's request",async()=>{await db.exec("reset role"); await db.query("insert into family_requests(org_id,school_id,student_id,kind,body,requested_by) values($1,$2,$3,'data_change','Other request',$4)",[id(20),id(21),id(22),id(10)]);await asUser(11);expect((await db.query("select * from family_requests where school_id=$1",[id(21)])).rows).toHaveLength(0);});