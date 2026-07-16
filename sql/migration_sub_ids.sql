-- Sub IDs gerados automaticamente no sync de cada produto
alter table public.ofertas add column if not exists sub_ids text[];

create index if not exists ofertas_sub_ids_idx on public.ofertas using gin (sub_ids);
