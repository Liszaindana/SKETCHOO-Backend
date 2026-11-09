create table if not exists public.password_reset_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempts_count integer not null default 0
    check (attempts_count between 0 and 5),
  created_at timestamptz not null default now()
);

create index if not exists password_reset_codes_user_created_idx
  on public.password_reset_codes (user_id, created_at desc);

alter table public.password_reset_codes enable row level security;
grant all on public.password_reset_codes to service_role;

create or replace function public.increment_password_reset_code_attempt(p_code_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_attempt_count integer;
begin
  update public.password_reset_codes
  set attempts_count = attempts_count + 1
  where id = p_code_id
    and consumed_at is null
    and expires_at > pg_catalog.now()
    and attempts_count < 5
  returning attempts_count into new_attempt_count;

  return new_attempt_count;
end;
$$;

revoke all on function public.increment_password_reset_code_attempt(uuid)
  from public, anon, authenticated;
grant execute on function public.increment_password_reset_code_attempt(uuid)
  to service_role;

create or replace function public.find_auth_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select id
  from auth.users
  where pg_catalog.lower(email) = pg_catalog.lower(p_email)
  limit 1
$$;

revoke all on function public.find_auth_user_id_by_email(text)
  from public, anon, authenticated;
grant execute on function public.find_auth_user_id_by_email(text)
  to service_role;
