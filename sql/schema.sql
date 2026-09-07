-- ============================================================
-- سامانه مدیریت کارگاه ساختمانی — Schema v1
-- Run this once in the Supabase SQL editor.
-- ============================================================

-- ------------------------------------------------------------
-- 1. profiles  (one row per auth user; role reserved for future use)
-- ------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','manager','worker')),
  display_name text,
  created_at timestamptz not null default now()
);

-- auto-create a profile row whenever a new auth user is created
-- This trigger is a convenience only — it must never be able to block
-- Supabase Auth from creating a user. If anything inside it fails, it
-- logs a warning and lets the auth insert proceed; you can then create
-- the profile row manually (see README.md) if it didn't get created.
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'owner')
  on conflict (id) do nothing;
  return new;
exception when others then
  raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ------------------------------------------------------------
-- 2. persons (workers)
-- ------------------------------------------------------------
create table if not exists persons (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  job_title text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_persons_owner on persons(owner_id);

-- ------------------------------------------------------------
-- 3. attendance  (one row = one person present on one day)
-- ------------------------------------------------------------
create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid not null references persons(id) on delete cascade,
  work_date date not null,
  created_at timestamptz not null default now(),
  unique (person_id, work_date)
);
create index if not exists idx_attendance_owner_date on attendance(owner_id, work_date);

-- ------------------------------------------------------------
-- 4. daily_records  (one row per calendar day: just the note)
-- ------------------------------------------------------------
create table if not exists daily_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  work_date date not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, work_date)
);

-- ------------------------------------------------------------
-- 5. materials
-- ------------------------------------------------------------
create table if not exists materials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  unit text not null,
  current_quantity numeric not null default 0,
  min_quantity numeric not null default 0,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_materials_owner on materials(owner_id);

-- ------------------------------------------------------------
-- 6. inventory_transactions  (source of truth for material stock)
-- ------------------------------------------------------------
create table if not exists inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  material_id uuid not null references materials(id) on delete cascade,
  work_date date not null,
  type text not null check (type in ('initial','purchase','consumption','adjustment')),
  quantity_change numeric not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_invtx_material on inventory_transactions(material_id);
create index if not exists idx_invtx_owner_date on inventory_transactions(owner_id, work_date);

-- consumption must be recorded as a negative number, purchase/initial as positive.
-- (adjustment can be either sign, since it reconciles reality)
alter table inventory_transactions
  add constraint chk_invtx_sign check (
    (type = 'consumption' and quantity_change <= 0) or
    (type in ('purchase','initial') and quantity_change >= 0) or
    (type = 'adjustment')
  );

-- ------------------------------------------------------------
-- 7. tools
-- ------------------------------------------------------------
create table if not exists tools (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  unit text not null default 'عدد',
  current_quantity numeric not null default 0,
  min_quantity numeric not null default 0,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_tools_owner on tools(owner_id);

-- ------------------------------------------------------------
-- 8. tool_transactions
-- ------------------------------------------------------------
create table if not exists tool_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  tool_id uuid not null references tools(id) on delete cascade,
  work_date date not null,
  type text not null check (type in ('initial','added','lost','broken','removed','adjustment')),
  quantity_change numeric not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_tooltx_tool on tool_transactions(tool_id);
create index if not exists idx_tooltx_owner_date on tool_transactions(owner_id, work_date);

alter table tool_transactions
  add constraint chk_tooltx_sign check (
    (type in ('lost','broken','removed') and quantity_change <= 0) or
    (type in ('initial','added') and quantity_change >= 0) or
    (type = 'adjustment')
  );

-- ============================================================
-- BALANCE MAINTENANCE — triggers recompute current_quantity
-- from the full transaction history on every insert/update/delete.
-- This guarantees the stored balance can never drift from history.
-- ============================================================

create or replace function recompute_material_balance()
returns trigger as $$
declare
  target_material uuid;
begin
  target_material := coalesce(new.material_id, old.material_id);
  update materials
    set current_quantity = coalesce((
          select sum(quantity_change) from inventory_transactions
          where material_id = target_material
        ), 0),
        updated_at = now()
    where id = target_material;
  return null;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_invtx_balance on inventory_transactions;
create trigger trg_invtx_balance
  after insert or update or delete on inventory_transactions
  for each row execute function recompute_material_balance();

create or replace function recompute_tool_balance()
returns trigger as $$
declare
  target_tool uuid;
begin
  target_tool := coalesce(new.tool_id, old.tool_id);
  update tools
    set current_quantity = coalesce((
          select sum(quantity_change) from tool_transactions
          where tool_id = target_tool
        ), 0),
        updated_at = now()
    where id = target_tool;
  return null;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_tooltx_balance on tool_transactions;
create trigger trg_tooltx_balance
  after insert or update or delete on tool_transactions
  for each row execute function recompute_tool_balance();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table profiles enable row level security;
alter table persons enable row level security;
alter table attendance enable row level security;
alter table daily_records enable row level security;
alter table materials enable row level security;
alter table inventory_transactions enable row level security;
alter table tools enable row level security;
alter table tool_transactions enable row level security;

create policy "own profile" on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy "own persons" on persons
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "own attendance" on attendance
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "own daily_records" on daily_records
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "own materials" on materials
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "own inventory_transactions" on inventory_transactions
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "own tools" on tools
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "own tool_transactions" on tool_transactions
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ============================================================
-- Notes:
-- * current_quantity on materials/tools is NEVER written directly by
--   the app — it only ever comes from the trigger-computed sum above.
-- * "اصلاح موجودی" (stock correction) is implemented in the app by
--   inserting ONE row with type='adjustment' and
--   quantity_change = (actual_count - current_quantity_before).
--   History is never edited or overwritten.
-- ============================================================
