CREATE OR REPLACE FUNCTION private.sv5_compare(_a uuid, _b uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare a sv5_measures; b sv5_measures; why text[]:='{}'; warn text[]:='{}'; sa jsonb; sb jsonb; std text[]:=array['nafes','qudrat','tahsili']; ma numeric; mb numeric; pa int; pb int; paired int; pdiff numeric; begin
 a:=private._sv5_get(_a,false); b:=private._sv5_get(_b,false);
 if a.id=b.id then raise exception 'اختر مقياسين مختلفين'; end if;
 if a.subject_id<>b.subject_id then why:=array_append(why,'المادة مختلفة'::text); end if;
 if a.scale_max<>b.scale_max then why:=array_append(why,format('سلم الدرجات مختلف (%s مقابل %s)',a.scale_max,b.scale_max)); end if;
 if (a.kind=any(std) or b.kind=any(std)) and a.kind<>b.kind then why:=array_append(why,'نوع القياس مختلف (اختبار وطني/معياري مقابل اختبار آخر)'::text); end if;
 if a.grade_id<>b.grade_id then warn:=array_append(warn,'الصف مختلف: الفئة ليست نفسها'::text); end if;
 if a.kind<>b.kind and not (a.kind=any(std) or b.kind=any(std)) then warn:=array_append(warn,'نوعا الاختبار مختلفان؛ تأكد أن الأداتين تقيسان المحتوى نفسه'::text); end if;
 select count(*) filter (where status='present'), avg(score) filter (where status='present') into pa, ma from private._sv5_scores(a.id);
 select count(*) filter (where status='present'), avg(score) filter (where status='present') into pb, mb from private._sv5_scores(b.id);
 select count(*), avg(y.score-x.score) into paired, pdiff from private._sv5_scores(a.id) x join private._sv5_scores(b.id) y on y.student_id=x.student_id where x.status='present' and y.status='present';
 if pa=0 or pb=0 then why:=array_append(why,'لا توجد نتائج حاضرة في أحد المقياسين'::text); end if;
 if pa>0 and pb>0 and abs(pa-pb)::numeric/greatest(pa,pb)>0.2 then warn:=array_append(warn,format('عدد المشاركين مختلف بوضوح (%s مقابل %s)',pa,pb)); end if;
 if pa>0 and pb>0 and paired::numeric/least(pa,pb)<0.5 then warn:=array_append(warn,format('الطلاب المشتركون في القياسين قليلون (%s)',paired)); end if;
 if pa<30 or pb<30 then warn:=array_append(warn,'عينة صغيرة (أقل من 30)؛ الفروق قد تكون عرضية'::text); end if;
 sa:=jsonb_build_object('id',a.id,'title',a.title,'kind',a.kind,'measured_on',a.measured_on,'period',a.period_label,'scale_max',a.scale_max,'present',pa,'mean',round(ma,2));
 sb:=jsonb_build_object('id',b.id,'title',b.title,'kind',b.kind,'measured_on',b.measured_on,'period',b.period_label,'scale_max',b.scale_max,'present',pb,'mean',round(mb,2));
 return jsonb_build_object('a',sa,'b',sb,'comparable',cardinality(why)=0,'reasons',to_jsonb(why),'warnings',to_jsonb(warn),
  'point_diff',case when cardinality(why)=0 then round(mb-ma,2) end,
  'pct_change',case when cardinality(why)=0 and ma>0 then round((mb-ma)/ma*100,2) end,
  'paired',paired,'paired_point_diff',case when cardinality(why)=0 and paired>0 then round(pdiff,2) end); end $function$;