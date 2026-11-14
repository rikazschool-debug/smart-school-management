
create table public.hr_pf_forms(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, category text not null default 'staff' check (category in ('teacher','admin','support','staff')),
  active boolean not null default true, current_version int not null default 0,
  created_by uuid, created_at timestamptz not null default now(), unique(org_id,name));
create table public.hr_pf_form_versions(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  form_id uuid not null references public.hr_pf_forms(id) on delete cascade,
  version int not null, criteria jsonb not null, created_by uuid, created_at timestamptz not null default now(),
  unique(form_id, version));
create table public.hr_pf_cycles(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, period_start date not null, period_end date not null,
  status text not null default 'open' check (status in ('open','closed')),
  created_by uuid, created_at timestamptz not null default now(), check (period_end >= period_start), unique(org_id,name));
create table public.hr_pf_reviews(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  cycle_id uuid not null references public.hr_pf_cycles(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  form_version_id uuid not null references public.hr_pf_form_versions(id) on delete cascade,
  criteria jsonb not null, evaluator uuid not null,
  status text not null default 'assigned' check (status in ('assigned','submitted','returned','reviewed','published','acknowledged','objected','resolved')),
  scores jsonb not null default '{}', total numeric, comments text, evidence jsonb not null default '[]',
  reviewer uuid, reviewed_at timestamptz, review_note text,
  publisher uuid, published_at timestamptz, published_total numeric, published_scores jsonb, published_comments text,
  responded_at timestamptz, objection text,
  resolution text check (resolution in ('upheld','amended')), resolution_note text, resolved_by uuid, resolved_at timestamptz, final_total numeric,
  rev int not null default 1, created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(cycle_id, employee_id));
grant all on public.hr_pf_forms, public.hr_pf_form_versions, public.hr_pf_cycles, public.hr_pf_reviews to service_role;
alter table public.hr_pf_forms enable row level security;
alter table public.hr_pf_form_versions enable row level security;
alter table public.hr_pf_cycles enable row level security;
alter table public.hr_pf_reviews enable row level security;
create trigger hr_pfr_upd before update on public.hr_pf_reviews for each row execute function public.touch_updated_at();

create or replace function public._hr_pf_lock() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' then
    if current_setting('rikaz.hr_purge', true) = old.org_id::text then return old; end if;
    raise exception 'سجلات الأداء لا تُحذف';
  end if;
  if tg_table_name='hr_pf_form_versions' then raise exception 'إصدار النموذج ثابت؛ أنشئ إصدارًا جديدًا'; end if;
  -- published result is frozen; only the response/resolution fields may change afterwards
  if old.published_at is not null and (new.published_total is distinct from old.published_total or new.published_scores is distinct from old.published_scores
     or new.published_comments is distinct from old.published_comments or new.scores is distinct from old.scores or new.criteria is distinct from old.criteria
     or new.evidence is distinct from old.evidence or new.employee_id<>old.employee_id or new.evaluator<>old.evaluator) then raise exception 'النتيجة المنشورة ثابتة'; end if;
  if new.criteria is distinct from old.criteria then raise exception 'معايير التقييم ثابتة بعد الإسناد'; end if;
  return new;
end $$;
create trigger hr_pfv_lock before update or delete on public.hr_pf_form_versions for each row execute function public._hr_pf_lock();
create trigger hr_pfr_lock before update or delete on public.hr_pf_reviews for each row execute function public._hr_pf_lock();

create or replace function public._hr_pf_ok(_school uuid, _action text) returns boolean language sql stable security definer set search_path=public as
$$ select _hr_ext_on(school_org(_school),'performance') and _hrs_school(_school,'hr_performance',_action) $$;
create or replace function public._hr_pf_any(_org uuid, _action text) returns boolean language sql stable security definer set search_path=public as
$$ select _hr_ext_on(_org,'performance') and (is_org_owner(_org) or exists(select 1 from schools s where s.org_id=_org and _hrs_school(s.id,'hr_performance',_action))) $$;
create or replace function public._hr_pf_user_can(_school uuid, _uid uuid, _action text) returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from memberships m where m.org_id=school_org(_school) and m.user_id=_uid and m.role='org_owner' and m.is_active)
   or coalesce(_perm_allows_user(_school,_uid,'hr_performance',_action), false) $$;
