create table if not exists public.travel_plans (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists travel_plans_updated_at on public.travel_plans;

create trigger travel_plans_updated_at
before update on public.travel_plans
for each row
execute function public.set_updated_at();

alter table public.travel_plans enable row level security;

-- No anon policies are needed. The Next.js API uses SUPABASE_SERVICE_ROLE_KEY
-- after checking the private session cookie.
