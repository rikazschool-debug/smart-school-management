create or replace function public._dn_org(_t text, _r jsonb) returns uuid language sql stable security definer set search_path to 'public' as $$
  select case when _t='hr_employees' then (_r->>'org_id')::uuid else school_org((_r->>'school_id')::uuid) end $$;
revoke all on function public._dn_org(text, jsonb) from public, anon, authenticated;

create or replace function public._dn_trg() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare o uuid; uid uuid := NEW.user_id; nid text := nullif(NEW.national_id,''); n text; c person_display_names; oldn text; tries int := 0;
begin
  o := _dn_org(TG_TABLE_NAME, to_jsonb(NEW));
  if o is null then return NEW; end if;
  NEW.display_name := _dn_clean(NEW.display_name);
  if TG_OP='INSERT' then
    if NEW.display_name is null then
      NEW.display_name := coalesce(_dn_person_claim(o,uid,nid), _dn_default(NEW.full_name)); NEW.display_name_manual := false;
    else NEW.display_name_manual := true; end if;
  else
    oldn := OLD.display_name;
    if pg_trigger_depth() > 1 then null;
    elsif NEW.display_name is null and oldn is null then return NEW;
    elsif NEW.display_name is null then NEW.display_name := _dn_default(NEW.full_name); NEW.display_name_manual := false;
    elsif NEW.display_name is distinct from oldn then NEW.display_name_manual := true;
    elsif not OLD.display_name_manual and NEW.full_name is distinct from OLD.full_name then NEW.display_name := _dn_default(NEW.full_name);
    end if;
  end if;
  if NEW.display_name is null then return NEW; end if;
  if length(NEW.display_name) > 80 then raise exception 'الاسم المعروض طويل (حتى 80 حرفًا)'; end if;
  loop
    n := _dn_norm(NEW.display_name);
    insert into person_display_names(org_id,norm,display_name,user_id,national_id,src_table,src_id)
      values(o,n,NEW.display_name,uid,nid,TG_TABLE_NAME,NEW.id) on conflict (org_id,norm) do nothing;
    select * into c from person_display_names where org_id=o and norm=n;
    exit when c.src_id = NEW.id or _dn_same(c,uid,nid);
    if NEW.display_name_manual or tries > 3 then
      raise exception 'الاسم المعروض غير متاح' using errcode='23505', hint = 'مقترح: '||_dn_suggest(o,NEW.display_name,uid,nid);
    end if;
    NEW.display_name := _dn_suggest(o,NEW.display_name,uid,nid); tries := tries + 1;
  end loop;
  update person_display_names set user_id=coalesce(user_id,uid), national_id=coalesce(national_id,nid) where org_id=o and norm=n;
  if TG_OP='UPDATE' and oldn is not null and _dn_norm(oldn) <> n then
    delete from person_display_names x where x.org_id=o and x.norm=_dn_norm(oldn) and (x.src_id=NEW.id or _dn_same(x,uid,nid));
  end if;
  return NEW;
end $$;

create or replace function public._dn_sync_trg() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare o uuid; uid uuid := NEW.user_id; nid text := nullif(NEW.national_id,'');
begin
  if pg_trigger_depth() > 1 or NEW.display_name is null or (TG_OP='UPDATE' and NEW.display_name is not distinct from OLD.display_name) then return null; end if;
  if uid is null and nid is null then return null; end if;
  o := _dn_org(TG_TABLE_NAME, to_jsonb(NEW));
  update hr_employees x set display_name=NEW.display_name, display_name_manual=NEW.display_name_manual
    where x.org_id=o and not (TG_TABLE_NAME='hr_employees' and x.id=NEW.id) and ((uid is not null and x.user_id=uid) or (nid is not null and x.national_id=nid)) and x.display_name is distinct from NEW.display_name;
  update teachers x set display_name=NEW.display_name, display_name_manual=NEW.display_name_manual
    where school_org(x.school_id)=o and not (TG_TABLE_NAME='teachers' and x.id=NEW.id) and ((uid is not null and x.user_id=uid) or (nid is not null and x.national_id=nid)) and x.display_name is distinct from NEW.display_name;
  update students x set display_name=NEW.display_name, display_name_manual=NEW.display_name_manual
    where school_org(x.school_id)=o and not (TG_TABLE_NAME='students' and x.id=NEW.id) and ((uid is not null and x.user_id=uid) or (nid is not null and x.national_id=nid)) and x.display_name is distinct from NEW.display_name;
  update guardians x set display_name=NEW.display_name, display_name_manual=NEW.display_name_manual
    where school_org(x.school_id)=o and not (TG_TABLE_NAME='guardians' and x.id=NEW.id) and ((uid is not null and x.user_id=uid) or (nid is not null and x.national_id=nid)) and x.display_name is distinct from NEW.display_name;
  return null;
end $$;
revoke all on function public._dn_trg(), public._dn_sync_trg() from public, anon, authenticated;