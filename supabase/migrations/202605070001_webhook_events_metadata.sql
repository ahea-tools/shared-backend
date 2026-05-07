alter table public.webhook_events
add column if not exists metadata jsonb null;
