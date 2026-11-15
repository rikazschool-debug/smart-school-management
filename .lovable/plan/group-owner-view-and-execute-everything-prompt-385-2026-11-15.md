# Group owner: view and execute everything (prompt-385)

## What changes for you
- As group owner, inside any school you open, you can view and carry out every action in every section, including actions that today belong only to a specific person (a teacher grading their own class, a member of a chat, a ticket handler, a supervisor's assigned teachers).
- Every such action is recorded under your own name in the existing activity logs, so it is always clear the owner did it, not the teacher.
- Other users keep exactly their current permissions. Nothing is opened to everyone.
- Platform admins keep acting as group owner, as today.

## Already done this turn
- Bottom-left pop-up for each new notification (about 6 seconds); clicking it opens the related section.
- Red counter next to every menu section (and collapsed group headings) with its unread notifications; opening the section clears it.

## How it will be built
1. Read-only audit of every server check that is limited to a specific person (about 60 checks found, for example course teacher, teacher of student, conversation member, group admin, ticket follower, procurement request owner, health calendar, duties, notices, events).
2. One new migration (test database first, never editing old ones) that adds "or the caller is the owner of this school's group" to each of those person-only checks. Section-permission checks already allow the owner and stay as they are.
3. Keep stopping rules that protect records, not people: archived term grades stay read-only, finished submissions stay unchanged, suspended branches stay suspended, deny rules for other users still apply.
4. Menu: owner sees every section of the opened school (teacher-only pages such as the digital classrooms and homework included).
5. Tests: a synthetic owner account in a synthetic group performs one action per section that used to need a specific person; a second synthetic group's owner must still be refused (no access across groups). Your real accounts are not touched.
6. Update the permissions matrix, evidence log and the project rules to record the new owner rule.

## Technical details
- Pattern per helper: `... or public.is_org_owner(<org of the record>)`, resolving the org from the record (course → school → org) so the grant never crosses groups.
- Audit rows keep `auth.uid()` (the owner) as the actor; no impersonation of the teacher.
- Production database only after your approval, per the existing test-first rule.
