-- Rode este arquivo INTEIRO no SQL Editor do Supabase
-- (cria a tabela ofertas do zero + todos os campos atuais)

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

-- Campos extras (idempotente — pode rodar várias vezes)
alter table public.ofertas add column if not exists period_start bigint;
alter table public.ofertas add column if not exists period_end bigint;
alter table public.ofertas add column if not exists list_type int;
alter table public.ofertas add column if not exists short_link text;
alter table public.ofertas add column if not exists subcategory text;
alter table public.ofertas add column if not exists product_options jsonb;
alter table public.ofertas add column if not exists sub_ids text[];
alter table public.ofertas add column if not exists hidden boolean default false;

create index if not exists ofertas_updated_at_idx on public.ofertas (updated_at desc);
create index if not exists ofertas_keyword_idx on public.ofertas (keyword);
create index if not exists ofertas_category_idx on public.ofertas (category);
create index if not exists ofertas_period_end_idx on public.ofertas (period_end);
create index if not exists ofertas_subcategory_idx on public.ofertas (category, subcategory);
create index if not exists ofertas_sub_ids_idx on public.ofertas using gin (sub_ids);

alter table public.ofertas enable row level security;

-- Leitura pública da vitrine (anon / publishable key)
drop policy if exists "ofertas_public_read" on public.ofertas;
create policy "ofertas_public_read"
  on public.ofertas
  for select
  to anon, authenticated
  using (true);

-- Escrita só via service role (backend) — sem policy de insert/update para anon

-- Campanhas de rastreio (Facebook, Instagram, etc.)
create table if not exists public.campanhas_rastreio (
  id text primary key,
  channel text not null default 'facebook',
  campaign text not null,
  products jsonb not null default '[]'::jsonb,
  links jsonb not null default '[]'::jsonb,
  example_sub_ids text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campanhas_rastreio_created_at_idx
  on public.campanhas_rastreio (created_at desc);

alter table public.campanhas_rastreio enable row level security;
