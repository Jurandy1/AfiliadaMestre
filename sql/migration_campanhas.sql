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

-- Leitura pública não necessária: só o backend (service role) acessa
drop policy if exists "campanhas_rastreio_no_anon" on public.campanhas_rastreio;
