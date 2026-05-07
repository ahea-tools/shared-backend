create table if not exists public.membership_entitlements (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  user_id uuid null references public.profiles(id) on delete set null,
  provider text not null default 'squarespace' check (provider in ('squarespace')),
  provider_customer_id text,
  provider_order_id text,
  provider_subscription_id text,
  provider_product_id text,
  provider_variant_id text,
  plan_code text,
  billing_interval text not null default 'unknown' check (billing_interval in ('monthly','annual','unknown')),
  status text not null default 'unknown' check (status in ('active','past_due','canceled','expired','refunded','unknown')),
  access_status text not null default 'paid' check (access_status in ('paid','comped','admin')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  source_event_id text,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'squarespace' check (provider in ('squarespace')),
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  processed_status text not null default 'pending' check (processed_status in ('pending','processed','ignored','failed')),
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique(provider, event_id)
);

create index if not exists membership_entitlements_email_idx on public.membership_entitlements(email);
create index if not exists membership_entitlements_user_id_idx on public.membership_entitlements(user_id);
create index if not exists membership_entitlements_provider_order_id_idx on public.membership_entitlements(provider_order_id);
create index if not exists membership_entitlements_provider_subscription_id_idx on public.membership_entitlements(provider_subscription_id);
create index if not exists membership_entitlements_provider_customer_id_idx on public.membership_entitlements(provider_customer_id);
create index if not exists membership_entitlements_provider_product_id_idx on public.membership_entitlements(provider_product_id);
create index if not exists membership_entitlements_provider_variant_id_idx on public.membership_entitlements(provider_variant_id);
create index if not exists membership_entitlements_status_idx on public.membership_entitlements(status);
create index if not exists membership_entitlements_current_period_end_idx on public.membership_entitlements(current_period_end);
create unique index if not exists membership_entitlements_provider_subscription_unique on public.membership_entitlements(provider, provider_subscription_id) where provider_subscription_id is not null;
create unique index if not exists membership_entitlements_provider_order_unique on public.membership_entitlements(provider, provider_order_id) where provider_order_id is not null;

create index if not exists webhook_events_provider_idx on public.webhook_events(provider);
create index if not exists webhook_events_event_type_idx on public.webhook_events(event_type);
create index if not exists webhook_events_processed_status_idx on public.webhook_events(processed_status);
create index if not exists webhook_events_created_at_idx on public.webhook_events(created_at);

alter table public.membership_entitlements enable row level security;
alter table public.webhook_events enable row level security;

drop trigger if exists membership_entitlements_set_updated_at on public.membership_entitlements;
create trigger membership_entitlements_set_updated_at before update on public.membership_entitlements for each row execute function public.set_updated_at();
