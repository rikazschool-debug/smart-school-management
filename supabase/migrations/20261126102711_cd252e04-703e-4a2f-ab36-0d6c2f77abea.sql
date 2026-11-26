CREATE OR REPLACE FUNCTION public._au_win(_x uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public'
AS $f$ select case when nullif(current_setting('au.win_eq', true),'') is not null then _x = current_setting('au.win_eq')::uuid
                   when nullif(current_setting('au.win_after', true),'') is not null then _x > current_setting('au.win_after')::uuid
                   else true end $f$;
CREATE OR REPLACE FUNCTION public._au_lim() RETURNS integer LANGUAGE sql STABLE SET search_path TO 'public'
AS $f$ select nullif(current_setting('au.win_lim', true),'')::int $f$;

DO $do$
declare f text; d text; n int; want int; begin
 foreach f in array array['_api_rows','_api_rows_v2','_api_rows_v3','_api_rows_v4'] loop
   d := pg_get_functiondef(('public.'||f||'(text,uuid,uuid[],boolean,uuid[],uuid[],uuid[],uuid[],uuid[],uuid[],uuid,uuid)')::regprocedure);
   if position('_au_win' in d) > 0 then continue; end if;
   n := (select count(*) from regexp_matches(d, '\(_id is null or (\w+)\.id = _id\)\) v', 'g'));
   want := case f when '_api_rows' then 20 when '_api_rows_v2' then 33 when '_api_rows_v3' then 4 else 12 end;
   if n <> want then raise exception '% has % branches, expected %', f, n, want; end if;
   d := regexp_replace(d, '\(_id is null or (\w+)\.id = _id\)\) v',
        '(_id is null or \1.id = _id) and public._au_win(\1.id) order by case when public._au_lim() is not null then \1.id end limit public._au_lim()) v', 'g');
   if f = '_api_rows_v2' or f = '_api_rows_v4' then
     d := replace(d, $s$_res = 'hr_attendance' and _id is null and d.org_id = _org and (_all or d.school_id = any(_sch))) v$s$,
       $s$_res = 'hr_attendance' and _id is null and d.org_id = _org and (_all or d.school_id = any(_sch)) and public._au_win(md5(d.employee_id::text || '_' || d.date::text)::uuid) order by case when public._au_lim() is not null then md5(d.employee_id::text || '_' || d.date::text)::uuid end limit public._au_lim()) v$s$);
   end if;
   execute d;
 end loop;
end $do$;

ALTER TABLE public.au_platform ADD COLUMN IF NOT EXISTS fin_formula_hash text;
UPDATE public.au_platform SET fin_formula_hash = md5(pg_get_functiondef('public._sf_balance(uuid)'::regprocedure) || pg_get_functiondef('public._sf_balances(uuid[])'::regprocedure));

CREATE OR REPLACE FUNCTION public._au_fin_guard(_org uuid, _schools uuid[])
 RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
declare bad int; begin
 if (select fin_formula_hash from au_platform limit 1) is distinct from
    md5(pg_get_functiondef('public._sf_balance(uuid)'::regprocedure) || pg_get_functiondef('public._sf_balances(uuid[])'::regprocedure)) then
   raise exception 'finance balance check failed: the finance balance formula changed; automation balances are blocked until parity is re-verified' using errcode='P0001';
 end if;
 with ids as (select b.id from sf_obligations b join schools s on s.id=b.school_id and s.org_id=_org
              where (_schools is null or b.school_id = any(_schools)) order by b.updated_at desc, b.id limit 25),
      tw as (select * from _sf_balances(array(select id from ids)))
 select count(*) into bad from ids left join tw on tw.obligation_id=ids.id where tw.bal is distinct from _sf_balance(ids.id);
 if bad > 0 then raise exception 'finance balance check failed: % balances differ from the finance service; results blocked', bad using errcode='P0001'; end if;
end $f$;
REVOKE ALL ON FUNCTION public._au_fin_guard(uuid,uuid[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._au_ds_api(_ev text, _org uuid, _schools uuid[], _lim integer, _entity uuid, _params jsonb)
 RETURNS TABLE(entity uuid, school uuid, period text, ctx jsonb)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare td date := school_today(); p jsonb; aft uuid; rep text; bk text; src au_sources; res text; sc uuid[]; lim int;
  rows_ jsonb; n int; got int := 0; r jsonb; eid uuid; sid uuid; guard int := 0;
begin
 select * into src from au_sources where event_code=_ev;
 if src.key is null or src.api_key is null then raise exception 'unknown data source %', _ev; end if;
 if src.org_section is not null and not section_enabled(_org, src.org_section) then return; end if;
 res := src.api_key;
 aft := nullif(coalesce(_params,'{}'::jsonb)->>'_after','')::uuid;
 p := coalesce(_au_check_params(_ev, coalesce(nullif(_params,'null'::jsonb),'{}'::jsonb) - '_after'), '{}'::jsonb);
 rep := coalesce(p->>'repeat','once');
 bk := case rep when 'daily' then '@'||td::text when 'weekly' then '@'||to_char(td,'IYYY-IW') when 'monthly' then '@'||to_char(td,'YYYY-MM') else '' end;
 lim := least(greatest(coalesce(_lim,100),1), coalesce(src.max_rows, 1000000));
 sc := array(select s.id from schools s where s.org_id=_org and s.is_active and (_schools is null or s.id = any(_schools)));
 loop
   -- the integration reader returns at most one window of rows after the cursor (or the single record); integrations never set this window
   perform set_config('au.win_eq', coalesce(_entity::text,''), true);
   perform set_config('au.win_after', case when _entity is null then coalesce(aft::text,'') else '' end, true);
   perform set_config('au.win_lim', case when _entity is null then lim::text else '2' end, true);
   select coalesce(jsonb_agg(z.x order by z.e),'[]'::jsonb), count(*) into rows_, n
     from (select x, case when (x->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (x->>'id')::uuid else md5(x->>'id')::uuid end e
           from _api_rows_all(res, _org, sc, _schools is null, null, null, null, null, null, null, null, null) x where x ? 'id') z;
   perform set_config('au.win_eq','',true); perform set_config('au.win_after','',true); perform set_config('au.win_lim','',true);
   for r in select * from jsonb_array_elements(rows_) loop
     eid := case when (r->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (r->>'id')::uuid else md5(r->>'id')::uuid end;
     aft := eid;
     sid := case when nullif(r->>'school_id','') ~* '^[0-9a-f-]{36}$' then (r->>'school_id')::uuid end;
     if (sid is null and _schools is null) or (sid is not null and sid = any(sc)) then
       entity := eid; school := sid;
       period := coalesce(case when src.date_field is not null then r->>src.date_field end, 'rec')||bk;
       ctx := _au_api_ctx(_ev, r, td) || _au_api_extra(res, r, td);
       got := got + 1; return next;
       exit when got >= lim;
     end if;
   end loop;
   guard := guard + 1;
   exit when _entity is not null or n < lim or got >= lim or guard > 1000;
 end loop;
end $function$;
REVOKE ALL ON FUNCTION public._au_ds_api(text,uuid,uuid[],integer,uuid,jsonb) FROM PUBLIC, anon, authenticated;

-- read-only automation access to operational sections (no operational grant needed)
CREATE OR REPLACE FUNCTION public._au_perm_list()
 RETURNS TABLE(sec text, sec_label text, o integer, act text, label text, ao integer)
 LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
 values
 ('au_view','مركز الأتمتة — العرض',1,'center','الدخول إلى مركز الأتمتة',1),
 ('au_view','مركز الأتمتة — العرض',1,'dashboard','لوحة المؤشرات',2),
 ('au_view','مركز الأتمتة — العرض',1,'rules','قواعد الأتمتة',3),
 ('au_view','مركز الأتمتة — العرض',1,'events','دليل الأحداث',4),
 ('au_view','مركز الأتمتة — العرض',1,'conditions','دليل الشروط والمتغيرات',5),
 ('au_view','مركز الأتمتة — العرض',1,'actions','دليل الإجراءات',6),
 ('au_view','مركز الأتمتة — العرض',1,'schedule','الجدولة',7),
 ('au_view','مركز الأتمتة — العرض',1,'runs','مراقبة التنفيذ',8),
 ('au_view','مركز الأتمتة — العرض',1,'failed','العمليات الفاشلة',9),
 ('au_view','مركز الأتمتة — العرض',1,'jobs','الوظائف التلقائية القائمة',10),
 ('au_view','مركز الأتمتة — العرض',1,'audit','سجل التدقيق',11),
 ('au_manage','مركز الأتمتة — إدارة القواعد',2,'create','إنشاء مسودة جديدة',1),
 ('au_manage','مركز الأتمتة — إدارة القواعد',2,'edit','تعديل المسودات',2),
 ('au_manage','مركز الأتمتة — إدارة القواعد',2,'clone','نسخ القواعد',3),
 ('au_manage','مركز الأتمتة — إدارة القواعد',2,'designer','استخدام المصمم المرئي',4),
 ('au_manage','مركز الأتمتة — إدارة القواعد',2,'simulate','إجراء المحاكاة',5),
 ('au_manage','مركز الأتمتة — إدارة القواعد',2,'submit','إرسال القاعدة للاعتماد',6),
 ('au_manage','مركز الأتمتة — إدارة القواعد',2,'versions','مشاهدة الإصدارات السابقة',7),
 ('au_manage','مركز الأتمتة — إدارة القواعد',2,'restore','اقتراح استعادة إصدار سابق',8),
 ('au_manage','مركز الأتمتة — إدارة القواعد',2,'archive','أرشفة القواعد',9),
 ('au_control','مركز الأتمتة — المراجعة والتحكم',3,'review','مراجعة القواعد',1),
 ('au_control','مركز الأتمتة — المراجعة والتحكم',3,'approve','اعتماد القواعد (مدير المدرسة أو الوكيل فقط)',2),
 ('au_control','مركز الأتمتة — المراجعة والتحكم',3,'reject','رفض القواعد أو إعادتها مع السبب',3),
 ('au_control','مركز الأتمتة — المراجعة والتحكم',3,'activate','تفعيل القواعد (مدير المدرسة أو الوكيل فقط)',4),
 ('au_control','مركز الأتمتة — المراجعة والتحكم',3,'pause','إيقاف القواعد',5),
 ('au_control','مركز الأتمتة — المراجعة والتحكم',3,'rerun','إعادة تشغيل القواعد',6),
 ('au_control','مركز الأتمتة — المراجعة والتحكم',3,'retry','إعادة محاولة العمليات الفاشلة',7),
 ('au_data','مركز الأتمتة — قراءة بيانات الأقسام التشغيلية',4,'meetings','قراءة بيانات الاجتماعات والقرارات (دون صلاحية التنظيم)',1),
 ('au_data','مركز الأتمتة — قراءة بيانات الأقسام التشغيلية',4,'circulars','قراءة بيانات التعاميم (دون صلاحية النشر)',2),
 ('au_data','مركز الأتمتة — قراءة بيانات الأقسام التشغيلية',4,'gate','قراءة حركة البوابة (دون صلاحية التشغيل)',3)
$function$;

CREATE OR REPLACE FUNCTION public._perm_valid(_section text, _action text, _scope text)
 RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
 select case when _section in ('au_view','au_manage','au_control','au_data')
   then exists(select 1 from _au_perm_list() p where p.sec=_section and p.act=_action) and (_scope is null or _scope='org')
   else _perm_valid_pre_au(_section,_action,_scope) end
$function$;

INSERT INTO public.au_sections(key,label,parent,area,status,reason)
VALUES ('au_data','مركز الأتمتة — قراءة بيانات الأقسام التشغيلية','users_admin','central','excluded','صلاحيات قراءة لمركز الأتمتة نفسه؛ لا تُبنى عليها قواعد أتمتة')
ON CONFLICT (key) DO NOTHING;

-- 'section:action' entries: view = section view; operational actions (organize/publish/operate) are satisfied either by
-- that action or by the read-only automation grant au_data.<section> — never by granting the operation itself
CREATE OR REPLACE FUNCTION public._au_ps_ok(_school uuid, _uid uuid, _ps text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
 select case when coalesce(nullif(split_part(_ps,':',2),''),'view') = 'view'
   then _perm_allows_user(_school, _uid, split_part(_ps,':',1), 'view')
   else _perm_allows_user(_school, _uid, split_part(_ps,':',1), split_part(_ps,':',2))
     or (exists(select 1 from _au_perm_list() l where l.sec='au_data' and l.act=split_part(_ps,':',1))
         and exists(select 1 from schools s where s.id=_school and _au_perm(s.org_id, _uid, 'au_data', split_part(_ps,':',1)))) end
$f$;
REVOKE ALL ON FUNCTION public._au_ps_ok(uuid,uuid,text) FROM PUBLIC, anon, authenticated;