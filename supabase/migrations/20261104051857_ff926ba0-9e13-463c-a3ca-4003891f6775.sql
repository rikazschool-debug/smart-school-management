create or replace function public.pc_custody_save_approve(_org uuid, _school uuid, _school_ids uuid[], _holder uuid, _purpose text, _amount numeric, _due date, _key uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare me uuid := auth.uid(); _id uuid; c pc_custodies;
begin
  -- Only the org owner may create-and-approve in one step, and never for himself (holder = procurement officer).
  if not _perm_owner(me, _org) then raise exception 'الحفظ مع الاعتماد متاح لمالك المؤسسة فقط' using errcode='42501'; end if;
  if _holder is null or _holder = me then raise exception 'اختر مسؤول المشتريات المستفيد؛ لا تُعتمد عهدة باسم المالك نفسه'; end if;
  _id := pc_custody_save(_org, null, _school, _school_ids, _holder, _purpose, _amount, _due, 0, _key);
  select * into c from pc_custodies where id = _id for update;
  if c.status = 'approved' then return _id; end if; -- idempotent retry
  if c.status <> 'draft' then raise exception 'حالة العهدة لا تسمح بالاعتماد'; end if;
  update pc_custodies set status='approved', rev=rev+1, updated_at=now(), submitted_at=now(), decided_by=me, decided_at=now() where id=_id;
  perform _pc_log(c.org_id, 'custody', _id, 'approve', jsonb_build_object('status','draft'), jsonb_build_object('status','approved','by_owner',true), 'إنشاء واعتماد مباشر من المالك');
  perform _pc_notify(c.holder_id, c.school_id, 'اعتُمدت عهدة باسمك', c.ref || ' — ' || c.amount || ' ريال', 'pc-c-ownapp:' || _id);
  return _id;
end $$;
revoke all on function public.pc_custody_save_approve(uuid,uuid,uuid[],uuid,text,numeric,date,uuid) from public, anon;
grant execute on function public.pc_custody_save_approve(uuid,uuid,uuid[],uuid,text,numeric,date,uuid) to authenticated;