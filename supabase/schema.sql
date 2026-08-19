-- PCSB Management System — Supabase Schema
-- Run this in your Supabase SQL Editor

-- Enable RLS
alter database postgres set "app.jwt_secret" to 'your-jwt-secret';

-- ============================================
-- PROFILES (extends auth.users)
-- ============================================
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  name text not null default '',
  role text not null default 'team' check (role in ('owner', 'team', 'partner')),
  allowed_pages text[] default null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Anyone can view profiles" on public.profiles for select using (true);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Owner can manage all profiles" on public.profiles for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'owner')
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', ''), 'team');
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================
-- BILLBOARDS
-- ============================================
create table if not exists public.billboards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text not null,
  max_slots integer not null default 10,
  description text,
  image_url text,
  partner_id uuid references public.profiles(id),
  profit_share_percent numeric not null default 0,
  costing numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table public.billboards enable row level security;

-- Owner sees all, partners see assigned, team sees all
create policy "Owner and team can view all billboards" on public.billboards for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('owner', 'team'))
);
create policy "Partners see assigned billboards" on public.billboards for select using (
  partner_id = auth.uid()
);
create policy "Owner can manage billboards" on public.billboards for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'owner')
);

-- ============================================
-- USER BILLBOARD ACCESS (for partners)
-- ============================================
create table if not exists public.user_billboard_access (
  user_id uuid references public.profiles(id) on delete cascade,
  billboard_id uuid references public.billboards(id) on delete cascade,
  primary key (user_id, billboard_id)
);

alter table public.user_billboard_access enable row level security;

create policy "Owner manages access" on public.user_billboard_access for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'owner')
);

-- ============================================
-- CLIENTS
-- ============================================
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_person text not null,
  phone text,
  email text,
  address text,
  notes text,
  stage text not null default 'inquiry' check (stage in ('inquiry', 'quotation', 'bo', 'scheduled', 'live', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clients enable row level security;

create policy "Owner can manage clients" on public.clients for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'owner')
);
create policy "Team can view clients" on public.clients for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('owner', 'team'))
);
create policy "Partners can view clients with bookings on their billboards" on public.clients for select using (
  exists (
    select 1 from public.bookings b
    join public.billboards bb on b.billboard_id = bb.id
    where b.client_id = clients.id and bb.partner_id = auth.uid()
  )
);

-- Auto-update updated_at
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger clients_updated_at before update on public.clients
  for each row execute procedure public.update_updated_at();

-- ============================================
-- BOOKINGS
-- ============================================
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade not null,
  billboard_id uuid references public.billboards(id) on delete cascade not null,
  slot_number integer not null default 1,
  start_date date not null,
  end_date date not null,
  monthly_rate numeric not null default 0,
  total_amount numeric not null default 0,
  status text not null default 'upcoming' check (status in ('upcoming', 'live', 'completed', 'cancelled')),
  payment_status text not null default 'pending_payment' check (payment_status in ('pending_payment', 'received_pending_profit_share', 'settled')),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.bookings enable row level security;

create policy "Owner can manage bookings" on public.bookings for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'owner')
);
create policy "Team can view bookings" on public.bookings for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('owner', 'team'))
);
create policy "Partners can view bookings on their billboards" on public.bookings for select using (
  exists (
    select 1 from public.billboards bb
    where bb.id = bookings.billboard_id and bb.partner_id = auth.uid()
  )
);

-- ============================================
-- ACTIVITY LOG
-- ============================================
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  details text,
  created_at timestamptz not null default now()
);

alter table public.activity_log enable row level security;

create policy "Owner can view all logs" on public.activity_log for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'owner')
);
create policy "Anyone can insert logs" on public.activity_log for insert with check (auth.uid() = user_id);

-- ============================================
-- SEED DATA: 5 Billboards
-- ============================================
insert into public.billboards (name, location, max_slots) values
  ('KK Landmark - Panel A', 'Kota Kinabalu', 10),
  ('KK Landmark - Panel B', 'Kota Kinabalu', 10),
  ('Likas', 'Likas, KK', 10),
  ('Sandakan', 'Sandakan', 10),
  ('Tawau', 'Tawau', 10)
on conflict do nothing;
