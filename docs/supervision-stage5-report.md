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

## Remaining stage-5 batches («غير مكتملة»)
Improvement actions from results, supervisory resources/bulletins on the existing library, professional portfolio, periodic reports and dashboard.
