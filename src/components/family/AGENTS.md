# family rules
- Guardian/student home reads only via family_children/family_child RPCs (server checks the link).
- fin_* tables are RPC-only; fin_pay_save is owner-only and logged; balances/payments are written only by the future financial link.
- Digital classroom = section_rooms (one per section); subject classrooms (one per course) are channels inside, linked by classrooms.section_room_id (insert trigger + ensure_classroom). Content never moves; access stays per course (can_view_course), room visible if any subject is. Regroup only via classroom_regroup (re-runnable, logs before/after report). Test: scripts/classroom-room-e2e.ts.
