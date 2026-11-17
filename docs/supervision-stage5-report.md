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

## Remaining stage-5 batches («غير مكتملة»)
Supervisory resources/bulletins on the existing library, professional portfolio, periodic reports and dashboard.
