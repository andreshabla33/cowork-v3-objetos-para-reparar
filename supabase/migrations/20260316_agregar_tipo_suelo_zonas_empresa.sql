begin;

alter table public.zonas_empresa
  add column if not exists tipo_suelo text default 'concrete_smooth';

comment on column public.zonas_empresa.tipo_suelo is 'Tipo de suelo PBR aplicado a la zona de empresa. Valores esperados alineados con FloorType del frontend.';

update public.zonas_empresa
set tipo_suelo = 'concrete_smooth'
where tipo_suelo is null;

commit;
