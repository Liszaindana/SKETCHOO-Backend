-- Persistence foundation for the learner APIs in the revised API spec.
-- Student-mode submissions must be attached to a guided Smartboard session;
-- self-guided activity rows belong to an authenticated user instead.

create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 1000),
  activity_type text not null
    check (activity_type in ('sketch_challenge', 'explore', 'story', 'mixed')),
  target_count integer not null check (target_count > 0),
  reward_points integer not null default 0 check (reward_points >= 0),
  icon_key text check (icon_key is null or char_length(icon_key) <= 80),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists missions_active_sort_idx
  on public.missions (sort_order, id)
  where is_active;

create table if not exists public.user_mission_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  student_id uuid references public.students (id) on delete cascade,
  mission_id uuid not null references public.missions (id) on delete restrict,
  progress_count integer not null default 0 check (progress_count >= 0),
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed')),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((user_id is not null) <> (student_id is not null)),
  check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  )
);

create unique index if not exists user_mission_progress_user_mission_uidx
  on public.user_mission_progress (user_id, mission_id)
  where user_id is not null;
create unique index if not exists user_mission_progress_student_mission_uidx
  on public.user_mission_progress (student_id, mission_id)
  where student_id is not null;

create table if not exists public.sketch_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  category text not null check (char_length(btrim(category)) between 1 and 80),
  image_url text not null check (char_length(image_url) <= 2048),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  reference_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(reference_data) = 'object' and octet_length(reference_data::text) <= 16384),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sketch_templates_active_filter_idx
  on public.sketch_templates (category, difficulty, id)
  where is_active;

create table if not exists public.sketch_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  student_id uuid references public.students (id) on delete restrict,
  session_id uuid references public.learning_sessions (id) on delete restrict,
  template_id uuid not null references public.sketch_templates (id) on delete restrict,
  image_url text not null check (char_length(image_url) between 1 and 2048),
  similarity_score numeric check (similarity_score is null or similarity_score between 0 and 100),
  feedback text check (feedback is null or char_length(feedback) <= 2000),
  created_at timestamptz not null default now(),
  check ((user_id is not null) <> (student_id is not null)),
  check (student_id is null or session_id is not null)
);

create index if not exists sketch_submissions_user_created_idx
  on public.sketch_submissions (user_id, created_at desc, id desc)
  where user_id is not null;
create index if not exists sketch_submissions_student_created_idx
  on public.sketch_submissions (student_id, created_at desc, id desc)
  where student_id is not null;
create index if not exists sketch_submissions_session_idx
  on public.sketch_submissions (session_id, created_at desc)
  where session_id is not null;

create table if not exists public.explore_questions (
  id uuid primary key default gen_random_uuid(),
  activity_type text not null
    check (activity_type in ('object_recognition', 'body_parts', 'counting')),
  prompt text not null check (char_length(btrim(prompt)) between 1 and 1000),
  options jsonb not null
    check (
      case when jsonb_typeof(options) = 'array'
        then jsonb_array_length(options) between 2 and 8
          and octet_length(options::text) <= 16384
        else false
      end
    ),
  correct_answer text not null check (char_length(correct_answer) between 1 and 128),
  image_url text check (image_url is null or char_length(image_url) <= 2048),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists explore_questions_active_filter_idx
  on public.explore_questions (activity_type, difficulty, id)
  where is_active;

create table if not exists public.explore_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  student_id uuid references public.students (id) on delete restrict,
  session_id uuid references public.learning_sessions (id) on delete restrict,
  question_id uuid not null references public.explore_questions (id) on delete restrict,
  answer text not null check (char_length(answer) between 1 and 128),
  is_correct boolean not null,
  points_awarded integer not null default 0 check (points_awarded >= 0),
  created_at timestamptz not null default now(),
  check ((user_id is not null) <> (student_id is not null)),
  check (student_id is null or session_id is not null)
);

create index if not exists explore_attempts_user_created_idx
  on public.explore_attempts (user_id, created_at desc, id desc)
  where user_id is not null;
create index if not exists explore_attempts_student_created_idx
  on public.explore_attempts (student_id, created_at desc, id desc)
  where student_id is not null;
create index if not exists explore_attempts_session_idx
  on public.explore_attempts (session_id, created_at desc)
  where session_id is not null;

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  student_id uuid references public.students (id) on delete restrict,
  session_id uuid references public.learning_sessions (id) on delete restrict,
  title text check (title is null or char_length(btrim(title)) between 1 and 200),
  story_text text check (story_text is null or char_length(btrim(story_text)) between 1 and 20000),
  detected_object text check (detected_object is null or char_length(detected_object) <= 200),
  image_url text check (image_url is null or char_length(image_url) <= 2048),
  provider text check (provider is null or char_length(provider) <= 80),
  model text check (model is null or char_length(model) <= 120),
  status text not null default 'completed'
    check (status in ('pending', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  check (status <> 'completed' or story_text is not null),
  check ((user_id is not null) <> (student_id is not null)),
  check (student_id is null or session_id is not null)
);

create index if not exists stories_user_created_idx
  on public.stories (user_id, created_at desc, id desc)
  where user_id is not null;
create index if not exists stories_student_created_idx
  on public.stories (student_id, created_at desc, id desc)
  where student_id is not null;
create index if not exists stories_session_idx
  on public.stories (session_id, created_at desc)
  where session_id is not null;

alter table public.missions enable row level security;
alter table public.user_mission_progress enable row level security;
alter table public.sketch_templates enable row level security;
alter table public.sketch_submissions enable row level security;
alter table public.explore_questions enable row level security;
alter table public.explore_attempts enable row level security;
alter table public.stories enable row level security;

grant all on public.missions, public.user_mission_progress,
  public.sketch_templates, public.sketch_submissions,
  public.explore_questions, public.explore_attempts, public.stories
  to service_role;

-- No client policies are created. Read/write access is mediated by NestJS.
-- Keep correct_answer server-only; learner endpoints must omit it in SELECTs.
