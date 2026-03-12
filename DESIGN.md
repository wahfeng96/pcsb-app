# PCSB Internal Management System — Design Document

## Overview
A Progressive Web App (PWA) for Penjenamaan Canggih Sdn Bhd to manage billboard operations, clients, scheduling, invoicing, and payments — all in one place.

**Problem:** Information scattered across multiple Google Sheets. Hard to track on mobile. No unified view.

**Solution:** Mobile-first web app with role-based access (owner/team/partner).

---

## Tech Stack
- **Frontend:** Next.js 14 (App Router) + Tailwind CSS + shadcn/ui
- **Backend/DB:** Supabase (PostgreSQL + Auth + Row Level Security)
- **Hosting:** Vercel (free tier)
- **PWA:** next-pwa for install-to-homescreen
- **Mobile-first:** Designed for phone, works on laptop too

---

## Users & Roles

| Role | Access | Edit |
|------|--------|------|
| **Owner** (Wah Feng) | Everything | Full CRUD |
| **Team** | Live date calendar, billboard photos | View only (edit later) |
| **Partner** | Only assigned billboard(s) data | View only |

Authentication: Supabase Auth (email/password or magic link)
Authorization: Row Level Security (RLS) policies per billboard assignment

---

## Billboards

5 billboards, each with up to 10 client slots:

| # | Name | Location |
|---|------|----------|
| 1 | KK Landmark - Panel A | Kota Kinabalu |
| 2 | KK Landmark - Panel B | Kota Kinabalu |
| 3 | Likas | Likas, KK |
| 4 | Sandakan | Sandakan |
| 5 | Tawau | Tawau |

- Slots are random (no fixed position)
- Each slot = 1 client booking for a period

---

## 5 Core Modules

### 1. 📊 Dashboard
The landing page after login. Shows at-a-glance:
- **Billboard occupancy:** 5 cards showing X/10 slots filled per billboard
- **Revenue this month / this year**
- **Outstanding payments** (overdue amounts highlighted red)
- **Upcoming events:** Next 7 days in/out dates
- **Quick actions:** Add client, create invoice

### 2. 📅 Live Date Calendar
The scheduling hub. Replaces all the Google Sheet calendar tabs.

**Views:**
- **Monthly calendar view** — color-coded by billboard
- **Billboard view** — select one billboard, see all 10 slots as rows (Gantt-style timeline)
- **List view** — upcoming in/out dates sorted by date

**Each booking shows:**
- Client name
- Billboard + slot
- Start date (in) → End date (out)
- Status: Upcoming / Live / Completed

**Color coding:**
- 🟢 Green = currently live
- 🟡 Yellow = upcoming (within 7 days)
- 🔴 Red = ending soon (within 7 days)
- ⬜ Gray = completed

**Key features:**
- Tap a booking to see full details
- Quick-add booking from calendar
- Filter by billboard

### 3. 👥 Client Management
Track every client through the sales pipeline.

**Pipeline stages:**
1. **Inquiry** — client asked about advertising
2. **Quotation** — price quoted
3. **BO Received** — Booking Order signed
4. **Scheduled** — assigned billboard + dates
5. **Live** — currently on billboard
6. **Completed** — live period ended
7. **Cancelled** — deal fell through

**Client record includes:**
- Company name & contact person
- Phone, email, address
- Assigned billboard(s) & slot(s)
- Live period (start → end)
- Contract value (e.g., RM3,000 for 3 months)
- Monthly breakdown (RM1,000/month)
- Payment terms (60 days credit)
- Documents: BO, quotation, invoice (upload/attach)
- Notes & activity log

**Views:**
- Pipeline board (Kanban-style)
- Client list (searchable, filterable)
- Client detail page

### 4. 🧾 Invoice
Generate and track invoices.

**Auto-generate from client booking:**
- Pull client info, billboard, period, amount
- Sequential invoice number (@1314, @1315...)
- PCSB bank details auto-filled
- Generate as PDF (using existing template style)

**Invoice tracking:**
- Status: Draft → Sent → Partially Paid → Paid → Overdue
- Payment schedule (monthly installments)
- Record each payment received (date, amount, method)
- Auto-calculate outstanding balance

**Payment reminders:**
- Visual indicator: days until due / days overdue
- One-tap WhatsApp reminder (opens WhatsApp with pre-filled message)
- Dashboard shows all overdue invoices

### 5. 💰 Sales & Payment Overview
Financial reporting and tracking.

**Views:**
- **Monthly revenue** — bar chart by month
- **By billboard** — revenue per billboard
- **Payment status** — paid vs outstanding vs overdue
- **Client payment history** — who paid, who hasn't

**Filters:**
- Date range
- Billboard
- Client
- Payment status

---

## Database Schema (Supabase/PostgreSQL)

### Tables:

**billboards**
- id, name, location, max_slots (default 10), description, image_url

**users**
- id, email, name, role (owner/team/partner), created_at

**user_billboard_access**
- user_id, billboard_id (for partner access control)

**clients**
- id, company_name, contact_person, phone, email, address, notes, stage (inquiry/quotation/bo/scheduled/live/completed/cancelled), created_at, updated_at

**bookings**
- id, client_id, billboard_id, slot_number, start_date, end_date, monthly_rate, total_amount, status (upcoming/live/completed/cancelled), notes, created_at

**invoices**
- id, client_id, booking_id, invoice_number, invoice_date, due_date, subtotal, tax, total, status (draft/sent/partial/paid/overdue), notes, created_at

**payments**
- id, invoice_id, amount, payment_date, method (bank_transfer/cash/cheque), reference, notes, created_at

**activity_log**
- id, user_id, entity_type (client/booking/invoice/payment), entity_id, action, details, created_at

---

## Screen Wireframes (Mobile-First)

### Bottom Navigation (4 tabs):
1. 🏠 Dashboard
2. 📅 Calendar
3. 👥 Clients
4. 💰 Finance

### Top Bar:
- PCSB logo (left)
- Notifications bell (right)
- Profile/settings (right)

---

## Phase Plan

### Phase 1 — Core (Week 1-2)
- Auth + user roles
- Billboard management
- Client CRUD + pipeline
- Live date calendar (monthly + billboard view)
- Dashboard with occupancy + upcoming dates

### Phase 2 — Finance (Week 3)
- Invoice generation (PDF)
- Payment tracking
- Payment reminders
- Sales overview charts

### Phase 3 — Polish (Week 4)
- PWA install
- WhatsApp integration (one-tap reminder)
- Partner access + RLS
- Email report sending
- Photo upload for billboard reports

### Phase 4 — Future
- Team edit permissions
- Auto-invoice on booking creation
- Client self-service portal
- Revenue forecasting
- Integration with accounting software

---

## Hosting & Cost
- **Supabase Free Tier:** 500MB DB, 50k auth users, 2GB storage — more than enough
- **Vercel Free Tier:** Unlimited deploys, custom domain
- **Total cost: RM 0/month** (free tier covers everything)

---

## Domain Suggestion
- app.pcsb-advertising.com (subdomain of existing site)
- Or: pcsb-app.vercel.app (free, no domain needed)

---

*Ready for review. Once approved, building starts.*
