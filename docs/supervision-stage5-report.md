# Supervision stage 5 — status

## Batch 1: نواتج التعلم (learning outcomes) — implemented and tested on the test DB
- Sources: published Rikaz tests (kind=test) analysed live from published grades; external results (school/diagnostic/formative/final, نافس، القدرات، التحصيلي) entered from a documented file. No official link or API to national systems is assumed.
- Measure fields: source note, date, year/term, period, stage/grade, sections, subject, course/teacher, score scale.
- Excel import: column mapping (auto-guess, editable), preview with per-row result (unknown student, out of scope, duplicate in file, two IDs for different students, score above scale, score with absence, name mismatch warning, empty = «لم يُقس»), confirm only after preview with a fingerprint; replace is opt-in and logged in sv5_result_history; every import logged.
- Analysis: targeted / with result / absent / exempt / not measured, mean, median, range, 10% distribution, per section; mastery levels only from a published, dated set; skills and MCQ item/distractor analysis only with a documented question mapping; discrimination index withheld under 30 participants.
- Comparison: refused for different subject, scale, or standardized vs other kinds; warnings for grade, test-type, participant and overlap differences and small samples; point difference and percent change shown separately.
- Permissions: owner/principal of the branch, supervisor only with a live assignment covering subject/course/teacher, course teacher read-only; other branch principal, other teacher and ended-assignment supervisor refused.

### Evidence
- /tmp/browser/sv449/lo.py (RPC, all PASS): preview writes nothing; 4 valid of 13 rows imported, 8 rejected with reasons, 1 left unmeasured; stale preview refused; corrected file 7 added/1 replaced; counts 12/8/2/1/1; principal cannot publish mastery, draft set unusable, published set frozen; valid and invalid comparison; access checks.
- /tmp/browser/sv449/loui.py (browser): supervisor created a measure, uploaded an Excel file (7 rows → 2 imported, 4 rejected incl. 2 duplicates, 1 not measured), analysis and print, comparison valid/invalid; teacher at 390px reads analysis without the import panel, no horizontal overflow; owner sees import.
- Unit: src/test/supervision-lo.test.ts (6).

### Not verified
- Analysis of a real Rikaz test (the test org has no published tests); the code path is untested.
- PDF content of the analysis export (only print view checked).
- Discrimination index with ≥30 participants (test data has 12 students).

## Batch 2: إجراءات التحسين من النتائج — implemented and tested on the test DB
- Tables sv5_actions, sv5_action_links, sv5_action_log (append-only trigger); RPC-only (sv5_act_*), RLS with no policies.
- Created only from a measure the writer may edit (owner/principal/live covering assignment); a frozen analysis snapshot is stored as evidence, later results never change it.
- Target: whole measure, chosen classes, or chosen students — only from that measure's targeted list; students are visible only to readers of the measure scope (course teacher of that course, branch leads, covering supervisor).
- Goals, up to 8 indicators with baseline/target (no weights), due date, responsible person chosen from the server pool (principals, covering supervisors, course teacher, calling owner).
- Draft may be incomplete; submit checks private._sv5_act_missing (mirrored by actMissing in act-model.ts). Principal/owner approves or returns with a reason; nobody approves an action they wrote or are responsible for.
- Execution (start / follow-up / done / cancel) is separate from impact. Impact is recorded by someone in scope who is not the responsible person, against a later measure of the same branch and subject; an incomparable measure can only be recorded as «غير قابل للمقارنة»; point difference and percent change stay separate; indicator actual values stored.
- Links to supervisor plans, PD plans and remedial plans by reference only; candidates and titles only where the caller can already read the item; another reader sees «عنصر خارج صلاحيتك».
- Every change appended to the log; stale revision refused. List filters (branch, status, overdue, impact, search) and Excel/PDF/print of list and of one action (labelled «نموذج داخلي»).

### Evidence
- /tmp/browser/sv449/act.py (RPC, all PASS, 38 checks): pool, out-of-measure student refused, out-of-scope owner refused, teacher cannot create or read draft, incomplete submit refused, stale rev refused, creator/responsible cannot approve, return needs reason, other teacher/other-branch principal/unassigned supervisor refused, impact before execution refused, responsible cannot measure impact, impact without measure refused, incomparable cannot claim improvement, comparable impact stored, unpermitted link refused, dev-plan link, full log.
- /tmp/browser/sv449/actui.py + actui2.py (browser): supervisor created from analysis (evidence prefilled from snapshot), submit disabled until complete, principal approved, teacher at 390px started and followed up, no impact form for the teacher, no overflow, no page errors. Screenshot /mnt/documents/improvement-action-form.png.
- Unit: src/test/supervision-act.test.ts (7).

### Not verified
- Linking to a supervisor plan or a remedial plan (no such records in the test branch's scope); code path untested.
- PDF file contents of action exports (print view built from the same rows).

## Batch 3: الموارد والنشرات — implemented and tested on the test DB
- Tables sv5_resources (versioned by series_id/version_of, one open draft per series), sv5_resource_files (file references, reused by later versions without copying), sv5_resource_log (append-only). RPC-only sv5_res_*.
- Kinds: bulletin, guide, strategy, assessment tool, template, training. Metadata: domain, subjects, stages, keywords, source, usage rights, explicit «no student data / evidence» confirmation.
- Writers: owner (group-wide), branch principal or supervisor with a live assignment (branch). Only the writer edits a draft. Publisher: owner (group-wide) or branch principal (branch), never the writer or last editor; return needs a reason. Published versions are immutable (trigger); a new version reuses files and needs re-confirmation; publishing it keeps the old one as «إصدار سابق».
- Readers: published → staff of the group (or of that branch); drafts → writer and publishers. Attachments (text/PDF/PNG/JPEG/WebP only) follow the same rule through can_read_file.
- Internal content is labelled «نموذج داخلي»; titles/summaries claiming official approval are refused on the server and flagged in the form. Nothing is published automatically; no evidence or student data is pulled in.
- UI: «الإشراف التربوي ← الموارد والتقارير» (published library with search by keywords, kind, domain, subject, stage; drafts & review queue; detail with preview/download, print, versions, log) and a read-only «الإشراف التربوي» tab inside the existing «المكتبة الرقمية».

### Incident during this batch (test DB only)
- Renaming can_read_file to add the resource rule left the three file policies (files read, storage read, storage upload) pointing to the renamed function, so file reads/uploads failed on the test DB for a few minutes. Fixed by recreating the three policies; verified no policy still references the old name and that file rows read again. Rule recorded in scripts/supervision AGENTS: recreate those policies whenever can_read_file is wrapped.

### Evidence
- /tmp/browser/sv449/res.py (RPC + storage, 34 PASS): scopes, writer/teacher/unassigned refusals, official-claim refusal, draft hidden from teacher, file type limit, upload, draft file not downloadable, stale rev, self-publish refused, other-branch principal refused (publish, read, download), return with reason, published readable/downloadable by teacher, published immutable, one open version, v2 reuses file and v1 keeps it, version history, owner cannot publish own group resource, list without body, log.
- /tmp/browser/sv449/resui.py + resui2.py (browser): supervisor created, attached a PDF, official-claim warning, submit; principal saw review queue and published; teacher at 390px searched by keyword+subject, opened and previewed the PDF, no manage tab, no overflow; library tab shows the shelf. Screenshot /mnt/documents/supervision-library-shelf.png.
- Unit: src/test/supervision-res.test.ts (7).

### Not verified
- Image preview inside a resource (only PDF and text were attached).
- Printed paper output.

## Batch 4: الملف المهني — implemented and tested on the test DB
- Tables sv5_portfolio (reference to the source + frozen summary title/date/description only; year/term derived from academic_years/terms; domain; teacher reflection; proposed/returned/verified/withdrawn) and sv5_portfolio_log (append-only). RPC-only sv5_pf_*.
- Sources: approved supervision records, present attendance in scheduled PD sessions, approved development plans, done improvement actions owned by the teacher. No files or internal notes are copied; «فتح المصدر» shows only when the caller passes the source's own read rule.
- Only the teacher proposes, edits or withdraws; verification/return (with reason) by owner, branch principal or a supervisor whose live assignment covers the teacher — never the teacher. Verified items are immutable; withdrawing frees the source again. Stale revisions refused.
- UI: «الموارد والتقارير ← الملف المهني», grouped by year → term → domain, filters, queue «بانتظار تحققك», per-item log, Excel/PDF/print with the note that item counts do not indicate quality.

### Evidence
- /tmp/browser/sv449/pf.py (28 PASS): candidates without notes, other teacher/principal cannot propose, domain required, duplicate refused, year/term derived, other teacher / other-branch principal / unassigned supervisor cannot read or verify, return needs reason, stale rev, re-propose, verify, verified immutable, withdraw + hidden + source free again, log order.
- /tmp/browser/sv449/pfui.py: teacher at 390px proposed a plan (button disabled until domain), no verify button for the teacher, no overflow; supervisor verified from the queue, log shown, print contains the note and rows. Screenshot /mnt/documents/professional-portfolio.png.
- Unit: src/test/supervision-pf.test.ts (5).

### Not verified
- Portfolio PDF/Excel file contents (print only); a teacher working in two branches.

## Batch 5: التقارير ولوحة المؤشرات — implemented and tested on the test DB
- RPC sv5_dash(_org,_school,_from,_to) (read-only, ≤ 1 year): nine indicators computed only over rows the caller may read through each source's own read rule (records, visits, dev plans, PD attendance, measures, actions, impact, portfolio, resources). Scope per branch is reported (owner / principal / supervisor with live assignment / teacher own data).
- Each indicator returns definition, denominator definition, numerator, denominator, period, last update and its rows (max 300 shown, totals over all). States: value / «صفر» (denominator > 0, numerator 0) / «لا توجد بيانات» / «لم يُقس» (measures, impact). The UI never prints 0 for the last two.
- Guidance/psychological/social cases (edu_*) are never read by the dashboard, including for the owner. No ranking of teachers or branches.
- UI «الموارد والتقارير ← لوحة المؤشرات»: period and branch filters, cards, drill-down table with links to each record, Excel/PDF/print for the summary and each indicator carrying period, branch and scope.

### Evidence
- /tmp/browser/sv449/dash.py (16 PASS): numerator/denominator equal listed rows, hours equal listed sessions, teachers see only own rows, supervisor scope ⊆ principal and limited to assigned branch, user without live assignment gets no supervision scope, other-branch principal refused, period limits, empty period gives «لا توجد بيانات» vs «لم يُقس», no guidance cases.
- /tmp/browser/sv449/dashui.py: supervisor card 1 من 1 matches its one row, row opens the record, indicator print carries period and note; owner Excel matches server values (10 من 11, «لا توجد بيانات», 8); teacher at 390px shows «لا توجد بيانات»/«لم يُقس», no overflow. Screenshot /mnt/documents/supervision-dashboard.png.
- Unit: src/test/supervision-dash.test.ts (5).

### Not verified
- «صفر» state with live data (covered by unit test only); PDF file contents of the dashboard.

## Remaining stage-5 batches («غير مكتملة»)
 portfolio, periodic reports and dashboard.
