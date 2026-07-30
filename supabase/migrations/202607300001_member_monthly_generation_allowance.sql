-- Durable, content-free, global member generation reservations.
create table if not exists public.member_generation_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null unique,
  tool_id text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  status text not null default 'reserved' check (status in ('reserved','completed','released','expired')),
  reserved_at timestamptz not null default now(),
  reservation_expires_at timestamptz not null,
  completed_at timestamptz,
  released_at timestamptz,
  release_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end > period_start)
);
create index if not exists member_generation_usage_idx on public.member_generation_reservations(user_id, period_start, period_end, status);
create index if not exists member_generation_stale_idx on public.member_generation_reservations(reservation_expires_at) where status = 'reserved';
alter table public.member_generation_reservations enable row level security;
revoke all on public.member_generation_reservations from anon, authenticated;
comment on table public.member_generation_reservations is 'Backend-only monthly member allowance ledger. Never store prompts, outputs, abstracts, or other user content.';

drop trigger if exists member_generation_reservations_set_updated_at on public.member_generation_reservations;
create trigger member_generation_reservations_set_updated_at before update on public.member_generation_reservations for each row execute function public.set_updated_at();

create or replace function public.reserve_member_monthly_generation(p_user_id uuid, p_request_id uuid, p_tool_id text, p_period_start timestamptz, p_period_end timestamptz, p_reservation_expires_at timestamptz, p_generation_limit integer)
returns table(reserved boolean, generations_used bigint, generations_limit integer, period_start timestamptz, period_end timestamptz)
language plpgsql security definer set search_path = pg_catalog, public as $$
declare existing public.member_generation_reservations; current_usage bigint;
begin
  if p_generation_limit < 1 or p_period_end <= p_period_start or p_reservation_expires_at <= now() then raise exception 'invalid reservation parameters'; end if;
  -- A per-user advisory transaction lock serializes competing requests across every tool.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  update public.member_generation_reservations set status='expired', updated_at=now()
    where user_id=p_user_id and period_start=p_period_start and period_end=p_period_end and status='reserved' and reservation_expires_at <= now();
  select * into existing from public.member_generation_reservations r where r.request_id=p_request_id;
  if found then
    if existing.user_id <> p_user_id or existing.period_start <> p_period_start or existing.period_end <> p_period_end then raise exception 'request id conflict'; end if;
    select count(*) into current_usage from public.member_generation_reservations r where r.user_id=p_user_id and r.period_start=p_period_start and r.period_end=p_period_end and r.status in ('reserved','completed');
    return query select existing.status in ('reserved','completed'), current_usage, p_generation_limit, p_period_start, p_period_end; return;
  end if;
  select count(*) into current_usage from public.member_generation_reservations r where r.user_id=p_user_id and r.period_start=p_period_start and r.period_end=p_period_end and r.status in ('reserved','completed');
  if current_usage >= p_generation_limit then return query select false, current_usage, p_generation_limit, p_period_start, p_period_end; return; end if;
  insert into public.member_generation_reservations(user_id,request_id,tool_id,period_start,period_end,reservation_expires_at) values(p_user_id,p_request_id,p_tool_id,p_period_start,p_period_end,p_reservation_expires_at);
  return query select true, current_usage + 1, p_generation_limit, p_period_start, p_period_end;
end $$;

create or replace function public.finalize_member_monthly_generation(p_request_id uuid, p_generation_limit integer)
returns table(generations_used bigint, generations_limit integer, period_start timestamptz, period_end timestamptz)
language plpgsql security definer set search_path = pg_catalog, public as $$
declare target public.member_generation_reservations; current_usage bigint;
begin
  select * into target from public.member_generation_reservations r where r.request_id=p_request_id for update;
  if not found then raise exception 'reservation not found'; end if;
  if target.status='reserved' and target.reservation_expires_at > now() then update public.member_generation_reservations set status='completed',completed_at=now(),updated_at=now() where request_id=p_request_id;
  elsif target.status <> 'completed' then raise exception 'reservation is not active'; end if;
  select count(*) into current_usage from public.member_generation_reservations r where r.user_id=target.user_id and r.period_start=target.period_start and r.period_end=target.period_end and r.status in ('reserved','completed') and (r.status='completed' or r.reservation_expires_at > now());
  return query select current_usage,p_generation_limit,target.period_start,target.period_end;
end $$;

create or replace function public.release_member_monthly_generation(p_request_id uuid, p_release_reason text default null)
returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare current_status text;
begin
  select status into current_status from public.member_generation_reservations where request_id=p_request_id for update;
  if not found then return true; end if;
  if current_status='reserved' then update public.member_generation_reservations set status='released',released_at=now(),release_reason=left(p_release_reason,100),updated_at=now() where request_id=p_request_id; end if;
  return true;
end $$;

create or replace function public.get_member_monthly_generation_usage(p_user_id uuid,p_period_start timestamptz,p_period_end timestamptz,p_generation_limit integer)
returns table(generations_used bigint,generations_limit integer,period_start timestamptz,period_end timestamptz)
language plpgsql security definer set search_path = pg_catalog, public as $$
declare current_usage bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  update public.member_generation_reservations set status='expired',updated_at=now() where user_id=p_user_id and period_start=p_period_start and period_end=p_period_end and status='reserved' and reservation_expires_at <= now();
  select count(*) into current_usage from public.member_generation_reservations r where r.user_id=p_user_id and r.period_start=p_period_start and r.period_end=p_period_end and r.status in ('reserved','completed');
  return query select current_usage,p_generation_limit,p_period_start,p_period_end;
end $$;
revoke all on function public.reserve_member_monthly_generation(uuid,uuid,text,timestamptz,timestamptz,timestamptz,integer) from public, anon, authenticated;
revoke all on function public.finalize_member_monthly_generation(uuid,integer) from public, anon, authenticated;
revoke all on function public.release_member_monthly_generation(uuid,text) from public, anon, authenticated;
revoke all on function public.get_member_monthly_generation_usage(uuid,timestamptz,timestamptz,integer) from public, anon, authenticated;
grant execute on function public.reserve_member_monthly_generation(uuid,uuid,text,timestamptz,timestamptz,timestamptz,integer) to service_role;
grant execute on function public.finalize_member_monthly_generation(uuid,integer) to service_role;
grant execute on function public.release_member_monthly_generation(uuid,text) to service_role;
grant execute on function public.get_member_monthly_generation_usage(uuid,timestamptz,timestamptz,integer) to service_role;
