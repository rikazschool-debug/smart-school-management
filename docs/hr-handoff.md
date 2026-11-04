# HR (الموارد البشرية) — handoff point (not started)

State today: HR shows «تحت الإنشاء» (owner card + area `hr` with `soon: true` in perm_catalog). No HR tables or RPCs exist.

Ready to reuse:
- People/accounts: memberships, staff_logins, account_setup, perm_* (add HR sections under area `hr`, follow the ev_* pattern: _perm_valid + _perm_base mirroring current rules + catalog labels; section tick = view only).
- Evaluation outputs are readable per person (ev_m_person, ev_teacher_file) — HR must read them through RPCs that keep "no self view" and branch scope.
- Notifications via _notify with dedupe keys; scheduled work on existing cron jobs; files via rikaz-files + create_post_file.

Out of scope until the owner decides (memory: Core): salaries, contracts, attendance fingerprint, finance links. First step next round: owner workshop on HR scope (records, leave, documents?) before any schema.
