UPDATE public.students SET national_id = '1100000001'
 WHERE full_name = 'سارة محمد' AND national_id = '11000000010' AND csmart_no = '11000000010'
   AND NOT EXISTS (SELECT 1 FROM public.students o WHERE o.national_id = '1100000001');