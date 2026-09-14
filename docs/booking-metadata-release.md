# MAIN PCSB booking metadata release

Target: https://pcsb-app.onrender.com, existing Render service srv-d6pc1mf5gffc739333rg, repository wahfeng96/pcsb-app. Not DMDC. Existing Render GitHub auto-deployment is the established release path. No service, environment or cost changes.

The existing Bookings UI is the section in `/clients/[id]`; this is the only full booking insert/edit entry point. Calendar content changes are a separate entity. Account/profit-sharing status-only mutations do not overwrite metadata. Brand remains unchanged; campaign and OD are separate optional fields. Dropdowns use only the current client booking result under existing Supabase RLS and combine with year/month and brand search. Empty values save as NULL; lengths 200/100; control characters rejected and React renders text safely.

## Migration

Production inspection confirmed 16 booking columns, no campaign or OD equivalent (invoice_number belongs to accounting, not booking OD). Migration `20260914064000_booking_campaign_metadata.sql` adds two nullable varchar columns and control-character checks, no backfill/defaults or RLS changes. Applied with authenticated linked `supabase db push --linked --yes` after dry-run proved this was the sole pending migration. Supabase project: sqryqwlevsgklctkxwok.

A private JSON snapshot of all 344 bookings, original columns and RLS was saved outside this repo before migration. Verification compared all original fields and policies exactly after migration: identical; all 344 new campaign and OD values NULL. Version recorded in production migration history. Snapshot is a targeted logical backup, not a full cluster backup. For app rollback, redeploy the prior commit and retain nullable columns; do not drop columns or restore over user edits.

## Verification

Vitest metadata tests cover legacy rows, whitespace/null, serialization, validation and combined permission-scoped options. Synthetic Chrome component tests execute the actual client detail page create/edit/load paths using an in-memory Supabase adapter (no production writes), blank/populated values, clearing, filters, role-gated actions, escaped HTML, desktop/mobile and screenshots. Existing Accounts/Sales Summary/Calendar tests remain in the suite. This does not claim an actual PostgreSQL synthetic round-trip or authenticated production UI test.

Build uses synthetic public config locally; build configuration already skips lint/type errors. New metadata modules pass focused lint. Existing client detail lint errors (any/unused imports/unused variables) and unrelated repository TypeScript errors predate this release; no new errors in changed metadata modules. Local Next chunk comparisons must account for environment-inlined public config; compare feature-specific emitted chunks rather than assume all shared chunk hashes match synthetic builds.

Screenshots/backups/build evidence are outside git or ignored. No secrets, production records, Accounts/Calendar/Sales Summary changes, or infrastructure artifacts belong in this commit.
