
alter table public.files drop constraint files_source_type_check;
alter table public.files add constraint files_source_type_check check (source_type in ('post','message','message_pending','circular'));
