// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, expect, it } from "vitest";
const db = new PGlite();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fn(file: string, name: string) {
  const sql = readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), "utf8");
  const match = sql.match(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION ${name.replaceAll(".", "\\.")}\\([\\s\\S]*?\\$\\$;`, "i"));
  if (!match) throw new Error(`Missing function ${name}`); return match[0];
}
beforeAll(async () => {
  await db.exec(`create schema private; create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('qa.uid',true),'')::uuid$$;
    create table homework(id uuid primary key,kind text,course_id uuid,status text,max_score numeric,version int,submission_types text[]);
    create table exam_papers(homework_id uuid primary key,questions jsonb,forms jsonb default '[]',delivery text,duration_minutes int,updated_at timestamptz);
    create table homework_submissions(id uuid primary key,homework_id uuid,student_id uuid,attempt_count int,status text);
    create table homework_grades(id uuid primary key default gen_random_uuid(),submission_id uuid unique,homework_id uuid,student_id uuid,attempt_no int,score numeric,criteria_scores jsonb,feedback text,status text,rubric_version int,needs_review boolean default false,graded_by uuid,graded_at timestamptz default now(),published_at timestamptz,rev int default 1,exam_reviewed_at timestamptz,exam_reviewed_by uuid,exam_approved_at timestamptz,exam_approved_by uuid);
    create table homework_grade_history(grade_id uuid,old_score numeric,new_score numeric,old_feedback text,new_feedback text,reason text,actor uuid);
    create function is_course_teacher(c uuid) returns boolean language sql as $$select auth.uid()='${id(1)}'::uuid and c='${id(2)}'::uuid$$;
    create function can_read_homework(h uuid) returns boolean language sql as $$select auth.uid() in ('${id(1)}'::uuid,'${id(3)}'::uuid) and h='${id(4)}'::uuid$$;
    create function _hw_event(h uuid,s uuid,a text,d jsonb) returns void language sql as $$select$$;
    create function _grade_submission_before_exam(s uuid,sc numeric,c jsonb,f text,fin boolean,r integer) returns integer language plpgsql as $$begin
      if sc<0 or sc>5 then raise exception 'score out of range'; end if;
      insert into homework_grades(submission_id,homework_id,student_id,score,status,published_at,rev) select id,homework_id,student_id,sc,case when fin then 'published' else 'in_progress' end,case when fin then now() end,1 from homework_submissions where id=s
      on conflict(submission_id) do update set score=sc,rev=homework_grades.rev+1,status=case when fin then 'published' else 'in_progress' end returning rev into r; return r; end$$;
    insert into homework values('${id(4)}','test','${id(2)}','draft',5,1,array['text']),('${id(5)}','homework','${id(2)}','published',5,1,array['text']);
    insert into homework_submissions values('${id(6)}','${id(4)}','${id(3)}',1,'submitted'),('${id(7)}','${id(5)}','${id(3)}',1,'submitted');
    insert into exam_papers(homework_id,questions) values('${id(4)}','[{"type":"single","prompt":"first","points":2,"options":["wrong","right"],"correct":[1],"answer":""},{"type":"single","prompt":"second","points":3,"options":["yes","no"],"correct":[0],"answer":""}]');
    select set_config('qa.uid','${id(1)}',false);`);
  const first = "20261116090411_00771652-dc11-4c4f-9d39-f7a3445d53af.sql";
  await db.exec(fn(first, "private.exam_config_save"));
  await db.exec(fn(first, "private.exam_get"));
  await db.exec(fn(first, "public.exam_result_action").replace("public.exam_result_action", "private.exam_result_action"));
  await db.exec(fn(first, "public.grade_submission").replace("public.grade_submission", "private.grade_submission"));
}, 30000);
afterAll(async () => { await db.close(); });
it("stores two fixed models with correctly remapped alternatives", async () => {
  await db.exec(`select private.exam_config_save('${id(4)}','paper',45,2)`);
  const result = await db.query<{ forms: { id: string; questions: { prompt: string; options: string[]; correct: number[] }[] }[] }>("select forms from exam_papers");
  const forms = result.rows[0]?.forms; expect(forms?.map(f => f.id)).toEqual(["A", "B"]);
  for (const form of forms ?? []) for (const q of form.questions) expect(q.options[q.correct[0] ?? -1]).toBe(q.prompt === "first" ? "right" : "yes");
});
it("non-teacher reads no answer keys in base or variant questions", async () => {
  await db.exec(`select set_config('qa.uid','${id(3)}',false)`);
  const r = await db.query<{ paper: { questions: object[]; forms: { questions: object[] }[] } }>(`select private.exam_get('${id(4)}') paper`);
  const paper = r.rows[0]?.paper; expect(paper).toBeDefined();
  for (const q of [...(paper?.questions ?? []), ...(paper?.forms.flatMap(f => f.questions) ?? [])]) { expect(q).not.toHaveProperty("correct"); expect(q).not.toHaveProperty("answer"); }
});
it("student cannot configure models or approve grades", async () => {
  await expect(db.exec(`select private.exam_config_save('${id(4)}','paper',45,2)`)).rejects.toThrow();
  await expect(db.exec(`select private.exam_result_action('${id(6)}','approve',1)`)).rejects.toThrow();
});
it("test grade stays hidden until review and approval; homework stays immediate", async () => {
  await db.exec(`select set_config('qa.uid','${id(1)}',false); select private.grade_submission('${id(6)}',5,'[]','',true,null); select private.grade_submission('${id(7)}',4,'[]','',true,null);`);
  const rows = (await db.query<{ homework_id: string; status: string; published_at: string | null }>("select homework_id,status,published_at from homework_grades order by homework_id")).rows;
  expect(rows[0]?.status).toBe("in_progress"); expect(rows[0]?.published_at).toBeNull(); expect(rows[1]?.status).toBe("published"); expect(rows[1]?.published_at).not.toBeNull();
  await expect(db.exec(`select private.exam_result_action('${id(6)}','approve',1)`)).rejects.toThrow();
  await db.exec(`select private.exam_result_action('${id(6)}','review',1);select private.exam_result_action('${id(6)}','approve',2)`);
  const grade = (await db.query<{ status: string; published_at: string | null; rev: number }>(`select status,published_at,rev from homework_grades where submission_id='${id(6)}'`)).rows[0];
  expect(grade).toMatchObject({ status: "graded", published_at: null, rev: 3 });
  await expect(db.exec(`select private.grade_submission('${id(6)}',2,'[]','edit',false,1)`)).rejects.toThrow();
  await db.exec(`select private.grade_submission('${id(6)}',2,'[]','edit',false,3)`);
  const edited = (await db.query<{ status: string; exam_approved_at: string | null }>(`select status,exam_approved_at from homework_grades where submission_id='${id(6)}'`)).rows[0]; expect(edited).toEqual({ status: "in_progress", exam_approved_at: null });
  expect((await db.query("select * from homework_grade_history")).rows).toHaveLength(1);
});