DO $m$ declare d text := pg_get_functiondef('public.pc_request_action(uuid,text,integer,text)'::regprocedure); o text := d;
begin
d := replace(d, $a$        else
          update pc_custodies set status='disbursed', rev=rev+1, updated_at=now() where id=c.id;
          perform _pc_log(r.org_id, 'custody', c.id, 'settle_reopened', jsonb_build_object('status','settling'), jsonb_build_object('status','disbursed','request', r.id, 'remaining', b.book), 'اعتماد التسوية — المتبقي يبقى في العهدة');
        end if;
        nxt := 'done';$a$, $b$        end if;
        nxt := 'approved';$b$);
if d=o then raise exception 'patch failed'; end if; execute d; end $m$;