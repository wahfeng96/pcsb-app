# Agency calendar access

Owner-requested scope: a selectable **Agency** role, calendar only, read-only, current and future months only. Business month boundaries use `Asia/Kuala_Lumpur` independently of the server/browser timezone. Implementation was reviewed before release; the owner explicitly approved production deployment on 2026-11-08. No existing production user assignment is part of this release.

## Product behavior and deliberately limited data

Owner user management offers Agency for both existing accounts and new accounts. Agency's page/editor permissions are fixed; the access editor is hidden for this role. The database normalizes every future Agency insert/update to `allowed_pages = ['/calendar']` and both financial editor flags false. Legacy billboard assignments can remain stored when converting an existing account, but are inactive while the role is Agency. An owner changing that account back to another role should review any retained billboard assignments.

Agency sees **all screens**, their calendar IN/OUT labels, content-change labels and daily occupancy. No billboard assignment is required. This follows the request for calendar access rather than introducing an unrequested per-screen limitation.

Agency's calendar response contains only screen IDs/names/location/capacity, booking IDs, billboard IDs, brand label (or company-name fallback), campaign label, slot size, status, bounded dates and event flags, plus content-change IDs/brand/screen/date. It excludes client contact details, client IDs, financial amounts/rates, costs, commissions, payment status, booking references, salespeople, internal notes and creator metadata. Brand/company/campaign labels remain visible because they are the existing calendar labels. This is a calendar-visibility policy, not anonymous occupancy-only access.

Each request returns **one month**. Overlapping bookings are included for correct occupancy, but `start_date` and `end_date` are clipped to the selected month. `start_event`/`end_event` prevent false IN/OUT labels at clipped boundaries, including Upcoming In/Out. Earlier/later booking dates cannot be recovered from this response. Cancelled bookings and content markers outside the requested month are excluded. Agency's upcoming lists are consequently limited to the displayed month; internal users retain their existing all-booking lists.

The month navigation disables the previous button at the current Malaysia month. No URL/query month controls the page state; the API and RPC independently reject historical/invalid requests. A minute timer clears an expired displayed month and advances it after Malaysia's month rollover. Requests are aborted on navigation to avoid stale responses. Previously delivered information cannot be retracted from a user's browser at rollover.

## Authorization layers

- `page-access.ts` makes Agency calendar-only regardless of `allowed_pages`, and fails closed for unknown roles. Navigation uses the same check. Financial editor helpers explicitly require an existing internal role.
- Middleware allows an approved Agency only exact `/calendar` and GET/HEAD `/api/agency-calendar`. Other app/nested/unknown URLs redirect to Calendar; other APIs and write methods return 403. Unapproved accounts remain pending and their API is denied.
- The calendar API verifies the cookie session using `auth.getUser()`, checks the approved profile and Agency role, requires one canonical `YYYY-MM` parameter, and uses only the session client's `get_agency_calendar(date)` RPC. Responses are `private, no-store`. It does not use the service key.
- The SQL RPC rechecks role/approval and month independently using database time in Malaysia. Null, nonfinite, non-first-of-month, past and beyond-four-digit-year dates are rejected. A manually called Supabase RPC cannot bypass the API's bounds.
- The migration installs **restrictive** RLS policies across every existing, non-extension public table. They AND with old permissive policies, preventing broad commission/payment policies or old billboard assignments from granting Agency access. Agency can select only its own profile and has no direct table writes. An anonymous restrictive deny on these business tables prevents removing the session from regaining rows through legacy PUBLIC/anon permissive policies; the app has no anonymous business-data feature. Internal users retain prior RLS policies; previously unprotected public tables retain authenticated internal access through a new permissive internal-only policy. Non-RLS-governed TRUNCATE/REFERENCES/TRIGGER table privileges are revoked from browser roles/PUBLIC; normal app CRUD remains governed by existing policies plus the fence. New tables in future migrations need the same restrictive fence.
- Profile policies are replaced with explicit internal/own reads, owner management and guarded internal self-updates to avoid recursive profile policies. A security-definer trigger permits only owners (or trusted service/database operations) to change access fields, and normalizes Agency grants. Agency cannot update even its own name/profile, or delete its own profile.
- Existing public views become `security_invoker = true` so they respect underlying RLS. The migration deliberately fails/rolls back if public materialized views exist; their grant model needs review first. View changes can expose missing base-table grants for existing internal consumers, so check the live inventory before release.
- Existing financial definer RPC permission helpers explicitly exclude Agency even if stale financial grants remain. Month-lock lookup returns false for Agency; internal/service/database lock enforcement is preserved, including service-key writes without a user JWT. Local regression tests exercise the latest source financial RPCs and the actual live-only legacy `get_profit_loss_data_before_cost_months()` body. Both that legacy RPC and the current reporting RPC call the patched `can_access_profit_loss()` helper before accessing finance; no replacement of their reporting logic is needed. The SQL cost-save compatibility wrapper delegates to the guarded implementation.
- `delete-booking` and all three `billboard-costs` write handlers now obtain the caller from a verified session. The request body's `userId` cannot impersonate an owner. These service-key paths additionally deny Agency before constructing the admin client. Existing owner/team/partner cost permissions remain in place.

The fence covers the source-controlled public app schema. The app currently has no Supabase Storage client path in source. The read-only preflight also inventories live Storage policies, public views and definer functions: review any production-only functions, schemas, private Storage policies or materialized views before enabling Agency. RLS does not make already-public URLs private.

## Verification

Run from the repository root:

```sh
npm ci
npm test
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=local-test-key npm run build
npx tsc --noEmit
```

`@electric-sql/pglite` is a dev dependency. The database tests run the migration in an isolated actual PostgreSQL engine compiled to WASM, without Docker, production credentials or network/database calls. The fixture deliberately includes permissive legacy table policies, a finance view, an unprotected table, stale Agency billboard edit access and cross-month bookings. It tests raw reads/joins/views/writes, self-escalation, owner role assignment, financial definer RPC denial, bounded calendar output, private-field omission, historical/invalid/future month requests, approval and anonymous access. This is executable SQL validation, not a substitute for the live-schema inventory or a staging Supabase/PostgREST session test.

The Next build is configured in the existing `next.config.mjs` to skip lint and type validation. Build success alone does not prove a clean typecheck. A separate pristine-HEAD TypeScript run confirmed existing failures in clients page's partial Booking shape, commission/profit-sharing missing `monthKey`, billboard-costs' generic client typing, and the ES2018 regexp flag in the unknown-revenue test. This change fixes the touched billboard-costs client typing; the other unrelated baseline failures remain.

Focused tests also cover Malaysia rollover at 16:00 UTC (including year rollover), canonical month validation, middleware direct-route/API denial, spoofed-owner writes, owner creation sanitization, and rendered role/calendar UI. Final local verification on 2026-11-08: **143 tests passed across 27 files**, including 25 Agency tests; production build passed with synthetic public Supabase settings; changed-file ESLint had **0 errors and 2 hook-dependency warnings**; `git diff --check` passed. Separate TypeScript checking has **4 remaining errors, all reproduced in pristine HEAD** (the unrelated clients, commission, profit-sharing and regexp-target issues listed above); there are no new Agency TypeScript errors.

## Completed read-only live-schema preflight (2026-11-08)

The linked project reference was checked as `sqryqwlevsgklctkxwok` before read-only Management API queries. The live database is PostgreSQL **17.6**. The inventory found **20 public tables, all with RLS; 55 public policies; no public views/materialized views; and zero Storage policies**. The existing role constraint allows exactly owner/team/partner, and all columns and signatures required by the migration exist with compatible types. No production row values or identities were fetched or changed.

A second catalog-only snapshot captured **156 columns/defaults, 82 constraints, 31 non-extension public functions and 20 public-table triggers**. There are **24 SECURITY DEFINER functions: 18 non-trigger functions and 6 trigger functions**. Every body was reviewed. Trigger functions cannot be directly invoked as SQL RPCs, and Agency's table write fences prevent reaching their privileged effects. `get_user_role()` returns only the caller's own role. The finance read/write RPCs use the patched permission helpers; both cost-save overloads reach the guarded implementation. The live-only legacy `get_profit_loss_data_before_cost_months()` already checks `can_access_profit_loss()` first, so the migration's existing helper patch closes access even when Agency retains stale financial page/editor flags. No additional migration behavior change was necessary. A schema-only actual-body fixture and stale-grant regression test now cover this production/source difference.

The exact catalog definitions were reconstructed in an isolated PGlite engine: all 20 tables with live column types/defaults, all table constraints (including PK/FK/unique/check and deferred constraint triggers), all 31 function bodies, all 55 policies, all 20 public-table triggers and audited public grants. The proposed migration applied successfully there. **143 separate rehearsal assertions passed**, including all 12 financial RPC signatures (the legacy read RPC and both cost overloads), stale Agency page/editor/billboard grants, raw access to every public table, writes, direct trigger-call rejection, current/future/past calendar requests, private-field exclusion and anonymous helper grants. **57 owner/team/partner table query results were identical before and after the migration** with synthetic data. Owner and assigned-partner booking edits still succeeded; an unassigned team's existing read-only booking policy remained read-only. All three approved internal editor roles retained both actual reporting RPCs and category writes. The legacy and current reporting RPCs kept their distinct existing revenue behavior.

Private evidence is stored outside the repository at `/Users/canggih/.openclaw/private/agency-preflight-20261108/`: `combined-result.json`, `schema-result.json`, the read-only query SQL, `rehearse.mjs` and `rehearsal-result.json`. No business rows or credentials are included in the committed legacy fixture. The reusable source audit now includes all non-extension public functions, columns/defaults, constraints and triggers within a read-only transaction.

**Compatibility/security result: the proposed migration is compatible with the captured live public schema, and no Agency access bypass was found after it is applied in the isolated rehearsal.** This verifies schema and SQL behavior, not hosted deployment: Supabase platform schemas/extensions and auth-side triggers were not recreated; `auth.users` and JWT helper functions use minimal synthetic equivalents, and non-constraint indexes were not copied. A hosted staging/PostgREST session test, production backup/restoration preparation and explicit release approval remain release steps. No production migration/dry-run transaction, account assignment, push or deployment occurred.

## Review and release steps (not executed)

1. Parent reviews the diff and security design. Confirm all-screen calendar labels and one-month upcoming lists are the intended Agency experience. Preserve the unrelated preexisting `supabase/.temp/cli-latest` edit.
2. The read-only live-schema inventory and isolated rehearsal above are complete. Immediately before an approved release, rerun **only** `supabase/audits/agency_calendar_access.sql` against project `sqryqwlevsgklctkxwok` and compare for drift. Resolve any new exposed definer functions, Storage policies, materialized views or incompatible schema changes before applying. Prepare protected backups and a reviewed restoration package from captured prior definitions; rehearsal snapshots are schema-only evidence, not production data backups. No existing production identities need modification.
3. Apply the exact new migration, preferably first in staging:

   ```sh
   psql "$PCSB_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261108131000_agency_calendar_access.sql
   ```

   Supply the connection through the operator's protected environment; never print it or commit it. The migration has its own transaction and rolls back on error. Do not replay old migrations: several contain historical one-off user grants. If the project uses Supabase migration history, after successful SQL application record this exact version with:

   ```sh
   supabase migration repair 20261108131000 --status applied --linked
   ```

   Alternatively use normal `supabase db push --linked` only after its `--dry-run` confirms this is the **only** intended pending migration and the linked project is correct. Do not run both application methods.
4. Run the audit again and confirm every app table has the Agency fence, profile policies are expected, views use invoker security, and RPC grants exclude anonymous callers. Verify existing owner/internal/editor workflows on staging. Database deployment must precede any Agency account assignment.
5. Deploy the reviewed application through the existing Render workflow only after authorization. Pushing `main` may auto-deploy to `https://pcsb-app.onrender.com`; this implementation leaves changes uncommitted/unpushed. No new production environment variable is required.
6. After the app and migration are verified together, an owner may explicitly create/assign the first Agency account. With a dedicated test identity, verify cookie-authenticated Calendar, rejected prior month API/RPC, rejected raw REST tables/nested joins/financial RPCs, rejected writes/spoofed `userId`, direct noncalendar URL denial, all-screen occupancy and current/future navigation. Verify owner/team/partner and approved P&L editors still work. Existing production user roles were not changed by this task.

For rollback, first revoke/disable any newly enabled Agency identities through the owner/operator workflow, then restore the reviewed prior app and captured database definitions. Do not remove the database fences while an Agency identity remains usable; the older app did not enforce this role. There is deliberately no automatic down migration that would silently reopen data access.

## Approved production release (2026-11-08)

The owner approved “Yes deploy now” after review. The immediate catalog preflight matched both private snapshots exactly. Migration `20261108131000` was applied atomically to linked project `sqryqwlevsgklctkxwok`, then recorded with `supabase migration repair --status applied --linked`. Applied file SHA-256: `4841a9cf523c582e191cab2119e38b3f7c33f86ef8572dc0b3aa6306d8e84178`.

Protected prior function/policy/constraint/grant definitions and a restoration SQL package were prepared outside the repository before application. Post-application catalog assertions verified RLS and restrictive Agency/anonymous fences on all 20 public tables, the extended role constraint and authenticated-only calendar RPC grant. Whole-row fingerprints of all 20 business tables matched before and after, including every existing profile and role.

A live rollback-only transaction used a synthetic auth/profile identity and verified normalization, raw reads across all 20 tables, finance permission helpers, both actual reporting RPC denials, current/future calendar access, historical month denial, private field omission and profile-write denial. The transaction was rolled back; an explicit subsequent lookup confirmed no temporary identity remained. No messages were sent. This SQL test uses the authenticated database role and JWT claims; it is not a browser cookie/PostgREST session test. Application deployment and HTTP/asset verification are recorded separately in the release report.
