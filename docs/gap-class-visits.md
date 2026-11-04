# Gap analysis — class visits & teacher evaluation (2026-11-04)

Source: docs/rikaz-scope-v8.md §10 (dept head) and §11 (supervisor D06).

| Requirement (scope v8) | Status in Rikaz | Evidence |
|---|---|---|
| Supervisor sees only assigned teachers and their classes | Built | supervisor_teachers + supervised_* helpers; scope-e2e |
| Supervisor plans visits from assigned teachers' timetable | Partly: timetable is readable in scope; no visit planner | timetable-e2e role views |
| Supervisory calendar + scheduled visits | Not built | no visit table/RPC |
| Evaluation forms with versions + completed visits | Not built | — |
| Recommendations, improvement plans, follow-up dates | Partly: can be issued as admin tasks (adm_tasks) to the teacher; no visit link | admin-e2e |
| Teacher acknowledgement and notes on a visit | Not built | — |
| Individual / aggregated supervision reports | Not built | — |
| Dept head may evaluate only by explicit evaluation policy (not by title) | Rule respected: no evaluation right exists for any role | perm tree has no visit section |
| Supervisor cannot message as the teacher or edit grades | Built (read-only) | scope-e2e, homework-e2e observers |

Conclusion: class visits / teacher evaluation is a missing module, not a defect. Building it is a new feature (tables, RPCs, permission section, D06/D05/teacher screens) and needs the owner's go-ahead; it was not built in the closure round, which forbids new scope.
