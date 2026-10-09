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

The verified release can be fast-forwarded to MAIN `main` and pushed. Render deployment is owner-operated: in the existing PCSB service choose **Manual Deploy → Deploy latest commit**. No Render deployment is performed by this release worker. After deployment, verify the deployed commit matches main and the owner's `/other-profit-loss` opens with an empty ledger using read-only checks.

Do not apply these files to DMDC or PLC.
