create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_tokens_user_id_idx
  on public.password_reset_tokens (user_id);

alter table public.password_reset_tokens enable row level security;

grant all on public.password_reset_tokens to service_role;

-- No client policies: only the backend's Supabase service-role key can access this table.
