-- Student profiles are not Auth users. This keeps young learners out of the
-- email/password flow and lets a teacher select a child for a Smartboard session.
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete restrict,
  classroom_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  is_active boolean not null default true,
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists classrooms_id_school_id_uidx
  on public.classrooms (id, school_id);

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'students_classroom_school_fk'
      and conrelid = 'public.students'::regclass
  ) then
    alter table public.students
      add constraint students_classroom_school_fk
      foreign key (classroom_id, school_id)
      references public.classrooms (id, school_id)
      on delete restrict;
  end if;
end $$;

create index if not exists students_school_classroom_created_idx
  on public.students (school_id, classroom_id, created_at desc);

create table if not exists public.learning_sessions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete restrict,
  classroom_id uuid,
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  device_label text check (device_label is null or char_length(device_label) <= 120),
  status text not null default 'active'
    check (status in ('active', 'completed', 'cancelled')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (status = 'active' and ended_at is null)
    or (status in ('completed', 'cancelled') and ended_at is not null)
  )
);

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'learning_sessions_classroom_school_fk'
      and conrelid = 'public.learning_sessions'::regclass
  ) then
    alter table public.learning_sessions
      add constraint learning_sessions_classroom_school_fk
      foreign key (classroom_id, school_id)
      references public.classrooms (id, school_id)
      on delete restrict;
  end if;
end $$;

create index if not exists learning_sessions_school_started_idx
  on public.learning_sessions (school_id, started_at desc);

create unique index if not exists learning_sessions_one_active_per_classroom_idx
  on public.learning_sessions (classroom_id)
  where classroom_id is not null and status = 'active';

create table if not exists public.learning_session_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.learning_sessions (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete restrict,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique (session_id, student_id)
);

create index if not exists learning_session_participants_student_idx
  on public.learning_session_participants (student_id, joined_at desc);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users (id) on delete cascade,
  student_id uuid references public.students (id) on delete cascade,
  session_id uuid references public.learning_sessions (id) on delete set null,
  activity_type text not null
    check (activity_type in ('sketch_challenge', 'explore', 'story')),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  score numeric check (score is null or (score >= 0 and score <= 100)),
  points_awarded integer not null default 0 check (points_awarded >= 0),
  result_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(result_summary) = 'object' and octet_length(result_summary::text) <= 8192),
  created_at timestamptz not null default now(),
  check (owner_user_id is not null or student_id is not null)
);

create index if not exists activities_owner_created_idx
  on public.activities (owner_user_id, created_at desc);
create index if not exists activities_student_created_idx
  on public.activities (student_id, created_at desc);
create index if not exists activities_session_created_idx
  on public.activities (session_id, created_at desc);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null check (char_length(action) between 1 and 100),
  target_type text not null check (char_length(target_type) between 1 and 80),
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 8192),
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_idx
  on public.audit_logs (created_at desc, id desc);
create index if not exists audit_logs_actor_created_idx
  on public.audit_logs (actor_user_id, created_at desc);

alter table public.students enable row level security;
alter table public.learning_sessions enable row level security;
alter table public.learning_session_participants enable row level security;
alter table public.activities enable row level security;
alter table public.audit_logs enable row level security;

grant all on public.students, public.learning_sessions,
  public.learning_session_participants, public.activities, public.audit_logs
  to service_role;

-- No client policies: NestJS uses its server-only Supabase key and enforces
-- role and school scope for each request.
