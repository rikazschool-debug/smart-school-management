insert into public.au_sections(key,label,parent,area,status,reason) values
 ('au_view','مركز الأتمتة — العرض','users_admin','central','excluded','صلاحيات مركز الأتمتة نفسه؛ لا تُبنى عليها قواعد أتمتة'),
 ('au_manage','مركز الأتمتة — إدارة القواعد','users_admin','central','excluded','صلاحيات مركز الأتمتة نفسه؛ لا تُبنى عليها قواعد أتمتة'),
 ('au_control','مركز الأتمتة — المراجعة والتحكم','users_admin','central','excluded','صلاحيات مركز الأتمتة نفسه؛ لا تُبنى عليها قواعد أتمتة'),
 ('au_settings_info','مركز الأتمتة — الإعدادات والإيقاف الطارئ','users_admin','central','excluded','إعدادات المحرك لمدير النظام فقط؛ لا تُبنى عليها قواعد أتمتة')
on conflict (key) do nothing;