-- Subcategoria + metadados de variação (tamanho, voltagem, etc.)
alter table public.ofertas add column if not exists subcategory text;
alter table public.ofertas add column if not exists product_options jsonb;

create index if not exists ofertas_subcategory_idx on public.ofertas (category, subcategory);
