# MAIN PCSB Profit & Loss release

Target: canonical MAIN repository `/Users/canggih/Projects/pcsb-app`, Supabase project `sqryqwlevsgklctkxwok`, and the existing Render service. Do not use this migration in DMDC or PLC. Render deployment is intentionally excluded from this release step.

## Accounting semantics

Revenue grain is a saved `monthly_payments` row, not an invoice number. A row is included only while its own status is exactly `completed`, and it contributes its saved payment amount to the one billboard referenced by its booking. The application already stores manually split multi-billboard work as separate bookings, so shared invoice numbers are labels only and are never expanded into a full invoice total per billboard.

The migration trigger creates a reporting-month assignment only when a payment enters `completed`, using `Asia/Kuala_Lumpur` to choose the current month. Moving revenue updates only `profit_loss_revenue_assignments.reporting_month`; it never changes booking dates, invoice fields, payment fields, or payment status.

Existing completed payments receive no backfill or business-row mutation. The protected read function deterministically reports any existing completed payment without an assignment in October 2026, the feature introduction month. Its first manual move creates the persisted assignment. If a payment later leaves `completed`, it disappears from P&L without deleting its assignment; if it returns to completed, the prior reporting assignment remains.

Costs use their entered `cost_date`. Company totals count each cost once, including General / Company Overhead. A billboard view includes only allocation rows for that billboard and excludes General overhead. Database checks and deferred constraint triggers require positive, unique allocations whose sum exactly equals the cost total.

Cost categories are deactivated, not deleted in the UI. Historical costs retain a restricted foreign-key reference and continue showing an inactive category label.

## Access control

`/profit-loss` is owner-only by default. Unlike legacy pages, a `NULL` `profiles.allowed_pages` does not grant P&L. The owner may explicitly add `/profit-loss` through Users & Access. New-user defaults also exclude it.

Middleware blocks the route, navigation hides it, and `get_profit_loss_data()` independently checks the owner or explicit approved-user grant before returning any joined revenue or cost data. New tables have RLS with the same grant check for reads and owner-only writes. Mutation functions also verify owner status. A profile trigger prevents non-owner users from changing their own role, approval, email, or page permissions through direct profile updates.

Invoice numbers link to the established Accounts invoice search route. A granted P&L viewer also needs Accounts page permission for that cross-page link; P&L access alone does not widen Accounts access.

## Migration

Migration: `20261002090000_profit_loss.sql`.

It creates three P&L cost tables, one revenue-assignment table, indexes, checks, RLS policies, protected RPC functions, status/updated-at triggers, and the profile access-field guard. It does not update, backfill, or delete production business rows.

Before applying, confirm the linked project, create the private logical backup used by the established MAIN workflow, and run `supabase db push --linked --dry-run` with this as the only pending migration. Apply only after the dry run is clean. Afterward, verify migration history, table/RLS/policy/function/trigger presence, and unchanged counts for bookings, monthly payments, clients, billboards, and existing accounting tables. New P&L tables should have zero rows immediately after migration.

## Verification

Unit tests cover paid-row filtering inputs, combined year/month/billboard filters, company versus billboard allocation totals, exact split validation, MYT month boundaries, margin behavior, and owner/default/explicit permission rules.

Chrome component tests use synthetic fixtures only. They cover desktop/mobile layout, combined filters, invoice routing, drag and select month persistence calls, allocation form validation, cost save calls, and read-only granted-user behavior. Production build verification uses synthetic public Supabase build values because this checkout has no local runtime environment file.

Screenshots and migration/backup evidence remain outside git under `/Users/canggih/.openclaw/workspace/main/output/pcsb-pl-page-20261002/`.
