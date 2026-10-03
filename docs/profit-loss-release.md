# MAIN PCSB Profit & Loss release

## Monthly close lock

Migration `20261003043000_profit_loss_month_locks.sql` adds an owner-controlled lock for each reporting month. A locked month remains readable but rejects revenue moves into or out of it, cost creates/updates/deletes dated in it, and allocation changes for its costs. Unlocking is owner-only and validates the supplied code against a one-way SHA-256 digest in the database function; the code is not included in the browser bundle or stored as plaintext.

After applying the migration, run `supabase/audits/profit_loss_month_locks.sql`. Verify five protection triggers and three lock functions are present. Existing P&L records are not modified and no month starts locked.

Payment completion no longer guesses the current reporting month. Completed rows without an assignment remain in Unknown; assigning them to a month is explicit and target-lock protected.

A completed payment assigned to a locked month also cannot change away from `completed`, be deleted, or have its invoice/billing-month identity changed. P&L-visible booking fields cannot be changed or deleted while any completed revenue from that booking is in a locked month. Accounts surfaces database errors and stops before synchronizing Profit Sharing, booking, or commission status.

Bookings with completed revenue in a locked month cannot be deleted or change `monthly_rate`, `status`, `client_id`, `billboard_id`, or `brand_name`, because those live booking values are included in the protected P&L report. Unrelated booking metadata remains editable.

Target: canonical MAIN repository `/Users/canggih/Projects/pcsb-app`, Supabase project `sqryqwlevsgklctkxwok`, and the existing Render service. Do not use this migration in DMDC or PLC. Render deployment is intentionally excluded from this release step.

## Accounting semantics

Revenue grain is a saved `monthly_payments` row, not an invoice number. A row is included only while its own status is exactly `completed`, and it contributes its saved payment amount to the one billboard referenced by its booking. The application already stores manually split multi-billboard work as separate bookings, so shared invoice numbers are labels only and are never expanded into a full invoice total per billboard.

Migration `20261003053000_profit_loss_unknown_revenue.sql` makes a settled booking (`bookings.payment_status = 'settled'`) the evidence that payment was received. For each billing month inferred by the existing `round(total_amount / monthly_rate)` rule, a month without completed, assigned revenue appears in Unknown. IDs use `unknown:<booking UUID>:<billing month>`, so unsaved rows remain stable across reloads. Unknown is excluded from calendar-month and full-year P&L totals until assigned.

The owner-only `assign_profit_loss_revenue` RPC runs in one database transaction. It takes a transaction advisory lock for the booking/billing-month pair, then reassigns an existing completed row, completes a deterministic existing partial row while preserving its invoice number and billing month, or inserts only the missing monthly-payment row without inventing an invoice number. It then creates the reporting assignment. The target month must be unlocked; triggers also protect moves out of a locked source month. Repeated or concurrent calls are idempotent and cannot create a second row for the pair. Legacy duplicate assigned rows are collapsed deterministically in reads and exposed by the audit query.

Existing business rows are not backfilled by the migration. The former completion trigger is removed, avoiding a transient current-month assignment and conflicts with locked current months. Single-month bookings such as Don Legacy (`a8a7252f-1c91-4426-8f76-ebd711b3635c`, RM2,000) therefore appear as one RM2,000 Unknown row when settled and missing a completed assignment; multi-month bookings expose only their missing billing months.

Costs use their entered `cost_date`. Company totals count each cost once, including General / Company Overhead. A billboard view includes only allocation rows for that billboard and excludes General overhead. Database checks and deferred constraint triggers require positive, unique allocations whose sum exactly equals the cost total.

Cost categories are deactivated, not deleted in the UI. Historical costs retain a restricted foreign-key reference and continue showing an inactive category label.

## Access control

`/profit-loss` is owner-only by default. Unlike legacy pages, a `NULL` `profiles.allowed_pages` does not grant P&L. The owner may explicitly add `/profit-loss` through Users & Access. New-user defaults also exclude it.

Middleware blocks the route, navigation hides it, and `get_profit_loss_data()` independently checks the owner or explicit approved-user grant before returning any joined revenue or cost data. New tables have RLS with the same grant check for reads and owner-only writes. Mutation functions also verify owner status. A profile trigger prevents non-owner users from changing their own role, approval, email, or page permissions through direct profile updates.

Invoice numbers link to the established Accounts invoice search route. A granted P&L viewer also needs Accounts page permission for that cross-page link; P&L access alone does not widen Accounts access.

## Migration

Base migration: `20261002090000_profit_loss.sql`. Unknown revenue migration: `20261003053000_profit_loss_unknown_revenue.sql`. Read-only audit: `supabase/audits/profit_loss_unknown_revenue.sql`.

It creates three P&L cost tables, one revenue-assignment table, indexes, checks, RLS policies, protected RPC functions, status/updated-at triggers, and the profile access-field guard. It does not update, backfill, or delete production business rows.

Before applying, confirm the linked project, create the private logical backup used by the established MAIN workflow, and run `supabase db push --linked --dry-run` with this as the only pending migration. Apply only after the dry run is clean. Afterward, verify migration history, table/RLS/policy/function/trigger presence, and unchanged counts for bookings, monthly payments, clients, billboards, and existing accounting tables. New P&L tables should have zero rows immediately after migration.

## Verification

Unit tests cover paid-row filtering inputs, combined year/month/billboard filters, company versus billboard allocation totals, exact split validation, MYT month boundaries, margin behavior, and owner/default/explicit permission rules.

Chrome component tests use synthetic fixtures only. They cover desktop/mobile layout, combined filters, invoice routing, drag and select month persistence calls, allocation form validation, cost save calls, and read-only granted-user behavior. Production build verification uses synthetic public Supabase build values because this checkout has no local runtime environment file.

Screenshots and migration/backup evidence remain outside git under `/Users/canggih/.openclaw/workspace/main/output/pcsb-pl-page-20261002/`.
