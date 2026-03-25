begin;

alter table public.empresas
  add column if not exists plantilla_oficina text;

comment on column public.empresas.plantilla_oficina is 'Identificador de la plantilla base elegida por la empresa durante el registro inicial de su oficina en el espacio único.';

alter table public.espacio_objetos
  add column if not exists empresa_id uuid references public.empresas(id) on delete cascade,
  add column if not exists es_de_plantilla boolean not null default false,
  add column if not exists plantilla_origen text;

comment on column public.espacio_objetos.empresa_id is 'Empresa propietaria lógica del objeto dentro del espacio compartido.';
comment on column public.espacio_objetos.es_de_plantilla is 'Indica si el objeto fue sembrado automáticamente desde una plantilla base.';
comment on column public.espacio_objetos.plantilla_origen is 'Identificador de la plantilla que originó el objeto base.';

create index if not exists idx_espacio_objetos_empresa_id
  on public.espacio_objetos (empresa_id);

create index if not exists idx_espacio_objetos_espacio_empresa
  on public.espacio_objetos (espacio_id, empresa_id);

create index if not exists idx_espacio_objetos_empresa_plantilla
  on public.espacio_objetos (empresa_id, es_de_plantilla);

update public.espacio_objetos as eo
set empresa_id = me.empresa_id
from public.miembros_espacio as me
where eo.owner_id = me.usuario_id
  and eo.espacio_id = me.espacio_id
  and eo.empresa_id is null
  and me.empresa_id is not null;

commit;
