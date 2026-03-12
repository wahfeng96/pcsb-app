# PCSB Internal Management System

Billboard management system for Penjenamaan Canggih Sdn Bhd (PCSB).

## Features (Phase 1)
- **Auth** — Email/password login with role-based access (owner/team/partner)
- **Dashboard** — Billboard occupancy, active bookings, pending payments, upcoming events
- **Calendar** — Monthly view + Billboard view with color-coded bookings
- **Clients** — CRUD with pipeline stages (Inquiry → Quotation → BO → Scheduled → Live → Completed)
- **Billboards** — 5 billboards with partner assignment, profit share %, costing, and profit calculation
- **Payment tracking** — 3 states: Pending Payment, Received (Pending Profit Share), Settled
- **Mobile-first** — Bottom nav on mobile, sidebar on desktop
- **PWA ready** — Installable to homescreen

## Tech Stack
- Next.js 15 (App Router) + TypeScript
- Tailwind CSS + shadcn/ui components
- Supabase (Auth + PostgreSQL + Row Level Security)

## Setup

### 1. Create Supabase Project
1. Go to [supabase.com](https://supabase.com) and create a new project
2. Go to **SQL Editor** and run the contents of `supabase/schema.sql`
3. Go to **Settings → API** and copy the URL and anon key

### 2. Configure Environment
```bash
cp .env.local.example .env.local
```
Edit `.env.local` with your Supabase credentials:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Create Owner Account
1. Go to Supabase → **Authentication → Users** → Add User
2. Create user with email/password
3. Go to **Table Editor → profiles** and set the user's `role` to `owner`

### 4. Run Locally
```bash
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

### 5. Deploy to Vercel
```bash
npx vercel
```
Set the environment variables in Vercel dashboard.

## Role Permissions
| Role | Dashboard | Calendar | Clients | Billboards | Edit |
|------|-----------|----------|---------|------------|------|
| Owner | ✅ | ✅ | ✅ | ✅ | Full CRUD |
| Team | ✅ | ✅ | View | View | Calendar only |
| Partner | — | — | Assigned only | Assigned only | View only |

## Database Schema
See `supabase/schema.sql` for the full schema with RLS policies.

Key tables: `profiles`, `billboards`, `clients`, `bookings`, `activity_log`

## Profit Calculation
- **Profit** = Revenue (sum of booking amounts) - Costing (per billboard)
- **Owner share** = Profit × (100% - partner share %)
- **Partner share** = Profit × partner share %
