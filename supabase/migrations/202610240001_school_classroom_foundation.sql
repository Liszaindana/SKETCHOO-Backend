create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  code text not null unique check (code = lower(code) and code ~ '^[a-z0-9-]{3,32}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.school_memberships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  membership_role text not null check (membership_role in ('admin', 'teacher')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id, user_id)
);

-- MVP scope: one active school assignment per admin account.
create unique index if not exists school_memberships_one_active_school_per_user_idx
  on public.school_memberships (user_id)
  where is_active;

create table if not exists public.classrooms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  grade_label text check (grade_label is null or char_length(grade_label) <= 40),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name)
);

alter table public.schools enable row level security;
alter table public.school_memberships enable row level security;
alter table public.classrooms enable row level security;

grant all on public.schools, public.school_memberships, public.classrooms to service_role;

-- No client policies are created. Access is mediated by the NestJS API.
