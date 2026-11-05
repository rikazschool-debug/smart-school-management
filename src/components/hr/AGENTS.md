# HR rules
- Log: docs/hr/execution-log.md (update per package).
- HR attendance (hr_att_*): RPC-only; raw punches append-only and separate from computed hr_att_days; closed days change only after dated reopen; devices via signed /api/public/hr/attendance → service-only _hr_att_ingest; money effect only via payroll. Tests: hr-att-e2e, hra-journey.
- HR pay (hr_decisions/hr_advances/hr_pay_*): RPC-only; dated hr_pay_policies, unset = held. Tests: hr-pay-e2e, hrp-journey.
- HR extensions: owner switch (hr_ext_settings); recruitment hr_rc_*, convert once. Tests: hr-recruit-e2e, hrr-journey.
- Mobile punch: hr_att_self_punch always needs a fresh (≤60 s), accurate reading inside the school site (hr_att_sites) of a live assignment; only school/distance/accuracy are stored. Asset custody (hr_assets/hr_asset_custodies): one open custody per asset (unique index), never touches money. Tests: hr-loc-assets-e2e, hla-journey.
- Principals get no HR section by default (no _perm_base/template grant); access only by explicit grant.
