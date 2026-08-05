-- Rode este arquivo INTEIRO no SQL Editor do Supabase.
-- Cria tabelas conversions + feed_syncs e adiciona colunas de rastreio de qualidade em ofertas.

-- 1. Reverificação periódica de sales/rating e status de shortlink (Invariante B + A)
alter table public.ofertas add column if not exists sales_verified_at timestamptz;
alter table public.ofertas add column if not exists short_link_pending boolean default false;

create index if not exists ofertas_sales_verified_at_idx
  on public.ofertas (sales_verified_at nulls first);
create index if not exists ofertas_short_link_pending_idx
  on public.ofertas (short_link_pending) where short_link_pending = true;

-- 2. Conversões persistidas — fonte do "Painel do Meu Site"
create table if not exists public.conversions (
  conversion_id bigint primary key,
  purchase_time timestamptz,
  click_time timestamptz,
  complete_time timestamptz,
  order_id text,
  order_status text,
  fraud_status text,
  shop_id bigint,
  shop_name text,
  shop_type int,
  item_id bigint,
  item_name text,
  item_price numeric,
  actual_amount numeric,
  refund_amount numeric,
  qty int,
  total_commission numeric,
  net_commission numeric,
  seller_commission numeric,
  shopee_commission_capped numeric,
  mcn_management_fee numeric,
  utm_content text,
  sub_id1 text,
  sub_id2 text,
  sub_id3 text,
  sub_id4 text,
  sub_id5 text,
  is_meu_site boolean generated always as (sub_id1 = 'afiliadamestre') stored,
  validated boolean default false,
  updated_at timestamptz not null default now()
);

create index if not exists conversions_purchase_time_idx
  on public.conversions (purchase_time desc);
create index if not exists conversions_is_meu_site_idx
  on public.conversions (is_meu_site, purchase_time desc);
create index if not exists conversions_item_id_idx
  on public.conversions (item_id);
create index if not exists conversions_shop_id_idx
  on public.conversions (shop_id);
create index if not exists conversions_sub_id3_idx
  on public.conversions (sub_id3);
create index if not exists conversions_order_id_idx
  on public.conversions (order_id);

alter table public.conversions enable row level security;
-- Escrita apenas via service role (backend). Sem policy pra anon.

-- 3. Controle de feeds já processados (evita reprocessar o mesmo FULL/DELTA)
create table if not exists public.feed_syncs (
  datafeed_id text primary key,
  reference_id text,
  feed_mode text not null,           -- FULL | DELTA
  feed_date text not null,           -- YYYYMMDD
  total_count bigint,
  processed_rows bigint default 0,
  processed_at timestamptz not null default now(),
  duration_ms int,
  notes text
);

create index if not exists feed_syncs_processed_at_idx
  on public.feed_syncs (processed_at desc);
create index if not exists feed_syncs_mode_date_idx
  on public.feed_syncs (feed_mode, feed_date desc);

alter table public.feed_syncs enable row level security;
