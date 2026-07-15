-- Rode no SQL Editor do Supabase
-- Tabela de ofertas da vitrine (cache da productOfferV2)

create table if not exists public.ofertas (
  item_id bigint primary key,
  product_name text not null,
  image_url text,
  price_min numeric,
  price_max numeric,
  price_discount_rate text,
  sales text,
  rating_star numeric,
  commission_rate text,
  seller_commission_rate text,
  shopee_commission_rate text,
  commission text,
  offer_link text,
  product_link text,
  shop_id bigint,
  shop_name text,
  shop_type int,
  keyword text,
  category text default 'todos',
  updated_at timestamptz not null default now()
);

-- Campos extras para conversão / tracking (idempotente)
alter table public.ofertas add column if not exists period_start bigint;
alter table public.ofertas add column if not exists period_end bigint;
alter table public.ofertas add column if not exists list_type int;
alter table public.ofertas add column if not exists short_link text;

create index if not exists ofertas_updated_at_idx on public.ofertas (updated_at desc);
create index if not exists ofertas_keyword_idx on public.ofertas (keyword);
create index if not exists ofertas_category_idx on public.ofertas (category);
create index if not exists ofertas_period_end_idx on public.ofertas (period_end);

alter table public.ofertas enable row level security;

-- Leitura pública da vitrine (anon / publishable key)
drop policy if exists "ofertas_public_read" on public.ofertas;
create policy "ofertas_public_read"
  on public.ofertas
  for select
  to anon, authenticated
  using (true);

-- Escrita só via service role (backend) — sem policy de insert/update para anon
