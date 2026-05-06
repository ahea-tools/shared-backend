create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  email_verified boolean not null default false,
  access_status text not null default 'free' check (access_status in ('free','paid','comped','admin')),
  access_expires_at timestamptz null,
  generations_used integer not null default 0 check (generations_used >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references public.profiles(id) on delete set null,
  email text,
  tool_id text not null,
  request_id text not null,
  status text not null,
  blocked_reason text,
  model text,
  input_chars integer,
  output_chars integer,
  created_at timestamptz not null default now()
);

create table if not exists public.access_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  access_status text not null check (access_status in ('free','paid','comped','admin')),
  max_uses integer,
  uses integer not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists generation_events_user_id_idx on public.generation_events(user_id);
create index if not exists generation_events_created_at_idx on public.generation_events(created_at desc);

alter table public.profiles enable row level security;
alter table public.generation_events enable row level security;
alter table public.access_codes enable row level security;

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
