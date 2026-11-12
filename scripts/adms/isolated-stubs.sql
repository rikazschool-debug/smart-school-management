-- Minimal stand-ins for the production objects supabase/pending/adms_v1.sql depends on.
-- Used ONLY by scripts/adms-v1-isolated.ts on a throwaway local Postgres. Signatures match production.
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
create schema if not exists auth; create schema if not exists extensions;
create extension if not exists pgcrypto schema extensions;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, extensions, public to anon, authenticated, service_role;
create table organizations (id uuid primary key, name text not null, created_by uuid, is_active boolean not null default true, created_at timestamptz default now(), updated_at timestamptz default now());
create table schools (id uuid primary key, org_id uuid not null references organizations(id), name text not null, is_active boolean not null default true, created_at timestamptz default now());
create table hr_employees (id uuid primary key, org_id uuid not null references organizations(id), employee_no text not null, full_name text not null, status text not null default 'active');
create table hr_att_devices (id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id), school_id uuid, name text not null, serial_no text, is_active boolean not null default true);
create table hr_att_punches (id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id), employee_id uuid references hr_employees(id),
  at timestamptz not null, source text not null check (source in ('manual','import','device','mobile','correction')), device_id uuid references hr_att_devices(id) on delete set null,
  key text, reason text, created_by uuid, created_at timestamptz default now(), school_id uuid references schools(id), distance_m integer, accuracy_m integer, unique (org_id, key));
create table stub_owner (org_id uuid, user_id uuid);
create table stub_perm (org_id uuid, user_id uuid, section text, action text);
create table stub_section_off (org_id uuid, section text);
create table stub_emp_school (emp uuid primary key, school uuid);
create table stub_closed (school uuid, d date);
create table stub_day_calls (emp uuid, at timestamptz);
create or replace function section_enabled(_org uuid, _section text) returns boolean language sql stable as $$ select not exists (select 1 from stub_section_off where org_id = _org and section = _section) $$;
create or replace function is_org_owner(_org uuid) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from stub_owner where org_id = _org and user_id = auth.uid()) $$;
create or replace function perm_scope(_org uuid, _user uuid, _section text, _action text) returns text language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from stub_perm where org_id = _org and user_id = _user and section = _section and action = _action) then 'org' else null end $$;
-- Same body as production _hrs_org.
create or replace function _hrs_org(_org uuid, _sec text, _action text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth.uid() is not null and section_enabled(_org,'hr') and (is_org_owner(_org) or perm_scope(_org, auth.uid(), _sec, _action) = 'org'), false) $$;
create or replace function _hr_emp_school(_emp uuid) returns uuid language sql stable security definer set search_path = public as $$ select school from stub_emp_school where emp = _emp $$;
create or replace function _hr_at_closed(_school uuid, _date date) returns boolean language sql stable as $$ select exists (select 1 from stub_closed where school = _school and d = _date) $$;
create or replace function _hr_at_punch_days(_emp uuid, _at timestamptz) returns void language sql as $$ insert into stub_day_calls values (_emp, _at) $$;
