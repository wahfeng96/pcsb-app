# MAIN PCSB calendar campaign display

Scope: `wahfeng96/pcsb-app`, Calendar only. The existing bookings `select('*', joins)` already returns optional `campaign_name`; no migration, backfill, database writes, auth or RLS changes.

Saved, trimmed campaign names follow the existing brand/client label as ` — …` in IN/OUT event chips, overflow events, Upcoming In/Out, and daily occupancy details; the Calendar never adds a literal `Campaign:` prefix. Null, missing, empty and whitespace-only values add nothing. React text rendering preserves unsafe-looking strings as literal text. Existing colors, half-slot widths, date inclusion, filters and occupancy totals are unchanged.

Campaign labels truncate when collapsed; native details opens the complete wrapped text with keyboard or touch, and title attributes support mouse inspection. Overflow uses a native disclosure instead of a hover-only clipped panel. Occupancy names wrap even for unbroken strings. The decorative desktop “occupied” label no longer intercepts pointer events intended for the existing occupancy trigger.

Verification: 12 focused Vitest assertions and 2 synthetic Chrome Calendar tests pass, including desktop/mobile paths, fallback/blank/long/HTML-looking campaigns, colors, independent screen filters and slot totals. Build passes using synthetic public Supabase config. Focused ESLint has zero errors and the unchanged Calendar useEffect dependency warning. Existing build config skips type/lint validation, so build success is not a clean typecheck claim. Synthetic screenshots remain ignored.

Release note: pushing `main` may trigger the repository's configured Render auto-deployment. No Render controls were clicked and live deployment was not verified or claimed.
