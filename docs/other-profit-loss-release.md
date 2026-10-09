# MAIN PCSB Other P&L release

Target: `/Users/canggih/Projects/pcsb-app`, `wahfeng96/pcsb-app`, MAIN Supabase `sqryqwlevsgklctkxwok`, production `https://pcsb-app.onrender.com`. Initial release branch: `codex/other-profit-loss-20261009`. Released MAIN baseline: `70792198da8a69f8b36f05972266a5b42db660c9`. The monthly revision is committed directly to `main`.

## Behavior

`/other-profit-loss` provides a separate manual ledger with income and expense tables, date/description/positive MYR amount and optional category, add/edit/delete with confirmation, Overall and Jan–Dec tabs, a year picker with previous/next arrows, and inclusive date limits, and income/expense/net profit or loss cards. Dates use MYT for initial selection. Categories are independent optional text, never references to advertising categories. Saving a single entry selects its year/month and clears date limits so it is visible. Saving expenses for multiple months opens Overall in the selected year. Switching year/month clears date limits. Overall includes a 12-month income/expense/net summary and yearly totals; monthly cards also show full-year totals. The monthly summary and full-year card figures ignore date limits, explicitly labelled in the UI; the active period cards and ledger respect date limits.

The page queries only `other_profit_loss_entries`, in deterministic 500-row pages for the selected year so totals are not truncated by Supabase's default limit. Errors hide incomplete totals and provide retry. React renders descriptions/categories as literal text. Client validation rejects invalid dates, blank/overlong/control text, non-positive/non-finite amounts and excess decimal places. Database constraints independently protect valid dates, entry kinds, positive finite amounts and text. Metadata records creator/timestamps; updates preserve original creator and creation time.

The sidebar and mobile More menu show Other P&L. Middleware uses the shared page registry to guard direct navigation. The owner can view and edit. Approved non-owners need a separate explicit `/other-profit-loss` grant in Users & Access and can view only. Legacy NULL page access and new-user defaults do not grant this page. Existing advertising P&L editor permissions do not grant Other P&L editing. The existing profile access-field protection continues to prevent non-owner self-grants. No existing profile or permission grants are modified.

Advertising P&L, Accounts, bookings, advertising cost categories and computations remain independent. The new table has no advertising/account foreign keys or integration. Existing dirty `supabase/.temp/cli-latest` is excluded from this release commit.

## Monthly expense revision (9 October 2026)

Add Expense supports explicit one-or-more month checkboxes in the page's selected year. The amount is **per selected month**, not divided between months: RM1,000 for Jan/Feb/Mar previews RM3,000 total and stores three separate RM1,000 rows. The form previews every exact date. Day of month is 1–31; shorter months use their last valid day (31 Jan / 28 Feb / 31 Mar in 2026, 29 Feb in 2024). Month selections are sorted and deduplicated before insertion. A current-month tab defaults to today's MYT day; other monthly tabs default to day 1. Overall defaults to the current MYT month/day for the current year and January 1 for other years. Income remains a single dated entry.

The page issues **one array INSERT through PostgREST**, never a sequence of inserts. PostgreSQL statement atomicity prevents partially saved month batches; an invalid row or denied owner policy rolls back all rows. No new RPC, schema, permission grant or migration is needed. The existing `20261009120000_other_profit_loss.sql` migration is the sole schema dependency and was already verified applied to MAIN in the prior release. This revision performs no production database writes or synthetic production inserts.

Existing entries retain their dates and values. Editing and deletion target one ID; the edit form uses a normal date and amount and does not display multi-month controls. Editing one month's rental never changes sibling rows. The ledger stays fully independent of advertising data/calculations. Owner-only mutations and separate approved-viewer grants are unchanged.

Tabs support arrow keys, Home and End. Month tabs and tables scroll within their containers on mobile, with a visible scrolling hint; dialogs scroll internally on short screens.

Revision checks:

- Full Vitest suite: **108/108 passed**, including 26 ledger checks. Tests cover per-month amounts/totals, unique/sorted months, invalid selections, 30/31-day months, leap-year/century rules, years 0001/9999, and date boundaries.
- Chrome component suite: **13/13 passed**, including nine ledger scenarios and four advertising P&L regressions. Covers Overall/monthly totals, single and multiple expense months, year isolation, leap-day dates, single-entry edit/delete, empty selection, batch failure/retry, permissions, >500 rows, keyboard tabs and mobile interaction.
- Synthetic PostgreSQL/PGlite: **42 checks passed**, including batch success, middle-row constraint failure with zero partial rows, single-row edit/delete, and viewer batch denial.
- Focused ESLint and `git diff --check`: clean.
- Production build: passed with synthetic public Supabase configuration.
- TypeScript: the same 11 existing diagnostics as the prior release, byte-identical; no new diagnostics in the revised files.
- Private synthetic screenshots and verification outputs: `/Users/canggih/.openclaw/workspace/main/output/other-pl-monthly-20261009/`.

## Initial release verification

- Full Vitest suite: 99/99 passed, including 17 new ledger checks.
- Chrome component tests: 10/10 passed (6 new ledger tests and 4 existing P&L regression tests). Tests cover CRUD, positive amount validation, literal script-looking text, loss/empty states, combined filters, read-only/denied users, recoverable load/write failures, >500 rows and mobile document width.
- Synthetic PostgreSQL/PGlite: 35 checks passed for rollback dry-run, committed migration, initial empty ledger, unchanged synthetic existing rows, owner CRUD, explicit viewer reads, denied/unapproved/advertising-only users, anonymous denial, creator provenance, constraints and RLS. The harness now reproduces Supabase's explicit default anon function grants and verifies both helpers reject anonymous calls.
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

Production schema verification completed on 9 October 2026 against linked MAIN project `sqryqwlevsgklctkxwok`. The resumed worker checked live migration history before any retry and found version `20261009120000` already applied. No duplicate migration execution was performed; exactly one history row exists.

Private pre-migration schema/data backups were successfully created and their byte sizes and SHA-256 hashes match `backup-manifest.json`. The recorded production rollback dry run succeeded. Post-migration readback exactly matches the preflight baseline for all 19 existing public tables (2,269 rows, per-table checksums and RLS flags), 51 existing policies, 27 existing functions and 19 existing triggers. Existing profile data and permissions are unchanged.

The new independent ledger contains zero rows, has RLS enabled, four authenticated policies, two indexes, three functions and one update trigger. Reads require owner or approved explicit page access; writes require owner. Anonymous table access is denied. Production's default function privileges explicitly granted anon access to the two new helpers despite the original PUBLIC revoke. A bounded transaction revoked only those new helper grants; the original migration source now explicitly revokes PUBLIC and anon to reproduce the verified live state. This reconciliation leaves the sole migration version unchanged. Focused synthetic PostgreSQL verification passed all 35 checks with the explicit default grants reproduced. No production test entries or other business data writes were made.

Private evidence: `release-schema-proof.json`, `post-migration-baseline.json`, `post-migration-schema.json`, `helper-privilege-correction.sql`, `helper-correction-result.json`, and `backup-manifest.json` in the output directory above. Backups and query results must never enter git.

## Application deployment

The initial release was pushed to MAIN `main` at `70792198da8a69f8b36f05972266a5b42db660c9`. The monthly revision is pushed to MAIN `main` after the checks above. Render deployment is owner-operated: in the existing PCSB service choose **Manual Deploy → Deploy latest commit**. No Render deployment is performed by this release worker. After deployment, verify the deployed commit matches main and the owner's `/other-profit-loss` opens with Overall and Jan–Dec tabs using read-only checks. Existing ledger records must remain visible in their corresponding year/month. Do not create production entries for smoke testing.

Do not apply these files to DMDC or PLC.
