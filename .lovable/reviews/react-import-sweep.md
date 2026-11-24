# React import flow sweep — 24 November 2026

## User-facing rule
Every screen must load without trying to use React features that were not imported. This is the rule behind the reported TS2686 error.

## Evidence and limits
- Read and parsed all 658 TypeScript source files under src, including 394 files containing JSX, all current HTTP route source and all server-function source. This is source inspection, not a full signed-in journey or a new typecheck.
- use-mobile imports useEffect/useState explicitly. Its only direct consumer is ui/sidebar, which imports React explicitly; both desktop and mobile branches follow the import rule.
- All 40 files with runtime React namespace references import a runtime React binding. Type-only namespace references do not access a React runtime global.
- tsconfig uses react-jsx: JSX alone does not require a default React import.
- Latest observed harness build entry: 2026-11-24T10:04:50Z, build OK; no TS2686 found in the available build log. Runtime telemetry is unavailable. The quoted instruction text is absent from current source.
- SQL database functions do not execute React/TypeScript and cannot produce this import error; no SQL, settled financial records, settings, example data, permissions or app behavior were changed.
- The Wafeq review remains incomplete for backup/restore, isolated provider access, real accounting flows, current VPS/mobile deployment and signed-in financial UI acceptance. New finance packages remain unimplemented.

## All runtime React namespace consumers
- `src/components/ui/accordion.tsx`: follows the rule; runtime React imported.
- `src/components/ui/alert-dialog.tsx`: follows the rule; runtime React imported.
- `src/components/ui/alert.tsx`: follows the rule; runtime React imported.
- `src/components/ui/avatar.tsx`: follows the rule; runtime React imported.
- `src/components/ui/breadcrumb.tsx`: follows the rule; runtime React imported.
- `src/components/ui/button.tsx`: follows the rule; runtime React imported.
- `src/components/ui/calendar.tsx`: follows the rule; runtime React imported.
- `src/components/ui/card.tsx`: follows the rule; runtime React imported.
- `src/components/ui/carousel.tsx`: follows the rule; runtime React imported.
- `src/components/ui/chart.tsx`: follows the rule; runtime React imported.
- `src/components/ui/checkbox.tsx`: follows the rule; runtime React imported.
- `src/components/ui/command.tsx`: follows the rule; runtime React imported.
- `src/components/ui/context-menu.tsx`: follows the rule; runtime React imported.
- `src/components/ui/dialog.tsx`: follows the rule; runtime React imported.
- `src/components/ui/drawer.tsx`: follows the rule; runtime React imported.
- `src/components/ui/dropdown-menu.tsx`: follows the rule; runtime React imported.
- `src/components/ui/form.tsx`: follows the rule; runtime React imported.
- `src/components/ui/hover-card.tsx`: follows the rule; runtime React imported.
- `src/components/ui/input-otp.tsx`: follows the rule; runtime React imported.
- `src/components/ui/input.tsx`: follows the rule; runtime React imported.
- `src/components/ui/label.tsx`: follows the rule; runtime React imported.
- `src/components/ui/menubar.tsx`: follows the rule; runtime React imported.
- `src/components/ui/navigation-menu.tsx`: follows the rule; runtime React imported.
- `src/components/ui/pagination.tsx`: follows the rule; runtime React imported.
- `src/components/ui/popover.tsx`: follows the rule; runtime React imported.
- `src/components/ui/progress.tsx`: follows the rule; runtime React imported.
- `src/components/ui/radio-group.tsx`: follows the rule; runtime React imported.
- `src/components/ui/scroll-area.tsx`: follows the rule; runtime React imported.
- `src/components/ui/select.tsx`: follows the rule; runtime React imported.
- `src/components/ui/separator.tsx`: follows the rule; runtime React imported.
- `src/components/ui/sheet.tsx`: follows the rule; runtime React imported.
- `src/components/ui/sidebar.tsx`: follows the rule; runtime React imported.
- `src/components/ui/slider.tsx`: follows the rule; runtime React imported.
- `src/components/ui/switch.tsx`: follows the rule; runtime React imported.
- `src/components/ui/table.tsx`: follows the rule; runtime React imported.
- `src/components/ui/tabs.tsx`: follows the rule; runtime React imported.
- `src/components/ui/textarea.tsx`: follows the rule; runtime React imported.
- `src/components/ui/toggle-group.tsx`: follows the rule; runtime React imported.
- `src/components/ui/toggle.tsx`: follows the rule; runtime React imported.
- `src/components/ui/tooltip.tsx`: follows the rule; runtime React imported.

## All type-only React namespace consumers
- `src/components/admin/shared.tsx`: type-only references; no unimported runtime React use.
- `src/components/admissions/page.tsx`: type-only references; no unimported runtime React use.
- `src/components/attendance/calls-settings.tsx`: type-only references; no unimported runtime React use.
- `src/components/grades/sheet.tsx`: type-only references; no unimported runtime React use.
- `src/components/guardian-quick-add.tsx`: type-only references; no unimported runtime React use.
- `src/components/health/health-desk.tsx`: type-only references; no unimported runtime React use.
- `src/components/health/health-file.tsx`: type-only references; no unimported runtime React use.
- `src/components/hr/documents.tsx`: type-only references; no unimported runtime React use.
- `src/components/hr/money.tsx`: type-only references; no unimported runtime React use.
- `src/components/hr/navigation.tsx`: type-only references; no unimported runtime React use.
- `src/components/hr/version-card.tsx`: type-only references; no unimported runtime React use.
- `src/components/maintenance/page.tsx`: type-only references; no unimported runtime React use.
- `src/components/org-docs/org-docs.tsx`: type-only references; no unimported runtime React use.
- `src/components/password-input.tsx`: type-only references; no unimported runtime React use.
- `src/components/people-import-dialog.tsx`: type-only references; no unimported runtime React use.
- `src/components/platform/platform-notices.tsx`: type-only references; no unimported runtime React use.
- `src/components/procurement/custody.tsx`: type-only references; no unimported runtime React use.
- `src/components/procurement/expense.tsx`: type-only references; no unimported runtime React use.
- `src/components/procurement/needs.tsx`: type-only references; no unimported runtime React use.
- `src/components/procurement/requests.tsx`: type-only references; no unimported runtime React use.
- `src/components/procurement/ui.tsx`: type-only references; no unimported runtime React use.
- `src/components/procurement/workspace.tsx`: type-only references; no unimported runtime React use.
- `src/components/school-logo.tsx`: type-only references; no unimported runtime React use.
- `src/components/site/content.tsx`: type-only references; no unimported runtime React use.
- `src/components/site/register-form.tsx`: type-only references; no unimported runtime React use.
- `src/components/states.tsx`: type-only references; no unimported runtime React use.
- `src/components/supervision/lo.tsx`: type-only references; no unimported runtime React use.
- `src/components/supervision/pd-teachers.tsx`: type-only references; no unimported runtime React use.
- `src/components/supervision/pf.tsx`: type-only references; no unimported runtime React use.
- `src/components/supervision/res.tsx`: type-only references; no unimported runtime React use.
- `src/components/support/whatsapp-extras.tsx`: type-only references; no unimported runtime React use.
- `src/components/ui/badge.tsx`: type-only references; no unimported runtime React use.
- `src/components/ui/resizable.tsx`: type-only references; no unimported runtime React use.
- `src/components/ui/skeleton.tsx`: type-only references; no unimported runtime React use.
- `src/components/ui/sonner.tsx`: type-only references; no unimported runtime React use.
- `src/components/virtual-classes.tsx`: type-only references; no unimported runtime React use.
- `src/routes/_authenticated/app/evaluation.tsx`: type-only references; no unimported runtime React use.
- `src/routes/_authenticated/app/homework.$id.tsx`: type-only references; no unimported runtime React use.
- `src/routes/_authenticated/app/hr.tsx`: type-only references; no unimported runtime React use.
- `src/routes/_authenticated/app/my-employment.tsx`: type-only references; no unimported runtime React use.
- `src/routes/_authenticated/app/platform.tsx`: type-only references; no unimported runtime React use.
- `src/routes/_authenticated/app/procurement.tsx`: type-only references; no unimported runtime React use.
- `src/routes/_authenticated/route.tsx`: type-only references; no unimported runtime React use.
- `src/routes/auth.tsx`: type-only references; no unimported runtime React use.
- `src/routes/join.$token.tsx`: type-only references; no unimported runtime React use.
- `src/test/exam-create.test.tsx`: type-only references; no unimported runtime React use.
- `src/test/package-ui.test.tsx`: type-only references; no unimported runtime React use.

## Exhaustive source inventory
All files below were read now. “No runtime namespace” means no runtime React.namespace reference was found; it is not a claim that every unrelated flow in that file has been tested.

| Source file | Rule assessment |
| --- | --- |
| `src/components/academic-allocation.tsx` | No runtime React namespace dependency |
| `src/components/academic-preset-picker.tsx` | No runtime React namespace dependency |
| `src/components/account-button.tsx` | No runtime React namespace dependency |
| `src/components/account-panel.tsx` | No runtime React namespace dependency |
| `src/components/admin/meeting-form.tsx` | No runtime React namespace dependency |
| `src/components/admin/meeting-list.tsx` | No runtime React namespace dependency |
| `src/components/admin/meeting-room.tsx` | No runtime React namespace dependency |
| `src/components/admin/rsvp.tsx` | No runtime React namespace dependency |
| `src/components/admin/shared.tsx` | React references are type-only |
| `src/components/admissions/page.tsx` | React references are type-only |
| `src/components/admissions/search.ts` | No runtime React namespace dependency |
| `src/components/admissions/shared.ts` | No runtime React namespace dependency |
| `src/components/attendance/calls-settings.tsx` | React references are type-only |
| `src/components/attendance/field-test-guide.tsx` | No runtime React namespace dependency |
| `src/components/attendance/hub-nav.tsx` | No runtime React namespace dependency |
| `src/components/attendance/lessons.tsx` | No runtime React namespace dependency |
| `src/components/attendance/scanner.tsx` | No runtime React namespace dependency |
| `src/components/attendance/staff.tsx` | No runtime React namespace dependency |
| `src/components/attendance/student-search.tsx` | No runtime React namespace dependency |
| `src/components/attendance/tick-status.tsx` | No runtime React namespace dependency |
| `src/components/classroom-posts.tsx` | No runtime React namespace dependency |
| `src/components/classroom-room-tabs.ts` | No runtime React namespace dependency |
| `src/components/comm/chat-extras.tsx` | No runtime React namespace dependency |
| `src/components/comm/circulars.tsx` | No runtime React namespace dependency |
| `src/components/comm/classes.tsx` | No runtime React namespace dependency |
| `src/components/comm/collaboration.tsx` | No runtime React namespace dependency |
| `src/components/comm/dept-picker.tsx` | No runtime React namespace dependency |
| `src/components/comm/group-panel.tsx` | No runtime React namespace dependency |
| `src/components/comm/image-thumb.tsx` | No runtime React namespace dependency |
| `src/components/comm/manage.tsx` | No runtime React namespace dependency |
| `src/components/comm/material-file-viewer.tsx` | No runtime React namespace dependency |
| `src/components/comm/meetings-tab.tsx` | No runtime React namespace dependency |
| `src/components/comm/member-picker.tsx` | No runtime React namespace dependency |
| `src/components/comm/mention-menu.tsx` | No runtime React namespace dependency |
| `src/components/comm/new-chat.tsx` | No runtime React namespace dependency |
| `src/components/comm/notice-files.tsx` | No runtime React namespace dependency |
| `src/components/comm/pdf-pages.tsx` | No runtime React namespace dependency |
| `src/components/comm/thread.tsx` | No runtime React namespace dependency |
| `src/components/comm/xbranch.tsx` | No runtime React namespace dependency |
| `src/components/confirm.tsx` | No runtime React namespace dependency |
| `src/components/contract-match.tsx` | No runtime React namespace dependency |
| `src/components/crud-page.tsx` | No runtime React namespace dependency |
| `src/components/dashboard/branches.tsx` | No runtime React namespace dependency |
| `src/components/dashboard/central-hr.tsx` | No runtime React namespace dependency |
| `src/components/dashboard/follow-up.tsx` | No runtime React namespace dependency |
| `src/components/dashboard/home.tsx` | No runtime React namespace dependency |
| `src/components/dashboard/kit.tsx` | No runtime React namespace dependency |
| `src/components/dashboard/week-calendar.tsx` | No runtime React namespace dependency |
| `src/components/dashboard/work-panel.tsx` | No runtime React namespace dependency |
| `src/components/display-names-preview.tsx` | No runtime React namespace dependency |
| `src/components/education/desk.tsx` | No runtime React namespace dependency |
| `src/components/education/model.ts` | No runtime React namespace dependency |
| `src/components/education/offline-note.tsx` | No runtime React namespace dependency |
| `src/components/education/plan-board.tsx` | No runtime React namespace dependency |
| `src/components/education/plan-detail.tsx` | No runtime React namespace dependency |
| `src/components/education/plan-evidence.tsx` | No runtime React namespace dependency |
| `src/components/education/plan-wizard.tsx` | No runtime React namespace dependency |
| `src/components/education/staff-presence.tsx` | No runtime React namespace dependency |
| `src/components/education/stats.tsx` | No runtime React namespace dependency |
| `src/components/education/teacher-plan.tsx` | No runtime React namespace dependency |
| `src/components/evaluation/charts.tsx` | No runtime React namespace dependency |
| `src/components/evaluation/stars.test.ts` | No runtime React namespace dependency |
| `src/components/evaluation/stars.tsx` | No runtime React namespace dependency |
| `src/components/events/calendar.tsx` | No runtime React namespace dependency |
| `src/components/events/files.tsx` | No runtime React namespace dependency |
| `src/components/events/form-editor.tsx` | No runtime React namespace dependency |
| `src/components/events/form-render.tsx` | No runtime React namespace dependency |
| `src/components/events/item.tsx` | No runtime React namespace dependency |
| `src/components/events/public-files.tsx` | No runtime React namespace dependency |
| `src/components/events/section-forms.tsx` | No runtime React namespace dependency |
| `src/components/events/shared.tsx` | No runtime React namespace dependency |
| `src/components/events/upload.ts` | No runtime React namespace dependency |
| `src/components/export-brand-sync.tsx` | No runtime React namespace dependency |
| `src/components/family/attendance-model.ts` | No runtime React namespace dependency |
| `src/components/family/attendance.tsx` | No runtime React namespace dependency |
| `src/components/family/child-overview.tsx` | No runtime React namespace dependency |
| `src/components/family/fin-pay-settings.tsx` | No runtime React namespace dependency |
| `src/components/family/requests.tsx` | No runtime React namespace dependency |
| `src/components/family/search.ts` | No runtime React namespace dependency |
| `src/components/family/student-day.tsx` | No runtime React namespace dependency |
| `src/components/family/timetable-view.tsx` | No runtime React namespace dependency |
| `src/components/family-visits/shared.tsx` | No runtime React namespace dependency |
| `src/components/gifted/board.tsx` | No runtime React namespace dependency |
| `src/components/gifted/family.tsx` | No runtime React namespace dependency |
| `src/components/gifted/hub.tsx` | No runtime React namespace dependency |
| `src/components/gifted/model.ts` | No runtime React namespace dependency |
| `src/components/gifted/nomination-wizard.tsx` | No runtime React namespace dependency |
| `src/components/gifted/nominations.tsx` | No runtime React namespace dependency |
| `src/components/gifted/plan-editor.tsx` | No runtime React namespace dependency |
| `src/components/gifted/plans.tsx` | No runtime React namespace dependency |
| `src/components/gifted/programs.tsx` | No runtime React namespace dependency |
| `src/components/gifted/reports.tsx` | No runtime React namespace dependency |
| `src/components/gifted/students.tsx` | No runtime React namespace dependency |
| `src/components/gifted/works.tsx` | No runtime React namespace dependency |
| `src/components/grades/common.ts` | No runtime React namespace dependency |
| `src/components/grades/gradebook.tsx` | No runtime React namespace dependency |
| `src/components/grades/grades-calc.test.ts` | No runtime React namespace dependency |
| `src/components/grades/setup.tsx` | No runtime React namespace dependency |
| `src/components/grades/sheet.tsx` | React references are type-only |
| `src/components/guardian-import-dialog.tsx` | No runtime React namespace dependency |
| `src/components/guardian-link-panel.tsx` | No runtime React namespace dependency |
| `src/components/guardian-quick-add.tsx` | React references are type-only |
| `src/components/guardian-source-pick.tsx` | No runtime React namespace dependency |
| `src/components/guidance/agenda.tsx` | No runtime React namespace dependency |
| `src/components/guidance/board.tsx` | No runtime React namespace dependency |
| `src/components/guidance/case-model.ts` | No runtime React namespace dependency |
| `src/components/guidance/case-run.tsx` | No runtime React namespace dependency |
| `src/components/guidance/cases.tsx` | No runtime React namespace dependency |
| `src/components/guidance/family-summaries.tsx` | No runtime React namespace dependency |
| `src/components/guidance/hub.tsx` | No runtime React namespace dependency |
| `src/components/guidance/model.ts` | No runtime React namespace dependency |
| `src/components/guidance/plans.tsx` | No runtime React namespace dependency |
| `src/components/guidance/programs.tsx` | No runtime React namespace dependency |
| `src/components/guidance/referral-wizard.tsx` | No runtime React namespace dependency |
| `src/components/guidance/referrals.tsx` | No runtime React namespace dependency |
| `src/components/guidance/reports.tsx` | No runtime React namespace dependency |
| `src/components/guidance/search.ts` | No runtime React namespace dependency |
| `src/components/health/calendar-model.test.ts` | No runtime React namespace dependency |
| `src/components/health/calendar-model.ts` | No runtime React namespace dependency |
| `src/components/health/calendar.tsx` | No runtime React namespace dependency |
| `src/components/health/health-desk.tsx` | React references are type-only |
| `src/components/health/health-file.tsx` | React references are type-only |
| `src/components/homework/exam-create.tsx` | No runtime React namespace dependency |
| `src/components/homework/exam-model.ts` | No runtime React namespace dependency |
| `src/components/homework/exam-paper.tsx` | No runtime React namespace dependency |
| `src/components/homework/exam-solve.tsx` | No runtime React namespace dependency |
| `src/components/homework/export.tsx` | No runtime React namespace dependency |
| `src/components/homework/files.tsx` | No runtime React namespace dependency |
| `src/components/homework/list.tsx` | No runtime React namespace dependency |
| `src/components/homework/question-fields.tsx` | No runtime React namespace dependency |
| `src/components/homework/student-homework.tsx` | No runtime React namespace dependency |
| `src/components/homework/submissions.tsx` | No runtime React namespace dependency |
| `src/components/hr/adms-bridge.tsx` | No runtime React namespace dependency |
| `src/components/hr/assets.tsx` | No runtime React namespace dependency |
| `src/components/hr/att-devices.tsx` | No runtime React namespace dependency |
| `src/components/hr/attendance.tsx` | No runtime React namespace dependency |
| `src/components/hr/bulk-actions.tsx` | No runtime React namespace dependency |
| `src/components/hr/categories.tsx` | No runtime React namespace dependency |
| `src/components/hr/contracts-shared.ts` | No runtime React namespace dependency |
| `src/components/hr/doc-date-picker.test.ts` | No runtime React namespace dependency |
| `src/components/hr/doc-date-picker.tsx` | No runtime React namespace dependency |
| `src/components/hr/documents.tsx` | React references are type-only |
| `src/components/hr/employee-list.test.tsx` | No runtime React namespace dependency |
| `src/components/hr/employee-list.tsx` | No runtime React namespace dependency |
| `src/components/hr/employee-sheet.tsx` | No runtime React namespace dependency |
| `src/components/hr/en-hint.tsx` | No runtime React namespace dependency |
| `src/components/hr/extensions.tsx` | No runtime React namespace dependency |
| `src/components/hr/id-readiness.tsx` | No runtime React namespace dependency |
| `src/components/hr/import.tsx` | No runtime React namespace dependency |
| `src/components/hr/leave.tsx` | No runtime React namespace dependency |
| `src/components/hr/letters.tsx` | No runtime React namespace dependency |
| `src/components/hr/manager-pick.tsx` | No runtime React namespace dependency |
| `src/components/hr/money.tsx` | React references are type-only |
| `src/components/hr/navigation.tsx` | React references are type-only |
| `src/components/hr/p10.tsx` | No runtime React namespace dependency |
| `src/components/hr/p8-self.tsx` | No runtime React namespace dependency |
| `src/components/hr/pay-policies.tsx` | No runtime React namespace dependency |
| `src/components/hr/pd-hours.tsx` | No runtime React namespace dependency |
| `src/components/hr/profile-fields.tsx` | No runtime React namespace dependency |
| `src/components/hr/shared.tsx` | No runtime React namespace dependency |
| `src/components/hr/version-card.tsx` | React references are type-only |
| `src/components/import-dialog.tsx` | No runtime React namespace dependency |
| `src/components/list-tools.tsx` | No runtime React namespace dependency |
| `src/components/logo.tsx` | No runtime React namespace dependency |
| `src/components/maintenance/need-panel.tsx` | No runtime React namespace dependency |
| `src/components/maintenance/ops-home.tsx` | No runtime React namespace dependency |
| `src/components/maintenance/page.tsx` | React references are type-only |
| `src/components/maintenance/requests.tsx` | No runtime React namespace dependency |
| `src/components/maintenance/search.ts` | No runtime React namespace dependency |
| `src/components/maintenance/shared.ts` | No runtime React namespace dependency |
| `src/components/multi-section-assign.tsx` | No runtime React namespace dependency |
| `src/components/navigation-section.tsx` | No runtime React namespace dependency |
| `src/components/notification-bell.tsx` | No runtime React namespace dependency |
| `src/components/notification-toasts.tsx` | No runtime React namespace dependency |
| `src/components/org-docs/archive-model.ts` | No runtime React namespace dependency |
| `src/components/org-docs/form-options.ts` | No runtime React namespace dependency |
| `src/components/org-docs/org-docs.tsx` | React references are type-only |
| `src/components/org-years.tsx` | No runtime React namespace dependency |
| `src/components/owner-portal.tsx` | No runtime React namespace dependency |
| `src/components/password-input.tsx` | React references are type-only |
| `src/components/people/bulk-bar.test.tsx` | No runtime React namespace dependency |
| `src/components/people/bulk-bar.tsx` | No runtime React namespace dependency |
| `src/components/people/bulk-policy.test.ts` | No runtime React namespace dependency |
| `src/components/people/bulk-policy.ts` | No runtime React namespace dependency |
| `src/components/people/person-card.tsx` | No runtime React namespace dependency |
| `src/components/people/shared.tsx` | No runtime React namespace dependency |
| `src/components/people/tags-admin.tsx` | No runtime React namespace dependency |
| `src/components/people-import-dialog.tsx` | React references are type-only |
| `src/components/people-picker.tsx` | No runtime React namespace dependency |
| `src/components/perm-person.tsx` | No runtime React namespace dependency |
| `src/components/perm-tree.tsx` | No runtime React namespace dependency |
| `src/components/placement-history.tsx` | No runtime React namespace dependency |
| `src/components/platform/platform-home.tsx` | No runtime React namespace dependency |
| `src/components/platform/platform-notices.tsx` | React references are type-only |
| `src/components/platform/platform-schools.tsx` | No runtime React namespace dependency |
| `src/components/platform/platform-subs.tsx` | No runtime React namespace dependency |
| `src/components/platform/signup-requests.tsx` | No runtime React namespace dependency |
| `src/components/procurement/archive.tsx` | No runtime React namespace dependency |
| `src/components/procurement/branch-overview.tsx` | No runtime React namespace dependency |
| `src/components/procurement/custody.tsx` | React references are type-only |
| `src/components/procurement/expense-grid.tsx` | No runtime React namespace dependency |
| `src/components/procurement/expense.tsx` | React references are type-only |
| `src/components/procurement/export-buttons.tsx` | No runtime React namespace dependency |
| `src/components/procurement/form-builder.tsx` | No runtime React namespace dependency |
| `src/components/procurement/needs.tsx` | React references are type-only |
| `src/components/procurement/reports.tsx` | No runtime React namespace dependency |
| `src/components/procurement/requests.tsx` | React references are type-only |
| `src/components/procurement/settlement-sheet.tsx` | No runtime React namespace dependency |
| `src/components/procurement/shared.tsx` | No runtime React namespace dependency |
| `src/components/procurement/ui.tsx` | React references are type-only |
| `src/components/procurement/workspace.tsx` | React references are type-only |
| `src/components/reports/builder.tsx` | No runtime React namespace dependency |
| `src/components/reports/core.ts` | No runtime React namespace dependency |
| `src/components/reports/more.ts` | No runtime React namespace dependency |
| `src/components/require-school.tsx` | No runtime React namespace dependency |
| `src/components/sanad.tsx` | No runtime React namespace dependency |
| `src/components/schedule/generate-panel.tsx` | No runtime React namespace dependency |
| `src/components/schedule/settings-tab.tsx` | No runtime React namespace dependency |
| `src/components/schedule/substitutions-tab.tsx` | No runtime React namespace dependency |
| `src/components/school-logo.tsx` | React references are type-only |
| `src/components/school-map/model.ts` | No runtime React namespace dependency |
| `src/components/school-map/school-map.tsx` | No runtime React namespace dependency |
| `src/components/school-profile.tsx` | No runtime React namespace dependency |
| `src/components/site/content.tsx` | React references are type-only |
| `src/components/site/register-form.tsx` | React references are type-only |
| `src/components/site/shell.tsx` | No runtime React namespace dependency |
| `src/components/staff-department-filter.ts` | No runtime React namespace dependency |
| `src/components/staff-directory-actions.tsx` | No runtime React namespace dependency |
| `src/components/staff-directory-filter.tsx` | No runtime React namespace dependency |
| `src/components/staff-directory-model.ts` | No runtime React namespace dependency |
| `src/components/staff-directory.tsx` | No runtime React namespace dependency |
| `src/components/staff-scopes.tsx` | No runtime React namespace dependency |
| `src/components/staff-wizard.tsx` | No runtime React namespace dependency |
| `src/components/states.tsx` | React references are type-only |
| `src/components/subject-preset-picker.tsx` | No runtime React namespace dependency |
| `src/components/supervision/act-model.ts` | No runtime React namespace dependency |
| `src/components/supervision/assign.tsx` | No runtime React namespace dependency |
| `src/components/supervision/dash-model.ts` | No runtime React namespace dependency |
| `src/components/supervision/dash.tsx` | No runtime React namespace dependency |
| `src/components/supervision/delegations.tsx` | No runtime React namespace dependency |
| `src/components/supervision/evidence.tsx` | No runtime React namespace dependency |
| `src/components/supervision/filler.tsx` | No runtime React namespace dependency |
| `src/components/supervision/form-editor.tsx` | No runtime React namespace dependency |
| `src/components/supervision/form-print.ts` | No runtime React namespace dependency |
| `src/components/supervision/form-ui.tsx` | No runtime React namespace dependency |
| `src/components/supervision/forms-model.ts` | No runtime React namespace dependency |
| `src/components/supervision/forms.tsx` | No runtime React namespace dependency |
| `src/components/supervision/hub.tsx` | No runtime React namespace dependency |
| `src/components/supervision/lo-actions.tsx` | No runtime React namespace dependency |
| `src/components/supervision/lo-measure.tsx` | No runtime React namespace dependency |
| `src/components/supervision/lo-model.ts` | No runtime React namespace dependency |
| `src/components/supervision/lo.tsx` | React references are type-only |
| `src/components/supervision/model.ts` | No runtime React namespace dependency |
| `src/components/supervision/pd-api.ts` | No runtime React namespace dependency |
| `src/components/supervision/pd-model.ts` | No runtime React namespace dependency |
| `src/components/supervision/pd-plans.tsx` | No runtime React namespace dependency |
| `src/components/supervision/pd-programs.tsx` | No runtime React namespace dependency |
| `src/components/supervision/pd-teachers.tsx` | React references are type-only |
| `src/components/supervision/pd.tsx` | No runtime React namespace dependency |
| `src/components/supervision/pf-model.ts` | No runtime React namespace dependency |
| `src/components/supervision/pf.tsx` | React references are type-only |
| `src/components/supervision/records.tsx` | No runtime React namespace dependency |
| `src/components/supervision/res-model.ts` | No runtime React namespace dependency |
| `src/components/supervision/res.tsx` | React references are type-only |
| `src/components/supervision/use-unsaved.ts` | No runtime React namespace dependency |
| `src/components/supervision/work-model.ts` | No runtime React namespace dependency |
| `src/components/supervision/work-plan.tsx` | No runtime React namespace dependency |
| `src/components/supervision/work-progress.tsx` | No runtime React namespace dependency |
| `src/components/supervision/work-report.ts` | No runtime React namespace dependency |
| `src/components/supervision/work-visit.tsx` | No runtime React namespace dependency |
| `src/components/supervision/work.tsx` | No runtime React namespace dependency |
| `src/components/support/assignee-picker.tsx` | No runtime React namespace dependency |
| `src/components/support/calls-caps.ts` | No runtime React namespace dependency |
| `src/components/support/calls.tsx` | No runtime React namespace dependency |
| `src/components/support/caps.ts` | No runtime React namespace dependency |
| `src/components/support/draft-files.tsx` | No runtime React namespace dependency |
| `src/components/support/followers.tsx` | No runtime React namespace dependency |
| `src/components/support/handling.tsx` | No runtime React namespace dependency |
| `src/components/support/hours.tsx` | No runtime React namespace dependency |
| `src/components/support/internal-ticket.tsx` | No runtime React namespace dependency |
| `src/components/support/route-picker.tsx` | No runtime React namespace dependency |
| `src/components/support/summary.tsx` | No runtime React namespace dependency |
| `src/components/support/support.tsx` | No runtime React namespace dependency |
| `src/components/support/ticket-fields.tsx` | No runtime React namespace dependency |
| `src/components/support/ticket-model.ts` | No runtime React namespace dependency |
| `src/components/support/whatsapp-actions.tsx` | No runtime React namespace dependency |
| `src/components/support/whatsapp-extras.tsx` | React references are type-only |
| `src/components/support/whatsapp-transfer.tsx` | No runtime React namespace dependency |
| `src/components/support/whatsapp.tsx` | No runtime React namespace dependency |
| `src/components/ui/accordion.tsx` | Runtime React explicitly imported |
| `src/components/ui/alert-dialog.tsx` | Runtime React explicitly imported |
| `src/components/ui/alert.tsx` | Runtime React explicitly imported |
| `src/components/ui/aspect-ratio.tsx` | No runtime React namespace dependency |
| `src/components/ui/avatar.tsx` | Runtime React explicitly imported |
| `src/components/ui/badge.tsx` | React references are type-only |
| `src/components/ui/breadcrumb.tsx` | Runtime React explicitly imported |
| `src/components/ui/button.tsx` | Runtime React explicitly imported |
| `src/components/ui/calendar.tsx` | Runtime React explicitly imported |
| `src/components/ui/card.tsx` | Runtime React explicitly imported |
| `src/components/ui/carousel.tsx` | Runtime React explicitly imported |
| `src/components/ui/chart.tsx` | Runtime React explicitly imported |
| `src/components/ui/checkbox.tsx` | Runtime React explicitly imported |
| `src/components/ui/collapsible.tsx` | No runtime React namespace dependency |
| `src/components/ui/command.tsx` | Runtime React explicitly imported |
| `src/components/ui/context-menu.tsx` | Runtime React explicitly imported |
| `src/components/ui/dialog.tsx` | Runtime React explicitly imported |
| `src/components/ui/drawer.tsx` | Runtime React explicitly imported |
| `src/components/ui/dropdown-menu.tsx` | Runtime React explicitly imported |
| `src/components/ui/form.tsx` | Runtime React explicitly imported |
| `src/components/ui/hover-card.tsx` | Runtime React explicitly imported |
| `src/components/ui/input-otp.tsx` | Runtime React explicitly imported |
| `src/components/ui/input.tsx` | Runtime React explicitly imported |
| `src/components/ui/label.tsx` | Runtime React explicitly imported |
| `src/components/ui/menubar.tsx` | Runtime React explicitly imported |
| `src/components/ui/native-select.ts` | No runtime React namespace dependency |
| `src/components/ui/navigation-menu.tsx` | Runtime React explicitly imported |
| `src/components/ui/pagination.tsx` | Runtime React explicitly imported |
| `src/components/ui/popover.tsx` | Runtime React explicitly imported |
| `src/components/ui/progress.tsx` | Runtime React explicitly imported |
| `src/components/ui/radio-group.tsx` | Runtime React explicitly imported |
| `src/components/ui/resizable.tsx` | React references are type-only |
| `src/components/ui/scroll-area.tsx` | Runtime React explicitly imported |
| `src/components/ui/select.tsx` | Runtime React explicitly imported |
| `src/components/ui/separator.tsx` | Runtime React explicitly imported |
| `src/components/ui/sheet.tsx` | Runtime React explicitly imported |
| `src/components/ui/sidebar.tsx` | Runtime React explicitly imported |
| `src/components/ui/skeleton.tsx` | React references are type-only |
| `src/components/ui/slider.tsx` | Runtime React explicitly imported |
| `src/components/ui/sonner.tsx` | React references are type-only |
| `src/components/ui/switch.tsx` | Runtime React explicitly imported |
| `src/components/ui/table.tsx` | Runtime React explicitly imported |
| `src/components/ui/tabs.tsx` | Runtime React explicitly imported |
| `src/components/ui/textarea.tsx` | Runtime React explicitly imported |
| `src/components/ui/toggle-group.tsx` | Runtime React explicitly imported |
| `src/components/ui/toggle.tsx` | Runtime React explicitly imported |
| `src/components/ui/tooltip.tsx` | Runtime React explicitly imported |
| `src/components/virtual-classes.tsx` | React references are type-only |
| `src/components/week-grid.tsx` | No runtime React namespace dependency |
| `src/components/work-today.tsx` | No runtime React namespace dependency |
| `src/hooks/use-mobile.tsx` | React hooks explicitly imported |
| `src/hooks/use-online.ts` | No runtime React namespace dependency |
| `src/integrations/supabase/auth-middleware.test.ts` | No runtime React namespace dependency |
| `src/integrations/supabase/auth-middleware.ts` | No runtime React namespace dependency |
| `src/integrations/supabase/client.server.ts` | No runtime React namespace dependency |
| `src/integrations/supabase/client.ts` | No runtime React namespace dependency |
| `src/integrations/supabase/previewAuthStorage.ts` | No runtime React namespace dependency |
| `src/integrations/supabase/types.ts` | No runtime React namespace dependency |
| `src/lib/academic-year.ts` | No runtime React namespace dependency |
| `src/lib/accounts-provision.test.ts` | No runtime React namespace dependency |
| `src/lib/accounts.functions.ts` | No runtime React namespace dependency |
| `src/lib/acct-outbox.server.ts` | No runtime React namespace dependency |
| `src/lib/adms/adms.test.ts` | No runtime React namespace dependency |
| `src/lib/adms/contract.ts` | No runtime React namespace dependency |
| `src/lib/adms/receiver.ts` | No runtime React namespace dependency |
| `src/lib/adms/sync.ts` | No runtime React namespace dependency |
| `src/lib/adms-registry-worker.server.ts` | No runtime React namespace dependency |
| `src/lib/adms-registry.server.ts` | No runtime React namespace dependency |
| `src/lib/adms.functions.ts` | No runtime React namespace dependency |
| `src/lib/agora-token.test.ts` | No runtime React namespace dependency |
| `src/lib/agora-token.ts` | No runtime React namespace dependency |
| `src/lib/announce-provider.test.ts` | No runtime React namespace dependency |
| `src/lib/announce.functions.ts` | No runtime React namespace dependency |
| `src/lib/announcer.ts` | No runtime React namespace dependency |
| `src/lib/attendance.test.ts` | No runtime React namespace dependency |
| `src/lib/attendance.ts` | No runtime React namespace dependency |
| `src/lib/auth-sms-hook.server.ts` | No runtime React namespace dependency |
| `src/lib/auth-sms-hook.test.ts` | No runtime React namespace dependency |
| `src/lib/comm.tsx` | No runtime React namespace dependency |
| `src/lib/contract-match.ts` | No runtime React namespace dependency |
| `src/lib/csmart.test.ts` | No runtime React namespace dependency |
| `src/lib/demo-accounts.ts` | No runtime React namespace dependency |
| `src/lib/error-capture.ts` | No runtime React namespace dependency |
| `src/lib/error-page.ts` | No runtime React namespace dependency |
| `src/lib/events-public.functions.ts` | No runtime React namespace dependency |
| `src/lib/evt-outbox.server.ts` | No runtime React namespace dependency |
| `src/lib/export-brand.ts` | No runtime React namespace dependency |
| `src/lib/export.ts` | No runtime React namespace dependency |
| `src/lib/gemini-speech.server.ts` | No runtime React namespace dependency |
| `src/lib/gemini-speech.test.ts` | No runtime React namespace dependency |
| `src/lib/guardian-activation.server.ts` | No runtime React namespace dependency |
| `src/lib/guardian-login.test.ts` | No runtime React namespace dependency |
| `src/lib/guardian-login.ts` | No runtime React namespace dependency |
| `src/lib/homework.ts` | No runtime React namespace dependency |
| `src/lib/hr-bilingual.test.ts` | No runtime React namespace dependency |
| `src/lib/hr-bilingual.ts` | No runtime React namespace dependency |
| `src/lib/hr-fields.test.ts` | No runtime React namespace dependency |
| `src/lib/hr-fields.ts` | No runtime React namespace dependency |
| `src/lib/hr-sheet.test.ts` | No runtime React namespace dependency |
| `src/lib/hr-sheet.ts` | No runtime React namespace dependency |
| `src/lib/id-login-service.test.ts` | No runtime React namespace dependency |
| `src/lib/id-login-web.test.ts` | No runtime React namespace dependency |
| `src/lib/id-login.functions.ts` | No runtime React namespace dependency |
| `src/lib/id-login.server.ts` | No runtime React namespace dependency |
| `src/lib/id-login.test.ts` | No runtime React namespace dependency |
| `src/lib/id-login.ts` | No runtime React namespace dependency |
| `src/lib/import-export.test.ts` | No runtime React namespace dependency |
| `src/lib/live-signals.ts` | No runtime React namespace dependency |
| `src/lib/lovable-error-reporting.ts` | No runtime React namespace dependency |
| `src/lib/maqsam-creds.server.ts` | No runtime React namespace dependency |
| `src/lib/maqsam-window.test.ts` | No runtime React namespace dependency |
| `src/lib/maqsam-window.ts` | No runtime React namespace dependency |
| `src/lib/maqsam.functions.ts` | No runtime React namespace dependency |
| `src/lib/meeting-live.functions.ts` | No runtime React namespace dependency |
| `src/lib/mentions.ts` | No runtime React namespace dependency |
| `src/lib/message-delivery.server.ts` | No runtime React namespace dependency |
| `src/lib/message-delivery.test.ts` | No runtime React namespace dependency |
| `src/lib/message-worker.server.ts` | No runtime React namespace dependency |
| `src/lib/mobile-login-cors.test.ts` | No runtime React namespace dependency |
| `src/lib/mobile-login-http.test.ts` | No runtime React namespace dependency |
| `src/lib/mobile-login-http.ts` | No runtime React namespace dependency |
| `src/lib/month.test.ts` | No runtime React namespace dependency |
| `src/lib/month.ts` | No runtime React namespace dependency |
| `src/lib/my-avatar.ts` | No runtime React namespace dependency |
| `src/lib/navigation-groups.ts` | No runtime React namespace dependency |
| `src/lib/notification-filter.ts` | No runtime React namespace dependency |
| `src/lib/notification-sections.ts` | No runtime React namespace dependency |
| `src/lib/ops-staff.ts` | No runtime React namespace dependency |
| `src/lib/owner-scope.ts` | No runtime React namespace dependency |
| `src/lib/page-meta.tsx` | No runtime React namespace dependency |
| `src/lib/people-import.test.ts` | No runtime React namespace dependency |
| `src/lib/people-import.ts` | No runtime React namespace dependency |
| `src/lib/people-read.ts` | No runtime React namespace dependency |
| `src/lib/perm-order.ts` | No runtime React namespace dependency |
| `src/lib/perm-tabs.ts` | No runtime React namespace dependency |
| `src/lib/platform-owner-login.test.tsx` | No runtime React namespace dependency |
| `src/lib/presence.tsx` | No runtime React namespace dependency |
| `src/lib/private-file-delivery.test.ts` | No runtime React namespace dependency |
| `src/lib/private-file-delivery.ts` | No runtime React namespace dependency |
| `src/lib/reply-fill.test.ts` | No runtime React namespace dependency |
| `src/lib/reply-fill.ts` | No runtime React namespace dependency |
| `src/lib/report-builder.ts` | No runtime React namespace dependency |
| `src/lib/roles.ts` | No runtime React namespace dependency |
| `src/lib/sanad.functions.ts` | No runtime React namespace dependency |
| `src/lib/schedule.ts` | No runtime React namespace dependency |
| `src/lib/school-perms.ts` | No runtime React namespace dependency |
| `src/lib/session.tsx` | No runtime React namespace dependency |
| `src/lib/staff-assignment.ts` | No runtime React namespace dependency |
| `src/lib/staff-context.ts` | No runtime React namespace dependency |
| `src/lib/student-presence.test.ts` | No runtime React namespace dependency |
| `src/lib/student-presence.ts` | No runtime React namespace dependency |
| `src/lib/subject-presets.ts` | No runtime React namespace dependency |
| `src/lib/supervision-file-validation.ts` | No runtime React namespace dependency |
| `src/lib/supervision-files.functions.ts` | No runtime React namespace dependency |
| `src/lib/timetable-fixture.ts` | No runtime React namespace dependency |
| `src/lib/timetable-model.ts` | No runtime React namespace dependency |
| `src/lib/timetable-scale.test.ts` | No runtime React namespace dependency |
| `src/lib/timetable-solver.test.ts` | No runtime React namespace dependency |
| `src/lib/timetable-solver.ts` | No runtime React namespace dependency |
| `src/lib/timetable.worker.ts` | No runtime React namespace dependency |
| `src/lib/utils.ts` | No runtime React namespace dependency |
| `src/lib/visit-form.ts` | No runtime React namespace dependency |
| `src/lib/vps-preview-boundaries.test.ts` | No runtime React namespace dependency |
| `src/lib/wa-inbox.functions.ts` | No runtime React namespace dependency |
| `src/lib/wa-placeholders.test.ts` | No runtime React namespace dependency |
| `src/lib/wa-placeholders.ts` | No runtime React namespace dependency |
| `src/lib/wa-template.test.ts` | No runtime React namespace dependency |
| `src/lib/wa-template.ts` | No runtime React namespace dependency |
| `src/lib/wa-time.test.ts` | No runtime React namespace dependency |
| `src/lib/wa-time.ts` | No runtime React namespace dependency |
| `src/lib/wati-inbox-auth.server.ts` | No runtime React namespace dependency |
| `src/lib/wati-inbox-policy.test.ts` | No runtime React namespace dependency |
| `src/lib/wati-inbox-policy.ts` | No runtime React namespace dependency |
| `src/lib/wati-inbox-status.functions.ts` | No runtime React namespace dependency |
| `src/lib/wati-otp.ts` | No runtime React namespace dependency |
| `src/lib/wati-webhook.server.ts` | No runtime React namespace dependency |
| `src/lib/workspace-appearance.ts` | No runtime React namespace dependency |
| `src/lib/workspace-perms.ts` | No runtime React namespace dependency |
| `src/routeTree.gen.ts` | No runtime React namespace dependency |
| `src/router.tsx` | No runtime React namespace dependency |
| `src/routes/__root.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/academic.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/admin.calendar.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/admin.duties.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/admin.index.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/admin.meetings.$id.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/admin.meetings.index.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/admin.requests.$id.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/admin.room.$id.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/admin.tasks.$id.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/admissions.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/attendance-scan.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/attendance-station.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/attendance.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/bus-maintenance.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/calls.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/chat-settings.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/child.$id.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/choose-role.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/circulars.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/classrooms.$id.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/classrooms.index.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/classrooms.section.$id.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/collaboration.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/communication.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/courses.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/evaluation.tsx` | React references are type-only |
| `src/routes/_authenticated/app/events.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/family-requests.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/family-visits.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/finance.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/gifted-care.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/grades.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/guardians.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/health.$id.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/health.index.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/homework.$id.tsx` | React references are type-only |
| `src/routes/_authenticated/app/homework.index.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/homework.new.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/hr.tsx` | React references are type-only |
| `src/routes/_authenticated/app/hr_.assets.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/hr_.attendance.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/hr_.contracts.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/hr_.documents.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/hr_.housing.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/hr_.insurance.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/hr_.leave.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/hr_.letters.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/hr_.opening.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/hr_.payroll.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/hr_.performance.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/hr_.recruit.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/hr_.reports.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/hr_.training.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/hub.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/index.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/maintenance.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/members.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/my-employment.tsx` | React references are type-only |
| `src/routes/_authenticated/app/notice.$id.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/notifications.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/operations.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/org-docs.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/permissions.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/pickup.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/platform-notices.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/platform-subs.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/platform.tsx` | React references are type-only |
| `src/routes/_authenticated/app/procurement.tsx` | React references are type-only |
| `src/routes/_authenticated/app/profile.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/remedial-plans.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/reports.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/results.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/route.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/schedule.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/school-day.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/school-home.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/school-map.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/schools.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/signup-requests.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/student-guidance.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/students.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/substitutions.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/supervision-visits.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/supervision.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/support.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/tags.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/teachers.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/team-leave.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/tests.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/transport.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/virtual-classes.index.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/virtual-classes.room.$id.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/app/visits.tsx` | No runtime React namespace dependency |
| `src/routes/_authenticated/route.tsx` | React references are type-only |
| `src/routes/api/integrations/adms/v1/events.ts` | No runtime React namespace dependency |
| `src/routes/api/internal/adms/sync.ts` | No runtime React namespace dependency |
| `src/routes/api/internal/messages/dispatch.ts` | No runtime React namespace dependency |
| `src/routes/api/public/admissions/wordpress.ts` | No runtime React namespace dependency |
| `src/routes/api/public/auth/request-code.ts` | No runtime React namespace dependency |
| `src/routes/api/public/auth/send-sms.ts` | No runtime React namespace dependency |
| `src/routes/api/public/auth/student-login.ts` | No runtime React namespace dependency |
| `src/routes/api/public/auth/verify-code.ts` | No runtime React namespace dependency |
| `src/routes/api/public/hr/attendance.ts` | No runtime React namespace dependency |
| `src/routes/api/public/maqsam/recording.ts` | No runtime React namespace dependency |
| `src/routes/api/public/wati/webhook.ts` | No runtime React namespace dependency |
| `src/routes/auth.tsx` | React references are type-only |
| `src/routes/features.tsx` | No runtime React namespace dependency |
| `src/routes/index.tsx` | No runtime React namespace dependency |
| `src/routes/invite.$token.tsx` | No runtime React namespace dependency |
| `src/routes/join.$token.tsx` | React references are type-only |
| `src/routes/join.track.$code.tsx` | No runtime React namespace dependency |
| `src/routes/pricing.tsx` | No runtime React namespace dependency |
| `src/routes/register.tsx` | No runtime React namespace dependency |
| `src/routes/reset-password.tsx` | No runtime React namespace dependency |
| `src/server.ts` | No runtime React namespace dependency |
| `src/start.ts` | No runtime React namespace dependency |
| `src/test/academic-catalog-security.test.ts` | No runtime React namespace dependency |
| `src/test/academic-preset-picker.test.tsx` | No runtime React namespace dependency |
| `src/test/academic-year.test.ts` | No runtime React namespace dependency |
| `src/test/admissions-current-students.test.ts` | No runtime React namespace dependency |
| `src/test/app-routing.test.tsx` | No runtime React namespace dependency |
| `src/test/arabic-error.test.ts` | No runtime React namespace dependency |
| `src/test/case-model.test.ts` | No runtime React namespace dependency |
| `src/test/case-run-model.test.ts` | No runtime React namespace dependency |
| `src/test/classroom-room-tabs.test.ts` | No runtime React namespace dependency |
| `src/test/collaboration-context.test.ts` | No runtime React namespace dependency |
| `src/test/current-package-permissions.test.ts` | No runtime React namespace dependency |
| `src/test/dashboard-followup.test.ts` | No runtime React namespace dependency |
| `src/test/education-model.test.ts` | No runtime React namespace dependency |
| `src/test/exam-create.test.tsx` | React references are type-only |
| `src/test/exam-database.test.ts` | No runtime React namespace dependency |
| `src/test/exam-model.test.ts` | No runtime React namespace dependency |
| `src/test/exam-workflow.test.ts` | No runtime React namespace dependency |
| `src/test/export-csv.test.ts` | No runtime React namespace dependency |
| `src/test/family-attendance-model.test.ts` | No runtime React namespace dependency |
| `src/test/family-request-scope.test.ts` | No runtime React namespace dependency |
| `src/test/gifted-model.test.ts` | No runtime React namespace dependency |
| `src/test/grade-name-select.test.tsx` | No runtime React namespace dependency |
| `src/test/guidance-links.test.ts` | No runtime React namespace dependency |
| `src/test/guidance-model.test.ts` | No runtime React namespace dependency |
| `src/test/guidance-programs.test.ts` | No runtime React namespace dependency |
| `src/test/homework-roster-states.test.tsx` | No runtime React namespace dependency |
| `src/test/live-signals.test.ts` | No runtime React namespace dependency |
| `src/test/mentions.test.ts` | No runtime React namespace dependency |
| `src/test/navigation-groups.test.ts` | No runtime React namespace dependency |
| `src/test/navigation-section.test.tsx` | No runtime React namespace dependency |
| `src/test/notification-filter.test.ts` | No runtime React namespace dependency |
| `src/test/notification-sections.test.ts` | No runtime React namespace dependency |
| `src/test/org-docs-archive.test.ts` | No runtime React namespace dependency |
| `src/test/org-docs-form-options.test.ts` | No runtime React namespace dependency |
| `src/test/package-database.test.ts` | No runtime React namespace dependency |
| `src/test/package-ui.test.tsx` | React references are type-only |
| `src/test/page-meta.test.ts` | No runtime React namespace dependency |
| `src/test/people-read.test.tsx` | No runtime React namespace dependency |
| `src/test/perm-order.test.ts` | No runtime React namespace dependency |
| `src/test/perm-tabs.test.ts` | No runtime React namespace dependency |
| `src/test/perm-tree-rules.test.ts` | No runtime React namespace dependency |
| `src/test/perm-tree-selection.test.tsx` | No runtime React namespace dependency |
| `src/test/provider-acceptance.test.ts` | No runtime React namespace dependency |
| `src/test/provider-callback-acceptance.test.ts` | No runtime React namespace dependency |
| `src/test/question-key.test.tsx` | No runtime React namespace dependency |
| `src/test/report-builder.test.ts` | No runtime React namespace dependency |
| `src/test/roles.test.ts` | No runtime React namespace dependency |
| `src/test/school-map-model.test.ts` | No runtime React namespace dependency |
| `src/test/school-perms.test.ts` | No runtime React namespace dependency |
| `src/test/setup.ts` | No runtime React namespace dependency |
| `src/test/staff-assignment.test.ts` | No runtime React namespace dependency |
| `src/test/staff-context.test.ts` | No runtime React namespace dependency |
| `src/test/staff-department-filter.test.ts` | No runtime React namespace dependency |
| `src/test/staff-directory-model.test.ts` | No runtime React namespace dependency |
| `src/test/subject-preset-picker.test.tsx` | No runtime React namespace dependency |
| `src/test/subject-presets.test.ts` | No runtime React namespace dependency |
| `src/test/supervision-act.test.ts` | No runtime React namespace dependency |
| `src/test/supervision-dash.test.ts` | No runtime React namespace dependency |
| `src/test/supervision-files.test.ts` | No runtime React namespace dependency |
| `src/test/supervision-forms.test.ts` | No runtime React namespace dependency |
| `src/test/supervision-lo.test.ts` | No runtime React namespace dependency |
| `src/test/supervision-model.test.ts` | No runtime React namespace dependency |
| `src/test/supervision-pd.test.ts` | No runtime React namespace dependency |
| `src/test/supervision-pf.test.ts` | No runtime React namespace dependency |
| `src/test/supervision-report.test.ts` | No runtime React namespace dependency |
| `src/test/supervision-res.test.ts` | No runtime React namespace dependency |
| `src/test/supervision-work.test.ts` | No runtime React namespace dependency |
| `src/test/support-ticket-model.test.ts` | No runtime React namespace dependency |
| `src/test/task-people-picker.test.tsx` | No runtime React namespace dependency |
| `src/test/unified-calendar.test.ts` | No runtime React namespace dependency |
| `src/test/workspace-perms.test.ts` | No runtime React namespace dependency |
| `src/types/agora-token-internal.d.ts` | No runtime React namespace dependency |
