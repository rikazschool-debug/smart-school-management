create or replace function public._hr_d_row(d hr_documents, _full boolean) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('id',d.id,'employee_id',e.id,'employee',e.full_name,'employee_no',e.employee_no,'school',(select name from schools where id=_hr_emp_school(e.id)),
    'type_id',t.id,'type',t.name,'confidential',t.confidential,'needs_number',t.needs_number,'needs_expiry',t.needs_expiry,
    'contract_id',d.contract_id,'contract_no',(select contract_no from hr_contracts where id=d.contract_id),
    'status',_hr_d_status(d),'accepted_version',d.accepted_version,
    'current',(select _hr_dv_json(v) from hr_document_versions v where v.document_id=d.id and v.status <> 'pending_file' order by (v.version=d.accepted_version) desc, v.version desc limit 1),
    'latest',(select _hr_dv_json(v) from hr_document_versions v where v.document_id=d.id and v.status <> 'pending_file' order by v.version desc limit 1),
    'versions', case when _full then coalesce((select jsonb_agg(_hr_dv_json(v) order by v.version desc) from hr_document_versions v where v.document_id=d.id and v.status <> 'pending_file'),'[]') end)
  from hr_employees e, hr_doc_types t where e.id=d.employee_id and t.id=d.type_id $$;
revoke all on function public._hr_d_row(hr_documents,boolean) from public, anon, authenticated;