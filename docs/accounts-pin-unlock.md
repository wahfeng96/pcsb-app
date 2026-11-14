# Accounts completed-entry PIN unlock

Owner request: correct August 2026 Enchanteur invoice @1424 to Invoice Sent and allow the owner to reopen an individual completed Accounts entry with the supplied PIN. No bulk reset.

## Production correction already performed

The linked project's exact row was freshly identified by invoice @1424, Punya Creative, Enchanteur, August 2026, Sandakan and RM4,600. On 14 November 2026 its stored monthly payment was changed from `completed` to `invoice_sent` and its `settled_at` was cleared, with a compare-and-set predicate and exact one-row assertion. Private before/after snapshots verify that the booking, Profit Sharing, Commission and P&L assignment rows were unchanged. The target had no P&L assignment.

**The existing application still forces the display to Completed from Profit Sharing. The release below is necessary to show the correction as Invoice Sent without changing Profit Sharing.** Its narrowly conditional metadata backfill marks only the already-corrected @1424 row as explicitly reopened; it does not alter any payment status.

## Behavior

- Every completed Accounts status, including legacy Profit Sharing-derived completion, opens an entry-specific PIN dialog for the owner. This works in the invoice search results, monthly row and expanded billable-month rows.
- `unlock_accounts_payment` verifies `auth.uid()` against the owner profile and checks the PIN in PostgreSQL using a salted bcrypt verifier. The verifier, attempts, transaction capabilities and audit records are in an inaccessible private schema. No new application secret or plaintext PIN is included in browser code.
- Five wrong attempts lock the owner identity for a 15-minute window. Failure responses commit the attempt counter. Attempts serialize per owner; reopening locks the booking and payment, checks the expected payment identity and refuses duplicates or a stale/already-reopened target.
- The selected row becomes `invoice_sent`, its settlement timestamp is cleared, and `accounts_reopened_at` records the explicit override. When it is completed again, the database clears that override, requiring the PIN for another reopening.
- Legacy Profit Sharing-only completed entries can be materialized as an individual Invoice Sent payment by the same RPC.
- A database trigger prevents direct status reversal, metadata forgery, completed-entry deletion and inserting an Invoice Sent duplicate over a completed payment. An unforgeable private transaction capability permits only the RPC's selected change. Existing table RLS/policies and unrelated RPC grants are unchanged.
- The dialog blocks duplicate submissions, hides and clears PIN input, shows failures and refreshes Accounts after success.

## Financial effects to review

Profit Sharing and Commission states, booking-level payment state, amounts, invoice references and existing P&L assignments are retained. Reopening removes a payment from completed Accounts revenue and from the existing P&L paid-revenue eligibility until completed again. If an assignment remains, completing again restores its eligibility in that existing reporting month. A locked assigned P&L month still blocks reopening; the Accounts PIN does not bypass P&L locks. Completed-payment deletion now requires reopening first, which also protects against delete/reinsert bypasses.

## Verification

- Full Vitest suite: 162 tests across 30 files passed, including seven actual PostgreSQL PIN/security tests and three dialog interaction tests.
- Four Playwright component/browser tests passed across desktop and mobile: owner and viewer Accounts regressions; wrong PIN, correct PIN, chosen-entry-only change, refresh, unchanged unrelated completed row, unchanged Profit Sharing and no horizontal overflow.
- Production Next build passed with non-secret synthetic public Supabase configuration. The repository's existing build configuration ignores type errors; separate checking reports the same four known baseline errors in clients, commission, profit-sharing and a pre-existing regex-target test. No new errors were reported in changed files.
- Changed-file ESLint: zero errors, one existing Accounts `load` hook-dependency warning. `git diff --check` passed.
- Complete fresh live public schema preflight: 20 tables, 35 functions including production/legacy definer functions, 97 policies and 21 triggers. Reconstructed in isolated PGlite with original columns/defaults, constraints, RLS, policy/grant definitions and trigger bodies. The exact migration succeeded; owner reopening, non-owner denial, direct-update denial and unchanged owner/team/agency read access were verified. Synthetic `auth.users` and auth claim helpers replace hosted authentication; network/PostgREST/browser login is outside that rehearsal.
- `supabase db push --linked --dry-run` lists only migration `20261114063000_accounts_pin_unlock.sql`; no schema was applied by this implementation task.

## Release after parent review

1. Review/cherry-pick the isolated feature commit into the existing main checkout, preserving unrelated local changes. The checkout starts at existing commit `2c6d98a` and includes that P&L/Profit Sharing synchronization.
2. Verify linked project `sqryqwlevsgklctkxwok`, refresh private backup/preflight and check migration dry-run again. Apply the reviewed migration with `supabase db push --linked` through normal tool policy. It must precede application deployment.
3. Requery @1424 and confirm `status=invoice_sent`, `settled_at IS NULL`, non-null `accounts_reopened_at`, unchanged reference/amount, and unchanged related ledgers. Confirm existing owner/agency permissions and function grants.
4. Use the established Render release workflow for `https://pcsb-app.onrender.com`. Pushing main may deploy automatically, so do not push until ready for release. The README's old generic Vercel section is not the deployed workflow; the Agency release records the actual Render target.
5. Verify authenticated Accounts shows @1424 as Invoice Sent; opening a different completed entry displays the PIN dialog. Exercise a wrong PIN without mutation. Do not reopen another real payment just to test success unless it is separately authorized; correct-PIN behavior is covered by the isolated tests.

Private proof, snapshots, rehearsal script/results, command logs and synthetic screenshots are outside the repository under the task's protected backup directory. No customer or team messages were sent.
