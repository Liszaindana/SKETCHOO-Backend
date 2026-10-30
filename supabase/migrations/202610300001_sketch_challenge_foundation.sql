-- Fondasi fitur Sketch Challenge (Tantangan Sketsa) untuk anak TK/PAUD (4-6 tahun).
-- Menyimpan master level, progres level per user (status & high stars), dan submission riwayat.

create table if not exists public.sketch_challenge_levels (
  id text primary key,
  level_number integer not null unique check (level_number > 0),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  subtitle text not null default '' check (char_length(subtitle) <= 200),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_sketch_challenge_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  level_id text not null references public.sketch_challenge_levels (id) on delete cascade,
  status text not null default 'locked'
    check (status in ('locked', 'active', 'completed')),
  high_stars integer not null default 0 check (high_stars between 0 and 3),
  high_score integer not null default 0 check (high_score >= 0),
  attempts_count integer not null default 0 check (attempts_count >= 0),
  last_artwork_url text check (last_artwork_url is null or char_length(last_artwork_url) <= 2048),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, level_id)
);

create index if not exists user_sketch_challenge_progress_user_idx
  on public.user_sketch_challenge_progress (user_id, level_id);

create table if not exists public.sketch_challenge_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  level_id text not null references public.sketch_challenge_levels (id) on delete cascade,
  stroke_count integer not null default 0 check (stroke_count >= 0),
  total_points integer not null default 0 check (total_points >= 0),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  stars_earned integer not null check (stars_earned between 1 and 3),
  score_awarded integer not null default 0 check (score_awarded >= 0),
  artwork_image_url text check (artwork_image_url is null or char_length(artwork_image_url) <= 2048),
  feedback_message text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists sketch_challenge_submissions_user_level_idx
  on public.sketch_challenge_submissions (user_id, level_id, created_at desc);

-- Seed level hewan (asset lokal FE: assets/sketch challenge/hewan/)
insert into public.sketch_challenge_levels (id, level_number, title, subtitle, is_active)
values
  ('bebek',     1, 'Bebek',     '+20 Bintang', true),
  ('kucing',    2, 'Kucing',    '+20 Bintang', true),
  ('ikan',      3, 'Ikan',      '+20 Bintang', true),
  ('kupu_kupu', 4, 'Kupu-Kupu', '+20 Bintang', true),
  ('kura_kura', 5, 'Kura-Kura', '+20 Bintang', true)
on conflict (id) do update set
  level_number = excluded.level_number,
  title = excluded.title,
  subtitle = excluded.subtitle,
  is_active = excluded.is_active;
