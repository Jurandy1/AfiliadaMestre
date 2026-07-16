-- Ocultar produtos da vitrine sem apagar do banco
alter table public.ofertas add column if not exists hidden boolean default false;

create index if not exists ofertas_hidden_idx on public.ofertas (hidden) where hidden = true;
