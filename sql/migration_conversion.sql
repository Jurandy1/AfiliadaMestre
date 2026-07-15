-- Migration: rode no SQL Editor se a tabela já existir
alter table public.ofertas add column if not exists period_start bigint;
alter table public.ofertas add column if not exists period_end bigint;
alter table public.ofertas add column if not exists list_type int;
alter table public.ofertas add column if not exists short_link text;
create index if not exists ofertas_period_end_idx on public.ofertas (period_end);
