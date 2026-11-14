create or replace function public._dn_trg() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare o uuid; uid uuid := NEW.user_id; nid text := nullif(NEW.national_id,''); n text; c person_display_names; oldn text; tries int := 0;
begin
  o := case when TG_TABLE_NAME='hr_employees' then NEW.org_id else school_org(NEW.school_id) end;
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
    -- a name typed by a person is refused with a suggestion; an automatic name takes the next free variant
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
revoke all on function public._dn_trg() from public, anon, authenticated;