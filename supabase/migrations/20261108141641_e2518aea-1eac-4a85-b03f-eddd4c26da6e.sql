-- ===== Chat settings (cs_*) =====
alter function public._perm_base(uuid,uuid,text,text) rename to _perm_base_v9;
create or replace function public._perm_base(_school uuid, _uid uuid, _section text, _action text) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select case when _section='chat_settings' then _perm_owner(_uid, school_org(_school))
    else _perm_base_v9(_school,_uid,_section,_action) end $$;

alter function public.perm_catalog() rename to _perm_catalog_v8;
create or replace function public.perm_catalog() returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_set(b, '{sections}', (b->'sections') || jsonb_build_array(
    jsonb_build_object('key','chat_settings','label','ضبط المحادثات — الردود المحفوظة والآلية والصوتيات','parent','school_admin',
      'actions',jsonb_build_array('view','replies','autoreply','media'),'scopes',jsonb_build_array('org'),
      'labels',jsonb_build_object('view','عرض إعدادات المحادثات وسجلها','replies','إدارة الردود المحفوظة','autoreply','إدارة الردود الآلية','media','إعدادات الرسائل الصوتية والمرفقات'))))
  from (select _perm_catalog_v8() b) x $$;

create or replace function public._cs_ok(_org uuid, _action text) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select coalesce(is_org_owner(_org) or perm_scope(_org, auth.uid(), 'chat_settings', _action) = 'org'
    or (_action='view' and exists(select 1 from unnest(array['replies','autoreply','media']) a where perm_scope(_org, auth.uid(), 'chat_settings', a) = 'org')), false) $$;

create table public.cs_settings(
  org_id uuid primary key references organizations(id) on delete cascade,
  voice_enabled boolean not null default true, voice_max_sec int not null default 120, voice_max_bytes bigint not null default 5242880,
  attachments_enabled boolean not null default true, updated_by uuid, updated_at timestamptz not null default now());
create table public.cs_replies(
  id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id) on delete cascade,
  title text not null, shortcut text not null, body text not null, roles text[] not null default '{all}', active boolean not null default true,
  created_by uuid, updated_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index cs_replies_short_uq on public.cs_replies(org_id, lower(shortcut));
create table public.cs_auto_rules(
  id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id) on delete cascade,
  kind text not null check (kind in ('welcome','off_hours')), name text not null, body text not null,
  school_ids uuid[] not null default '{}', recipient_roles text[] not null default '{}',
  priority int not null default 100, cooldown_hours int not null default 12,
  hours jsonb not null default '{"days":[0,1,2,3,4],"start":"07:00","end":"14:00"}',
  sender_label text not null default 'رد آلي — إدارة المدرسة',
  active boolean not null default false, activated_at timestamptz,
  created_by uuid, updated_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.cs_auto_runs(
  id uuid primary key default gen_random_uuid(), org_id uuid not null, rule_id uuid not null references cs_auto_rules(id) on delete cascade,
  conversation_id uuid not null, trigger_message_id uuid not null, reply_message_id uuid, result text not null, created_at timestamptz not null default now(),
  unique(rule_id, trigger_message_id));
create index cs_auto_runs_conv on public.cs_auto_runs(rule_id, conversation_id, created_at desc);
create table public.cs_log(
  id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id) on delete cascade,
  actor uuid not null, entity text not null, entity_id uuid, action text not null, before jsonb, after jsonb, created_at timestamptz not null default now());
create index cs_log_org on public.cs_log(org_id, created_at desc);
grant all on public.cs_settings, public.cs_replies, public.cs_auto_rules, public.cs_auto_runs, public.cs_log to service_role;
alter table public.cs_settings enable row level security;
alter table public.cs_replies enable row level security;
alter table public.cs_auto_rules enable row level security;
alter table public.cs_auto_runs enable row level security;
alter table public.cs_log enable row level security;

alter table public.messages add column if not exists kind text not null default 'text' check (kind in ('text','voice','auto'));
alter table public.messages add column if not exists auto_rule_id uuid references cs_auto_rules(id) on delete set null;
alter table public.files add column if not exists duration_sec int;

create or replace function public._cs_get(_org uuid) returns cs_settings language sql stable security definer set search_path to 'public' as $$
  select coalesce((select s from cs_settings s where s.org_id=_org), row(_org,true,120,5242880,true,null,now())::cs_settings) $$;

create or replace function public._cs_log(_org uuid, _entity text, _id uuid, _action text, _before jsonb, _after jsonb) returns void
language sql security definer set search_path to 'public' as $$
  insert into cs_log(org_id, actor, entity, entity_id, action, before, after) values (_org, auth.uid(), _entity, _id, _action, _before, _after) $$;

create or replace function public._cs_clean(_t text, _max int) returns text language sql immutable as $$
  select left(regexp_replace(btrim(coalesce(_t,'')), '[\u0000-\u0008\u000B\u000C\u000E-\u001F]', '', 'g'), _max) $$;

-- caller's role labels in an org (for reply availability)
create or replace function public._cs_my_roles(_org uuid) returns text[] language sql stable security definer set search_path to 'public' as $$
  select coalesce(array_agg(distinct role::text), '{}') from memberships where user_id=auth.uid() and org_id=_org and is_active $$;

-- ===== Settings / admin RPCs =====
create or replace function public.cs_admin(_org uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare s cs_settings; begin
  if not _cs_ok(_org,'view') then raise exception 'ليست لديك صلاحية لهذا الإجراء'; end if;
  s := _cs_get(_org);
  return jsonb_build_object(
    'caps', jsonb_build_object('replies',_cs_ok(_org,'replies'),'autoreply',_cs_ok(_org,'autoreply'),'media',_cs_ok(_org,'media')),
    'settings', to_jsonb(s) - 'updated_by',
    'replies', coalesce((select jsonb_agg(to_jsonb(r) - 'created_by' - 'updated_by' order by r.title) from cs_replies r where r.org_id=_org), '[]'),
    'rules', coalesce((select jsonb_agg((to_jsonb(r) - 'created_by' - 'updated_by') || jsonb_build_object('runs',(select count(*) from cs_auto_runs x where x.rule_id=r.id and x.result='sent')) order by r.priority, r.name) from cs_auto_rules r where r.org_id=_org), '[]'),
    'schools', coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from schools where org_id=_org), '[]'),
    'log', coalesce((select jsonb_agg(jsonb_build_object('at',l.created_at,'entity',l.entity,'action',l.action,'actor',coalesce(p.full_name,'مستخدم'),'before',l.before,'after',l.after) order by l.created_at desc)
      from (select * from cs_log where org_id=_org order by created_at desc limit 100) l left join profiles p on p.id=l.actor), '[]'),
    'runs', coalesce((select jsonb_agg(jsonb_build_object('at',x.created_at,'rule',r.name,'result',x.result) order by x.created_at desc)
      from (select * from cs_auto_runs where org_id=_org order by created_at desc limit 50) x join cs_auto_rules r on r.id=x.rule_id), '[]'));
end $$;

create or replace function public.cs_settings_save(_org uuid, _voice boolean, _max_sec int, _max_mb numeric, _attach boolean) returns void
language plpgsql security definer set search_path to 'public' as $$
declare b cs_settings; a cs_settings; begin
  if not _cs_ok(_org,'media') then raise exception 'ليست لديك صلاحية لهذا الإجراء'; end if;
  if _max_sec < 5 or _max_sec > 600 then raise exception 'مدة التسجيل بين 5 ثوانٍ و10 دقائق'; end if;
  if _max_mb <= 0 or _max_mb > 20 then raise exception 'حجم التسجيل بين 0.1 و20 ميغابايت'; end if;
  b := _cs_get(_org);
  insert into cs_settings(org_id, voice_enabled, voice_max_sec, voice_max_bytes, attachments_enabled, updated_by, updated_at)
    values (_org, _voice, _max_sec, (_max_mb*1048576)::bigint, _attach, auth.uid(), now())
    on conflict (org_id) do update set voice_enabled=excluded.voice_enabled, voice_max_sec=excluded.voice_max_sec, voice_max_bytes=excluded.voice_max_bytes,
      attachments_enabled=excluded.attachments_enabled, updated_by=excluded.updated_by, updated_at=now() returning * into a;
  perform _cs_log(_org,'settings',null,'update', to_jsonb(b)-'updated_by'-'updated_at', to_jsonb(a)-'updated_by'-'updated_at');
end $$;

create or replace function public.cs_reply_save(_org uuid, _id uuid, _title text, _shortcut text, _body text, _roles text[], _active boolean) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare b cs_replies; a cs_replies; sc text := lower(regexp_replace(_cs_clean(_shortcut,30), '^/+', '')); begin
  if not _cs_ok(_org,'replies') then raise exception 'ليست لديك صلاحية لهذا الإجراء'; end if;
  if _cs_clean(_title,80) = '' then raise exception 'العنوان مطلوب'; end if;
  if sc !~ '^[[:alnum:]_\-\u0600-\u06FF]{1,30}$' then raise exception 'الاختصار حروف أو أرقام بلا مسافات (حتى 30)'; end if;
  if _cs_clean(_body,2000) = '' then raise exception 'نص الرد مطلوب'; end if;
  if coalesce(array_length(_roles,1),0)=0 then raise exception 'اختر الفئات التي تستخدم الرد'; end if;
  if exists(select 1 from cs_replies r where r.org_id=_org and lower(r.shortcut)=sc and r.id is distinct from _id) then raise exception 'الاختصار مستخدم لرد آخر'; end if;
  if _id is null then
    insert into cs_replies(org_id,title,shortcut,body,roles,active,created_by,updated_by) values (_org,_cs_clean(_title,80),sc,_cs_clean(_body,2000),_roles,coalesce(_active,true),auth.uid(),auth.uid()) returning * into a;
    perform _cs_log(_org,'reply',a.id,'create',null,jsonb_build_object('title',a.title,'shortcut',a.shortcut,'roles',a.roles,'active',a.active));
  else
    select * into b from cs_replies where id=_id and org_id=_org; if b.id is null then raise exception 'الرد غير موجود'; end if;
    update cs_replies set title=_cs_clean(_title,80), shortcut=sc, body=_cs_clean(_body,2000), roles=_roles, active=coalesce(_active,true), updated_by=auth.uid(), updated_at=now() where id=_id returning * into a;
    perform _cs_log(_org,'reply',a.id,'update',jsonb_build_object('title',b.title,'shortcut',b.shortcut,'roles',b.roles,'active',b.active,'body',b.body),jsonb_build_object('title',a.title,'shortcut',a.shortcut,'roles',a.roles,'active',a.active,'body',a.body));
  end if;
  return a.id;
end $$;

create or replace function public.cs_rule_save(_org uuid, _id uuid, _kind text, _name text, _body text, _schools uuid[], _roles text[], _priority int, _cooldown int, _hours jsonb, _label text, _active boolean) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare b cs_auto_rules; a cs_auto_rules; begin
  if not _cs_ok(_org,'autoreply') then raise exception 'ليست لديك صلاحية لهذا الإجراء'; end if;
  if _kind not in ('welcome','off_hours') then raise exception 'نوع القاعدة غير صالح'; end if;
  if _cs_clean(_name,80)='' or _cs_clean(_body,1000)='' then raise exception 'الاسم والنص مطلوبان'; end if;
  if exists(select 1 from unnest(coalesce(_schools,'{}')) s where not exists(select 1 from schools x where x.id=s and x.org_id=_org)) then raise exception 'مدرسة خارج المؤسسة'; end if;
  if _cooldown < 1 or _cooldown > 720 then raise exception 'مهلة التكرار بين ساعة و30 يومًا'; end if;
  if _kind='off_hours' and not (_hours ? 'days' and _hours ? 'start' and _hours ? 'end' and (_hours->>'start') ~ '^\d\d:\d\d$' and (_hours->>'end') ~ '^\d\d:\d\d$' and (_hours->>'start') < (_hours->>'end')) then raise exception 'ساعات العمل غير صالحة'; end if;
  if _id is null then
    insert into cs_auto_rules(org_id,kind,name,body,school_ids,recipient_roles,priority,cooldown_hours,hours,sender_label,active,activated_at,created_by,updated_by)
      values (_org,_kind,_cs_clean(_name,80),_cs_clean(_body,1000),coalesce(_schools,'{}'),coalesce(_roles,'{}'),coalesce(_priority,100),_cooldown,coalesce(_hours,'{}'),coalesce(nullif(_cs_clean(_label,60),''),'رد آلي — إدارة المدرسة'),coalesce(_active,false),case when _active then now() end,auth.uid(),auth.uid()) returning * into a;
    perform _cs_log(_org,'rule',a.id,'create',null,to_jsonb(a)-'created_by'-'updated_by');
  else
    select * into b from cs_auto_rules where id=_id and org_id=_org; if b.id is null then raise exception 'القاعدة غير موجودة'; end if;
    update cs_auto_rules set kind=_kind,name=_cs_clean(_name,80),body=_cs_clean(_body,1000),school_ids=coalesce(_schools,'{}'),recipient_roles=coalesce(_roles,'{}'),priority=coalesce(_priority,100),cooldown_hours=_cooldown,
      hours=coalesce(_hours,'{}'),sender_label=coalesce(nullif(_cs_clean(_label,60),''),'رد آلي — إدارة المدرسة'),active=coalesce(_active,false),
      activated_at=case when coalesce(_active,false) and not b.active then now() when coalesce(_active,false) then b.activated_at end, updated_by=auth.uid(), updated_at=now() where id=_id returning * into a;
    perform _cs_log(_org,'rule',a.id,'update',to_jsonb(b)-'created_by'-'updated_by',to_jsonb(a)-'created_by'-'updated_by');
  end if;
  return a.id;
end $$;

-- ===== Auto reply engine =====
create or replace function public._cs_in_hours(_hours jsonb, _at timestamptz) returns boolean language sql stable as $$
  select (extract(dow from _at at time zone 'Asia/Riyadh'))::int in (select jsonb_array_elements_text(coalesce(_hours->'days','[]'))::int)
     and to_char(_at at time zone 'Asia/Riyadh','HH24:MI') >= coalesce(_hours->>'start','00:00')
     and to_char(_at at time zone 'Asia/Riyadh','HH24:MI') < coalesce(_hours->>'end','24:00') $$;

-- which rule (if any) answers a message: pure check, shared by trigger and preview
create or replace function public._cs_pick(_org uuid, _school uuid, _kind_conv text, _seq bigint, _recipient_roles text[], _at timestamptz, _conv uuid) returns cs_auto_rules
language sql stable security definer set search_path to 'public' as $$
  select r from cs_auto_rules r
   where r.org_id=_org and r.active and r.activated_at <= _at
     and _kind_conv in ('direct','family','student')
     and (cardinality(r.school_ids)=0 or _school = any(r.school_ids))
     and (cardinality(r.recipient_roles)=0 or r.recipient_roles && _recipient_roles)
     and ((r.kind='welcome' and _seq=1) or (r.kind='off_hours' and not _cs_in_hours(r.hours,_at)))
     and (_conv is null or not exists(select 1 from cs_auto_runs x where x.rule_id=r.id and x.conversation_id=_conv and x.result='sent' and x.created_at > _at - make_interval(hours => r.cooldown_hours)))
   order by r.priority, case r.kind when 'welcome' then 0 else 1 end, r.created_at limit 1 $$;

create or replace function public._cs_auto_trg() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare c record; rcp record; r cs_auto_rules; roles text[]; nseq bigint; mid uuid; begin
  if new.auto_rule_id is not null or new.kind='auto' then return null; end if;
  select * into c from conversations where id=new.conversation_id;
  if c.kind not in ('direct','family','student') then return null; end if;
  -- exactly one other active member (the recipient); students/guardians never auto-reply
  select m.user_id into rcp from conversation_members m where m.conversation_id=c.id and m.left_at is null and m.user_id<>new.sender_id limit 2;
  if rcp.user_id is null or (select count(*) from conversation_members m where m.conversation_id=c.id and m.left_at is null and m.user_id<>new.sender_id) <> 1 then return null; end if;
  select coalesce(array_agg(distinct role::text),'{}') into roles from memberships where user_id=rcp.user_id and org_id=c.org_id and is_active and (c.school_id is null or school_id=c.school_id or school_id is null)
     and role not in ('student','guardian');
  if cardinality(roles)=0 then return null; end if;
  r := _cs_pick(c.org_id, c.school_id, c.kind, new.seq, roles, new.created_at, c.id);
  if r.id is null then return null; end if;
  begin
    insert into cs_auto_runs(org_id, rule_id, conversation_id, trigger_message_id, result) values (c.org_id, r.id, c.id, new.id, 'sent');
  exception when unique_violation then return null; end;
  update conversations set last_seq=last_seq+1, last_message_at=now() where id=c.id returning last_seq into nseq;
  mid := gen_random_uuid();
  insert into messages(id, conversation_id, school_id, seq, sender_id, body, client_id, kind, auto_rule_id)
    values (mid, c.id, c.school_id, nseq, rcp.user_id, r.body, md5(r.id::text||new.id::text)::uuid, 'auto', r.id);
  update cs_auto_runs set reply_message_id=mid where rule_id=r.id and trigger_message_id=new.id;
  begin perform _notify(new.sender_id, c.school_id, 'message', r.sender_label, null, _conv_link(c.id), 'msg:'||mid); exception when others then null; end;
  return null;
end $$;
create trigger msg_auto_reply after insert on public.messages for each row execute function _cs_auto_trg();

create or replace function public._msg_sent_as_trg() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare c record; begin
  if new.auto_rule_id is not null then new.sent_as := 'staff'; return new; end if;
  select * into c from conversations where id=new.conversation_id;
  new.sent_as := case when _ctx_staff(c.org_id, c.school_id) then 'staff' else 'family' end;
  return new;
end $$;

-- preview without sending anything
create or replace function public.cs_rule_preview(_org uuid, _school uuid, _role text, _first boolean, _at timestamptz) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare r cs_auto_rules; begin
  if not _cs_ok(_org,'autoreply') then raise exception 'ليست لديك صلاحية لهذا الإجراء'; end if;
  r := _cs_pick(_org, _school, 'direct', case when _first then 1 else 2 end, array[_role], coalesce(_at,now()), null);
  if r.id is null then return jsonb_build_object('match',false); end if;
  return jsonb_build_object('match',true,'rule',r.name,'kind',r.kind,'label',r.sender_label,'body',r.body);
end $$;

-- ===== Saved replies for the composer =====
create or replace function public.cs_my_replies(_conv uuid) returns table(id uuid, title text, shortcut text, body text)
language sql stable security definer set search_path to 'public' as $$
  select r.id, r.title, r.shortcut, r.body from cs_replies r join conversations c on c.id=_conv and c.org_id=r.org_id
   where r.active and conv_send_block(_conv) is null
     and ('all' = any(r.roles) or r.roles && _cs_my_roles(c.org_id))
   order by r.title $$;

create or replace function public.cs_conv_limits(_conv uuid) returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('voice', s.voice_enabled and c.allow_attachments, 'voice_max_sec', s.voice_max_sec, 'voice_max_bytes', s.voice_max_bytes, 'attachments', s.attachments_enabled and c.allow_attachments)
  from conversations c cross join lateral (select * from _cs_get(c.org_id)) s where c.id=_conv and is_conv_member(_conv) $$;

-- ===== Voice files =====
create or replace function public.create_voice_file(_conv uuid, _mime text, _size bigint, _duration int) returns table(id uuid, storage_path text)
language plpgsql security definer set search_path to 'public' as $$
declare c record; s cs_settings; blk text; fid uuid := gen_random_uuid(); path text; sch uuid; m text := split_part(lower(coalesce(_mime,'')),';',1); begin
  select * into c from conversations where conversations.id=_conv;
  blk := conv_send_block(_conv); if blk is not null then raise exception '%', blk; end if;
  s := _cs_get(c.org_id);
  if not s.voice_enabled or not c.allow_attachments then raise exception 'الرسائل الصوتية غير مفعّلة في هذه المحادثة'; end if;
  if m not in ('audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/aac','audio/wav') then raise exception 'نوع التسجيل غير مدعوم'; end if;
  if _size <= 0 or _size > s.voice_max_bytes then raise exception 'حجم التسجيل يتجاوز الحد (% ميغابايت)', round(s.voice_max_bytes/1048576.0,1); end if;
  if _duration <= 0 or _duration > s.voice_max_sec then raise exception 'مدة التسجيل تتجاوز الحد (% ثانية)', s.voice_max_sec; end if;
  if (select count(*) from files f where f.uploaded_by=auth.uid() and f.source_type='message_pending' and f.created_at > now()-interval '1 hour') >= 30 then raise exception 'تجاوزت حد المرفقات المؤقتة، حاول لاحقًا'; end if;
  sch := coalesce(c.school_id, (select mm.school_id from memberships mm where mm.user_id=auth.uid() and mm.is_active and mm.org_id=c.org_id and mm.school_id is not null order by mm.created_at limit 1));
  if sch is null then raise exception 'لا يوجد فرع سارٍ لك في هذه المؤسسة لحفظ المرفق'; end if;
  path := sch || '/m/' || _conv || '/' || fid;
  insert into files(id, school_id, storage_path, name, mime_type, size_bytes, source_type, source_id, duration_sec)
    values (fid, sch, path, 'رسالة صوتية', m, _size, 'message_pending', _conv, _duration);
  return query select fid, path;
end $$;

-- linking a pending file to a message: the uploaded object must match the declared type and size (server side, not the extension)
create or replace function public._msg_file_link_trg() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare o record; begin
  if old.source_type='message_pending' and new.source_type='message' then
    select (x.metadata->>'size')::bigint sz, split_part(lower(coalesce(x.metadata->>'mimetype','')),';',1) mt into o from storage.objects x where x.bucket_id='rikaz-files' and x.name=new.storage_path;
    if o.sz is null or o.sz > old.size_bytes * 1.05 + 1024 then raise exception 'حجم الملف المرفوع لا يطابق المصرّح به'; end if;
    if old.mime_type like 'audio/%' and o.mt not like 'audio/%' then raise exception 'نوع الملف المرفوع لا يطابق التسجيل'; end if;
  end if;
  return new;
end $$;
create trigger files_msg_link before update of source_type on public.files for each row execute function _msg_file_link_trg();

-- mark voice messages
create or replace function public._msg_voice_trg() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if old.source_type='message_pending' and new.source_type='message' and new.mime_type like 'audio/%' then
    update messages set kind='voice' where id=new.source_id and kind='text';
  end if;
  return null;
end $$;
create trigger files_msg_voice after update of source_type on public.files for each row execute function _msg_voice_trg();

-- ===== Thread read: add kind/auto label/mime/duration =====
drop function public.conv_messages(uuid, bigint, integer);
create function public.conv_messages(_conv uuid, _before bigint default null, _limit integer default 30)
 returns table(id uuid, seq bigint, sender_id uuid, sender_name text, sender_label text, masked boolean, mine boolean, body text, reply_to uuid, created_at timestamptz, edited_at timestamptz, deleted_at timestamptz, pinned_at timestamptz, files jsonb, kind text)
 language sql stable security definer set search_path to 'public' as $$
  select x.id, x.seq,
    case when v.ok and x.auto_rule_id is null then x.sender_id end,
    case when x.auto_rule_id is not null then coalesce(ar.sender_label,'رد آلي') when x.sender_id=auth.uid() then 'أنت' when v.ok then coalesce(p.full_name,'مستخدم') else _cg_generic_label2(_conv, x.sender_id) end,
    case when x.auto_rule_id is null and v.ok and x.sender_id<>auth.uid() then (select _cg_label(m.reasons) from conversation_members m where m.conversation_id=_conv and m.user_id=x.sender_id order by m.left_at nulls first limit 1) end,
    not v.ok, x.sender_id=auth.uid() and x.auto_rule_id is null, x.body, x.reply_to, x.created_at, x.edited_at, x.deleted_at, x.pinned_at,
    coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',case when v.ok then f.name else 'مرفق' || coalesce(substring(f.name from '\.[A-Za-z0-9]{1,6}$'),'') end,'size_bytes',f.size_bytes,'storage_path',f.storage_path,'mime',f.mime_type,'duration',f.duration_sec) order by f.created_at)
              from files f where f.source_type='message' and f.source_id=x.id and x.deleted_at is null), '[]'::jsonb),
    x.kind
  from messages x
  cross join lateral (select _cg_msg_visible(_conv, x.sender_id, x.sent_as) ok) v
  left join profiles p on p.id=x.sender_id and v.ok
  left join cs_auto_rules ar on ar.id=x.auto_rule_id
  where x.conversation_id=_conv and can_read_conv_at(_conv, x.created_at) and (_before is null or x.seq < _before)
  order by x.seq desc limit least(greatest(coalesce(_limit,30),1),100) $$;

-- ===== Attachments gallery (same visibility as the thread) =====
create or replace function public.conv_files(_conv uuid, _tab text, _before timestamptz, _limit int default 30)
 returns table(id uuid, name text, mime text, size_bytes bigint, duration int, storage_path text, created_at timestamptz, message_id uuid, seq bigint, sender_name text)
 language sql stable security definer set search_path to 'public' as $$
  select f.id, case when v.ok then f.name else 'مرفق' || coalesce(substring(f.name from '\.[A-Za-z0-9]{1,6}$'),'') end, f.mime_type, f.size_bytes, f.duration_sec, f.storage_path, f.created_at, x.id, x.seq,
    case when x.sender_id=auth.uid() then 'أنت' when v.ok then coalesce(p.full_name,'مستخدم') else _cg_generic_label2(_conv, x.sender_id) end
  from files f join messages x on x.id=f.source_id and f.source_type='message'
  cross join lateral (select _cg_msg_visible(_conv, x.sender_id, x.sent_as) ok) v
  left join profiles p on p.id=x.sender_id and v.ok
  where x.conversation_id=_conv and x.deleted_at is null and is_conv_member(_conv) and can_read_conv_at(_conv, x.created_at)
    and (_before is null or f.created_at < _before)
    and case _tab when 'images' then f.mime_type like 'image/%' when 'voice' then f.mime_type like 'audio/%' else f.mime_type not like 'image/%' and f.mime_type not like 'audio/%' end
  order by f.created_at desc limit least(greatest(coalesce(_limit,30),1),60) $$;

revoke all on function public.cs_admin(uuid), public.cs_settings_save(uuid,boolean,int,numeric,boolean), public.cs_reply_save(uuid,uuid,text,text,text,text[],boolean),
  public.cs_rule_save(uuid,uuid,text,text,text,uuid[],text[],int,int,jsonb,text,boolean), public.cs_rule_preview(uuid,uuid,text,boolean,timestamptz),
  public.cs_my_replies(uuid), public.cs_conv_limits(uuid), public.create_voice_file(uuid,text,bigint,int), public.conv_messages(uuid,bigint,integer), public.conv_files(uuid,text,timestamptz,int) from public, anon;
grant execute on function public.cs_admin(uuid), public.cs_settings_save(uuid,boolean,int,numeric,boolean), public.cs_reply_save(uuid,uuid,text,text,text,text[],boolean),
  public.cs_rule_save(uuid,uuid,text,text,text,uuid[],text[],int,int,jsonb,text,boolean), public.cs_rule_preview(uuid,uuid,text,boolean,timestamptz),
  public.cs_my_replies(uuid), public.cs_conv_limits(uuid), public.create_voice_file(uuid,text,bigint,int), public.conv_messages(uuid,bigint,integer), public.conv_files(uuid,text,timestamptz,int) to authenticated;
revoke all on function public._cs_ok(uuid,text), public._cs_pick(uuid,uuid,text,bigint,text[],timestamptz,uuid), public._cs_log(uuid,text,uuid,text,jsonb,jsonb) from public, anon, authenticated;