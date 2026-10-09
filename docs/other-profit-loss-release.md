# MAIN PCSB Other P&L release

Target: `/Users/canggih/Projects/pcsb-app`, `wahfeng96/pcsb-app`, MAIN Supabase `sqryqwlevsgklctkxwok`, production `https://pcsb-app.onrender.com`. Release branch: `codex/other-profit-loss-20261009`.

## Behavior

`/other-profit-loss` provides a separate manual ledger with income and expense tables, date/description/positive MYR amount and optional category, add/edit/delete with confirmation, year/month/full-year and inclusive date limits, and income/expense/net profit or loss cards. Dates use MYT for initial selection. Categories are independent optional text, never references to advertising categories. Saving an entry selects its year/month and clears date limits so it is visible.

The page queries only `other_profit_loss_entries`, in deterministic 500-row pages for the selected year so totals are not truncated by Supabase's default limit. Errors hide incomplete totals and provide retry. React renders descriptions/categories as literal text. Client validation rejects invalid dates, blank/overlong/control text, non-positive/non-finite amounts and excess decimal places. Database constraints independently protect valid dates, entry kinds, positive finite amounts and text. Metadata records creator/timestamps; updates preserve original creator and creation time.

The sidebar and mobile More menu show Other P&L. Middleware uses the shared page registry to guard direct navigation. The owner can view and edit. Approved non-owners need a separate explicit `/other-profit-loss` grant in Users & Access and can view only. Legacy NULL page access and new-user defaults do not grant this page. Existing advertising P&L editor permissions do not grant Other P&L editing. The existing profile access-field protection continues to prevent non-owner self-grants. No existing profile or permission grants are modified.

Advertising P&L, Accounts, bookings, advertising cost categories and computations remain independent. The new table has no advertising/account foreign keys or integration. Existing dirty `supabase/.temp/cli-latest` is excluded from this release commit.

## Verification

- Full Vitest suite: 99/99 passed, including 17 new ledger checks.
- Chrome component tests: 10/10 passed (6 new ledger tests and 4 existing P&L regression tests). Tests cover CRUD, positive amount validation, literal script-looking text, loss/empty states, combined filters, read-only/denied users, recoverable load/write failures, >500 rows and mobile document width.
- Synthetic PostgreSQL/PGlite: 33 checks passed for rollback dry-run, committed migration, initial empty ledger, unchanged synthetic existing rows, owner CRUD, explicit viewer reads, denied/unapproved/advertising-only users, anonymous denial, creator provenance, constraints and RLS.
- Focused ESLint: clean.
- Next production build: passed with synthetic public Supabase build values; generated `/other-profit-loss` successfully. Existing build config skips type/lint validation; these were checked separately.
- Full TypeScript check: 11 existing errors, byte-identical to unchanged HEAD `ed0e9530f353ba4e4ac1d8d1231fb65032c13d12`; no new diagnostics. Baseline problems are in Clients, Commission, Profit Sharing, billboard-cost API and an older P&L test.
- Desktop/mobile screenshots inspected: no clipping or overlaps; mobile tables scroll inside cards.

Re-run SQL checks using a temporary PGlite installation outside the app:

```sh
node scripts/verify-other-profit-loss.mjs /absolute/path/to/pglite/dist/index.js
```

Private evidence: `/Users/canggih/.openclaw/workspace/main/output/other-pl-20261009/` (desktop.png, mobile.png, baseline-typescript.txt, current-typescript.txt, verification.json, temporary db-harness).

## Schema and production release status

Migration: `supabase/migrations/20261009120000_other_profit_loss.sql`. Creates only the ledger table, index, new read/write helpers, four RLS policies and a metadata trigger, within a transaction with a 5-second lock timeout. No UPDATE/DELETE/backfill of existing business records.

Linked migration history was read successfully. All previous local/remote versions match; version `20261009120000` is absent remotely. `supabase db push --linked --dry-run` succeeded and listed this as the sole pending migration. This CLI dry run verifies migration selection; the synthetic PostgreSQL rollback execution separately validates SQL. Production migration was NOT applied.

The established `supabase db dump --linked --file <private-output>/pre-migration-schema.sql` backup failed because the Docker daemon at `/var/run/docker.sock` is unavailable. No valid backup was created. Backup/readback are required by this request, so production migration and deployment remain blocked. No synthetic production writes were made. No push to main or Render deploy was performed.

## Exact release actions after backup readiness is restored

1. Confirm MAIN project `sqryqwlevsgklctkxwok`, release commit and sole pending migration. Enable the operator-managed Docker backup path or use an owner-approved equivalent private logical backup. Do not proceed without a successful backup.
2. From the canonical checkout, create private schema and data dumps. Preserve and hash both; they contain private business data and must never enter git:

```sh
supabase db dump --linked --file /Users/canggih/.openclaw/workspace/main/output/other-pl-20261009/pre-migration-schema.sql
supabase db dump --linked --data-only --file /Users/canggih/.openclaw/workspace/main/output/other-pl-20261009/pre-migration-data.sql
```

3. Run the first two read-only queries in `supabase/audits/other_profit_loss.sql` in the authenticated MAIN SQL Editor and save baseline counts privately. Expect absent new objects and zero applied migration-history rows. Execute the committed migration with its final COMMIT replaced by ROLLBACK in SQL Editor; require success, then run `supabase db push --linked --dry-run` and require this to be the only pending migration.
4. Apply the migration through `supabase db push --linked`. Run the entire read-only audit. Require unchanged existing-table counts, zero ledger rows, RLS enabled, four policies, one update trigger, both protected helpers, no anon read/helper access and exactly one migration-history row. Do not add production test entries.
5. Only after schema/readback succeeds and deployment is authorized: merge or fast-forward `codex/other-profit-loss-20261009` into MAIN `main`, push main, then in the existing PCSB Render service choose **Manual Deploy → Deploy latest commit** if its GitHub auto-deploy does not start. Verify Render's deployed commit matches the release and owner `/other-profit-loss` loads with an empty ledger; use read-only smoke checks.

Do not apply these files to DMDC or PLC.
